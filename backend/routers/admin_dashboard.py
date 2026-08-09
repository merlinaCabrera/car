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

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field
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
    reservas_semana: int          # reservas confirmadas/bloqueadas en los próximos 7 días
    comercios_activos: int
    comercios_total: int
    productos_activos: int
    productos_total: int
    proximos_eventos: List[EventoResumenResponse]


class IngresoMesResponse(BaseModel):
    mes_label: str
    cuotas: Decimal
    compras: Decimal
    alquileres: Decimal
    total: Decimal


class ProductoMasVendidoResponse(BaseModel):
    nombre: str
    categoria: str
    unidades: int
    monto: Decimal


class EstadisticasDashboardResponse(BaseModel):
    ingresos_por_mes: List[IngresoMesResponse]
    variacion_mes_pct: Optional[Decimal] = Field(
        default=None,
        description="Variación % de ingresos del mes actual vs. el anterior. "
                     "None si el mes anterior no tuvo ingresos (división por cero).",
    )
    productos_mas_vendidos: List[ProductoMasVendidoResponse]


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _inicio_de_mes_actual() -> datetime:
    ahora = datetime.now(timezone.utc)
    return ahora.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _restar_meses(base: datetime, meses: int) -> datetime:
    """Devuelve el inicio del mes que está `meses` atrás de `base` (base ya
    debe estar al inicio de un mes). Evita depender de dateutil."""
    total = (base.year * 12 + (base.month - 1)) - meses
    anio, mes = divmod(total, 12)
    return base.replace(year=anio, month=mes + 1)


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

    # ── Reservas esta semana ───────────────────────────────────────────────────
    fin_semana = ahora + timedelta(days=7)
    reservas_semana = (
        db.query(func.count(models.ReservaInstalacion.id_reserva))
        .filter(
            models.ReservaInstalacion.estado.in_(["bloqueada", "confirmada"]),
            models.ReservaInstalacion.fecha_inicio >= ahora,
            models.ReservaInstalacion.fecha_inicio <= fin_semana,
        )
        .scalar()
    ) or 0

    return ResumenDashboardResponse(
        ingresos_mes=ingresos_mes,
        mes_label=mes_label,
        reservas_sin_reparto=reservas_sin_reparto,
        reservas_semana=reservas_semana,
        comercios_activos=comercios_activos,
        comercios_total=comercios_total,
        productos_activos=productos_activos,
        productos_total=productos_total,
        proximos_eventos=proximos_eventos,
    )


# ─── ENDPOINT: Estadísticas para /admin/estadisticas ───────────────────────────

_MESES_HISTORICO_DEFAULT = 6  # ventana del gráfico si no se manda ?meses=


