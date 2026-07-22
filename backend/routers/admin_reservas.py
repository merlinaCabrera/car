# backend/routers/admin_reservas.py
"""
Router de administración de reservas de instalaciones.

Cubre:
  - Listado/detalle de reservas para la Agenda de Reservas del admin.
  - Reservas activas AHORA (para el selector del Escáner de Canchas).
  - Configuración de reparto (num_socios_esperados / monto_reintegro_unitario).
  - Escaneo de QR en la puerta de la cancha → dispara el ReintegroQR.
  - Consulta de reintegros ya realizados sobre una reserva.
  - Suspensión de una reserva confirmada (lluvia, etc.) con acreditación de saldo.
"""

from __future__ import annotations

from decimal import Decimal
from typing import List, Optional
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session, joinedload

import models
import schemas
from database import get_db
from dependencies import require_roles
from utils.audit import registrar_audit, extraer_ip

router = APIRouter()

# Roles que administran la agenda completa (ver/editar reservas, suspender).
_ROLES_ADMIN = ("admin_general", "personal_administrativo")

# Roles habilitados para escanear QR en la puerta de la cancha. Incluye
# admin_temporal porque ese rol es justamente el del control de acceso físico
# (ver bloque "Control de Acceso" del menú, que ya lo habilita para el
# Escáner QR general de socios). portero_cancha queda listo para el día que
# se siembre en la tabla `roles` y se quiera separar operadores por escáner
# sin tocar código.
_ROLES_ESCANEO = ("admin_general", "personal_administrativo", "admin_temporal", "portero_cancha")


# ─────────────────────────────────────────────────────────────────────────────
# Listado de reservas (Agenda de Reservas)
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/admin/reservas",
    response_model=List[schemas.ReservaAdminListResponse],
    summary="Listar reservas para la agenda del admin",
)
def listar_reservas(
    instalacion: Optional[str] = Query(default=None),
    estado: Optional[str] = Query(default=None, description="bloqueada | confirmada | liberada | expirada"),
    desde: Optional[date] = Query(default=None),
    hasta: Optional[date] = Query(default=None),
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN)),
) -> List[schemas.ReservaAdminListResponse]:
    query = db.query(models.ReservaInstalacion).options(
        joinedload(models.ReservaInstalacion.usuario_responsable),
        joinedload(models.ReservaInstalacion.reintegros),
    )

    if instalacion:
        query = query.filter(models.ReservaInstalacion.instalacion == instalacion)
    if estado:
        query = query.filter(models.ReservaInstalacion.estado == estado)
    if desde:
        query = query.filter(models.ReservaInstalacion.fecha_fin >= desde)
    if hasta:
        query = query.filter(models.ReservaInstalacion.fecha_inicio <= hasta)

    reservas = query.order_by(models.ReservaInstalacion.fecha_inicio.asc()).all()

    resultado: List[schemas.ReservaAdminListResponse] = []
    for r in reservas:
        nombre_responsable = None
        if r.usuario_responsable is not None:
            nombre_responsable = f"{r.usuario_responsable.nombre} {r.usuario_responsable.apellido}"

        resultado.append(
            schemas.ReservaAdminListResponse(
                id_reserva=r.id_reserva,
                instalacion=r.instalacion,
                fecha_inicio=r.fecha_inicio,
                fecha_fin=r.fecha_fin,
                estado=r.estado,
                id_usuario=r.id_usuario,
                nombre_responsable=nombre_responsable,
                notas=r.notas,
                num_socios_esperados=r.num_socios_esperados,
                monto_reintegro_unitario=r.monto_reintegro_unitario,
                escaneos_realizados=len(r.reintegros),
            )
        )
    return resultado


# ─────────────────────────────────────────────────────────────────────────────
# Reservas activas AHORA — selector del Escáner de Canchas
# ─────────────────────────────────────────────────────────────────────────────
#
# CRÍTICO: esta ruta debe declararse ANTES de "/admin/reservas/{id_reserva}".
# FastAPI/Starlette no hace fallback automático a la siguiente ruta cuando
# falla la validación de tipo del path param (int(id_reserva) fallaría con
# "activas") — devuelve 422 directo si "{id_reserva}" quedó registrada
# primero. Declarando "activas" antes, matchea como ruta literal exacta.

