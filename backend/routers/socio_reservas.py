# backend/routers/socio_reservas.py
"""
Router de consulta de disponibilidad de instalaciones (quincho, canchas, etc.)
para el socio — Módulo de Reservas.

── Registrar en main.py ────────────────────────────────────────────────────────
    from routers import socio_reservas
    app.include_router(socio_reservas.router)
────────────────────────────────────────────────────────────────────────────────

Endpoints:
  GET /socio/reservas/  → Franjas ocupadas (bloqueada/confirmada)
                          para pintar el calendario. Permite filtrar por
                          instalación y/o fecha.

Decisiones técnicas:
  - Solo se devuelven reservas en estado 'bloqueada' o 'confirmada'. Las
    'liberada'/'expirada' no ocupan la agenda y no tiene sentido pintarlas.
  - Si no se especifica `fecha`, se filtra por defecto `fecha_fin >= ahora`
    para no traer reservas pasadas (el calendario solo necesita futuro).
  - La respuesta es intencionalmente liviana (`DisponibilidadReservaResponse`):
    no expone `id_orden` ni `id_producto`, porque cualquier socio autenticado
    puede consultar la agenda de una instalación y no debe ver a qué orden
    (de qué otro socio) corresponde cada bloqueo — solo el rango horario.
  - Este endpoint es de solo lectura: no crea, ni bloquea, ni valida
    superposición. Eso lo hará POST /socio/reservas/pre-reserva (pendiente).
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from dependencies import require_roles

router = APIRouter(
    prefix="/socio/reservas",
    tags=["Socio — Reservas de Instalaciones"],
)

# Mismo criterio que socio_carrito.py: jugador hereda derechos de socio,
# admin_general se incluye para poder testear el flujo sin un segundo usuario.
_ROLES_COMPRADORES = ("socio", "jugador", "admin_general")

_ESTADOS_OCUPA_AGENDA = ("bloqueada", "confirmada")


@router.get(
    "/",
    response_model=List[schemas.DisponibilidadReservaResponse],
    summary="Franjas ocupadas de instalaciones (para pintar el calendario)",
)
def listar_disponibilidad(
    instalacion: Optional[str] = Query(
        default=None,
        description="Filtrar por una instalación específica (ej: 'quincho').",
    ),
    fecha: Optional[date] = Query(
        default=None,
        description="Filtrar por una fecha específica (YYYY-MM-DD). Devuelve reservas que se superponen con ese día.",
    ),
    db: Session = Depends(get_db),
    _socio: models.Usuario = Depends(require_roles(*_ROLES_COMPRADORES)),
) -> List[schemas.DisponibilidadReservaResponse]:
    query = (
        db.query(models.ReservaInstalacion)
        .filter(
            models.ReservaInstalacion.estado.in_(_ESTADOS_OCUPA_AGENDA),
        )
    )

    if instalacion:
        query = query.filter(models.ReservaInstalacion.instalacion == instalacion)

    if fecha:
        # Filtra reservas que se superponen con el día consultado.
        start_of_day = datetime.combine(fecha, datetime.min.time()).replace(tzinfo=timezone.utc)
        end_of_day = start_of_day + timedelta(days=1)
        query = query.filter(
            models.ReservaInstalacion.fecha_inicio < end_of_day,
            models.ReservaInstalacion.fecha_fin > start_of_day,
        )
    else:
        # Comportamiento por defecto: mostrar todas las reservas futuras
        query = query.filter(models.ReservaInstalacion.fecha_fin >= datetime.now(timezone.utc))

    return query.order_by(models.ReservaInstalacion.fecha_inicio.asc()).all()