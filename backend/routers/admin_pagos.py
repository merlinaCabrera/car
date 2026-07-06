# backend/routers/admin_pagos.py
"""
Router de gestión financiera — Cuotas Sociales (panel de administración).

Endpoints:
  GET  /admin/pagos/estadisticas          → Resumen financiero global.
  GET  /admin/pagos/morosos               → Listado de socios activos para cobro.
  POST /admin/pagos/registrar-pago-manual → Cobro por ventanilla (efectivo/transferencia).

Todos los endpoints requieren rol 'admin_general' o 'personal_administrativo'.

Decisiones técnicas:
  - Existe un ÚNICO producto de cuota social. El precio final se calcula con
    _calcular_precio_cuota(), que aplica un descuento dinámico del 40% si el
    socio es menor de 18 años. El admin no necesita saber qué tarifa aplicar:
    el sistema lo resuelve solo.
  - registrar-pago-manual crea primero un Pago (estado='verificado',
    comprobante_url=NULL) y luego la Orden ya 'aprobada' referenciando ese
    Pago. Esto satisface el NOT NULL de Orden.id_pago del patrón Split-Order.
    El dinero ya se cobró en persona, así que el Pago nace verificado
    directamente, sin pasar por el flujo de comprobante.
  - deuda_historica_meses nunca baja de 0 (clamp explícito).
  - MOTOR DE COBERTURA (mismo que admin_ordenes.py — ver
    _calcular_nuevo_mes_cubierto): el pago por ventanilla también recalcula
    `mes_cubierto_hasta`, no solo `deuda_historica_meses`. La base es
    SIEMPRE usuario.mes_cubierto_hasta si no es None (sin importar si está
    vencida en el pasado) — nunca se "saltea" al día de hoy, para no
    perdonar en silencio la deuda histórica de un socio con la cobertura
    vencida. Si nunca tuvo cuota aprobada, la base es fecha_ingreso.
  - Todo el flujo (pago + orden + detalle + actualización de deuda/cobertura
    + audit_log) se hace en una sola transacción con un único commit al final.
  - Todos los cálculos intermedios usan Decimal explícito para evitar errores
    de precisión aritmética al persistir en columnas Numeric(10,2).
"""

from __future__ import annotations

import calendar
from datetime import date
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from dependencies import get_current_user, require_roles

router = APIRouter(
    prefix="/admin/pagos",
    tags=["Admin — Pagos y Cuotas Sociales"],
)

# Constante declarada como Decimal para que toda la aritmética subsiguiente
# opere en Decimal y no mezcle float (lo que generaría resultados imprecisos
# al escribir en columnas Numeric de PostgreSQL).
DESCUENTO_MENOR: Decimal = Decimal("0.40")

_ROLES_ADMIN_PAGOS = ("admin_general", "personal_administrativo")


# ─── Helpers ──────────────────────────────────────────────────────────────────

# ─── Motor de cálculo de períodos de cobertura ───────────────────────────────
# (Duplicado intencionalmente de admin_ordenes.py: cada router administrativo
# es un módulo independiente en este proyecto — mismo patrón que _extraer_ip
# y _registrar_audit, ya duplicados entre routers. Si en el futuro se agrega
# un tercer punto de entrada que toque mes_cubierto_hasta, conviene moverlo a
# un módulo compartido, p.ej. backend/services/cobertura.py.)

def _sumar_meses(base: date, meses: int) -> date:
    """
    Suma `meses` enteros positivos a `base` usando únicamente la stdlib
    (calendar + datetime.date). Evita los errores clásicos de overflow de mes
    (ej: 31 de enero + 1 mes ≠ 31 de febrero).
    """
    total_meses = base.month - 1 + meses
    anio = base.year + total_meses // 12
    mes = total_meses % 12 + 1
    dia = min(base.day, calendar.monthrange(anio, mes)[1])
    return date(anio, mes, dia)


