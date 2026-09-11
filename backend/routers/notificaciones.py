# backend/routers/notificaciones.py
"""
Router para la gestión de notificaciones del usuario.

Endpoints:
  GET  /notificaciones/             → Lista las notificaciones del usuario logueado.
  POST /notificaciones/marcar-leidas → Marca una o más notificaciones como leídas.
"""
from typing import Dict, List, Optional, Set

from fastapi import APIRouter, Depends, status
from sqlalchemy import or_, update
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from dependencies import get_current_user

router = APIRouter(
    prefix="/notificaciones",
    tags=["Notificaciones"],
)

# ─── Rutas del frontend a las que apunta el botón "Ver detalle" ───────────────
# Decisión D6 (QA del 11-09): el desglose de una compra de cuota social vive en
# /socio/cuotas, no en /mis-compras. Antes el frontend mandaba a /mis-compras
# cualquier notificación con referencia_tabla='ordenes' —sin saber qué se había
# comprado—, así que el aviso de "pago de cuota verificado" caía en una pantalla
# que no mostraba esa compra.
_RUTA_CUOTAS  = "/socio/cuotas"
_RUTA_COMPRAS = "/mis-compras"


def _ruta_para_categorias(categorias: Optional[Set[str]]) -> Optional[str]:
    """
    Resuelve a qué pantalla mandar según las categorías de lo comprado.

    Solo-cuota → Gestión de Cuotas. Mixta (cuota + tienda/alquiler) → Mis
    Compras, que desde D6 muestra las dos cosas y linkea al detalle de cuotas.
    Sin categorías (la orden/pago no existe o no es del socio) → sin acción.
    """
    if not categorias:
        return None
    if categorias == {"cuota_social"}:
        return _RUTA_CUOTAS
    return _RUTA_COMPRAS


def _rutas_destino(
    db: Session,
    id_usuario: int,
    notificaciones: List[models.Notificacion],
) -> Dict[int, Optional[str]]:
    """
    Mapea id_notificacion → ruta del frontend, en UNA sola query.

    Las notificaciones apuntan a una orden (referencia_tabla='ordenes') o a un
    pago (='pagos', el aviso de comprobante generado del checkout). En los dos
    casos hace falta saber qué categorías tiene lo comprado; se resuelven las
    dos de una, filtrando además por id_usuario para que una referencia ajena
    nunca devuelva ruta.
    """
    ids_ordenes = {
        n.referencia_id for n in notificaciones
        if n.referencia_tabla == "ordenes" and n.referencia_id is not None
    }
    ids_pagos = {
        n.referencia_id for n in notificaciones
        if n.referencia_tabla == "pagos" and n.referencia_id is not None
    }
    if not ids_ordenes and not ids_pagos:
        return {}

    condiciones = []
    if ids_ordenes:
        condiciones.append(models.Orden.id_orden.in_(ids_ordenes))
    if ids_pagos:
        condiciones.append(models.Orden.id_pago.in_(ids_pagos))

    filas = (
        db.query(
            models.Orden.id_orden,
            models.Orden.id_pago,
            models.ProductoServicio.categoria,
        )
        .join(models.DetalleOrden, models.DetalleOrden.id_orden == models.Orden.id_orden)
        .join(
            models.ProductoServicio,
            models.ProductoServicio.id_producto == models.DetalleOrden.id_producto,
        )
        .filter(models.Orden.id_usuario == id_usuario, or_(*condiciones))
        .all()
    )

    cats_orden: Dict[int, Set[str]] = {}
    cats_pago: Dict[int, Set[str]] = {}
    for id_orden, id_pago, categoria in filas:
        cats_orden.setdefault(id_orden, set()).add(categoria)
        cats_pago.setdefault(id_pago, set()).add(categoria)

    rutas: Dict[int, Optional[str]] = {}
    for n in notificaciones:
        if n.referencia_id is None:
            continue
        if n.referencia_tabla == "ordenes":
            rutas[n.id_notificacion] = _ruta_para_categorias(cats_orden.get(n.referencia_id))
        elif n.referencia_tabla == "pagos":
            rutas[n.id_notificacion] = _ruta_para_categorias(cats_pago.get(n.referencia_id))
    return rutas


@router.get(
    "/",
    response_model=List[schemas.NotificacionResponse],
    summary="Listar notificaciones del usuario logueado",
)
def listar_notificaciones(
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
) -> List[schemas.NotificacionResponse]:
    """
    Devuelve todas las notificaciones del usuario autenticado, tanto leídas
    como no leídas, ordenadas por fecha de creación descendente.

    Cada notificación que referencia una orden o un pago viaja con su
    `ruta_destino` ya resuelta (ver `_rutas_destino`): el frontend no puede
    decidirlo solo porque depende de la categoría de lo comprado.
    """
    notificaciones = (
        db.query(models.Notificacion)
        .filter(models.Notificacion.id_usuario == current_user.id_usuario)
        .order_by(models.Notificacion.created_at.desc())
        .all()
    )

    rutas = _rutas_destino(db, current_user.id_usuario, notificaciones)
    respuesta = []
    for n in notificaciones:
        item = schemas.NotificacionResponse.model_validate(n)
        item.ruta_destino = rutas.get(n.id_notificacion)
        respuesta.append(item)
    return respuesta


@router.post(
    "/marcar-leidas",
    status_code=status.HTTP_200_OK,
    summary="Marcar una o más notificaciones como leídas",
)
def marcar_notificaciones_leidas(
    payload: schemas.MarcarLeidaPayload,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
) -> dict:
    """
    Actualiza el estado de una lista de notificaciones a `leida = True`.
    La operación es masiva y solo afecta a las notificaciones que pertenecen
    al usuario autenticado, para evitar que un usuario modifique las de otro.
    """
    if not payload.ids:
        return {"ok": True, "filas_afectadas": 0}

    # Usamos sqlalchemy.update para una operación masiva y eficiente.
    # Es crucial el doble filtro: id_notificacion IN (...) AND id_usuario = ...
    stmt = (
        update(models.Notificacion)
        .where(
            models.Notificacion.id_notificacion.in_(payload.ids),
            models.Notificacion.id_usuario == current_user.id_usuario,
            models.Notificacion.leida.is_(False),
        )
        .values(leida=True)
    )

    result = db.execute(stmt)
    db.commit()

    return {"ok": True, "filas_afectadas": result.rowcount}