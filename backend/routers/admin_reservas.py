# backend/routers/admin_reservas.py
"""
Router de visualización de reservas para el administrador.
"""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

import models
import schemas
from database import get_db
from dependencies import require_roles

router = APIRouter(
    prefix="/admin/reservas",
    tags=["Admin — Reservas"],
)

_ROLES_ADMIN = ("admin_general", "personal_administrativo")

@router.get(
    "/",
    response_model=List[schemas.ReservaAdminResponse],
    summary="Listar todas las reservas de instalaciones con datos de la orden y socio",
)
def listar_reservas_admin(
    db: Session = Depends(get_db),
    _admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN)),
) -> List[models.ReservaInstalacion]:
    """
    Devuelve un listado completo de todas las reservas de instalaciones,
    enriquecidas con la información de la orden de pago asociada y los datos
    del socio que la realizó.

    Utiliza `joinedload` para cargar eficientemente las relaciones:
    ReservaInstalacion → Orden → Usuario.

    Ordenado por fecha de inicio de la reserva de forma descendente.
    """
    reservas = (
        db.query(models.ReservaInstalacion)
        .options(
            joinedload(models.ReservaInstalacion.orden)
            .joinedload(models.Orden.usuario)
        )
        .order_by(models.ReservaInstalacion.fecha_inicio.desc())
        .all()
    )
    return reservas