def _calcular_nuevo_mes_cubierto(
    usuario: models.Usuario,
    meses_a_pagar: int,
    dia_vencimiento_cuota: int,
) -> date:
    """
    Calcula la nueva fecha de cobertura del socio tras un pago de cuota.

    REGLA DE NEGOCIO ESTRICTA (corrige el bug de "amnistía de deuda"):
      · Base = usuario.mes_cubierto_hasta, SIEMPRE que no sea None — sin
        importar si esa fecha ya está vencida en el pasado. Un pago nunca
        "saltea" al día de hoy: extiende la cobertura desde donde el socio
        se quedó, llenando cronológicamente los meses adeudados. Usar
        MAX(mes_cubierto_hasta, hoy) perdona en silencio toda la deuda
        acumulada, porque ancla el nuevo período en el presente en vez de
        continuar la secuencia real de meses impagos.
      · Si mes_cubierto_hasta es None (el socio nunca tuvo una cuota
        aprobada), la base es usuario.fecha_ingreso. Si también fuera None
        (no debería pasar — la columna es NOT NULL — pero se cubre
        defensivamente), se usa date.today() como última red de seguridad.
      · La base se normaliza al día `dia_vencimiento_cuota` dentro de su
        propio mes/año.
      · Se suman `meses_a_pagar` meses mediante _sumar_meses() (aritmética
        de calendario correcta, sin errores de overflow de 30/31 días).
      · El día final se fuerza a `dia_vencimiento_cuota`, con clamp al
        último día del mes destino (relevante para febrero).
    """
    if usuario.mes_cubierto_hasta is not None:
        base = usuario.mes_cubierto_hasta
    elif usuario.fecha_ingreso is not None:
        base = usuario.fecha_ingreso
    else:
        base = date.today()

    dia_normalizado = min(dia_vencimiento_cuota, calendar.monthrange(base.year, base.month)[1])
    base_normalizada = base.replace(day=dia_normalizado)

    nueva_fecha = _sumar_meses(base_normalizada, meses_a_pagar)

    dia_final = min(dia_vencimiento_cuota, calendar.monthrange(nueva_fecha.year, nueva_fecha.month)[1])
    return nueva_fecha.replace(day=dia_final)


def _obtener_dia_vencimiento(db: Session) -> int:
    """
    Lee dia_vencimiento_cuota de la fila singleton de ConfiguracionGlobal.
    Si la tabla está vacía (entorno de tests sin seed), devuelve 10 como fallback.
    """
    config = db.query(models.ConfiguracionGlobal).first()
    if config is None:
        return 10
    return config.dia_vencimiento_cuota


# ─── Helpers generales ────────────────────────────────────────────────────────

def _extraer_ip(request: Request) -> Optional[str]:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return getattr(request.client, "host", None)


def _registrar_audit(
    *,
    db: Session,
    actor_id: int,
    accion: str,
    tabla_afectada: str,
    registro_id: Optional[int],
    detalle: dict,
    ip: Optional[str] = None,
) -> None:
    db.add(
        models.AuditLog(
            usuario_actor=actor_id,
            accion=accion,
            tabla_afectada=tabla_afectada,
            registro_id=registro_id,
            detalle=detalle,
            ip_origen=ip,
        )
    )


def _calcular_edad(fecha_nacimiento: Optional[date]) -> Optional[int]:
    """
    Retorna la edad en años completos al día de hoy.
    Devuelve None si fecha_nacimiento es NULL.
    """
    if fecha_nacimiento is None:
        return None
    hoy = date.today()
    return (
        hoy.year - fecha_nacimiento.year
        - ((hoy.month, hoy.day) < (fecha_nacimiento.month, fecha_nacimiento.day))
    )