@router.get(
    "/admin/reservas/activas",
    response_model=List[schemas.ReservaAdminListResponse],
    summary="Reservas confirmadas cuya franja horaria está vigente ahora (selector del Escáner de Canchas)",
)
def listar_reservas_activas(
    db: Session = Depends(get_db),
    _operador: models.Usuario = Depends(require_roles(*_ROLES_ESCANEO)),
) -> List[schemas.ReservaAdminListResponse]:
    """
    Análogo a GET /deportivo/eventos/hoy, pero acotado a la ventana horaria
    real de la reserva (no al día completo): un turno de cancha dura 1-2hs,
    no 3-10hs como un evento, así que "activa ahora" = fecha_inicio <= ahora
    <= fecha_fin. Margen de 15 min antes del inicio para que el portero
    pueda abrir la reserva un rato antes de que lleguen los socios.
    """
    ahora = datetime.now(timezone.utc)
    margen = timedelta(minutes=15)

    reservas = (
        db.query(models.ReservaInstalacion)
        .options(
            joinedload(models.ReservaInstalacion.usuario_responsable),
            joinedload(models.ReservaInstalacion.reintegros),
        )
        .filter(
            models.ReservaInstalacion.estado == "confirmada",
            models.ReservaInstalacion.fecha_inicio <= ahora + margen,
            models.ReservaInstalacion.fecha_fin >= ahora,
        )
        .order_by(models.ReservaInstalacion.fecha_inicio.asc())
        .all()
    )

    resultado: List[schemas.ReservaAdminListResponse] = []
    for r in reservas:
        nombre_responsable = None
        if r.usuario_responsable is not None:
            nombre_responsable = f"{r.usuario_responsable.nombre} {r.usuario_responsable.apellido}"

        resultado.append(
            schemas.ReservaAdminListResponse(
                id_reserva=r.id_reserva,
                instalacion=r.instalacion,
                fecha_inicio=r.fecha_inicio,
                fecha_fin=r.fecha_fin,
                estado=r.estado,
                id_usuario=r.id_usuario,
                nombre_responsable=nombre_responsable,
                notas=r.notas,
                num_socios_esperados=r.num_socios_esperados,
                monto_reintegro_unitario=r.monto_reintegro_unitario,
                escaneos_realizados=len(r.reintegros),
            )
        )
    return resultado


@router.get(
    "/admin/reservas/{id_reserva}",
    response_model=schemas.ReservaAdminResponse,
    summary="Detalle de una reserva, con su orden asociada",
)
def detalle_reserva(
    id_reserva: int,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN)),
) -> schemas.ReservaAdminResponse:
    reserva = (
        db.query(models.ReservaInstalacion)
        .options(
            joinedload(models.ReservaInstalacion.orden).joinedload(models.Orden.usuario),
        )
        .filter(models.ReservaInstalacion.id_reserva == id_reserva)
        .first()
    )
    if reserva is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reserva no encontrada.")

    return schemas.ReservaAdminResponse.model_validate(reserva)


# ─────────────────────────────────────────────────────────────────────────────
# Configuración de reparto (num_socios_esperados / monto_reintegro_unitario)
# ─────────────────────────────────────────────────────────────────────────────

