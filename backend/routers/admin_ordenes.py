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

Decisiones técnicas:
  - Al aprobar, se recorren los detalles de la orden y, únicamente para los
    ítems cuyo producto pertenece a la categoría 'cuota_social', se resta
    `cantidad` a `deuda_historica_meses` del socio dueño de la orden, con
    clamp en 0 (nunca queda negativa — coherente con el
    CheckConstraint chk_deuda_no_negativa de models.py).
  - Para el resto de las categorías (alquiler, indumentaria, otro) con manejo
    de stock (`stock IS NOT NULL`), se valida disponibilidad y se descuenta
    `cantidad` del stock del producto. Si no alcanza, se aborta la aprobación
    completa con 400 (nada se persiste porque el commit es único, al final).
  - "Tipo" de orden (cuota vs. tienda) se determina por la presencia de al
    menos un DetalleOrden cuyo producto sea categoria='cuota_social'. Una
    orden mixta (cuota + tienda en el mismo carrito) se considera 'cuota'
    a fines del filtro — no debería ocurrir en el flujo normal, pero así
    ninguna orden con componente de cuota social queda fuera de la bandeja
    de cuotas.
  - Solo se puede aprobar/rechazar una orden que esté en
    'pendiente_verificacion'; cualquier otro estado es un 400, para evitar
    doble procesamiento.
  - Cada acción queda en audit_log con snapshot de antes/después.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
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
_TIPOS_FILTRO_VALIDOS = ("cuota", "tienda")


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


def _subquery_tiene_cuota_social(db: Session):
    """
    Subquery EXISTS: True si la orden (correlacionada por id_orden) tiene al
    menos un DetalleOrden cuyo producto es de categoría 'cuota_social'.
    """
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
    """Aplica el filtro `tipo` ('cuota' | 'tienda') a un query de Orden ya construido."""
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
    # tipo == "tienda"
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

    # ── Descuento de deuda (cuota_social) y de stock (tienda) ─────────────────
    # Recorremos los detalles (ya potencialmente actualizados arriba). Nada de
    # esto se persiste todavía porque el commit es único, al final: si algún
    # ítem de tienda no tiene stock suficiente, abortamos con 400 y ningún
    # cambio (deuda ni stock) queda guardado.
    for detalle in orden.detalles:
        if detalle.producto is None:
            continue

        if detalle.producto.categoria == "cuota_social":
            meses_cuota_descontados += detalle.cantidad
        elif detalle.producto.stock is not None:
            if detalle.producto.stock < detalle.cantidad:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Stock insuficiente para '{detalle.producto.nombre}': "
                        f"disponible {detalle.producto.stock}, solicitado {detalle.cantidad}. "
                        f"No se puede aprobar la orden #{orden.id_orden}."
                    ),
                )
            detalle.producto.stock -= detalle.cantidad

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