def _obtener_producto_cuota_social(db: Session) -> models.ProductoServicio:
    """Busca el único producto activo de categoría 'cuota_social'."""
    producto = (
        db.query(models.ProductoServicio)
        .filter(
            models.ProductoServicio.categoria == "cuota_social",
            models.ProductoServicio.es_activo.is_(True),
        )
        .first()
    )
    if producto is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "No existe ningún producto activo con categoria='cuota_social'. "
                "Por favor, cargá la 'Cuota Social' base en el sistema."
            ),
        )
    return producto


def _calcular_precio_cuota(
    precio_base: Decimal,
    fecha_nacimiento: Optional[date],
) -> Decimal:
    """
    Calcula el precio final de la cuota usando aritmética Decimal estricta.
    Aplica DESCUENTO_MENOR (Decimal("0.40")) si el socio tiene menos de 18 años.
    Al ser precio_base también Decimal (Numeric ORM → Decimal en Python) y
    DESCUENTO_MENOR Decimal, toda la expresión opera en Decimal sin conversión
    implícita a float, evitando errores de precisión en columnas Numeric(10,2).
    """
    edad = _calcular_edad(fecha_nacimiento)
    if edad is not None and edad < 18:
        return precio_base * (Decimal("1") - DESCUENTO_MENOR)
    return precio_base


# ─── ENDPOINT: Estadísticas financieras ───────────────────────────────────────

@router.get(
    "/estadisticas",
    response_model=schemas.EstadisticasPagosResponse,
    summary="Resumen financiero: socios al día, morosos y deuda total estimada",
)
def obtener_estadisticas(
    db: Session = Depends(get_db),
    _admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN_PAGOS)),
) -> schemas.EstadisticasPagosResponse:
    # Para la deuda total estimada usamos el precio de la cuota base (adulto)
    # como referencia del tablero — una cifra de orientación global.
    producto_cuota_base = _obtener_producto_cuota_social(db)
    dia_vencimiento = _obtener_dia_vencimiento(db)

    total_al_dia = (
        db.query(func.count(models.Usuario.id_usuario))
        .filter(
            models.Usuario.fecha_baja.is_(None),
            models.Usuario.deuda_historica_meses == 0,
        )
        .scalar()
    ) or 0

    total_morosos = (
        db.query(func.count(models.Usuario.id_usuario))
        .filter(
            models.Usuario.fecha_baja.is_(None),
            models.Usuario.deuda_historica_meses > 0,
        )
        .scalar()
    ) or 0

    suma_meses_adeudados = (
        db.query(func.coalesce(func.sum(models.Usuario.deuda_historica_meses), 0))
        .filter(
            models.Usuario.fecha_baja.is_(None),
            models.Usuario.deuda_historica_meses > 0,
        )
        .scalar()
    ) or 0

    deuda_total = Decimal(suma_meses_adeudados) * producto_cuota_base.precio_actual

    return schemas.EstadisticasPagosResponse(
        total_socios_al_dia=total_al_dia,
        total_socios_morosos=total_morosos,
        precio_cuota_actual=producto_cuota_base.precio_actual,
        deuda_total_estimada=deuda_total,
        dia_vencimiento_cuota=dia_vencimiento,
    )


# ─── ENDPOINT: Listado de morosos / socios para cobro ─────────────────────────

