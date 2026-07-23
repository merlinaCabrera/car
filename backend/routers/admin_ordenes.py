# backend/routers/admin_ordenes.py
"""
Router de verificación de Órdenes — panel del administrador.

Endpoints:
  GET  /admin/ordenes/pendientes              → Bandeja de órdenes esperando verificación
                                                  (con filtro opcional por tipo: cuota | tienda).
  GET  /admin/ordenes/pendientes/count        → Cantidad total de órdenes pendientes.
  GET  /admin/ordenes/pendientes-tienda/count → Cantidad de órdenes pendientes que son
                                                  puras ventas de tienda/alquiler (sin cuota_social).
  POST /admin/ordenes/{id_orden}/aprobar      → Aprueba la orden y aplica sus efectos.
  POST /admin/ordenes/{id_orden}/rechazar     → Rechaza la orden con motivo obligatorio.

Todos los endpoints requieren rol 'admin_general' o 'personal_administrativo'.

El motor de negocio de la aprobación (deuda, cobertura, stock, reservas,
audit_log, notificaciones y mails) vive en utils/ordenes.py —
procesar_aprobacion_orden(). Se extrajo ahí para que el webhook de Mercado
Pago (routers/webhooks_mercadopago.py) pueda aprobar automáticamente
ejecutando EXACTAMENTE el mismo código que un admin humano, sin duplicar
la lógica. Ver ese módulo para el detalle del algoritmo (motor de períodos,
manejo de stock, reservas, etc.).
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session, joinedload

import models
import schemas
from database import get_db
from dependencies import require_roles
from mailer.services import email_tasks
from utils.audit import registrar_audit as _registrar_audit, extraer_ip as _extraer_ip
from utils.ordenes import procesar_aprobacion_orden, verificar_pendiente

router = APIRouter(
    prefix="/admin/ordenes",
    tags=["Admin — Verificación de Órdenes"],
)

_ROLES_ADMIN = ("admin_general", "personal_administrativo")
_TIPOS_FILTRO_VALIDOS = ("cuota", "tienda")


# ─── Helpers de esta ruta ─────────────────────────────────────────────────────

def _obtener_orden_o_404(db: Session, id_orden: int) -> models.Orden:
    orden = (
        db.query(models.Orden)
        .options(
            joinedload(models.Orden.detalles).joinedload(models.DetalleOrden.producto),
            joinedload(models.Orden.detalles).joinedload(models.DetalleOrden.reserva),
            joinedload(models.Orden.usuario),
            joinedload(models.Orden.pago),
        )
        .filter(models.Orden.id_orden == id_orden)
        .first()
    )
    if orden is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No existe la orden #{id_orden}.",
        )
    return orden


def _subquery_tiene_cuota_social(db: Session):
    """Subquery EXISTS: True si la orden tiene al menos un ítem de cuota_social."""
    return (
        db.query(models.DetalleOrden.id_detalle)
        .join(
            models.ProductoServicio,
            models.DetalleOrden.id_producto == models.ProductoServicio.id_producto,
        )
        .filter(
            models.DetalleOrden.id_orden == models.Orden.id_orden,
            models.ProductoServicio.categoria == "cuota_social",
        )
        .exists()
    )


def _aplicar_filtro_tipo(query, db: Session, tipo: Optional[str]):
    """Aplica el filtro `tipo` ('cuota' | 'tienda') a un query de Orden."""
    if tipo is None:
        return query

    if tipo not in _TIPOS_FILTRO_VALIDOS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Parámetro 'tipo' inválido. Opciones válidas: {_TIPOS_FILTRO_VALIDOS}.",
        )

    tiene_cuota = _subquery_tiene_cuota_social(db)
    if tipo == "cuota":
        return query.filter(tiene_cuota)
    return query.filter(~tiene_cuota)


# ─── ENDPOINT: Bandeja de órdenes pendientes ──────────────────────────────────

@router.get(
    "/pendientes",
    response_model=List[schemas.OrdenAdminResponse],
    summary="Listar órdenes pendientes de verificación (con filtro opcional por tipo)",
)
def listar_ordenes_pendientes(
    tipo: Optional[str] = Query(
        None,
        description="Filtro opcional: 'cuota' (contienen cuota_social) o "
                    "'tienda' (indumentaria/alquileres, sin cuota_social). "
                    "Si se omite, devuelve todas.",
    ),
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN)),
) -> List[schemas.OrdenAdminResponse]:
    query = (
        db.query(models.Orden)
        .options(
            joinedload(models.Orden.detalles).joinedload(models.DetalleOrden.producto),
            joinedload(models.Orden.usuario),
            joinedload(models.Orden.pago),
        )
        .filter(models.Orden.estado == "pendiente_verificacion")
    )

    query = _aplicar_filtro_tipo(query, db, tipo)
    ordenes = query.order_by(models.Orden.fecha_creacion.asc()).all()
    return ordenes


@router.get("/pendientes/count", response_model=int, summary="Cantidad de órdenes pendientes")
def contar_ordenes_pendientes(
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN)),
) -> int:
    return db.query(models.Orden).filter(models.Orden.estado == "pendiente_verificacion").count()


@router.get(
    "/pendientes-tienda/count",
    response_model=int,
    summary="Cantidad de órdenes pendientes que son puras ventas de tienda (sin cuota_social)",
)
def contar_ordenes_pendientes_tienda(
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN)),
) -> int:
    query = db.query(models.Orden).filter(models.Orden.estado == "pendiente_verificacion")
    query = _aplicar_filtro_tipo(query, db, "tienda")
    return query.count()


# ─── ENDPOINT: Aprobar orden ───────────────────────────────────────────────────

@router.post(
    "/{id_orden}/aprobar",
    response_model=schemas.OrdenAprobarResponse,
    summary="Aprobar una orden pendiente de verificación",
)
def aprobar_orden(
    id_orden: int,
    payload: schemas.OrdenAprobar,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN)),
) -> schemas.OrdenAprobarResponse:
    """
    Aprobación manual: un admin humano revisó el comprobante y confirma.
    Todo el motor de negocio vive en utils.ordenes.procesar_aprobacion_orden
    — el mismo que usa el webhook de Mercado Pago para aprobar sin
    intervención humana.
    """
    orden = _obtener_orden_o_404(db, id_orden)
    verificar_pendiente(orden)

    respuesta = procesar_aprobacion_orden(
        db=db,
        orden=orden,
        actor_id=admin.id_usuario,
        background_tasks=background_tasks,
        notas_admin=payload.notas_admin,
        meses_corregidos=payload.meses_corregidos,
        ip=_extraer_ip(request),
    )

    db.commit()
    db.refresh(orden)

    return respuesta


# ─── ENDPOINT: Rechazar orden ──────────────────────────────────────────────────

@router.post(
    "/{id_orden}/rechazar",
    response_model=schemas.OrdenRechazarResponse,
    summary="Rechazar una orden pendiente de verificación",
)
def rechazar_orden(
    id_orden: int,
    payload: schemas.OrdenRechazar,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN)),
) -> schemas.OrdenRechazarResponse:
    orden = _obtener_orden_o_404(db, id_orden)
    verificar_pendiente(orden)

    orden.estado = "rechazada"
    orden.motivo_rechazo = payload.motivo_rechazo

    # ── Liberar reservas de alquiler asociadas ────────────────────────────────
    # Si la orden tenía turnos bloqueados, hay que devolverlos a la agenda:
    # el pago no se concretó, así que el horario tiene que volver a ofertarse.
    for detalle in orden.detalles:
        if (
            detalle.producto is not None
            and detalle.producto.categoria == "alquiler"
            and detalle.reserva is not None
            and detalle.reserva.estado == "bloqueada"
        ):
            detalle.reserva.estado = "liberada"

    # ── Resolver el Pago padre si quedó "huérfano" ────────────────────────────
    # Un Pago puede tener más de una Orden hija (split-order: cuota + tienda).
    # Si esta era la única orden útil (ninguna otra sigue pendiente ni fue
    # aprobada), el rechazo es total: dejamos el Pago en 'rechazado'.
    quedan_ordenes_utiles = (
        db.query(models.Orden.id_orden)
        .filter(
            models.Orden.id_pago == orden.id_pago,
            models.Orden.id_orden != orden.id_orden,
            models.Orden.estado.in_(("pendiente_verificacion", "aprobada")),
        )
        .first()
        is not None
    )

    pago = orden.pago
    pago_marcado_rechazado = False
    if pago is not None and pago.estado == "pendiente" and not quedan_ordenes_utiles:
        pago.estado = "rechazado"
        pago_marcado_rechazado = True

    _registrar_audit(
        db=db,
        actor_id=admin.id_usuario,
        accion="RECHAZAR_ORDEN",
        tabla_afectada="ordenes",
        registro_id=orden.id_orden,
        detalle={
            "id_usuario": orden.id_usuario,
            "motivo_rechazo": payload.motivo_rechazo,
            "monto_total": str(orden.monto_total),
            "id_pago": orden.id_pago,
            "pago_marcado_rechazado": pago_marcado_rechazado,
        },
        ip=_extraer_ip(request),
    )

    # ── Notificar al socio ───────────────────────────────────────────────────
    db.add(
        models.Notificacion(
            id_usuario=orden.id_usuario,
            tipo="orden_rechazada",
            titulo="Problema con tu pago",
            cuerpo=f"Hubo un problema con tu transferencia por ${orden.monto_total}. "
                   f"Motivo: {payload.motivo_rechazo}.",
            referencia_id=orden.id_orden,
            referencia_tabla="ordenes",
        )
    )

    # ── Mail al socio avisando el rechazo (background) ───────────────────────
    socio_rechazo = orden.usuario
    if socio_rechazo and socio_rechazo.email:
        background_tasks.add_task(
            email_tasks.task_orden_rechazada,
            email_destino=socio_rechazo.email,
            nombre_socio=socio_rechazo.nombre,
            numero_orden=orden.id_orden,
            motivo=payload.motivo_rechazo,
        )

    db.commit()
    db.refresh(orden)

    return schemas.OrdenRechazarResponse(
        id_orden=orden.id_orden,
        estado=orden.estado,
        motivo_rechazo=orden.motivo_rechazo,
    )