# backend/routers/socio_reservas.py
"""
Router de consulta de disponibilidad de instalaciones (quincho, canchas, etc.)
para el socio — Módulo de Reservas.

── Registrar en main.py ────────────────────────────────────────────────────────
    from routers import socio_reservas
    app.include_router(socio_reservas.router)
────────────────────────────────────────────────────────────────────────────────

Endpoints:
  GET  /socio/reservas/               → Franjas ocupadas (bloqueada/confirmada)
                                         para pintar el calendario. Permite
                                         filtrar por instalación y/o fecha.
  POST /socio/reservas/pre-reserva    → Bloquea una franja para este socio
                                         ANTES del checkout (evita que dos
                                         socios agreguen el mismo turno al
                                         carrito al mismo tiempo).
  POST /socio/reservas/{id}/liberar   → Libera una pre-reserva propia que
                                         todavía no está atada a una orden
                                         (ej: el socio la sacó del carrito).

Decisiones técnicas:
  - Solo se devuelven reservas en estado 'bloqueada' o 'confirmada'. Las
    'liberada'/'expirada' no ocupan la agenda y no tiene sentido pintarlas.
  - Si no se especifica `fecha`, se filtra por defecto `fecha_fin >= ahora`
    para no traer reservas pasadas (el calendario solo necesita futuro).
  - La respuesta del GET es intencionalmente liviana
    (`DisponibilidadReservaResponse`): no expone `id_orden` ni `id_producto`,
    porque cualquier socio autenticado puede consultar la agenda de una
    instalación y no debe ver a qué orden (de qué otro socio) corresponde
    cada bloqueo — solo el rango horario.
  - PRE-RESERVA: crea la fila en `reservas_instalaciones` con
    estado='bloqueada' e `id_orden=NULL`. Es el mismo mecanismo de "reservar
    el lugar antes de pagar" que ya usan para stock en el checkout, pero acá
    ocurre ANTES del checkout porque la franja tiene que dejar de ofertarse
    apenas alguien la elige, no recién al confirmar la compra.
  - EXPIRACIÓN DE PRE-RESERVAS "HUÉRFANAS": una `bloqueada` con `id_orden`
    NULL y `creado_at` más viejo que `_MINUTOS_EXPIRACION_PRE_RESERVA` se
    considera abandonada (el socio la agregó al carrito y nunca pagó). El
    job programado que ya limpia `Orden.expira_at` debería correr también
    esta limpieza — ver `liberar_pre_reservas_expiradas()` al final del
    archivo, pensado para reusar en ese mismo job.
  - No hace falta chequear "es mía" en /liberar contra `id_usuario`, porque
    `ReservaInstalacion` no tiene ese campo (a propósito: la disponibilidad
    es anónima). Por eso solo se puede liberar una reserva `bloqueada` sin
    `id_orden` — una vez que tiene orden, ya no es "mía en el carrito", es
    parte de una compra y se cancela por el flujo de órdenes, no por acá.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
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

# Cuánto tiempo puede vivir una pre-reserva sin orden asociada antes de
# considerarse abandonada. Bastante menor a las 48hs de una Orden: acá el
# socio recién está armando el carrito, no esperando que le verifiquen un
# comprobante.
_MINUTOS_EXPIRACION_PRE_RESERVA = 20


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


# ─── POST /socio/reservas/pre-reserva ──────────────────────────────────────

@router.post(
    "/pre-reserva",
    response_model=schemas.ReservaInstalacionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Bloquear una franja horaria antes de agregarla al carrito",
)
def crear_pre_reserva(
    payload: schemas.ReservaInstalacionCreate,
    db: Session = Depends(get_db),
    _socio: models.Usuario = Depends(require_roles(*_ROLES_COMPRADORES)),
) -> models.ReservaInstalacion:
    """
    Crea una `ReservaInstalacion` en estado 'bloqueada' (sin orden asociada
    todavía). El frontend guarda el `id_reserva` devuelto en el ítem del
    carrito y lo manda en el checkout (`DetalleOrdenCreate.id_reserva`) para
    que esa misma fila quede vinculada a la orden que se genere.

    Valida:
      1. El producto existe, está activo y es de categoría 'alquiler'
         (no tendría sentido pre-reservar una cuota social o indumentaria).
      2. No hay superposición con ninguna reserva 'bloqueada' o 'confirmada'
         ya existente para esa instalación — acá SÍ se valida superposición,
         a diferencia del GET de disponibilidad que es de solo lectura.
    """
    producto = (
        db.query(models.ProductoServicio)
        .filter(models.ProductoServicio.id_producto == payload.id_producto)
        .first()
    )
    if producto is None or not producto.es_activo:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El producto de alquiler seleccionado no existe o no está disponible.",
        )
    if producto.categoria != "alquiler":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Solo se pueden pre-reservar productos de categoría 'alquiler'.",
        )

    superposicion = (
        db.query(models.ReservaInstalacion)
        .filter(
            models.ReservaInstalacion.instalacion == payload.instalacion,
            models.ReservaInstalacion.estado.in_(_ESTADOS_OCUPA_AGENDA),
            models.ReservaInstalacion.fecha_inicio < payload.fecha_fin,
            models.ReservaInstalacion.fecha_fin > payload.fecha_inicio,
        )
        .first()
    )
    if superposicion is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ese turno ya no está disponible. Elegí otro horario.",
        )

    nueva_reserva = models.ReservaInstalacion(
        id_producto=payload.id_producto,
        instalacion=payload.instalacion,
        fecha_inicio=payload.fecha_inicio,
        fecha_fin=payload.fecha_fin,
        estado="bloqueada",
        # id_orden queda NULL hasta el checkout
    )
    db.add(nueva_reserva)
    db.commit()
    db.refresh(nueva_reserva)
    return nueva_reserva


# ─── POST /socio/reservas/{id_reserva}/liberar ─────────────────────────────

@router.post(
    "/{id_reserva}/liberar",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Liberar una pre-reserva propia (sacarla del carrito)",
)
def liberar_pre_reserva(
    id_reserva: int,
    db: Session = Depends(get_db),
    _socio: models.Usuario = Depends(require_roles(*_ROLES_COMPRADORES)),
) -> None:
    """
    Libera una reserva 'bloqueada' sin orden asociada, típicamente porque el
    socio la sacó del carrito antes de pagar. No se puede liberar por acá una
    reserva que ya tiene `id_orden` (eso se cancela por el flujo de órdenes).
    """
    reserva = (
        db.query(models.ReservaInstalacion)
        .filter(models.ReservaInstalacion.id_reserva == id_reserva)
        .first()
    )
    if reserva is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reserva no encontrada.")
    if reserva.estado != "bloqueada" or reserva.id_orden is not None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Esta reserva ya no se puede liberar (no está en el carrito).",
        )

    reserva.estado = "liberada"
    db.commit()


# ─── Job programado: limpiar pre-reservas huérfanas ────────────────────────

def liberar_pre_reservas_expiradas(db: Session) -> int:
    """
    Pensado para correr desde el mismo job que ya expira `Orden.expira_at`.
    Libera toda `ReservaInstalacion` en estado 'bloqueada', sin `id_orden`,
    cuyo `creado_at` supere `_MINUTOS_EXPIRACION_PRE_RESERVA`. Devuelve la
    cantidad de filas liberadas (para loguear en el job).
    """
    limite = datetime.now(timezone.utc) - timedelta(minutes=_MINUTOS_EXPIRACION_PRE_RESERVA)
    huerfanas = (
        db.query(models.ReservaInstalacion)
        .filter(
            models.ReservaInstalacion.estado == "bloqueada",
            models.ReservaInstalacion.id_orden.is_(None),
            models.ReservaInstalacion.creado_at < limite,
        )
        .all()
    )
    for reserva in huerfanas:
        reserva.estado = "liberada"
    db.commit()
    return len(huerfanas)