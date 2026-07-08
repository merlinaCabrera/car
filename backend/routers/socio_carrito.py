# backend/routers/socio_carrito.py
"""
Router del carrito de compras genérico del socio.

── Registrar en main.py ────────────────────────────────────────────────────────
    from routers import socio_carrito
    app.include_router(socio_carrito.router)
────────────────────────────────────────────────────────────────────────────────

Endpoints:
  POST /socio/carrito/checkout   → Genera un Pago + Órdenes hijas (split-order)
                                    a partir de los ítems del carrito.
  GET  /socio/carrito/productos  → Catálogo disponible para la tienda del socio.

Subida de comprobante:
  Se adjunta al PAGO (no a cada orden individual), vía el endpoint agnóstico
  al origen: POST /socio/cuotas/pagos/{id_pago}/comprobante

── Patrón "Split-Order bajo un único Pago" ─────────────────────────────────────
  El socio puede tener en el carrito, al mismo tiempo, ítems de dos dominios
  de negocio distintos:
    - cuota_social  → siempre se factura en SU PROPIA orden.
    - tienda        → alquileres, indumentaria, otro → van juntos en otra orden.
  Motivo de la separación: cada dominio tiene lógica de aprobación distinta
  del lado de fn_aprobar_orden() (la cuota impacta deuda_historica_meses, la
  tienda impacta stock/reservas), así que conviene que sean órdenes separadas
  aunque el socio las pague con una sola transferencia y un solo comprobante.
  Ese comprobante único vive en el `Pago` que agrupa ambas órdenes — por eso
  el checkout ya NO crea una Orden suelta, crea un Pago y cuelga de él 1 o 2
  Órdenes según qué haya en el carrito.

Decisiones técnicas (se mantienen del router anterior):
  ─ PRECIO: el valor que envía el frontend se IGNORA completamente.
    El backend lee precio_actual de ProductoServicio en el momento exacto
    del checkout. Esto cierra el vector de manipulación de precios.

  ─ STOCK: se descuenta INMEDIATAMENTE en el checkout, no al aprobar.
    Esto evita la sobreventa (dos socios reservando el mismo último ítem
    mientras ambas órdenes están 'pendiente_verificacion'). El stock
    reservado se libera automáticamente si el admin rechaza la orden
    (ver rechazar_orden en admin_ordenes.py) o queda consumido si la
    aprueba. La cuota_social nunca tiene stock (siempre None), así que
    este descuento no la afecta.

  ─ TRANSACCIÓN: Pago + Orden(es) + DetalleOrden(es) + AuditLog en un único
    commit. Si cualquier paso falla, la DB queda intacta (todo lo agregado
    antes del commit se descarta).

  ─ RETORNO: PagoResponse (no OrdenResponse). El frontend necesita el
    id_pago para saber dónde adjuntar el comprobante — ya no existe un solo
    "id_orden" representativo del checkout, puede haber hasta dos órdenes.
"""

from __future__ import annotations

from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status, Query
from sqlalchemy.orm import Session, joinedload

import models
import schemas
from database import get_db
from dependencies import require_roles

router = APIRouter(
    prefix="/socio/carrito",
    tags=["Socio — Carrito"],
)

# jugador hereda todos los derechos de socio (ambos roles se asignan juntos).
# admin_general se incluye para que pueda testear el flujo sin necesitar un
# segundo usuario con rol socio.
_ROLES_COMPRADORES = ("socio", "jugador", "admin_general")


# ─── Helper ──────────────────────────────────────────────────────────────────

