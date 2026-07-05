# backend/routers/socio_reservas.py
"""
Router de consulta de disponibilidad de instalaciones (quincho, canchas, etc.)
para el socio — Módulo de Reservas.

── Registrar en main.py ────────────────────────────────────────────────────────
    from routers import socio_reservas
    app.include_router(socio_reservas.router)
────────────────────────────────────────────────────────────────────────────────

Endpoints:
  GET /socio/reservas/{instalacion}  → Franjas ocupadas (bloqueada/confirmada)
                                         de esa instalación, para pintar el
                                         calendario y evitar que el socio elija
                                         un horario ya tomado.

Decisiones técnicas:
  - Solo se devuelven reservas en estado 'bloqueada' o 'confirmada'. Las
    'liberada'/'expirada' no ocupan la agenda y no tiene sentido pintarlas.
  - Se filtra por defecto `fecha_fin >= ahora` para no traer reservas pasadas
    (el calendario del frontend solo necesita futuro). Params `desde`/`hasta`
    opcionales permiten paginar por rango si el calendario los usa.
  - La respuesta es intencionalmente liviana (`DisponibilidadReservaResponse`):
    no expone `id_orden` ni `id_producto`, porque cualquier socio autenticado
    puede consultar la agenda de una instalación y no debe ver a qué orden
    (de qué otro socio) corresponde cada bloqueo — solo el rango horario.
  - Este endpoint es de solo lectura: no crea, ni bloquea, ni valida
    superposición. Eso lo hará POST /socio/reservas/pre-reserva (pendiente).
"""

from __future__ import annotations

from datetime import datetime, timezone
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
    "/{instalacion}",
    response_model=List[schemas.DisponibilidadReservaResponse],
    summary="Franjas ocupadas de una instalación (para pintar el calendario)",
)
def listar_disponibilidad(
    instalacion: str,
    desde: Optional[datetime] = Query(
        default=None,
        description="Incluye reservas con fecha_fin >= desde. Default: ahora (UTC).",
    ),
    hasta: Optional[datetime] = Query(
        default=None,
        description="Incluye reservas con fecha_inicio <= hasta. Default: sin límite.",
    ),
    db: Session = Depends(get_db),
    _socio: models.Usuario = Depends(require_roles(*_ROLES_COMPRADORES)),
) -> List[schemas.DisponibilidadReservaResponse]:
    limite_inferior = desde if desde is not None else datetime.now(timezone.utc)

    query = (
        db.query(models.ReservaInstalacion)
        .filter(
            models.ReservaInstalacion.instalacion == instalacion,
            models.ReservaInstalacion.estado.in_(_ESTADOS_OCUPA_AGENDA),
            models.ReservaInstalacion.fecha_fin >= limite_inferior,
        )
    )

    if hasta is not None:
        query = query.filter(models.ReservaInstalacion.fecha_inicio <= hasta)

    return query.order_by(models.ReservaInstalacion.fecha_inicio.asc()).all()