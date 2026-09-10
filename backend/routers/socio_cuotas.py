# backend/routers/socio_cuotas.py
"""
Router de autogestión de Cuotas Sociales — pantalla "Mis Cuotas" del socio.

Endpoints:
  GET  /socio/cuotas/estado                → Estado financiero del socio logueado.
  GET  /socio/cuotas/historial             → Historial de pagos de cuota ya aprobados.
  POST /socio/cuotas/generar-orden         → El socio pide pagar N meses (crea un
                                               Pago + su Orden hija de cuota_social).
  GET  /socio/cuotas/orden-pendiente       → Orden de cuota pendiente del socio (o null).
  POST /socio/cuotas/ordenes/{id}/cancelar → Cancela una orden propia pendiente.
  POST /socio/cuotas/pagos/{id_pago}/comprobante → Sube el comprobante del PAGO.

Todos los endpoints requieren rol 'socio' o 'jugador'.

Decisiones técnicas:
  - El precio se calcula con utils.precios (fuente única de verdad), que
    aplica el descuento configurado en ConfiguracionGlobal.descuento_menor_pct
    sobre el producto único de 'cuota_social' si el socio es menor de 18.
  - Patrón "Split-Order bajo un único Pago": Orden.id_pago es NOT NULL, así
    que generar-orden ya NO crea una Orden suelta. Primero crea un Pago
    (estado='pendiente', comprobante_url=NULL) y recién después cuelga de él
    la Orden de cuota_social. El comprobante se sube al PAGO, no a la Orden.
  - generar-orden crea la orden en estado 'pendiente_verificacion' (NO
    'aprobada'). No toca deuda_historica_meses: eso solo se actualiza cuando
    la orden pasa a 'aprobada'.
  - Se bloquea la creación de una nueva orden de cuota si el socio ya tiene
    una orden de cuota 'pendiente_verificacion' sin resolver.
  - El historial solo muestra órdenes 'aprobada' (pagos confirmados).
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import List, Optional

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    Request,
    UploadFile,
    status,
)
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

import models
import schemas
from database import get_db
from dependencies import get_current_user, require_roles
from mailer.services import email_tasks
from utils.s3 import generar_presigned_url
from utils.comprobantes import (
    borrar_comprobante_anterior,
    validar_y_subir_comprobante,
)
from utils.cuotas_periodos import calcular_estado_financiero
from utils.precios import (
    calcular_edad,
    calcular_precio_cuota,
    es_menor,
    obtener_descuento_menor_pct,
    obtener_producto_cuota_social,
)
from utils.fechas import hoy_club
from utils.ordenes import restaurar_stock_orden


def _resolver_url_archivo(valor: str | None) -> str | None:
    """
    Convierte un valor de DB a URL navegable:
    - Si es None → None
    - Si empieza con '/' → es ruta local legacy, se devuelve tal cual
    - Si no → es un key de S3, se genera una Presigned URL
    """
    if not valor:
        return None
    if valor.startswith("/"):
        return valor  # ruta local legacy, el frontend la maneja como antes
    return generar_presigned_url(valor)

router = APIRouter(
    prefix="/socio/cuotas",
    tags=["Socio — Mis Cuotas"],
)

_ROLES_SOCIO = ("socio", "jugador")

# Los formatos y el tamaño máximo aceptados viven en utils/comprobantes.py,
# compartidos con el camino del admin (/admin/pagos/{id}/comprobante), para que
# no puedan aceptar cosas distintas.


# ─── Helpers ──────────────────────────────────────────────────────────────────

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


# Los helpers de precio (edad, descuento de menores, producto de cuota) viven
# en utils/precios.py. Estaban duplicados a mano en 4 routers y el carrito se
# quedó sin ellos — de ahí BUG-12 (menores cobrados como adultos en el
# checkout). Se re-exportan con los nombres locales de siempre para no tocar
# los llamadores de este módulo.
_calcular_edad = calcular_edad
_obtener_producto_cuota_social = obtener_producto_cuota_social
_obtener_descuento_menor_pct = obtener_descuento_menor_pct
_calcular_precio_cuota = calcular_precio_cuota


# ─── ENDPOINT: Estado financiero del socio ────────────────────────────────────

@router.get(
    "/estado",
    response_model=schemas.EstadoCuotaSocioResponse,
    summary="Estado actual de la cuota social del socio logueado",
)
def obtener_estado_cuota(
    db: Session = Depends(get_db),
    socio: models.Usuario = Depends(require_roles(*_ROLES_SOCIO)),
) -> schemas.EstadoCuotaSocioResponse:
    # Obtiene el producto base y calcula el precio real para este socio
    producto_cuota = _obtener_producto_cuota_social(db)
    precio_real_socio = _calcular_precio_cuota(
        producto_cuota.precio_actual, socio.fecha_nacimiento, db
    )

    config = db.query(models.ConfiguracionGlobal).first()
    dia_vencimiento = config.dia_vencimiento_cuota if config else 10

    # ── Bypass de beca ─────────────────────────────────────────────────────────────────
    # Si la beca está activa hoy, devolvemos deuda = 0 sin importar mes_cubierto_hasta.
    # La deuda real queda "congelada" en el campo: cuando expire la beca, el motor
    # financiero retomará desde ese punto automáticamente.
    hoy = hoy_club()
    beca_activa = (
        socio.es_becado
        and (socio.becado_hasta is None or socio.becado_hasta >= hoy)
    )
    if beca_activa:
        return schemas.EstadoCuotaSocioResponse(
            id_producto=producto_cuota.id_producto,
            meses_adeudados=[],
            mes_cubierto_hasta=socio.mes_cubierto_hasta,  # se expone para transparencia
            precio_cuota_actual=precio_real_socio,
            deuda_total_pesos=Decimal("0"),
            dia_vencimiento_cuota=dia_vencimiento,
            fecha_ingreso=socio.fecha_ingreso,
            es_becado=True,
            becado_hasta=socio.becado_hasta,
        )

    estado = calcular_estado_financiero(socio.mes_cubierto_hasta, socio.fecha_ingreso, dia_vencimiento, hoy)
    return schemas.EstadoCuotaSocioResponse(
        id_producto=producto_cuota.id_producto,
        meses_adeudados=estado.meses_adeudados,
        mes_cubierto_hasta=socio.mes_cubierto_hasta,
        precio_cuota_actual=precio_real_socio,
        deuda_total_pesos=Decimal(estado.cantidad_meses) * precio_real_socio,
        dia_vencimiento_cuota=dia_vencimiento,
        fecha_ingreso=socio.fecha_ingreso,
        en_mes_ingreso=estado.en_mes_ingreso,
        es_becado=False,
        becado_hasta=None,
    )


# ─── ENDPOINT: Historial de pagos ─────────────────────────────────────────────

@router.get(
    "/historial",
    response_model=List[schemas.HistorialPagoCuotaResponse],
    summary="Historial de pagos de cuota social (aprobados y resueltos sin éxito)",
)
def obtener_historial_pagos(
    db: Session = Depends(get_db),
    socio: models.Usuario = Depends(require_roles(*_ROLES_SOCIO)),
) -> List[schemas.HistorialPagoCuotaResponse]:
    # Traemos todos los id_producto de categoría cuota_social activos para
    # cubrir el caso en que el socio pagó con el producto de menor siendo menor
    # y ahora tiene la cuota de adulto. Así el historial nunca queda truncado.
    ids_cuota = [
        p.id_producto
        for p in db.query(models.ProductoServicio)
        .filter(models.ProductoServicio.categoria == "cuota_social")
        .all()
    ]

    detalles = (
        db.query(models.DetalleOrden)
        .join(models.Orden, models.DetalleOrden.id_orden == models.Orden.id_orden)
        .options(
            joinedload(models.DetalleOrden.orden).joinedload(models.Orden.pago)
        )
        .filter(
            models.Orden.id_usuario == socio.id_usuario,
            # Todo lo YA RESUELTO, no solo lo aprobado. Las órdenes de cuota no
            # aparecen en "Mis Compras" (esa pantalla es tienda/alquileres a
            # propósito), así que si acá tampoco figuraban, un pago rechazado o
            # expirado no existía en ninguna pantalla del socio — BUG-06 de la
            # QA del 08-09. Las 'pendiente_verificacion' siguen fuera: esas ya
            # se muestran arriba, en el banner de orden pendiente.
            models.Orden.estado.in_(
                ("aprobada", "rechazada", "expirada", "cancelada_socio")
            ),
            models.DetalleOrden.id_producto.in_(ids_cuota),
        )
        .order_by(
            func.coalesce(models.Orden.aprobada_at, models.Orden.fecha_creacion).desc()
        )
        .all()
    )

    return [
        schemas.HistorialPagoCuotaResponse(
            id_orden=d.id_orden,
            estado=d.orden.estado,
            fecha_pago=d.orden.aprobada_at or d.orden.fecha_creacion,
            cantidad_meses=d.cantidad,
            monto_pagado=d.precio_unitario_historico * d.cantidad,
            mes_referencia=d.mes_referencia,
            comprobante_url=_resolver_url_archivo(d.orden.pago.comprobante_url) if d.orden.pago else None,
            motivo_rechazo=d.orden.motivo_rechazo,
        )
        for d in detalles
    ]


# ─── ENDPOINT: Generar orden de pago ──────────────────────────────────────────

@router.post(
    "/generar-orden",
    response_model=schemas.GenerarOrdenCuotaResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generar una orden de pago por N meses de cuota social",
)
def generar_orden_cuota(
    payload: schemas.GenerarOrdenCuotaPayload,
    request: Request,
    db: Session = Depends(get_db),
    socio: models.Usuario = Depends(require_roles(*_ROLES_SOCIO)),
) -> schemas.GenerarOrdenCuotaResponse:
    # El precio se calcula dinámicamente: un socio menor de 18 recibe el
    # descuento automáticamente, sin intervención del admin.
    producto_cuota = _obtener_producto_cuota_social(db)
    precio_congelado = _calcular_precio_cuota(
        producto_cuota.precio_actual, socio.fecha_nacimiento, db
    )

    # Evitar duplicados: si ya hay una orden de cualquier cuota_social sin
    # resolver, no dejamos generar otra.
    ids_cuota = [
        p.id_producto
        for p in db.query(models.ProductoServicio)
        .filter(models.ProductoServicio.categoria == "cuota_social")
        .all()
    ]

    orden_pendiente_existente = (
        db.query(models.Orden.id_orden)
        .join(models.DetalleOrden, models.DetalleOrden.id_orden == models.Orden.id_orden)
        .filter(
            models.Orden.id_usuario == socio.id_usuario,
            models.Orden.estado == "pendiente_verificacion",
            models.DetalleOrden.id_producto.in_(ids_cuota),
        )
        .first()
    )
    if orden_pendiente_existente is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Ya tenés una orden de cuota pendiente (#{orden_pendiente_existente.id_orden}). "
                "Subí el comprobante o esperá a que se resuelva antes de generar otra."
            ),
        )

    monto_total = precio_congelado * payload.meses_a_pagar

    # 1 ── Crear el Pago (cabecera única de cobro) ──────────────────────────
    nuevo_pago = models.Pago(
        id_usuario=socio.id_usuario,
        monto_total=monto_total,
        estado="pendiente",
    )
    db.add(nuevo_pago)
    db.flush()

    # 2 ── Crear la Orden hija de cuota_social, colgada del Pago ────────────
    nueva_orden = models.Orden(
        id_usuario=socio.id_usuario,
        id_pago=nuevo_pago.id_pago,
        estado="pendiente_verificacion",
        monto_total=monto_total,
    )
    db.add(nueva_orden)
    db.flush()

    detalle = models.DetalleOrden(
        id_orden=nueva_orden.id_orden,
        id_producto=producto_cuota.id_producto,
        cantidad=payload.meses_a_pagar,
        precio_unitario_historico=precio_congelado,
    )
    db.add(detalle)

    _registrar_audit(
        db=db,
        actor_id=socio.id_usuario,
        accion="SOLICITAR_PAGO_CUOTA",
        tabla_afectada="ordenes",
        registro_id=nueva_orden.id_orden,
        detalle={
            "id_pago": nuevo_pago.id_pago,
            "id_producto": producto_cuota.id_producto,
            "nombre_producto": producto_cuota.nombre,
            "meses_a_pagar": payload.meses_a_pagar,
            "precio_unitario_historico": str(precio_congelado),
            "monto_total": str(monto_total),
            "es_menor": es_menor(socio.fecha_nacimiento),
        },
        ip=_extraer_ip(request),
    )

    db.commit()
    db.refresh(nueva_orden)

    return schemas.GenerarOrdenCuotaResponse(
        id_orden=nueva_orden.id_orden,
        id_pago=nuevo_pago.id_pago,
        estado=nueva_orden.estado,
        monto_total=nueva_orden.monto_total,
        meses_a_pagar=payload.meses_a_pagar,
        expira_at=nueva_orden.expira_at,
    )


# ─── ENDPOINT: Consultar orden pendiente ──────────────────────────────────────

@router.get(
    "/orden-pendiente",
    response_model=Optional[schemas.OrdenSocioPendienteResponse],
    summary="Devuelve la orden de cuota pendiente del socio, o null si no tiene ninguna",
)
def obtener_orden_pendiente(
    db: Session = Depends(get_db),
    socio: models.Usuario = Depends(require_roles(*_ROLES_SOCIO)),
) -> Optional[schemas.OrdenSocioPendienteResponse]:
    """
    Devuelve null (HTTP 200 con body `null`) cuando no hay orden pendiente.
    Se prefiere null sobre 404 porque la ausencia es un estado válido y
    esperado — el frontend puede ramificar sin capturar excepciones.
    """
    # Seleccionamos el producto correcto para el socio y filtramos por
    # categoría cuota_social en general, para cubrir cambios de edad.
    ids_cuota = [
        p.id_producto
        for p in db.query(models.ProductoServicio)
        .filter(models.ProductoServicio.categoria == "cuota_social")
        .all()
    ]

    orden = (
        db.query(models.Orden)
        .join(models.DetalleOrden, models.DetalleOrden.id_orden == models.Orden.id_orden)
        .options(
            joinedload(models.Orden.detalles).joinedload(models.DetalleOrden.producto),
            joinedload(models.Orden.pago),
        )
        .filter(
            models.Orden.id_usuario == socio.id_usuario,
            models.Orden.estado == "pendiente_verificacion",
            models.DetalleOrden.id_producto.in_(ids_cuota),
        )
        .order_by(models.Orden.fecha_creacion.desc())
        .first()
    )

    return orden


# ─── ENDPOINT: Cancelar orden pendiente ───────────────────────────────────────

@router.post(
    "/ordenes/{id_orden}/cancelar",
    response_model=schemas.OrdenCancelarResponse,
    summary="Cancelar una orden propia que aún está pendiente de verificación",
)
def cancelar_orden_pendiente(
    id_orden: int,
    request: Request,
    db: Session = Depends(get_db),
    socio: models.Usuario = Depends(require_roles(*_ROLES_SOCIO)),
) -> schemas.OrdenCancelarResponse:
    """
    Permite que el socio cancele su propia orden mientras esté en
    'pendiente_verificacion'. Una vez aprobada o rechazada no puede cancelarse.

    Seguridad: se devuelve 404 aunque la orden exista pero sea ajena,
    para evitar IDOR (no revelar existencia de órdenes de otros socios).
    """
    orden = (
        db.query(models.Orden)
        .options(joinedload(models.Orden.detalles).joinedload(models.DetalleOrden.producto))
        .filter(
            models.Orden.id_orden == id_orden,
            models.Orden.id_usuario == socio.id_usuario,
        )
        .first()
    )
    if orden is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="La orden indicada no existe.",
        )

    if orden.estado != "pendiente_verificacion":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"No se puede cancelar: la orden #{id_orden} está en estado "
                f"'{orden.estado}'. Solo se pueden cancelar órdenes en "
                "'pendiente_verificacion'."
            ),
        )

    orden.estado = "cancelada_socio"

    # Devolver el stock que el checkout había descontado (indumentaria/otros).
    # Este endpoint es principalmente para cuotas (sin stock), pero un socio
    # podría pasar el id de una orden de tienda propia — cubrimos ese caso.
    restaurar_stock_orden(orden)

    # ── Resolver el Pago padre si se quedó sin órdenes activas ──────────────
    pago = orden.pago
    pago_actualizado = False
    if pago is not None and pago.estado == "pendiente":
        quedan_ordenes_activas = (
            db.query(models.Orden.id_orden)
            .filter(
                models.Orden.id_pago == pago.id_pago,
                models.Orden.id_orden != orden.id_orden,
                models.Orden.estado == "pendiente_verificacion",
            )
            .first()
            is not None
        )
        if not quedan_ordenes_activas:
            pago.estado = "rechazado"
            pago_actualizado = True

    _registrar_audit(
        db=db,
        actor_id=socio.id_usuario,
        accion="CANCELAR_ORDEN_CUOTA",
        tabla_afectada="ordenes",
        registro_id=orden.id_orden,
        detalle={
            "estado_anterior": "pendiente_verificacion",
            "estado_nuevo": "cancelada_socio",
            "monto_total": str(orden.monto_total),
            "id_pago": orden.id_pago,
            "pago_marcado_rechazado": pago_actualizado,
        },
        ip=_extraer_ip(request),
    )

    db.commit()
    db.refresh(orden)

    return schemas.OrdenCancelarResponse(
        id_orden=orden.id_orden,
        estado=orden.estado,
    )


# ─── ENDPOINT: Subir comprobante de pago ──────────────────────────────────────

@router.post(
    "/pagos/{id_pago}/comprobante",
    response_model=schemas.ComprobanteUploadResponse,
    summary="Subir el comprobante de un pago propio (cubre todas sus órdenes hijas)",
)
async def subir_comprobante(
    id_pago: int,
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    socio: models.Usuario = Depends(require_roles(*_ROLES_SOCIO)),
) -> schemas.ComprobanteUploadResponse:
    """
    El comprobante se adjunta al Pago (patrón Split-Order), no a cada Orden
    individual — un mismo comprobante puede cubrir la orden de cuota_social
    y la orden de tienda generadas en un mismo checkout.
    """
    pago = (
        db.query(models.Pago)
        .filter(models.Pago.id_pago == id_pago)
        .first()
    )
    if pago is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El pago indicado no existe.",
        )

    # No revelamos si el pago existe pero es de otro socio: mismo 404.
    if pago.id_usuario != socio.id_usuario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El pago indicado no existe.",
        )

    if pago.estado != "pendiente":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"No se puede subir comprobante: el pago está en estado "
                f"'{pago.estado}', no 'pendiente'."
            ),
        )

    s3_key, nombre_original, tamano_bytes = await validar_y_subir_comprobante(
        file, pago.id_pago
    )

    comprobante_anterior = pago.comprobante_url
    # Guardar el key de S3 en DB (no una ruta local)
    pago.comprobante_url = s3_key

    # ── Reiniciar el reloj de expiración ────────────────────────────────────
    # Las 48hs de expira_at arrancan a contar desde el checkout, no desde que
    # se sube el comprobante — un socio que tarda en conseguir/subir la foto
    # de la transferencia le dejaba al admin una ventana real mucho más
    # corta que 48hs para revisarla (a veces solo un par de horas). Al subir
    # el comprobante, le damos a cada orden hermana pendiente_verificacion
    # una ventana completa y fresca de 48hs desde este momento.
    nuevo_vencimiento = datetime.now(timezone.utc) + timedelta(hours=48)
    for orden_hermana in pago.ordenes:
        if orden_hermana.estado == "pendiente_verificacion":
            orden_hermana.expira_at = nuevo_vencimiento

    # Eliminar comprobante anterior de S3 si existía
    borrar_comprobante_anterior(comprobante_anterior)

    _registrar_audit(
        db=db,
        actor_id=socio.id_usuario,
        accion="SUBIR_COMPROBANTE_CUOTA",
        tabla_afectada="pagos",
        registro_id=pago.id_pago,
        detalle={
            "comprobante_url": s3_key,
            "comprobante_anterior": comprobante_anterior,
            "nombre_original": nombre_original,
            "tamano_bytes": tamano_bytes,
        },
        ip=_extraer_ip(request),
    )

    db.commit()
    db.refresh(pago)

    # ── Avisar al club que llegó un comprobante para verificar ────────────────
    background_tasks.add_task(
        email_tasks.task_aviso_club_comprobante_recibido,
        nombre_socio=f"{socio.nombre} {socio.apellido}",
        dni_socio=socio.dni,
        numero_pago=pago.id_pago,
        monto=str(pago.monto_total),
        comprobante_url=s3_key,
    )

    return schemas.ComprobanteUploadResponse(
        id_pago=pago.id_pago,
        comprobante_url=_resolver_url_archivo(pago.comprobante_url),
    )