def _extraer_ip(request: Request) -> Optional[str]:
    """Extrae la IP real considerando proxies (X-Forwarded-For)."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return getattr(request.client, "host", None)


# ─── POST /socio/carrito/checkout ─────────────────────────────────────────────

@router.post(
    "/checkout",
    response_model=schemas.PagoResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generar un Pago (con sus Órdenes hijas) a partir de los ítems del carrito",
)
def checkout_carrito(
    payload: schemas.OrdenCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(*_ROLES_COMPRADORES)),
) -> models.Pago:
    """
    Convierte el carrito del frontend en un Pago con 1 o 2 Órdenes hijas
    (split-order: cuota_social separada de tienda).

    Flujo (todo en una sola transacción):
      1. Verifica que el usuario esté activo.
      2. Itera los ítems del payload:
         a. Busca el ProductoServicio por id_producto en la BD.
         b. Verifica que exista y que es_activo sea True.
         c. Verifica que haya stock suficiente (si aplica).
         d. Descuenta stock ya en este paso (excepto cuota_social, que no tiene).
         e. Congela precio_actual como precio_unitario_historico.
      3. Calcula monto_total GLOBAL = Σ(precio_congelado × cantidad) de todo el carrito.
      4. Crea el Pago (estado='pendiente', monto_total=global) y hace flush
         para obtener id_pago.
      5. Separa los ítems resueltos en dos dominios: cuota_social vs. tienda.
      6. Por cada dominio no vacío, crea UNA Orden (id_pago=el recién creado,
         monto_total=subtotal de ese dominio) y sus DetalleOrden.
      7. Registra CHECKOUT_PAGO en audit_log, referenciado a "pagos"/id_pago.
      8. Commit único.
      9. Retorna el Pago (PagoResponse). El frontend usa pago.id_pago para
         adjuntar el comprobante único de la operación.
    """

    # 1 ── Usuario activo ───────────────────────────────────────────────────
    if current_user.fecha_baja is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tu cuenta está dada de baja y no podés generar órdenes.",
        )

    # 2 ── Resolución de productos y validaciones ───────────────────────────
    #
    # items_resueltos: lista de tuplas (ProductoServicio, DetalleOrdenCreate)
    # Permite iterar varias veces (calcular totales, separar por dominio,
    # insertar detalles) sin volver a consultar la BD.
    #
    items_resueltos: list[tuple[models.ProductoServicio, schemas.DetalleOrdenCreate]] = []

    for item in payload.items:

        # 2a. Producto existe
        producto = (
            db.query(models.ProductoServicio)
            .filter(models.ProductoServicio.id_producto == item.id_producto)
            .first()
        )
        if producto is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"El producto con ID {item.id_producto} no existe.",
            )

        # 2b. Producto disponible
        if not producto.es_activo:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"El producto '{producto.nombre}' no está disponible actualmente. "
                    "Quitalo del carrito y volvé a intentarlo."
                ),
            )

        # 2c. Stock suficiente (producto.stock = None → sin límite, p.ej. cuota social)
        if producto.stock is not None and producto.stock < item.cantidad:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"Stock insuficiente para '{producto.nombre}'. "
                    f"Disponible: {producto.stock}, solicitado: {item.cantidad}. "
                    "Ajustá la cantidad en el carrito."
                ),
            )

        # 2c-bis. Alquileres: la franja tiene que venir de una pre-reserva
        #         viva (bloqueada, sin orden todavía). Esto es lo que impide
        #         que el checkout invente una reserva sin pasar por la
        #         validación de superposición de POST /socio/reservas/pre-reserva.
        if producto.categoria == "alquiler":
            if item.id_reserva is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=(
                        f"Falta la pre-reserva para '{producto.nombre}'. "
                        "Elegí el turno de nuevo desde el calendario."
                    ),
                )
            reserva = (
                db.query(models.ReservaInstalacion)
                .filter(models.ReservaInstalacion.id_reserva == item.id_reserva)
                .first()
            )
            if (
                reserva is None
                or reserva.estado != "bloqueada"
                or reserva.id_orden is not None
                or reserva.id_producto != producto.id_producto
            ):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"El turno reservado para '{producto.nombre}' ya no está "
                        "disponible (expiró o se perdió). Elegilo de nuevo."
                    ),
                )

        # 2d. Descontar stock ya en el checkout, no al aprobar (evita overselling).
        #     Se restaura si el admin rechaza la orden (ver rechazar_orden).
        #     cuota_social siempre tiene stock=None, así que nunca entra acá.
        if producto.stock is not None:
            producto.stock -= item.cantidad

        items_resueltos.append((producto, item))

    # 3 ── Calcular monto_total GLOBAL exclusivamente en el backend ─────────
    monto_total_global: Decimal = sum(
        (producto.precio_actual * Decimal(item.cantidad) for producto, item in items_resueltos),
        Decimal("0"),
    )

    # 4 ── Crear el Pago (cabecera única de cobro) ───────────────────────────
    nuevo_pago = models.Pago(
        id_usuario=current_user.id_usuario,
        monto_total=monto_total_global,
        estado="pendiente",
        # comprobante_url queda NULL hasta que el socio lo suba.
    )
    db.add(nuevo_pago)
    db.flush()  # obtenemos nuevo_pago.id_pago sin hacer commit aún

    # 5 ── Split-order: separar ítems resueltos por dominio de negocio ──────
    items_cuotas = [
        (producto, item) for producto, item in items_resueltos
        if producto.categoria == "cuota_social"
    ]
    items_tienda = [
        (producto, item) for producto, item in items_resueltos
        if producto.categoria != "cuota_social"
    ]

    ordenes_creadas: list[models.Orden] = []

    def _crear_orden_para_dominio(
        grupo: list[tuple[models.ProductoServicio, schemas.DetalleOrdenCreate]],
    ) -> Optional[models.Orden]:
        """Crea una Orden + sus DetalleOrden para un dominio (cuota o tienda).
        No hace nada si el grupo está vacío."""
        if not grupo:
            return None

        subtotal: Decimal = sum(
            (producto.precio_actual * Decimal(item.cantidad) for producto, item in grupo),
            Decimal("0"),
        )

        orden = models.Orden(
            id_usuario=current_user.id_usuario,
            id_pago=nuevo_pago.id_pago,
            estado="pendiente_verificacion",
            monto_total=subtotal,
            # expira_at: server_default en el modelo = NOW() + 48 horas
        )
        db.add(orden)
        db.flush()  # obtenemos orden.id_orden para los DetalleOrden

        for producto, item in grupo:
            db.add(models.DetalleOrden(
                id_orden=orden.id_orden,
                id_producto=producto.id_producto,
                cantidad=item.cantidad,
                precio_unitario_historico=producto.precio_actual,  # ← CONGELADO
                mes_referencia=item.mes_referencia,                # None para no-cuotas
                id_reserva=item.id_reserva,                        # None salvo alquileres
            ))

            # Alquileres: la reserva pasa de "bloqueada, sin dueño" a
            # "bloqueada, atada a esta orden". fn_aprobar_orden() es quien
            # más adelante la mueve a 'confirmada' cuando el admin aprueba.
            if producto.categoria == "alquiler" and item.id_reserva is not None:
                reserva = (
                    db.query(models.ReservaInstalacion)
                    .filter(models.ReservaInstalacion.id_reserva == item.id_reserva)
                    .first()
                )
                reserva.id_orden = orden.id_orden

        return orden

    # 6 ── Crear una Orden por dominio no vacío ──────────────────────────────
    orden_cuota  = _crear_orden_para_dominio(items_cuotas)
    orden_tienda = _crear_orden_para_dominio(items_tienda)

    for orden in (orden_cuota, orden_tienda):
        if orden is not None:
            ordenes_creadas.append(orden)

    # Salvaguarda: si por algún motivo no se generó ninguna orden (no debería
    # pasar si payload.items no está vacío), no dejamos un Pago huérfano.
    if not ordenes_creadas:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El carrito no generó ninguna orden válida.",
        )

    # 7 ── Audit log — referenciado al Pago, no a una orden individual ──────
    db.add(models.AuditLog(
        usuario_actor=current_user.id_usuario,
        accion="CHECKOUT_PAGO",
        tabla_afectada="pagos",
        registro_id=nuevo_pago.id_pago,
        detalle={
            "monto_total": str(monto_total_global),
            "cantidad_items": len(items_resueltos),
            "ordenes_generadas": [
                {
                    "id_orden": orden.id_orden,
                    "dominio": "cuota_social" if orden is orden_cuota else "tienda",
                    "monto_total": str(orden.monto_total),
                }
                for orden in ordenes_creadas
            ],
            "items": [
                {
                    "id_producto":  producto.id_producto,
                    "nombre":       producto.nombre,
                    "categoria":    producto.categoria,
                    "cantidad":     item.cantidad,
                    "precio_unit":  str(producto.precio_actual),
                    "subtotal":     str(producto.precio_actual * item.cantidad),
                }
                for producto, item in items_resueltos
            ],
        },
        ip_origen=_extraer_ip(request),
    ))

    # 8 ── Commit único — Pago + Orden(es) + DetalleOrden(es) + AuditLog ────
    db.commit()
    db.refresh(nuevo_pago)

    return nuevo_pago


# ─── GET /socio/carrito/productos ─────────────────────────────────────────────

@router.get(
    "/productos",
    response_model=List[schemas.ProductoServicioResponse],
    summary="Catálogo de productos disponibles en la tienda del socio",
)
def listar_productos_tienda(
    categoria: Optional[str] = Query(
        default=None,
        description="Filtrar por categoría: 'indumentaria', 'alquiler' u 'otro'.",
    ),
    db: Session = Depends(get_db),
    _: models.Usuario = Depends(require_roles(*_ROLES_COMPRADORES)),
) -> List[schemas.ProductoServicioResponse]:
    """
    Reglas de negocio:
      - Excluye siempre categoria='cuota_social' (pantalla de cuotas dedicada).
      - Excluye productos con es_activo=False.
      - Si se pasa `categoria`, filtra por ese valor además de los anteriores.
      - Ordenado: primero los que tienen stock (o sin límite), luego los agotados.
        Dentro de cada grupo, alfabético por nombre.
    """
    CATEGORIAS_TIENDA = ("indumentaria", "alquiler", "otro")

    if categoria and categoria not in CATEGORIAS_TIENDA:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Categoría inválida. Opciones: {CATEGORIAS_TIENDA}",
        )

    query = (
        db.query(models.ProductoServicio)
        .filter(
            models.ProductoServicio.es_activo.is_(True),
            models.ProductoServicio.categoria != "cuota_social",
        )
    )

    if categoria:
        query = query.filter(models.ProductoServicio.categoria == categoria)

    # Ordenar: sin_stock al final, luego alfabético
    productos = query.order_by(models.ProductoServicio.nombre).all()

    # Separar en dos grupos: disponibles y agotados
    disponibles = [p for p in productos if p.stock is None or p.stock > 0]
    agotados    = [p for p in productos if p.stock is not None and p.stock == 0]

    return disponibles + agotados

# ─── GET /socio/carrito/mis-compras ───────────────────────────────────────────

@router.get(
    "/mis-compras",
    response_model=List[schemas.OrdenResponse],
    summary="Historial de órdenes de tienda (indumentaria/alquileres) del socio logueado",
)
def listar_mis_compras(
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(*_ROLES_COMPRADORES)),
) -> List[schemas.OrdenResponse]:
    """
    Devuelve las órdenes de "tienda" del socio: alquileres, indumentaria, otro.
    Excluye explícitamente cualquier orden que tenga al menos un ítem de
    categoría 'cuota_social' — esas se ven en la pantalla dedicada "Mis Cuotas"
    (socio_cuotas.py), no acá, para no duplicar/confundir el historial.

    La exclusión se hace con NOT EXISTS en vez de traer todo y filtrar en
    Python: así una orden mixta (si alguna vez llegara a existir) tampoco
    se cuela, sin tener que cargar sus detalles primero para decidir.
    """
    subquery_tiene_cuota = (
        db.query(models.DetalleOrden.id_detalle)
        .join(
            models.ProductoServicio,
            models.DetalleOrden.id_producto == models.ProductoServicio.id_producto,
        )
        .filter(
            models.DetalleOrden.id_orden == models.Orden.id_orden,
            models.ProductoServicio.categoria == "cuota_social",
        )
        .exists()
    )

    ordenes = (
        db.query(models.Orden)
        .options(
            joinedload(models.Orden.detalles).joinedload(models.DetalleOrden.producto),
            joinedload(models.Orden.pago),
        )
        .filter(
            models.Orden.id_usuario == current_user.id_usuario,
            ~subquery_tiene_cuota,
        )
        .order_by(models.Orden.fecha_creacion.desc())
        .all()
    )

    return ordenes