@router.get(
    "/estadisticas",
    response_model=EstadisticasDashboardResponse,
    summary="Serie histórica de ingresos por categoría + productos más vendidos, para /admin/estadisticas",
)
def obtener_estadisticas_dashboard(
    meses: int = Query(
        _MESES_HISTORICO_DEFAULT,
        ge=1,
        le=24,
        description="Cantidad de meses hacia atrás a incluir en 'ingresos_por_mes' (1 a 24).",
    ),
    db: Session = Depends(get_db),
    _admin: models.Usuario = Depends(require_roles(*_ROLES_DASHBOARD)),
) -> EstadisticasDashboardResponse:
    ahora = datetime.now(timezone.utc)
    inicio_mes_actual = _inicio_de_mes_actual()
    inicio_ventana = _restar_meses(inicio_mes_actual, meses - 1)

    # ── Ingresos por mes y categoría ───────────────────────────────────────────
    # Se suma a nivel de ítem (cantidad × precio histórico), no de Orden.monto_total,
    # para que el desglose por categoría sea exacto item por item, sin asumir que
    # una orden es 100% homogénea en categoría.
    filas = (
        db.query(
            func.date_trunc("month", models.Orden.aprobada_at).label("mes"),
            models.ProductoServicio.categoria.label("categoria"),
            func.sum(
                models.DetalleOrden.cantidad * models.DetalleOrden.precio_unitario_historico
            ).label("monto"),
        )
        .select_from(models.DetalleOrden)
        .join(models.Orden, models.DetalleOrden.id_orden == models.Orden.id_orden)
        .join(
            models.ProductoServicio,
            models.DetalleOrden.id_producto == models.ProductoServicio.id_producto,
        )
        .filter(
            models.Orden.estado == "aprobada",
            models.Orden.aprobada_at >= inicio_ventana,
        )
        .group_by("mes", models.ProductoServicio.categoria)
        .all()
    )

    # Arma los `meses` buckets en orden cronológico, aunque no haya
    # datos para algún mes (así el gráfico siempre muestra la ventana completa).
    buckets: dict[tuple[int, int], dict[str, Decimal]] = {}
    cursor = inicio_ventana
    orden_meses: list[tuple[int, int]] = []
    for _ in range(meses):
        clave = (cursor.year, cursor.month)
        orden_meses.append(clave)
        buckets[clave] = {"cuota_social": Decimal("0"), "alquiler": Decimal("0"), "compra": Decimal("0")}
        cursor = _restar_meses(cursor, -1)  # avanza un mes

    for fila in filas:
        clave = (fila.mes.year, fila.mes.month)
        if clave not in buckets:
            continue  # fuera de la ventana por huso horario en el borde del mes
        grupo = "compra" if fila.categoria in ("indumentaria", "otro") else fila.categoria
        buckets[clave][grupo] += fila.monto or Decimal("0")

    ingresos_por_mes = [
        IngresoMesResponse(
            mes_label=(
                f"{_MESES_ES[mes - 1][:3].capitalize()} '{str(anio)[2:]}"
                if meses > 12
                else _MESES_ES[mes - 1][:3].capitalize()
            ),
            cuotas=buckets[(anio, mes)]["cuota_social"],
            compras=buckets[(anio, mes)]["compra"],
            alquileres=buckets[(anio, mes)]["alquiler"],
            total=sum(buckets[(anio, mes)].values()),
        )
        for anio, mes in orden_meses
    ]

    # ── Variación del mes actual vs. el anterior ────────────────────────────────
    total_mes_actual = ingresos_por_mes[-1].total if ingresos_por_mes else Decimal("0")
    total_mes_anterior = ingresos_por_mes[-2].total if len(ingresos_por_mes) >= 2 else Decimal("0")
    variacion_mes_pct: Optional[Decimal] = None
    if total_mes_anterior > 0:
        variacion_mes_pct = (
            (total_mes_actual - total_mes_anterior) / total_mes_anterior * Decimal("100")
        ).quantize(Decimal("0.1"))

    # ── Top 5 productos más vendidos (últimos 30 días, unidades) ──────────────
    top_productos = (
        db.query(
            models.ProductoServicio.nombre,
            models.ProductoServicio.categoria,
            func.sum(models.DetalleOrden.cantidad).label("unidades"),
            func.sum(
                models.DetalleOrden.cantidad * models.DetalleOrden.precio_unitario_historico
            ).label("monto"),
        )
        .select_from(models.DetalleOrden)
        .join(models.Orden, models.DetalleOrden.id_orden == models.Orden.id_orden)
        .join(
            models.ProductoServicio,
            models.DetalleOrden.id_producto == models.ProductoServicio.id_producto,
        )
        .filter(
            models.Orden.estado == "aprobada",
            models.Orden.aprobada_at >= ahora - timedelta(days=30),
            models.ProductoServicio.categoria != "cuota_social",
        )
        .group_by(models.ProductoServicio.id_producto, models.ProductoServicio.nombre, models.ProductoServicio.categoria)
        .order_by(func.sum(models.DetalleOrden.cantidad).desc())
        .limit(5)
        .all()
    )

    productos_mas_vendidos = [
        ProductoMasVendidoResponse(
            nombre=p.nombre,
            categoria=p.categoria,
            unidades=p.unidades,
            monto=p.monto or Decimal("0"),
        )
        for p in top_productos
    ]

    return EstadisticasDashboardResponse(
        ingresos_por_mes=ingresos_por_mes,
        variacion_mes_pct=variacion_mes_pct,
        productos_mas_vendidos=productos_mas_vendidos,
    )