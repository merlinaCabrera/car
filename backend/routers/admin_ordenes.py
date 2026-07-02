# backend/routers/admin_ordenes.py
"""
Router de verificación de Órdenes — panel del administrador.

Endpoints:
  GET  /admin/ordenes/pendientes         → Bandeja de órdenes esperando verificación.
  POST /admin/ordenes/{id_orden}/aprobar → Aprueba la orden y aplica sus efectos.
  POST /admin/ordenes/{id_orden}/rechazar→ Rechaza la orden con motivo obligatorio.

Todos los endpoints requieren rol 'admin_general' o 'personal_administrativo'.

Decisiones técnicas:
  - Al aprobar, se recorren los detalles de la orden y, únicamente para los
    ítems cuyo producto pertenece a la categoría 'cuota_social', se resta
    `cantidad` a `deuda_historica_meses` del socio dueño de la orden, con
    clamp en 0 (nunca queda negativa — coherente con el
    CheckConstraint chk_deuda_no_negativa de models.py).
  - Otras categorías (alquiler, indumentaria, otro) no tocan la deuda; quedan
    como puntos de extensión futura (ej: confirmar reserva, descontar stock).
  - Solo se puede aprobar/rechazar una orden que esté en
    'pendiente_verificacion'; cualquier otro estado es un 400, para evitar
    doble procesamiento.
  - Cada acción queda en audit_log con snapshot de antes/después.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session, joinedload

import models
import schemas
from database import get_db
from dependencies import get_current_user, require_roles

router = APIRouter(
    prefix="/admin/ordenes",
    tags=["Admin — Verificación de Órdenes"],
)

_ROLES_ADMIN = ("admin_general", "personal_administrativo")


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


def _obtener_orden_o_404(db: Session, id_orden: int) -> models.Orden:
    orden = (
        db.query(models.Orden)
        .options(
            joinedload(models.Orden.detalles).joinedload(models.DetalleOrden.producto),
            joinedload(models.Orden.usuario),
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


def _verificar_pendiente(orden: models.Orden) -> None:
    if orden.estado != "pendiente_verificacion":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"La orden #{orden.id_orden} está en estado '{orden.estado}' y no "
                "puede procesarse; solo se pueden resolver órdenes "
                "'pendiente_verificacion'."
            ),
        )


# ─── ENDPOINT: Bandeja de órdenes pendientes ──────────────────────────────────

@router.get(
    "/pendientes",
    response_model=List[schemas.OrdenAdminResponse],
    summary="Listar todas las órdenes pendientes de verificación",
)
def listar_ordenes_pendientes(
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN)),
) -> List[schemas.OrdenAdminResponse]:
    ordenes = (
        db.query(models.Orden)
        .options(
            joinedload(models.Orden.detalles).joinedload(models.DetalleOrden.producto),
            joinedload(models.Orden.usuario),
        )
        .filter(models.Orden.estado == "pendiente_verificacion")
        .order_by(models.Orden.fecha_creacion.asc())
        .all()
    )
    return ordenes


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
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN)),
) -> schemas.OrdenAprobarResponse:
    orden = _obtener_orden_o_404(db, id_orden)
    _verificar_pendiente(orden)

    socio = orden.usuario
    deuda_antes = socio.deuda_historica_meses
    meses_cuota_descontados = 0
    meses_corregidos_aplicados: Optional[int] = None

    # ── Corrección opcional de meses antes de aprobar ─────────────────────────
    # Si el admin indica `meses_corregidos`, actualizamos el DetalleOrden de
    # cuota_social y recalculamos el monto_total de la orden con el precio
    # unitario que ya estaba congelado en el detalle (precio_unitario_historico).
    # Esto cubre el caso habitual: el socio solicitó N meses pero el comprobante
    # adjunto muestra un importe que corresponde a M meses distintos.
    if payload.meses_corregidos is not None:
        detalle_cuota = next(
            (
                d for d in orden.detalles
                if d.producto is not None and d.producto.categoria == "cuota_social"
            ),
            None,
        )
        if detalle_cuota is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Se especificó 'meses_corregidos' pero la orden no contiene "
                    "ningún ítem de categoría 'cuota_social' que corregir."
                ),
            )
        meses_corregidos_aplicados = payload.meses_corregidos
        detalle_cuota.cantidad = meses_corregidos_aplicados
        orden.monto_total = detalle_cuota.precio_unitario_historico * meses_corregidos_aplicados

    # ── Descuento de deuda ────────────────────────────────────────────────────
    # Recorremos los detalles (ya potencialmente actualizados arriba) para
    # sumar los meses de cuota_social que esta aprobación va a saldar.
    for detalle in orden.detalles:
        if detalle.producto is not None and detalle.producto.categoria == "cuota_social":
            meses_cuota_descontados += detalle.cantidad

    if meses_cuota_descontados > 0:
        socio.deuda_historica_meses = max(0, socio.deuda_historica_meses - meses_cuota_descontados)

    orden.estado = "aprobada"
    orden.aprobada_por = admin.id_usuario
    orden.aprobada_at = datetime.now(timezone.utc)
    if payload.notas_admin:
        orden.notas_admin = payload.notas_admin

    _registrar_audit(
        db=db,
        actor_id=admin.id_usuario,
        accion="APROBAR_ORDEN",
        tabla_afectada="ordenes",
        registro_id=orden.id_orden,
        detalle={
            "id_usuario": socio.id_usuario,
            "meses_cuota_descontados": meses_cuota_descontados,
            "meses_corregidos_aplicados": meses_corregidos_aplicados,
            "deuda_historica_meses_antes": deuda_antes,
            "deuda_historica_meses_despues": socio.deuda_historica_meses,
            "monto_total": str(orden.monto_total),
            "notas_admin": payload.notas_admin,
        },
        ip=_extraer_ip(request),
    )

    db.commit()
    db.refresh(orden)

    return schemas.OrdenAprobarResponse(
        id_orden=orden.id_orden,
        estado=orden.estado,
        aprobada_por=orden.aprobada_por,
        aprobada_at=orden.aprobada_at,
        deuda_historica_meses_restante=(
            socio.deuda_historica_meses if meses_cuota_descontados > 0 else None
        ),
    )


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
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN)),
) -> schemas.OrdenRechazarResponse:
    orden = _obtener_orden_o_404(db, id_orden)
    _verificar_pendiente(orden)

    orden.estado = "rechazada"
    orden.motivo_rechazo = payload.motivo_rechazo

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
        },
        ip=_extraer_ip(request),
    )

    db.commit()
    db.refresh(orden)

    return schemas.OrdenRechazarResponse(
        id_orden=orden.id_orden,
        estado=orden.estado,
        motivo_rechazo=orden.motivo_rechazo,
    )