@router.patch(
    "/admin/reservas/{id_reserva}/reparto",
    response_model=schemas.ReservaInstalacionResponse,
    summary="Fijar cuántos socios se esperan y el reintegro unitario por QR",
)
def configurar_reparto(
    id_reserva: int,
    payload: schemas.ConfigurarRepartoPayload,
    request: Request,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN)),
) -> schemas.ReservaInstalacionResponse:
    reserva = (
        db.query(models.ReservaInstalacion)
        .filter(models.ReservaInstalacion.id_reserva == id_reserva)
        .first()
    )
    if reserva is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reserva no encontrada.")
    if reserva.estado not in ("bloqueada", "confirmada"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Solo se puede configurar el reparto de reservas bloqueadas o confirmadas.",
        )

    reserva.num_socios_esperados = payload.num_socios_esperados

    if payload.monto_reintegro_unitario is not None:
        # El admin fija un monto explícito.
        reserva.monto_reintegro_unitario = payload.monto_reintegro_unitario
    else:
        # Default sugerido: precio total de la reserva × 20% / num_socios_esperados.
        # Requiere que la reserva ya tenga una orden con su detalle (precio histórico);
        # si todavía es una pre-reserva sin orden, usamos el precio_actual del producto.
        detalle = (
            db.query(models.DetalleOrden)
            .filter(models.DetalleOrden.id_reserva == reserva.id_reserva)
            .first()
        )
        if detalle is not None:
            precio_total = detalle.precio_unitario_historico * detalle.cantidad
        else:
            producto = (
                db.query(models.ProductoServicio)
                .filter(models.ProductoServicio.id_producto == reserva.id_producto)
                .first()
            )
            precio_total = producto.precio_actual if producto else Decimal("0")

        if payload.num_socios_esperados > 0:
            reserva.monto_reintegro_unitario = (
                precio_total * Decimal("0.20") / payload.num_socios_esperados
            ).quantize(Decimal("0.01"))
        else:
            reserva.monto_reintegro_unitario = None

    registrar_audit(
        db=db,
        actor_id=admin.id_usuario,
        accion="configurar_reparto_reserva",
        tabla_afectada="reservas_instalaciones",
        registro_id=reserva.id_reserva,
        detalle={
            "num_socios_esperados": reserva.num_socios_esperados,
            "monto_reintegro_unitario": str(reserva.monto_reintegro_unitario),
        },
        ip=extraer_ip(request),
    )

    db.commit()
    db.refresh(reserva)
    return schemas.ReservaInstalacionResponse.model_validate(reserva)


# ─────────────────────────────────────────────────────────────────────────────
# Escaneo de QR — dispara el reintegro individual
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/admin/reservas/{id_reserva}/escanear-qr",
    response_model=schemas.ReintegroQRResponse,
    summary="Registrar el escaneo de QR de un socio en la puerta de la cancha",
)
def escanear_qr(
    id_reserva: int,
    payload: schemas.EscanearQRPayload,
    request: Request,
    db: Session = Depends(get_db),
    operador: models.Usuario = Depends(require_roles(*_ROLES_ESCANEO)),
) -> schemas.ReintegroQRResponse:
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
            detail="Solo se puede escanear QR en reservas confirmadas.",
        )
    if reserva.monto_reintegro_unitario is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Esta reserva todavía no tiene un reintegro unitario configurado. Cargalo primero en /admin/reservas/{id}/reparto.",
        )

    socio = (
        db.query(models.Usuario)
        .filter(models.Usuario.qr_token == payload.qr_token)
        .first()
    )
    if socio is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="QR inválido: socio no encontrado.")

    ya_escaneo = (
        db.query(models.ReintegroQR)
        .filter(
            models.ReintegroQR.id_reserva == id_reserva,
            models.ReintegroQR.id_usuario == socio.id_usuario,
        )
        .first()
    )
    if ya_escaneo is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{socio.nombre} {socio.apellido} ya escaneó su QR en esta reserva.",
        )

    reintegro = models.ReintegroQR(
        id_reserva=id_reserva,
        id_usuario=socio.id_usuario,
        monto=reserva.monto_reintegro_unitario,
        forma="pendiente",  # el admin decide después efectivo / transferencia / saldo_a_favor
        escaneado_por=operador.id_usuario,
    )
    db.add(reintegro)

    registrar_audit(
        db=db,
        actor_id=operador.id_usuario,
        accion="escanear_qr_reintegro",
        tabla_afectada="reintegros_qr",
        registro_id=reserva.id_reserva,
        detalle={
            "id_usuario_socio": socio.id_usuario,
            "monto": str(reserva.monto_reintegro_unitario),
        },
        ip=extraer_ip(request),
    )

    db.commit()
    db.refresh(reintegro)

    return schemas.ReintegroQRResponse(
        id_reintegro=reintegro.id_reintegro,
        id_reserva=reintegro.id_reserva,
        id_usuario=reintegro.id_usuario,
        nombre_socio=f"{socio.nombre} {socio.apellido}",
        monto=reintegro.monto,
        forma=reintegro.forma,
        escaneado_at=reintegro.escaneado_at,
    )


