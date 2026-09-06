# backend/utils/fechas.py
"""
Fecha/hora "de negocio" del club — zona horaria de Argentina.

El backend corre en UTC (Render). Para cualquier cálculo que el socio VE
—si está moroso, qué día vence la cuota, la edad para el descuento de menor,
la fecha de baja— hay que usar la fecha local de Argentina, no la del SO.
Entre las 21:00 y las 00:00 hora ARG (UTC-3) `date.today()` del servidor ya
está un día adelantado y marca morosos antes de tiempo.

Los timestamps `DateTime(timezone=True)` (expira_at, fecha_inicio de reservas,
etc.) sí se comparan en UTC sin problema: son tz-aware y el instante es el
mismo. Esto es solo para lo que se razona en DÍAS.
"""
from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo

TZ_CLUB = ZoneInfo("America/Argentina/Buenos_Aires")


def hoy_club() -> date:
    """Fecha de hoy en hora de Argentina."""
    return datetime.now(TZ_CLUB).date()


def ahora_club() -> datetime:
    """Datetime actual (tz-aware) en hora de Argentina."""
    return datetime.now(TZ_CLUB)
