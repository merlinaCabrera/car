# backend/routers/admin_auditoria.py
"""
Router de Historial/Auditoría — visibilidad de acciones administrativas
para cualquier admin (admin_general o personal_administrativo).

Por qué existe:
  Con varias personas usando cuentas de admin_general (comisión directiva),
  necesitábamos una forma de que cualquiera pueda chequear "¿quién aprobó/
  rechazó/dio de baja/reactivó a tal socio, y cuándo?" sin generar un mail
  por cada acción (eso saturaría las bandejas para acciones rutinarias).
  El AuditLog ya registraba todo esto desde hace tiempo — lo único que
  faltaba era una pantalla para consultarlo.

Alcance de esta primera versión: se expone TODO lo que ya cae en AuditLog
(no solo lo de socios), pero el mapeo de etiquetas lindas por ahora solo
cubre las acciones de "Gestión de Socios" — el resto se muestra con su
nombre de acción crudo, legible pero sin traducir. A futuro se puede sumar
un filtro por categoría (usuarios, cuotas, alquileres, tienda) reusando
esta misma tabla, sin tocar el modelo.

Es de solo lectura: no hay POST/PATCH/DELETE acá, y no debería haberlos
nunca (AuditLog es inmutable por regla de negocio, ver models.py).
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import desc
from sqlalchemy.orm import Session, joinedload

import models
from database import get_db
from dependencies import require_roles

router = APIRouter(
    prefix="/admin/auditoria",
    tags=["Admin — Auditoría"],
)

_ADMIN = ("admin_general", "personal_administrativo")

# ══════════════════════════════════════════════════════════════════════════
# Etiquetas legibles — solo para las acciones de Gestión de Socios por ahora.
# Lo que no está acá se muestra igual (fallback: la acción cruda, con guiones
# bajos reemplazados por espacios), así que no hace falta mantener esto 100%
# completo para que la pantalla funcione.
# ══════════════════════════════════════════════════════════════════════════
_ETIQUETAS_ACCION = {
    "APROBAR_SOLICITUD_SOCIO": "Aprobó una solicitud de alta",
    "RECHAZAR_SOLICITUD_SOCIO": "Rechazó una solicitud de alta",
    "CREAR_SOCIO_MANUAL": "Creó un socio manualmente",
    "EDITAR_SOCIO": "Editó los datos de un socio",
    "BAJA_SOCIO": "Dio de baja a un socio",
    "REACTIVAR_SOCIO": "Reactivó a un socio",
    "CAMBIO_ROLES": "Cambió los roles de un usuario",
    "AJUSTE_SALDO_A_FAVOR": "Ajustó el saldo a favor de un socio",
}


class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    accion: str
    etiqueta: str
    tabla_afectada: str
    registro_id: Optional[int] = None
    detalle: Optional[dict] = None
    created_at: datetime
    actor_id: Optional[int] = None
    actor_nombre: Optional[str] = None
    actor_dni: Optional[str] = None


class AuditLogListResponse(BaseModel):
    items: List[AuditLogResponse]
    total: int


@router.get(
    "",
    response_model=AuditLogListResponse,
    summary="Historial de acciones administrativas",
)
def listar_auditoria(
    skip: int = 0,
    limit: int = Query(default=50, le=200),
    accion: Optional[str] = Query(default=None, description="Filtrar por acción exacta, ej: 'BAJA_SOCIO'."),
    tabla_afectada: Optional[str] = Query(default=None, description="Ej: 'usuarios', 'ordenes'."),
    id_usuario_actor: Optional[int] = Query(default=None, description="Filtrar por quién hizo la acción."),
    db: Session = Depends(get_db),
    _: models.Usuario = Depends(require_roles(*_ADMIN)),
):
    query = db.query(models.AuditLog).options(joinedload(models.AuditLog.actor))

    if accion:
        query = query.filter(models.AuditLog.accion == accion)
    if tabla_afectada:
        query = query.filter(models.AuditLog.tabla_afectada == tabla_afectada)
    if id_usuario_actor:
        query = query.filter(models.AuditLog.usuario_actor == id_usuario_actor)

    total = query.count()
    registros = (
        query.order_by(desc(models.AuditLog.created_at))
        .offset(skip)
        .limit(limit)
        .all()
    )

    items = [
        AuditLogResponse(
            id=r.id,
            accion=r.accion,
            etiqueta=_ETIQUETAS_ACCION.get(r.accion, r.accion.replace("_", " ").capitalize()),
            tabla_afectada=r.tabla_afectada,
            registro_id=r.registro_id,
            detalle=r.detalle,
            created_at=r.created_at,
            actor_id=r.actor.id_usuario if r.actor else None,
            actor_nombre=f"{r.actor.nombre} {r.actor.apellido}" if r.actor else None,
            actor_dni=r.actor.dni if r.actor else None,
        )
        for r in registros
    ]

    return AuditLogListResponse(items=items, total=total)


@router.get(
    "/acciones-disponibles",
    summary="Lista de valores distintos de 'accion' que hay cargados, para armar el filtro del frontend",
)
def listar_acciones_disponibles(
    db: Session = Depends(get_db),
    _: models.Usuario = Depends(require_roles(*_ADMIN)),
):
    filas = db.query(models.AuditLog.accion).distinct().order_by(models.AuditLog.accion).all()
    return [
        {"valor": f[0], "etiqueta": _ETIQUETAS_ACCION.get(f[0], f[0].replace("_", " ").capitalize())}
        for f in filas
    ]