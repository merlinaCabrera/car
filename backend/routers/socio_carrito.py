# backend/routers/socio_carrito.py
"""
Router del carrito de compras genérico del socio.

── Registrar en main.py ────────────────────────────────────────────────────────
    from routers import socio_carrito
    app.include_router(socio_carrito.router)
────────────────────────────────────────────────────────────────────────────────

Endpoints:
  POST /socio/carrito/checkout  → Genera Orden en 'pendiente_verificacion'
                                   a partir de los ítems del carrito.

Subida de comprobante:
  Se reutiliza el endpoint ya existente en socio_cuotas (agnóstico al origen):
  POST /socio/cuotas/ordenes/{id_orden}/comprobante

Decisiones técnicas:
  ─ PRECIO: el valor que envía el frontend se IGNORA completamente.
    El backend lee precio_actual de ProductoServicio en el momento exacto
    del checkout. Esto cierra el vector de manipulación de precios.

  ─ STOCK: se VERIFICA disponibilidad en el checkout para dar feedback
    inmediato al usuario, pero NO se decrementa todavía.
    El decremento real ocurre de forma atómica cuando el admin aprueba
    la orden (flujo existente en admin_pagos / fn_aprobar_orden).
    Riesgo aceptado en MVP: dos socios podrían pedir el último ítem al
    mismo tiempo; el admin resuelve el conflicto al aprobar.

  ─ TRANSACCIÓN: Orden + DetalleOrden(es) + AuditLog en un único commit.
    Si cualquier paso falla, la DB queda intacta.

  ─ REFRESH CON JOINEDLOAD: tras el commit se vuelve a cargar la orden
    con sus detalles y productos anidados para que OrdenResponse pueda
    serializar el campo detalles[].producto correctamente.
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
    response_model=schemas.OrdenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generar una orden de compra con los ítems del carrito",
)
def checkout_carrito(
    payload: schemas.OrdenCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(*_ROLES_COMPRADORES)),
) -> schemas.OrdenResponse:
    """
    Convierte el carrito del frontend en una Orden persistida.

    Flujo (todo en una sola transacción):
      1. Verifica que el usuario esté activo.
      2. Itera los ítems del payload:
         a. Busca el ProductoServicio por id_producto en la BD.
         b. Verifica que exista y que es_activo sea True.
         c. Verifica que haya stock suficiente (si aplica).
         d. Congela precio_actual como precio_unitario_historico.
      3. Calcula monto_total = Σ(precio_congelado × cantidad).
      4. Crea la Orden en estado 'pendiente_verificacion'.
      5. Crea un DetalleOrden por cada ítem.
      6. Registra CHECKOUT_CARRITO en audit_log.
      7. Commit único.
      8. Recarga con joinedload y retorna OrdenResponse completo.

    El frontend debe llamar a POST /socio/cuotas/ordenes/{id_orden}/comprobante
    inmediatamente después para que el socio adjunte el comprobante de pago.
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
    # Permite iterar dos veces (para calcular total y luego insertar detalles)
    # sin volver a consultar la BD.
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

        items_resueltos.append((producto, item))

    # 3 ── Calcular monto_total exclusivamente en el backend ────────────────
    monto_total: Decimal = sum(
        producto.precio_actual * Decimal(item.cantidad)
        for producto, item in items_resueltos
    )

    # 4 ── Crear Orden ──────────────────────────────────────────────────────
    nueva_orden = models.Orden(
        id_usuario=current_user.id_usuario,
        estado="pendiente_verificacion",
        monto_total=monto_total,
        # expira_at: server_default en el modelo = NOW() + 48 horas
    )
    db.add(nueva_orden)
    db.flush()  # obtenemos nueva_orden.id_orden sin hacer commit aún

    # 5 ── Crear DetalleOrden con precio histórico congelado ────────────────
    for producto, item in items_resueltos:
        db.add(models.DetalleOrden(
            id_orden=nueva_orden.id_orden,
            id_producto=producto.id_producto,
            cantidad=item.cantidad,
            precio_unitario_historico=producto.precio_actual,  # ← CONGELADO
            mes_referencia=item.mes_referencia,                # None para no-cuotas
        ))

    # 6 ── Audit log ────────────────────────────────────────────────────────
    db.add(models.AuditLog(
        usuario_actor=current_user.id_usuario,
        accion="CHECKOUT_CARRITO",
        tabla_afectada="ordenes",
        registro_id=nueva_orden.id_orden,
        detalle={
            "monto_total": str(monto_total),
            "cantidad_items": len(items_resueltos),
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

    # 7 ── Commit único ─────────────────────────────────────────────────────
    db.commit()

    # 8 ── Reload con relaciones para serializar OrdenResponse.detalles ─────
    #
    # db.refresh(nueva_orden) no carga las relaciones lazy.
    # Hacemos una query explícita con joinedload para que Pydantic pueda
    # acceder a detalles[].producto sin lazy-load fuera de la sesión.
    #
    orden_completa = (
        db.query(models.Orden)
        .options(
            joinedload(models.Orden.detalles)
            .joinedload(models.DetalleOrden.producto)
        )
        .filter(models.Orden.id_orden == nueva_orden.id_orden)
        .first()
    )

    return orden_completa


# ════════════════════════════════════════════════════════════════════════════════
# FRAGMENTO BACKEND — agregar a backend/routers/socio_carrito.py
# ════════════════════════════════════════════════════════════════════════════════
#
# Importar en el encabezado del archivo (si no están ya):
#   from typing import List, Optional
#   from fastapi import Query
#
# ────────────────────────────────────────────────────────────────────────────────

"""
GET /socio/carrito/productos

Retorna el catálogo de productos disponibles para el socio.
Excluye 'cuota_social' (tiene su propia pantalla) y los inactivos.
Soporta filtro opcional por categoría.
"""

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