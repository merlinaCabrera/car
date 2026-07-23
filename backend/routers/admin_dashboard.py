# backend/routers/admin_dashboard.py
"""
Router de resumen ejecutivo — Panel de Control del admin_general.

Endpoints:
  GET /admin/dashboard/resumen → foto agregada de todo lo que un admin
                                   general necesita para arrancar el día,
                                   sin tener que pegarle a cada router por
                                   separado desde el frontend.

Decisiones técnicas:
  - Exclusivo de 'admin_general': es el único rol que ve el link "Panel de
    Admin" en MainLayout.jsx, así que no tiene sentido exponer este
    agregado a personal_administrativo (que ya tiene sus propias pantallas
    filtradas).
  - Deliberadamente NO duplica contadores que ya existen como endpoint
    propio y liviano (solicitudes pendientes, órdenes pendientes, pagos
    pendientes, estadísticas financieras de morosidad) — esos se siguen
    pidiendo por separado desde el frontend porque ya son O(1) y varias
    pantallas los reutilizan tal cual. Este endpoint agrega justamente lo
    que faltaba y que sí conviene calcular junto: ingresos del mes,
    reservas sin reparto configurado, catálogo/comercios activos y los
    próximos eventos institucionales.
  - "Reservas sin reparto" solo cuenta reservas bloqueada/confirmada cuya
    fecha_fin todavía no pasó — una reserva vieja sin reparto configurado
    ya no es accionable, no tiene sentido alertar sobre ella.
  - "Ingresos del mes" suma Orden.monto_total de órdenes aprobada con
    aprobada_at dentro del mes calendario en curso (huso UTC, consistente
    con el resto del sistema).
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func
from sqlalchemy.orm import Session

import models
from database import get_db
from dependencies import get_current_user, require_roles

router = APIRouter(
    prefix="/admin/dashboard",
    tags=["Admin — Dashboard"],
)

_ROLES_DASHBOARD = ("admin_general",)

_MESES_ES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]


# ─── Schemas locales ──────────────────────────────────────────────────────────

class EventoResumenResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id_evento: int
    titulo: str
    tipo: str
    fecha_inicio: datetime
    ubicacion: Optional[str] = None


class ResumenDashboardResponse(BaseModel):
    ingresos_mes: Decimal
    mes_label: str
    reservas_sin_reparto: int
    comercios_activos: int
    comercios_total: int
    productos_activos: int
    productos_total: int
    proximos_eventos: List[EventoResumenResponse]


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _inicio_de_mes_actual() -> datetime:
    ahora = datetime.now(timezone.utc)
    return ahora.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


# ─── ENDPOINT: Resumen agregado ────────────────────────────────────────────────

@router.get(
    "/resumen",
    response_model=ResumenDashboardResponse,
    summary="Métricas agregadas para el Panel de Control del admin general",
)
def obtener_resumen(
    db: Session = Depends(get_db),
    _admin: models.Usuario = Depends(require_roles(*_ROLES_DASHBOARD)),
) -> ResumenDashboardResponse:
    ahora = datetime.now(timezone.utc)
    inicio_mes = _inicio_de_mes_actual()

    # ── Ingresos del mes: suma de órdenes aprobadas en el mes en curso ────────
    ingresos_mes = (
        db.query(func.coalesce(func.sum(models.Orden.monto_total), 0))
        .filter(
            models.Orden.estado == "aprobada",
            models.Orden.aprobada_at >= inicio_mes,
        )
        .scalar()
    ) or Decimal("0")

    mes_label = f"{_MESES_ES[ahora.month - 1]} {ahora.year}"

    # ── Reservas confirmadas/bloqueadas, vigentes, sin reparto configurado ────
    reservas_sin_reparto = (
        db.query(func.count(models.ReservaInstalacion.id_reserva))
        .filter(
            models.ReservaInstalacion.estado.in_(("bloqueada", "confirmada")),
            models.ReservaInstalacion.num_socios_esperados.is_(None),
            models.ReservaInstalacion.fecha_fin >= ahora,
        )
        .scalar()
    ) or 0

    # ── Comercios adheridos ────────────────────────────────────────────────────
    comercios_total = db.query(func.count(models.ComercioAsociado.id_comercio)).scalar() or 0
    comercios_activos = (
        db.query(func.count(models.ComercioAsociado.id_comercio))
        .filter(models.ComercioAsociado.es_activo.is_(True))
        .scalar()
    ) or 0

    # ── Catálogo de productos/servicios ────────────────────────────────────────
    productos_total = db.query(func.count(models.ProductoServicio.id_producto)).scalar() or 0
    productos_activos = (
        db.query(func.count(models.ProductoServicio.id_producto))
        .filter(models.ProductoServicio.es_activo.is_(True))
        .scalar()
    ) or 0

    # ── Próximos eventos institucionales ───────────────────────────────────────
    proximos_eventos = (
        db.query(models.Evento)
        .filter(
            models.Evento.estado.in_(("programado", "en_curso")),
            models.Evento.fecha_inicio >= ahora,
        )
        .order_by(models.Evento.fecha_inicio.asc())
        .limit(5)
        .all()
    )

    return ResumenDashboardResponse(
        ingresos_mes=ingresos_mes,
        mes_label=mes_label,
        reservas_sin_reparto=reservas_sin_reparto,
        comercios_activos=comercios_activos,
        comercios_total=comercios_total,
        productos_activos=productos_activos,
        productos_total=productos_total,
        proximos_eventos=proximos_eventos,
    )