@router.patch(
    "/admin/reintegros/{id_reintegro}/forma",
    response_model=schemas.ReintegroQRResponse,
    summary="Definir cómo se le pagó el reintegro al socio (efectivo / transferencia / saldo a favor)",
)
def definir_forma_reintegro(
    id_reintegro: int,
    forma: str = Query(..., description="'efectivo' | 'transferencia' | 'saldo_a_favor'"),
    request: Request = None,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN)),
) -> schemas.ReintegroQRResponse:
    if forma not in ("efectivo", "transferencia", "saldo_a_favor"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Forma inválida.")

    reintegro = (
        db.query(models.ReintegroQR)
        .filter(models.ReintegroQR.id_reintegro == id_reintegro)
        .first()
    )
    if reintegro is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reintegro no encontrado.")

    forma_anterior = reintegro.forma

    # Si se define como saldo_a_favor, acreditamos en la billetera interna del socio.
    if forma == "saldo_a_favor" and forma_anterior != "saldo_a_favor":
        socio = (
            db.query(models.Usuario)
            .filter(models.Usuario.id_usuario == reintegro.id_usuario)
            .first()
        )
        socio.saldo_a_favor = socio.saldo_a_favor + reintegro.monto

    reintegro.forma = forma

    registrar_audit(
        db=db,
        actor_id=admin.id_usuario,
        accion="definir_forma_reintegro",
        tabla_afectada="reintegros_qr",
        registro_id=reintegro.id_reintegro,
        detalle={"forma_anterior": forma_anterior, "forma_nueva": forma},
        ip=extraer_ip(request) if request else None,
    )

    db.commit()
    db.refresh(reintegro)

    socio = (
        db.query(models.Usuario)
        .filter(models.Usuario.id_usuario == reintegro.id_usuario)
        .first()
    )

    return schemas.ReintegroQRResponse(
        id_reintegro=reintegro.id_reintegro,
        id_reserva=reintegro.id_reserva,
        id_usuario=reintegro.id_usuario,
        nombre_socio=f"{socio.nombre} {socio.apellido}",
        monto=reintegro.monto,
        forma=reintegro.forma,
        escaneado_at=reintegro.escaneado_at,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Consulta de reintegros de una reserva
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/admin/reservas/{id_reserva}/reintegros",
    response_model=schemas.ReintegrosReservaResponse,
    summary="Ver todos los socios que escanearon su QR en una reserva",
)
def reintegros_de_reserva(
    id_reserva: int,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN)),
) -> schemas.ReintegrosReservaResponse:
    reserva = (
        db.query(models.ReservaInstalacion)
        .options(joinedload(models.ReservaInstalacion.reintegros).joinedload(models.ReintegroQR.usuario))
        .filter(models.ReservaInstalacion.id_reserva == id_reserva)
        .first()
    )
    if reserva is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reserva no encontrada.")

    reintegros_resp = [
        schemas.ReintegroQRResponse(
            id_reintegro=r.id_reintegro,
            id_reserva=r.id_reserva,
            id_usuario=r.id_usuario,
            nombre_socio=f"{r.usuario.nombre} {r.usuario.apellido}",
            monto=r.monto,
            forma=r.forma,
            escaneado_at=r.escaneado_at,
        )
        for r in reserva.reintegros
    ]
    monto_total = sum((r.monto for r in reserva.reintegros), Decimal("0"))

    return schemas.ReintegrosReservaResponse(
        id_reserva=reserva.id_reserva,
        num_socios_esperados=reserva.num_socios_esperados,
        escaneados=len(reintegros_resp),
        monto_total=monto_total,
        reintegros=reintegros_resp,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Suspensión de una reserva confirmada (lluvia, cancha en mantenimiento, etc.)
# ─────────────────────────────────────────────────────────────────────────────

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