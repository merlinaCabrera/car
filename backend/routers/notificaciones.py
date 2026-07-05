# backend/routers/notificaciones.py
"""
Router para la gestión de notificaciones del usuario.

Endpoints:
  GET  /notificaciones/             → Lista las notificaciones del usuario logueado.
  POST /notificaciones/marcar-leidas → Marca una o más notificaciones como leídas.
"""
from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy import update
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from dependencies import get_current_user

router = APIRouter(
    prefix="/notificaciones",
    tags=["Notificaciones"],
)


@router.get(
    "/",
    response_model=List[schemas.NotificacionResponse],
    summary="Listar notificaciones del usuario logueado",
)
def listar_notificaciones(
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
) -> List[models.Notificacion]:
    """
    Devuelve todas las notificaciones del usuario autenticado, tanto leídas
    como no leídas, ordenadas por fecha de creación descendente.
    """
    notificaciones = (
        db.query(models.Notificacion)
        .filter(models.Notificacion.id_usuario == current_user.id_usuario)
        .order_by(models.Notificacion.created_at.desc())
        .all()
    )
    return notificaciones


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