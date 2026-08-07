# backend/routers/admin_ordenes.py
"""
Router de verificación de Órdenes — panel del administrador.

Endpoints:
  GET  /admin/ordenes/pendientes              → Bandeja de órdenes esperando verificación
                                                  (con filtro opcional por tipo: cuota | tienda | alquiler | compra).
  GET  /admin/ordenes                          → Listado general: cualquier estado (o todos),
                                                  filtro por tipo, y búsqueda por DNI/nombre del socio.
  GET  /admin/ordenes/socio/{id_usuario}       → Historial completo de compras de UN socio
                                                  (cualquier estado), para ComprasSocioModal en AdminSocios.jsx.
  GET  /admin/ordenes/pendientes/count        → Cantidad de órdenes pendientes (con el mismo filtro opcional).
  GET  /admin/ordenes/pendientes-tienda/count → Cantidad de órdenes pendientes que son
                                                  puras ventas de tienda/alquiler (sin cuota_social).
  POST /admin/ordenes/{id_orden}/aprobar      → Aprueba la orden y aplica sus efectos.
  POST /admin/ordenes/{id_orden}/rechazar     → Rechaza la orden con motivo obligatorio.

Todos los endpoints requieren rol 'admin_general' o 'personal_administrativo'.

El motor de negocio de la aprobación (deuda, cobertura, stock, reservas,
audit_log, notificaciones y mails) vive en utils/ordenes.py —
procesar_aprobacion_orden(). Se extrajo ahí para que el webhook de Mercado
Pago (routers/webhooks_mercadopago.py) pueda aprobar automáticamente
ejecutando EXACTAMENTE el mismo código que un admin humano, sin duplicar
la lógica. Ver ese módulo para el detalle del algoritmo (motor de períodos,
manejo de stock, reservas, etc.).
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

import models
import schemas
from database import get_db
from dependencies import require_roles
from mailer.services import email_tasks
from utils.audit import registrar_audit as _registrar_audit, extraer_ip as _extraer_ip
from utils.ordenes import procesar_aprobacion_orden, verificar_pendiente, finalizar_pago_si_corresponde

router = APIRouter(
    prefix="/admin/ordenes",
    tags=["Admin — Verificación de Órdenes"],
)

_ROLES_ADMIN = ("admin_general", "personal_administrativo")

# 'cuota' y 'tienda' son los filtros históricos, usados por AdminPagos.jsx y
# AdminTienda.jsx respectivamente — sus semánticas NO cambian.
# 'alquiler' y 'compra' son subconjuntos de 'tienda' (que a su vez sigue
# incluyendo ambos) agregados para que el Panel de Control pueda mostrar un
# contador separado de "pagos de alquiler pendientes" vs. "pagos de
# indumentaria/otros pendientes", sin tocar la bandeja real de verificación
# (que sigue mostrando todo junto en /admin/tienda, donde efectivamente se
# aprueban/rechazan).
_TIPOS_FILTRO_VALIDOS = ("cuota", "tienda", "alquiler", "compra")

# Los 5 estados posibles de una Orden (ver CheckConstraint chk_orden_estado
# en models.py). 'cancelada_socio' es la que más se presta a pasarse por
# alto: es cuando el socio mismo cancela la orden desde su carrito antes de
# que un admin llegue a tocarla — no es lo mismo que 'rechazada' (que
# implica que un admin la revisó y la rechazó) ni que 'expirada' (que
# implica que nadie hizo nada y venció el plazo de 48hs).
_ESTADOS_ORDEN_VALIDOS = ("pendiente_verificacion", "aprobada", "rechazada", "cancelada_socio", "expirada")


# ─── Helpers de esta ruta ─────────────────────────────────────────────────────

def _obtener_orden_o_404(db: Session, id_orden: int) -> models.Orden:
    orden = (
        db.query(models.Orden)
        .options(
            joinedload(models.Orden.detalles).joinedload(models.DetalleOrden.producto),
            joinedload(models.Orden.detalles).joinedload(models.DetalleOrden.reserva),
            joinedload(models.Orden.usuario),
            joinedload(models.Orden.pago),
        )
        .filter(models.Orden.id_orden == id_orden)
        .first()
    )
    if orden is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No existe la orden #{id_orden}.",
        )
    return orden


def _subquery_tiene_cuota_social(db: Session):
    """Subquery EXISTS: True si la orden tiene al menos un ítem de cuota_social."""
    return _subquery_tiene_categoria(db, "cuota_social")


def _subquery_tiene_categoria(db: Session, categoria: str):
    """Subquery EXISTS: True si la orden tiene al menos un ítem de `categoria`
    (una de: cuota_social | alquiler | indumentaria | otro, ver chk_producto_categoria)."""
    return (
        db.query(models.DetalleOrden.id_detalle)
        .join(
            models.ProductoServicio,
            models.DetalleOrden.id_producto == models.ProductoServicio.id_producto,
        )
        .filter(
            models.DetalleOrden.id_orden == models.Orden.id_orden,
            models.ProductoServicio.categoria == categoria,
        )
        .exists()
    )


def _aplicar_filtro_tipo(query, db: Session, tipo: Optional[str]):
    """Aplica el filtro `tipo` a un query de Orden.

    - 'cuota':    contiene un ítem de cuota_social.
    - 'tienda':   sin cuota_social (indumentaria + alquiler + otro juntos —
                  semántica histórica, la usa la bandeja real de /admin/tienda).
    - 'alquiler': contiene un ítem de alquiler, sin cuota_social.
    - 'compra':   sin cuota_social y sin alquiler (indumentaria + otro puros).
    """
    if tipo is None:
        return query

    if tipo not in _TIPOS_FILTRO_VALIDOS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Parámetro 'tipo' inválido. Opciones válidas: {_TIPOS_FILTRO_VALIDOS}.",
        )

    tiene_cuota = _subquery_tiene_cuota_social(db)
    if tipo == "cuota":
        return query.filter(tiene_cuota)
    if tipo == "tienda":
        return query.filter(~tiene_cuota)

    tiene_alquiler = _subquery_tiene_categoria(db, "alquiler")
    if tipo == "alquiler":
        return query.filter(~tiene_cuota, tiene_alquiler)
    # tipo == "compra"
    return query.filter(~tiene_cuota, ~tiene_alquiler)


# ─── ENDPOINT: Bandeja de órdenes pendientes ──────────────────────────────────

@router.get(
    "/pendientes",
    response_model=List[schemas.OrdenAdminResponse],
    summary="Listar órdenes pendientes de verificación (con filtro opcional por tipo)",
)
def listar_ordenes_pendientes(
    tipo: Optional[str] = Query(
        None,
        description="Filtro opcional: 'cuota' (contiene cuota_social), "
                    "'alquiler' (contiene un ítem de alquiler, sin cuota_social), "
                    "'compra' (indumentaria/otro puro, sin cuota_social ni alquiler), "
                    "o 'tienda' (alquiler + compra juntos, sin cuota_social — "
                    "semántica histórica). Si se omite, devuelve todas.",
    ),
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN)),
) -> List[schemas.OrdenAdminResponse]:
    query = (
        db.query(models.Orden)
        .options(
            joinedload(models.Orden.detalles).joinedload(models.DetalleOrden.producto),
            joinedload(models.Orden.usuario),
            joinedload(models.Orden.pago),
        )
        .filter(models.Orden.estado == "pendiente_verificacion")
    )

    query = _aplicar_filtro_tipo(query, db, tipo)
    ordenes = query.order_by(models.Orden.fecha_creacion.asc()).all()
    return ordenes


# ─── ENDPOINT: Listado general (cualquier estado, con búsqueda) ───────────────

@router.get(
    "",
    response_model=List[schemas.OrdenAdminResponse],
    summary="Listar órdenes con filtros de estado/tipo y búsqueda por DNI o nombre del socio",
)
def listar_ordenes(
    estado: Optional[str] = Query(
        None,
        description=f"Filtro opcional por estado exacto: {_ESTADOS_ORDEN_VALIDOS}. "
                    "Si se omite, devuelve órdenes en cualquier estado.",
    ),
    tipo: Optional[str] = Query(
        None,
        description=f"Mismo filtro de categoría que /pendientes: {_TIPOS_FILTRO_VALIDOS}.",
    ),
    q: Optional[str] = Query(
        None,
        min_length=1,
        max_length=100,
        description="Busca por DNI, nombre o apellido del socio dueño de la orden "
                    "(coincidencia parcial, sin distinguir mayúsculas/minúsculas).",
    ),
    limit: int = Query(
        200, ge=1, le=500,
        description="Tope de resultados — pensado para pantallas admin, no para exportar el historial completo.",
    ),
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN)),
) -> List[schemas.OrdenAdminResponse]:
    """
    Generaliza a /pendientes: acá SÍ se puede pedir cualquier estado (o
    ninguno, para traer de todos), y se puede filtrar por socio. Pensado
    para la pantalla /admin/verificaciones, que necesita mostrar también
    lo ya resuelto (aprobadas/rechazadas/expiradas/canceladas) cuando el
    admin cambia de tab, y buscar "las compras de tal socio" sin tener que
    ir a ComprasSocioModal a mano.

    La búsqueda es un ILIKE simple sobre dni/nombre/apellido — no usa la
    columna nombre_completo_search (tsvector) porque esa hace *full-text*
    matching (por palabra completa, con stemming), y acá interesa más el
    comportamiento de "iba escribiendo y ya empieza a filtrar" con
    coincidencia parcial de subcadena, más predecible para un admin.
    """
    if estado is not None and estado not in _ESTADOS_ORDEN_VALIDOS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Estado inválido: '{estado}'. Opciones: {_ESTADOS_ORDEN_VALIDOS}",
        )

    query = (
        db.query(models.Orden)
        .join(models.Usuario, models.Orden.id_usuario == models.Usuario.id_usuario)
        .options(
            joinedload(models.Orden.detalles).joinedload(models.DetalleOrden.producto),
            joinedload(models.Orden.usuario),
            joinedload(models.Orden.pago),
        )
    )

    if estado:
        query = query.filter(models.Orden.estado == estado)

    query = _aplicar_filtro_tipo(query, db, tipo)

    if q:
        termino = f"%{q.strip()}%"
        query = query.filter(
            or_(
                models.Usuario.dni.ilike(termino),
                models.Usuario.nombre.ilike(termino),
                models.Usuario.apellido.ilike(termino),
                func.concat(models.Usuario.nombre, " ", models.Usuario.apellido).ilike(termino),
            )
        )

    return (
        query.order_by(models.Orden.fecha_creacion.desc())
        .limit(limit)
        .all()
    )


# ─── ENDPOINT: Historial de compras de un socio ───────────────────────────────

@router.get(
    "/socio/{id_usuario}",
    response_model=List[schemas.OrdenAdminResponse],
    summary="Historial completo de órdenes de un socio (todos los estados, filtro opcional por tipo)",
)
def listar_ordenes_de_socio(
    id_usuario: int,
    tipo: Optional[str] = Query(
        None,
        description=f"Filtro opcional: {_TIPOS_FILTRO_VALIDOS}. Si se omite, devuelve todas.",
    ),
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN)),
) -> List[schemas.OrdenAdminResponse]:
    """
    A diferencia de /pendientes (y de /), acá el filtro es por socio
    puntual en vez de por estado — es el historial completo (pendientes,
    aprobadas, rechazadas, canceladas, expiradas) de UN socio, para la
    pestaña "Ver Compras" de AdminSocios.jsx (componente ComprasSocioModal).
    """
    existe_usuario = (
        db.query(models.Usuario.id_usuario)
        .filter(models.Usuario.id_usuario == id_usuario)
        .first()
    )
    if existe_usuario is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No existe un usuario con id {id_usuario}.",
        )

    query = (
        db.query(models.Orden)
        .options(
            joinedload(models.Orden.detalles).joinedload(models.DetalleOrden.producto),
            joinedload(models.Orden.detalles).joinedload(models.DetalleOrden.reserva),
            joinedload(models.Orden.usuario),
            joinedload(models.Orden.pago),
        )
        .filter(models.Orden.id_usuario == id_usuario)
    )
    query = _aplicar_filtro_tipo(query, db, tipo)
    return query.order_by(models.Orden.fecha_creacion.desc()).all()


@router.get("/pendientes/count", response_model=int, summary="Cantidad de órdenes pendientes")
def contar_ordenes_pendientes(
    tipo: Optional[str] = Query(
        None,
        description="Filtro opcional: 'cuota' | 'tienda' | 'alquiler' | 'compra'. "
                    "Si se omite, devuelve el total sin filtrar.",
    ),
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN)),
) -> int:
    query = db.query(models.Orden).filter(models.Orden.estado == "pendiente_verificacion")
    query = _aplicar_filtro_tipo(query, db, tipo)
    return query.count()


@router.get(
    "/pendientes-tienda/count",
    response_model=int,
    summary="Cantidad de órdenes pendientes que son puras ventas de tienda (sin cuota_social)",
)
def contar_ordenes_pendientes_tienda(
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN)),
) -> int:
    query = db.query(models.Orden).filter(models.Orden.estado == "pendiente_verificacion")
    query = _aplicar_filtro_tipo(query, db, "tienda")
    return query.count()


# ─── ENDPOINT: Aprobar orden ───────────────────────────────────────────────────

@router.post(
    "/{id_orden}/aprobar",
    response_model=schemas.OrdenAprobarResponse,
    summary="Aprobar una orden pendiente de verificación",
)
def aprobar_orden(
    id_orden: int,
    payload: schemas.OrdenAprobar,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN)),
) -> schemas.OrdenAprobarResponse:
    """
    Aprobación manual: un admin humano revisó el comprobante y confirma.
    Todo el motor de negocio vive en utils.ordenes.procesar_aprobacion_orden
    — el mismo que usa el webhook de Mercado Pago para aprobar sin
    intervención humana.
    """
    orden = _obtener_orden_o_404(db, id_orden)
    verificar_pendiente(orden)

    respuesta = procesar_aprobacion_orden(
        db=db,
        orden=orden,
        actor_id=admin.id_usuario,
        background_tasks=background_tasks,
        notas_admin=payload.notas_admin,
        meses_corregidos=payload.meses_corregidos,
        ip=_extraer_ip(request),
    )

    finalizar_pago_si_corresponde(db=db, pago=orden.pago, background_tasks=background_tasks)

    db.commit()
    db.refresh(orden)

    return respuesta


# ─── ENDPOINT: Rechazar orden ──────────────────────────────────────────────────

@router.post(
    "/{id_orden}/rechazar",
    response_model=schemas.OrdenRechazarResponse,
    summary="Rechazar una orden pendiente de verificación",
)
def rechazar_orden(
    id_orden: int,
    payload: schemas.OrdenRechazar,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN)),
) -> schemas.OrdenRechazarResponse:
    orden = _obtener_orden_o_404(db, id_orden)
    verificar_pendiente(orden)

    orden.estado = "rechazada"
    orden.motivo_rechazo = payload.motivo_rechazo

    # ── Liberar reservas de alquiler asociadas ────────────────────────────────
    # Si la orden tenía turnos bloqueados, hay que devolverlos a la agenda:
    # el pago no se concretó, así que el horario tiene que volver a ofertarse.
    for detalle in orden.detalles:
        if (
            detalle.producto is not None
            and detalle.producto.categoria == "alquiler"
            and detalle.reserva is not None
            and detalle.reserva.estado == "bloqueada"
        ):
            detalle.reserva.estado = "liberada"

    # ── Resolver el Pago padre si quedó "huérfano" ────────────────────────────
    # Un Pago puede tener más de una Orden hija (split-order: cuota + tienda).
    # Si esta era la única orden útil (ninguna otra sigue pendiente ni fue
    # aprobada), el rechazo es total: dejamos el Pago en 'rechazado'.
    quedan_ordenes_utiles = (
        db.query(models.Orden.id_orden)
        .filter(
            models.Orden.id_pago == orden.id_pago,
            models.Orden.id_orden != orden.id_orden,
            models.Orden.estado.in_(("pendiente_verificacion", "aprobada")),
        )
        .first()
        is not None
    )

    pago = orden.pago
    pago_marcado_rechazado = False
    if pago is not None and pago.estado == "pendiente" and not quedan_ordenes_utiles:
        pago.estado = "rechazado"
        pago_marcado_rechazado = True

    _registrar_audit(
        db=db,
        actor_id=admin.id_usuario,
        accion="RECHAZAR_ORDEN",
        tabla_afectada="ordenes",
        registro_id=orden.id_orden,
        detalle={
            "id_usuario": orden.id_usuario,
            "motivo_rechazo": payload.motivo_rechazo,
            "monto_total": str(orden.monto_total),
            "id_pago": orden.id_pago,
            "pago_marcado_rechazado": pago_marcado_rechazado,
        },
        ip=_extraer_ip(request),
    )

    # ── Notificar al socio ───────────────────────────────────────────────────
    db.add(
        models.Notificacion(
            id_usuario=orden.id_usuario,
            tipo="orden_rechazada",
            titulo="Problema con tu pago",
            cuerpo=f"Hubo un problema con tu transferencia por ${orden.monto_total}. "
                   f"Motivo: {payload.motivo_rechazo}.",
            referencia_id=orden.id_orden,
            referencia_tabla="ordenes",
        )
    )

    # ── Mail al socio avisando el rechazo (background) ───────────────────────
    socio_rechazo = orden.usuario
    if socio_rechazo and socio_rechazo.email:
        background_tasks.add_task(
            email_tasks.task_orden_rechazada,
            email_destino=socio_rechazo.email,
            nombre_socio=socio_rechazo.nombre,
            numero_orden=orden.id_orden,
            motivo=payload.motivo_rechazo,
        )

    finalizar_pago_si_corresponde(db=db, pago=pago, background_tasks=background_tasks)

    db.commit()
    db.refresh(orden)

    return schemas.OrdenRechazarResponse(
        id_orden=orden.id_orden,
        estado=orden.estado,
        motivo_rechazo=orden.motivo_rechazo,
    )