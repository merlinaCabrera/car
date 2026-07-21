# backend/utils/audit.py
"""
Helper compartido de auditoría. Extraído de admin_ordenes.py para que
cualquier router (admin_ordenes, admin_reservas, futuros) escriba en
audit_log con la misma firma, sin importar funciones privadas entre routers.
"""
from __future__ import annotations

from typing import Optional

from fastapi import Request
from sqlalchemy.orm import Session

import models


def extraer_ip(request: Request) -> Optional[str]:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return getattr(request.client, "host", None)


def registrar_audit(
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