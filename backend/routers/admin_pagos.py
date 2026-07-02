# backend/routers/admin_pagos.py
"""
Router de gestión financiera — Cuotas Sociales (panel de administración).

Endpoints:
  GET  /admin/pagos/estadisticas          → Resumen financiero global.
  GET  /admin/pagos/morosos               → Listado de socios con deuda > 0.
  POST /admin/pagos/registrar-pago-manual → Cobro por ventanilla (efectivo/transferencia).

Todos los endpoints requieren rol 'admin_general' o 'personal_administrativo'.

Decisiones técnicas:
  - El precio de la cuota se toma SIEMPRE de ProductoServicio.precio_actual
    (categoria='cuota_social'), no de ConfiguracionGlobal.valor_cuota_base,
    porque es el precio que efectivamente se congela en cada DetalleOrden.
  - registrar-pago-manual crea la Orden ya 'aprobada' (no pasa por el flujo
    de verificación de comprobante) porque el dinero ya se cobró en persona.
  - precio_unitario_historico se congela con el precio_actual del momento
    del cobro, tal como indica el comentario de DetalleOrden en models.py.
  - deuda_historica_meses nunca baja de 0 (clamp explícito).
  - Todo el flujo (orden + detalle + actualización de deuda + audit_log) se
    hace en una sola transacción con un único commit al final.
"""

from __future__ import annotations

from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from dependencies import get_current_user, require_roles

router = APIRouter(
    prefix="/admin/pagos",
    tags=["Admin — Pagos y Cuotas Sociales"],
)

_ROLES_ADMIN_PAGOS = ("admin_general", "personal_administrativo")


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _extraer_ip(request: Request) -> Optional[str]:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return getattr(request.client, "host", None)


def _registrar_audit(
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


def _obtener_producto_cuota_social(db: Session) -> models.ProductoServicio:
    """
    Busca el producto activo de categoría 'cuota_social'. Si hay varios activos
    (no debería pasar, pero no está garantizado por una constraint), toma el
    más reciente por id_producto.
    """
    producto = (
        db.query(models.ProductoServicio)
        .filter(
            models.ProductoServicio.categoria == "cuota_social",
            models.ProductoServicio.es_activo.is_(True),
        )
        .order_by(models.ProductoServicio.id_producto.desc())
        .first()
    )
    if producto is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "No existe un producto activo con categoria='cuota_social'. "
                "Cargalo en productos_servicios antes de registrar pagos."
            ),
        )
    return producto


# ─── ENDPOINT: Estadísticas financieras ───────────────────────────────────────

@router.get(
    "/estadisticas",
    response_model=schemas.EstadisticasPagosResponse,
    summary="Resumen financiero: socios al día, morosos y deuda total estimada",
)
def obtener_estadisticas(
    db: Session = Depends(get_db),
    _admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN_PAGOS)),
) -> schemas.EstadisticasPagosResponse:
    producto_cuota = _obtener_producto_cuota_social(db)

    # Solo socios activos (fecha_baja IS NULL) entran en las estadísticas
    total_al_dia = (
        db.query(func.count(models.Usuario.id_usuario))
        .filter(
            models.Usuario.fecha_baja.is_(None),
            models.Usuario.deuda_historica_meses == 0,
        )
        .scalar()
    ) or 0

    total_morosos = (
        db.query(func.count(models.Usuario.id_usuario))
        .filter(
            models.Usuario.fecha_baja.is_(None),
            models.Usuario.deuda_historica_meses > 0,
        )
        .scalar()
    ) or 0

    suma_meses_adeudados = (
        db.query(func.coalesce(func.sum(models.Usuario.deuda_historica_meses), 0))
        .filter(
            models.Usuario.fecha_baja.is_(None),
            models.Usuario.deuda_historica_meses > 0,
        )
        .scalar()
    ) or 0

    deuda_total = Decimal(suma_meses_adeudados) * producto_cuota.precio_actual

    return schemas.EstadisticasPagosResponse(
        total_socios_al_dia=total_al_dia,
        total_socios_morosos=total_morosos,
        precio_cuota_actual=producto_cuota.precio_actual,
        deuda_total_estimada=deuda_total,
    )


# ─── ENDPOINT: Listado de morosos ─────────────────────────────────────────────