@router.get(
    "/morosos",
    response_model=List[schemas.MorosoResponse],
    summary="Listado de todos los socios activos para cobro manual",
)
def listar_morosos(
    db: Session = Depends(get_db),
    _admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN_PAGOS)),
) -> List[schemas.MorosoResponse]:
    # Se listan todos los socios activos, no solo los morosos, para permitir
    # el pago por adelantado desde la ventanilla.
    socios = (
        db.query(models.Usuario)
        .filter(models.Usuario.fecha_baja.is_(None))
        .order_by(
            models.Usuario.deuda_historica_meses.desc(),
            models.Usuario.apellido,
            models.Usuario.nombre,
        )
        .all()
    )

    producto_cuota_base = _obtener_producto_cuota_social(db)
    resultado = []
    for u in socios:
        # La deuda estimada se calcula con la tarifa correcta para cada socio.
        precio_unitario = _calcular_precio_cuota(
            producto_cuota_base.precio_actual, u.fecha_nacimiento
        )

        resultado.append(
            schemas.MorosoResponse(
                id_usuario=u.id_usuario,
                dni=u.dni,
                nombre=u.nombre,
                apellido=u.apellido,
                email=u.email,
                telefono=u.telefono,
                fecha_ingreso=u.fecha_ingreso,
                mes_cubierto_hasta=u.mes_cubierto_hasta,
                deuda_historica_meses=u.deuda_historica_meses,
                deuda_estimada=Decimal(u.deuda_historica_meses) * precio_unitario,
            )
        )

    return resultado


# ─── ENDPOINT: Registrar pago manual (ventanilla) ─────────────────────────────

