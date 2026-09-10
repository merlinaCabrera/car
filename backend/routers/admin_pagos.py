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

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Request,
    UploadFile,
    status,
)
from sqlalchemy import func
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from dependencies import get_current_user, require_roles
from utils.s3 import resolver_url_archivo
from utils.comprobantes import (
    borrar_comprobante_anterior,
    validar_y_subir_comprobante,
)
from utils.cuotas_periodos import calcular_estado_financiero, calcular_nuevo_mes_cubierto
from utils.fechas import hoy_club
from utils.precios import (
    calcular_edad,
    calcular_precio_cuota,
    es_menor,
    obtener_descuento_menor_pct,
    obtener_producto_cuota_social,
)

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


# Helpers de precio: la implementación vive en utils/precios.py (fuente única
# de verdad). Se re-exportan con los nombres locales de siempre para no tocar
# los llamadores de este módulo.
_calcular_edad = calcular_edad
_obtener_producto_cuota_social = obtener_producto_cuota_social
_obtener_descuento_menor_pct = obtener_descuento_menor_pct
_calcular_precio_cuota = calcular_precio_cuota


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
    hoy = hoy_club()

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
    hoy = hoy_club()
    socios = (
        db.query(models.Usuario)
        .filter(models.Usuario.fecha_baja.is_(None))
        .order_by(models.Usuario.apellido, models.Usuario.nombre)
        .all()
    )

    producto_cuota_base = _obtener_producto_cuota_social(db)
    descuento_pct = _obtener_descuento_menor_pct(db)  # una sola vez, no por socio
    resultado = []
    for u in socios:
        precio_unitario = _calcular_precio_cuota(
            producto_cuota_base.precio_actual, u.fecha_nacimiento, db,
            descuento_menor_pct=descuento_pct,
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
    # with_for_update: serializa este cobro con otro cobro manual del mismo socio
    # o con la aprobación de una orden pendiente suya — sin el lock, dos avances
    # de mes_cubierto_hasta parten de la misma base y uno se pierde (plata
    # cobrada dos veces, cobertura sumada una sola).
    usuario = (
        db.query(models.Usuario)
        .filter(models.Usuario.id_usuario == payload.id_usuario)
        .with_for_update()
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

    # 1b ── No cobrar por ventanilla si el socio tiene una orden de cuota
    # pendiente: si el admin cobra acá Y después aprueba la pendiente, la
    # cobertura avanza dos veces. Que resuelva la pendiente primero.
    orden_cuota_pendiente = (
        db.query(models.Orden.id_orden)
        .join(models.DetalleOrden, models.DetalleOrden.id_orden == models.Orden.id_orden)
        .join(models.ProductoServicio, models.DetalleOrden.id_producto == models.ProductoServicio.id_producto)
        .filter(
            models.Orden.id_usuario == usuario.id_usuario,
            models.Orden.estado == "pendiente_verificacion",
            models.ProductoServicio.categoria == "cuota_social",
        )
        .first()
    )
    if orden_cuota_pendiente is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"El socio tiene una orden de cuota pendiente (#{orden_cuota_pendiente.id_orden}). "
                "Aprobala o rechazala antes de registrar un cobro por ventanilla."
            ),
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
    # Ojo con el nombre: llamarla `es_menor` sombreaba el helper importado
    # de utils.precios dentro de toda esta función (Python marca el nombre
    # como local desde la primera asignación), así que quedaba inutilizable
    # acá aunque estuviera importado.
    socio_es_menor = es_menor(usuario.fecha_nacimiento)

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
        # Sin esto el Pago tomaba el server_default 'transferencia' y un cobro
        # en efectivo por ventanilla aparecía en el historial del socio como
        # "Pagado por transferencia" (BUG-09).
        metodo_pago=payload.metodo_pago,
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
            f"Pago manual por ventanilla ({payload.metodo_pago}) — "
            f"{payload.meses_a_pagar} mes(es). "
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
            "es_menor": socio_es_menor,
            "metodo_pago": payload.metodo_pago,
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


# ─── ENDPOINT: Reemplazar el comprobante de un pago (admin) ───────────────────

@router.post(
    "/{id_pago}/comprobante",
    response_model=schemas.ComprobanteUploadResponse,
    summary="Adjuntar o reemplazar el comprobante de un pago, desde el panel",
)
async def reemplazar_comprobante_admin(
    id_pago: int,
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN_PAGOS)),
) -> schemas.ComprobanteUploadResponse:
    """
    Pedido explícito de la QA (BUG-05, ronda 2): el admin necesitaba poder no
    solo VER el comprobante desde el panel, sino también reemplazarlo — el
    socio manda la foto por WhatsApp, o sube una ilegible y la corrige por
    teléfono, y quien está en la ventanilla la carga por él.

    Diferencias a propósito con el camino del socio
    (POST /socio/cuotas/pagos/{id_pago}/comprobante):

      · No exige que el pago sea del propio usuario (es el admin operando
        sobre el pago de un socio).
      · No exige estado 'pendiente'. Un pago ya verificado o rechazado también
        se puede corregir: si el archivo quedó ilegible o se cargó el de otro
        socio, el registro contable tiene que poder arreglarse después.
      · NO reinicia el reloj de expiración de las órdenes hermanas. Ese
        reinicio existe para darle al admin 48 h frescas desde que el SOCIO
        sube la foto; acá el que sube es el admin, y estirar el vencimiento
        solo por haber corregido un archivo sería un efecto colateral
        inesperado.
      · NO manda el aviso al club de "llegó un comprobante nuevo": el club es
        justamente quien lo está subiendo.
    """
    pago = db.query(models.Pago).filter(models.Pago.id_pago == id_pago).first()
    if pago is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El pago indicado no existe.",
        )

    s3_key, nombre_original, tamano_bytes = await validar_y_subir_comprobante(
        file, pago.id_pago
    )

    comprobante_anterior = pago.comprobante_url
    pago.comprobante_url = s3_key

    borrar_comprobante_anterior(comprobante_anterior)

    _registrar_audit(
        db=db,
        actor_id=admin.id_usuario,
        accion="REEMPLAZAR_COMPROBANTE_ADMIN",
        tabla_afectada="pagos",
        registro_id=pago.id_pago,
        detalle={
            "id_usuario_pago": pago.id_usuario,
            "comprobante_url": s3_key,
            "comprobante_anterior": comprobante_anterior,
            "nombre_original": nombre_original,
            "tamano_bytes": tamano_bytes,
            "estado_pago": pago.estado,
        },
        ip=_extraer_ip(request),
    )

    db.commit()
    db.refresh(pago)

    return schemas.ComprobanteUploadResponse(
        id_pago=pago.id_pago,
        comprobante_url=resolver_url_archivo(pago.comprobante_url) or s3_key,
        mensaje="Comprobante actualizado correctamente.",
    )