@router.get(
    "/morosos",
    response_model=List[schemas.MorosoResponse],
    summary="Listado de todos los socios activos para cobro manual",
)
def listar_morosos(
    db: Session = Depends(get_db),
    _admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN_PAGOS)),
) -> List[schemas.MorosoResponse]:
    producto_cuota = _obtener_producto_cuota_social(db)

    # Se listan todos los socios activos, no solo los morosos, para permitir
    # el pago por adelantado desde la ventanilla.
    socios = (
        db.query(models.Usuario)
        .filter(models.Usuario.fecha_baja.is_(None))
        .order_by(models.Usuario.deuda_historica_meses.desc(), models.Usuario.apellido, models.Usuario.nombre)
        .all()
    )

    return [
        schemas.MorosoResponse(
            id_usuario=u.id_usuario,
            dni=u.dni,
            nombre=u.nombre,
            apellido=u.apellido,
            email=u.email,
            telefono=u.telefono,
            deuda_historica_meses=u.deuda_historica_meses,
            deuda_estimada=Decimal(u.deuda_historica_meses) * producto_cuota.precio_actual,
        )
        for u in socios
    ]


# ─── ENDPOINT: Registrar pago manual (ventanilla) ─────────────────────────────

@router.post(
    "/registrar-pago-manual",
    response_model=schemas.RegistrarPagoManualResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Registrar un cobro manual (efectivo/transferencia) por ventanilla",
)
def registrar_pago_manual(
    payload: schemas.RegistrarPagoManualPayload,
    request: Request,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN_PAGOS)),
) -> schemas.RegistrarPagoManualResponse:
    # 1 — Validar que el usuario exista y esté activo
    usuario = (
        db.query(models.Usuario)
        .filter(models.Usuario.id_usuario == payload.id_usuario)
        .first()
    )
    if usuario is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No existe un usuario con id {payload.id_usuario}.",
        )
    if usuario.fecha_baja is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se puede registrar un pago para un socio dado de baja.",
        )

    # 2 — Buscar el producto de cuota social y congelar su precio actual
    producto_cuota = _obtener_producto_cuota_social(db)
    precio_congelado = producto_cuota.precio_actual
    monto_total = precio_congelado * payload.meses_a_pagar

    deuda_antes = usuario.deuda_historica_meses

    # 3 — Crear la Orden ya aprobada (el dinero ya se cobró en persona)
    nueva_orden = models.Orden(
        id_usuario=usuario.id_usuario,
        estado="aprobada",
        monto_total=monto_total,
        aprobada_por=admin.id_usuario,
        aprobada_at=func.now(),
        notas_admin=f"Pago manual por ventanilla — {payload.meses_a_pagar} mes(es).",
    )
    db.add(nueva_orden)
    db.flush()  # necesitamos nueva_orden.id_orden para el detalle

    # 4 — Crear el DetalleOrden congelando el precio histórico
    detalle = models.DetalleOrden(
        id_orden=nueva_orden.id_orden,
        id_producto=producto_cuota.id_producto,
        cantidad=payload.meses_a_pagar,
        precio_unitario_historico=precio_congelado,
    )
    db.add(detalle)

    # 5 — Actualizar la deuda del usuario, sin bajar de 0
    usuario.deuda_historica_meses = max(0, usuario.deuda_historica_meses - payload.meses_a_pagar)

    # 6 — Audit log
    _registrar_audit(
        db=db,
        actor_id=admin.id_usuario,
        accion="REGISTRAR_PAGO_MANUAL",
        tabla_afectada="ordenes",
        registro_id=nueva_orden.id_orden,
        detalle={
            "id_usuario": usuario.id_usuario,
            "meses_a_pagar": payload.meses_a_pagar,
            "precio_unitario_historico": str(precio_congelado),
            "monto_total": str(monto_total),
            "deuda_antes": deuda_antes,
            "deuda_despues": usuario.deuda_historica_meses,
        },
        ip=_extraer_ip(request),
    )

    # 7 — Commit único de toda la transacción
    db.commit()
    db.refresh(nueva_orden)
    db.refresh(usuario)

    return schemas.RegistrarPagoManualResponse(
        id_orden=nueva_orden.id_orden,
        id_usuario=usuario.id_usuario,
        meses_pagados=payload.meses_a_pagar,
        monto_total=monto_total,
        deuda_restante_meses=usuario.deuda_historica_meses,
    )