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
from utils.cuotas_periodos import calcular_estado_financiero, calcular_nuevo_mes_cubierto

router = APIRouter(
    prefix="/admin/pagos",
    tags=["Admin — Pagos y Cuotas Sociales"],
)
_ROLES_ADMIN_PAGOS = ("admin_general", "personal_administrativo")


# ─── Helpers ──────────────────────────────────────────────────────────────────

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


def _obtener_descuento_menor_pct(db: Session) -> Decimal:
    """
    Único punto de lectura del % de descuento para menores — vive en
    ConfiguracionGlobal (editable por el Admin General desde el Catálogo
    de Productos), no hardcodeado. Fallback a 40 si todavía no hay fila
    de configuración creada (mismo valor que estaba fijo antes de esto).
    Misma función que en socio_cuotas.py — ambas leen la misma fila de
    ConfiguracionGlobal, así que nunca pueden desincronizarse entre sí.
    """
    config = db.query(models.ConfiguracionGlobal).first()
    return config.descuento_menor_pct if config else Decimal("40")


def _calcular_precio_cuota(
    precio_base: Decimal,
    fecha_nacimiento: Optional[date],
    db: Session,
) -> Decimal:
    """
    Calcula el precio final de la cuota usando aritmética Decimal estricta.
    Aplica el % de descuento configurado (ConfiguracionGlobal.descuento_menor_pct)
    si el socio tiene menos de 18 años. Al ser precio_base también Decimal
    (Numeric ORM → Decimal en Python), toda la expresión opera en Decimal
    sin conversión implícita a float, evitando errores de precisión en
    columnas Numeric(10,2).
    """
    edad = _calcular_edad(fecha_nacimiento)
    if edad is not None and edad < 18:
        descuento_pct = _obtener_descuento_menor_pct(db)
        return precio_base * (Decimal("1") - descuento_pct / Decimal("100"))
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
    hoy = date.today()

    # "Al día" incluye tanto a quien nunca debió nada como a quien está
    # becado con cobertura vigente — mismo criterio que el resto del sistema
    # (QR, deportivo). Se resuelve en Python porque la becas interactúan
    # con la fecha, no es un simple WHERE de una columna.
    socios_activos = (
        db.query(models.Usuario)
        .filter(models.Usuario.fecha_baja.is_(None))
        .all()
    )

    total_al_dia = 0
    total_morosos = 0
    suma_meses_adeudados = 0

    for u in socios_activos:
        estado = calcular_estado_financiero(u.mes_cubierto_hasta, u.fecha_ingreso, dia_vencimiento, hoy)
        if estado.moroso:
            total_morosos += 1
            suma_meses_adeudados += estado.cantidad_meses
        else:
            total_al_dia += 1

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
    dia_vencimiento = _obtener_dia_vencimiento(db)
    hoy = date.today()
    socios = (
        db.query(models.Usuario)
        .filter(models.Usuario.fecha_baja.is_(None))
        .order_by(models.Usuario.apellido, models.Usuario.nombre)
        .all()
    )

    producto_cuota_base = _obtener_producto_cuota_social(db)
    resultado = []
    for u in socios:
        precio_unitario = _calcular_precio_cuota(
            producto_cuota_base.precio_actual, u.fecha_nacimiento, db
        )
        estado = calcular_estado_financiero(u.mes_cubierto_hasta, u.fecha_ingreso, dia_vencimiento, hoy)

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
                meses_adeudados=estado.meses_adeudados,
                deuda_estimada=Decimal(estado.cantidad_meses) * precio_unitario,
            )
        )

    # Peor deuda primero (más meses adeudados), luego alfabético.
    resultado.sort(key=lambda m: (-len(m.meses_adeudados), m.apellido, m.nombre))
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
    # _calcular_precio_cuota usa Decimal estricto y lee el % de descuento
    # desde ConfiguracionGlobal.descuento_menor_pct (editable, no hardcodeado).
    producto_cuota = _obtener_producto_cuota_social(db)
    precio_congelado: Decimal = _calcular_precio_cuota(
        producto_cuota.precio_actual, usuario.fecha_nacimiento, db
    )
    monto_total: Decimal = precio_congelado * Decimal(payload.meses_a_pagar)

    deuda_antes = calcular_estado_financiero(
        usuario.mes_cubierto_hasta, usuario.fecha_ingreso, _obtener_dia_vencimiento(db)
    )
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

    # 6 ── Calcular y actualizar mes_cubierto_hasta con el motor de períodos
    # compartido (utils/cuotas_periodos.py — la deuda se deriva de esta fecha,
    # no hay contador aparte que decrementar).
    dia_vencimiento = _obtener_dia_vencimiento(db)
    mes_cubierto_hasta_nuevo = calcular_nuevo_mes_cubierto(
        mes_cubierto_hasta=usuario.mes_cubierto_hasta,
        fecha_ingreso=usuario.fecha_ingreso,
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
            "meses_adeudados_antes": [d.isoformat() for d in deuda_antes.meses_adeudados],
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

    estado_despues = calcular_estado_financiero(
        usuario.mes_cubierto_hasta, usuario.fecha_ingreso, dia_vencimiento
    )
    return schemas.RegistrarPagoManualResponse(
        id_orden=nueva_orden.id_orden,
        id_usuario=usuario.id_usuario,
        meses_pagados=payload.meses_a_pagar,
        monto_total=monto_total,
        meses_adeudados_restante=estado_despues.meses_adeudados,
    )