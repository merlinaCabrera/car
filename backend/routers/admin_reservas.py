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

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from utils.audit import registrar_audit, extraer_ip

@router.post(
    "/admin/reservas/{id_reserva}/suspender",
    response_model=schemas.SuspenderReservaResponse,
    summary="Suspender una reserva confirmada y acreditar saldo a favor (ej: lluvia)",
)
def suspender_reserva(
    id_reserva: int,
    payload: schemas.SuspenderReservaPayload,
    request: Request,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN)),
) -> schemas.SuspenderReservaResponse:
    reserva = (
        db.query(models.ReservaInstalacion)
        .filter(models.ReservaInstalacion.id_reserva == id_reserva)
        .first()
    )
    if reserva is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reserva no encontrada.")
    if reserva.estado != "confirmada":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Solo se pueden suspender reservas confirmadas.",
        )
    if reserva.id_orden is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La reserva no tiene una orden asociada; no hay monto que reintegrar.",
        )

    detalle = (
        db.query(models.DetalleOrden)
        .filter(models.DetalleOrden.id_reserva == reserva.id_reserva)
        .first()
    )
    if detalle is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No se encontró el ítem de orden correspondiente a esta reserva.",
        )
    if reserva.id_usuario is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La reserva no tiene un socio responsable registrado; no se puede acreditar.",
        )

    monto = detalle.precio_unitario_historico * detalle.cantidad

    responsable = (
        db.query(models.Usuario)
        .filter(models.Usuario.id_usuario == reserva.id_usuario)
        .first()
    )
    if responsable is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Socio responsable no encontrado.")

    reserva.estado = "liberada"
    reserva.notas = f"{reserva.notas + ' — ' if reserva.notas else ''}SUSPENDIDA: {payload.motivo}"
    responsable.saldo_a_favor = responsable.saldo_a_favor + monto

    registrar_audit(
        db=db,
        actor_id=admin.id_usuario,
        accion="suspender_reserva",
        tabla_afectada="reservas_instalaciones",
        registro_id=reserva.id_reserva,
        detalle={
            "motivo": payload.motivo,
            "monto_acreditado": str(monto),
            "id_usuario_acreditado": responsable.id_usuario,
        },
        ip=extraer_ip(request),
    )

    db.commit()
    db.refresh(responsable)

    return schemas.SuspenderReservaResponse(
        id_reserva=reserva.id_reserva,
        estado=reserva.estado,
        monto_acreditado=monto,
        id_usuario_acreditado=responsable.id_usuario,
        nuevo_saldo=responsable.saldo_a_favor,
    )