@router.post(
    "/registrar-pago-manual",
    response_model=schemas.RegistrarPagoManualResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Registrar un cobro manual (efectivo/transferencia) por ventanilla",
)
def registrar_pago_manual(
    payload: schemas.RegistrarPagoManualPayload,
    request: Request,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN_PAGOS)),
) -> schemas.RegistrarPagoManualResponse:
    # 1 ── Validar que el usuario exista y esté activo ─────────────────────
    usuario = (
        db.query(models.Usuario)
        .filter(models.Usuario.id_usuario == payload.id_usuario)
        .first()
    )
    if usuario is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No existe un usuario con id {payload.id_usuario}.",
        )
    if usuario.fecha_baja is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se puede registrar un pago para un socio dado de baja.",
        )

    # 2 ── Seleccionar el producto y congelar el precio correcto para este socio
    # _calcular_precio_cuota usa Decimal estricto: precio_base (Decimal del ORM)
    # × (Decimal("1") - Decimal("0.40")), sin ninguna conversión a float.
    producto_cuota = _obtener_producto_cuota_social(db)
    precio_congelado: Decimal = _calcular_precio_cuota(
        producto_cuota.precio_actual, usuario.fecha_nacimiento
    )
    monto_total: Decimal = precio_congelado * Decimal(payload.meses_a_pagar)

    deuda_antes = usuario.deuda_historica_meses
    mes_cubierto_hasta_antes: Optional[date] = usuario.mes_cubierto_hasta
    es_menor = (
        _calcular_edad(usuario.fecha_nacimiento) is not None
        and _calcular_edad(usuario.fecha_nacimiento) < 18
    )

    # 3 ── Crear el Pago padre (patrón Split-Order) ─────────────────────────
    # Orden.id_pago es NOT NULL en el modelo, por lo tanto toda Orden debe
    # referenciar un Pago existente. En el cobro por ventanilla el dinero
    # ya está en mano, así que el Pago nace directamente en estado='verificado'
    # (no 'pendiente') y sin comprobante digital (comprobante_url=None).
    # flush() obtiene el id_pago generado por la BD sin hacer commit todavía,
    # permitiendo asignarlo a la Orden en el mismo bloque transaccional.
    nuevo_pago = models.Pago(
        id_usuario=usuario.id_usuario,
        monto_total=monto_total,
        estado="verificado",
        comprobante_url=None,
    )
    db.add(nuevo_pago)
    db.flush()  # genera nuevo_pago.id_pago sin commit

    # 4 ── Crear la Orden ya aprobada, referenciando el Pago recién creado ──
    nueva_orden = models.Orden(
        id_usuario=usuario.id_usuario,
        id_pago=nuevo_pago.id_pago,        # satisface NOT NULL
        estado="aprobada",
        monto_total=monto_total,
        aprobada_por=admin.id_usuario,
        aprobada_at=func.now(),
        notas_admin=(
            f"Pago manual por ventanilla — {payload.meses_a_pagar} mes(es). "
            f"Tarifa aplicada: {producto_cuota.nombre}."
        ),
    )
    db.add(nueva_orden)
    db.flush()  # genera nueva_orden.id_orden para el detalle

    # 5 ── Crear el DetalleOrden congelando el precio histórico ─────────────
    detalle = models.DetalleOrden(
        id_orden=nueva_orden.id_orden,
        id_producto=producto_cuota.id_producto,
        cantidad=payload.meses_a_pagar,
        precio_unitario_historico=precio_congelado,
    )
    db.add(detalle)

    # 6 ── Actualizar la deuda del usuario, sin bajar de 0 ──────────────────
    usuario.deuda_historica_meses = max(
        0, usuario.deuda_historica_meses - payload.meses_a_pagar
    )

    # 6b ── Calcular y actualizar mes_cubierto_hasta con el motor de períodos
    # (mismo motor que admin_ordenes.py — ver _calcular_nuevo_mes_cubierto).
    # Se lee usuario.mes_cubierto_hasta ANTES de esta línea (todavía no fue
    # tocado arriba), así que la base sigue siendo la cobertura real previa,
    # esté vencida o no.
    dia_vencimiento = _obtener_dia_vencimiento(db)
    mes_cubierto_hasta_nuevo = _calcular_nuevo_mes_cubierto(
        usuario=usuario,
        meses_a_pagar=payload.meses_a_pagar,
        dia_vencimiento_cuota=dia_vencimiento,
    )
    usuario.mes_cubierto_hasta = mes_cubierto_hasta_nuevo

    # 7 ── Audit log ─────────────────────────────────────────────────────────
    _registrar_audit(
        db=db,
        actor_id=admin.id_usuario,
        accion="REGISTRAR_PAGO_MANUAL",
        tabla_afectada="ordenes",
        registro_id=nueva_orden.id_orden,
        detalle={
            "id_pago": nuevo_pago.id_pago,
            "id_usuario": usuario.id_usuario,
            "meses_a_pagar": payload.meses_a_pagar,
            "id_producto": producto_cuota.id_producto,
            "nombre_producto": producto_cuota.nombre,
            "es_menor": es_menor,
            "precio_unitario_historico": str(precio_congelado),
            "monto_total": str(monto_total),
            "deuda_antes": deuda_antes,
            "deuda_despues": usuario.deuda_historica_meses,
            "mes_cubierto_hasta_antes": (
                mes_cubierto_hasta_antes.isoformat() if mes_cubierto_hasta_antes else None
            ),
            "mes_cubierto_hasta_despues": mes_cubierto_hasta_nuevo.isoformat(),
            "dia_vencimiento_cuota_usado": dia_vencimiento,
        },
        ip=_extraer_ip(request),
    )

    # 8 ── Notificar al socio ────────────────────────────────────────────────
    db.add(
        models.Notificacion(
            id_usuario=usuario.id_usuario,
            tipo="orden_aprobada",
            titulo="Pago en ventanilla registrado",
            cuerpo=(
                f"Se registró exitosamente tu pago por {payload.meses_a_pagar} "
                f"mes(es) de cuota. Monto total: ${monto_total}."
            ),
            referencia_id=nueva_orden.id_orden,
            referencia_tabla="ordenes",
        )
    )

    # 9 ── Commit único de toda la transacción ───────────────────────────────
    # Pago + Orden + DetalleOrden + deuda actualizada + audit_log se persisten
    # atómicamente. Si cualquier paso falla, ningún cambio queda en la BD.
    db.commit()

    db.refresh(nueva_orden)
    db.refresh(usuario)

    return schemas.RegistrarPagoManualResponse(
        id_orden=nueva_orden.id_orden,
        id_usuario=usuario.id_usuario,
        meses_pagados=payload.meses_a_pagar,
        monto_total=monto_total,
        deuda_restante_meses=usuario.deuda_historica_meses,
    )
