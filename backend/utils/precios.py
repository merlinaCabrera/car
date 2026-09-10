# backend/utils/precios.py
"""
Motor de precios de la cuota social — ÚNICO módulo que debe decidir cuánto
paga un socio concreto por un producto.

Por qué existe
──────────────
El descuento por menor de edad estaba implementado CUATRO veces, copiado a
mano en `routers/socio_cuotas.py`, `routers/admin_pagos.py` y
`routers/admin_usuarios.py` — y **faltaba** en `routers/socio_carrito.py`,
que es justamente el camino que usa el checkout real del socio.

Consecuencia (BUG-12 de docs/qa-manual-2026-09-08.md): la pantalla de cuotas
mostraba el precio con descuento porque leía `/socio/cuotas/estado`, pero al
confirmar la compra el carrito congelaba `producto.precio_actual` crudo. Un
socio menor terminaba con la orden, el mail y la vista del admin al precio
completo de adulto — un error de cobro real, no cosmético.

Regla
─────
El descuento aplica a los productos de categoría `cuota_social` cuando el
socio tiene menos de `EDAD_MAYORIA` años cumplidos. El porcentaje vive en
`ConfiguracionGlobal.descuento_menor_pct` (editable por el Admin General),
nunca hardcodeado; el fallback existe solo para bases sin fila de config.

Aritmética
──────────
Todo en `Decimal`. `precio_para_socio()` es la puerta de entrada para
cualquier código que arme una orden: recibe el producto entero y decide si
corresponde descuento según su categoría, así un llamador nuevo no puede
"olvidarse" del descuento como pasó con el carrito.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

import models
from utils.fechas import hoy_club

# Edad a partir de la cual se paga la cuota completa.
EDAD_MAYORIA = 18

# Porcentaje usado solo si todavía no existe la fila de ConfiguracionGlobal
# (base recién creada). Mismo valor que estaba fijo antes de hacerlo configurable.
DESCUENTO_MENOR_PCT_DEFAULT = Decimal("40")

# Categorías de producto sobre las que aplica el descuento por menor de edad.
# La cuota social es la única: la tienda y los alquileres se cobran igual a
# todo el mundo.
CATEGORIAS_CON_DESCUENTO_MENOR = ("cuota_social",)


def calcular_edad(fecha_nacimiento: Optional[date]) -> Optional[int]:
    """
    Edad en años cumplidos al día de hoy (zona horaria del club).
    Devuelve None si `fecha_nacimiento` es NULL — no se asume ninguna edad.
    """
    if fecha_nacimiento is None:
        return None
    hoy = hoy_club()
    return (
        hoy.year - fecha_nacimiento.year
        - ((hoy.month, hoy.day) < (fecha_nacimiento.month, fecha_nacimiento.day))
    )


def es_menor(fecha_nacimiento: Optional[date]) -> bool:
    """
    True solo si hay fecha de nacimiento cargada Y el socio es menor de
    `EDAD_MAYORIA`. Sin fecha de nacimiento → False (paga cuota completa),
    porque no se puede afirmar que sea menor.

    Esta es la MISMA condición que usa el descuento y la que tiene que usar
    el filtro "Menores" de /admin/socios, para que no puedan divergir.
    """
    edad = calcular_edad(fecha_nacimiento)
    return edad is not None and edad < EDAD_MAYORIA


def obtener_descuento_menor_pct(db: Session) -> Decimal:
    """
    Único punto de lectura del % de descuento para menores — vive en
    ConfiguracionGlobal, editable por el Admin General desde el Catálogo
    de Productos.
    """
    config = db.query(models.ConfiguracionGlobal).first()
    return config.descuento_menor_pct if config else DESCUENTO_MENOR_PCT_DEFAULT


def obtener_producto_cuota_social(db: Session) -> models.ProductoServicio:
    """Busca el único producto activo de categoría 'cuota_social'."""
    producto = (
        db.query(models.ProductoServicio)
        .filter(
            models.ProductoServicio.categoria == "cuota_social",
            models.ProductoServicio.es_activo.is_(True),
        )
        .first()
    )
    if producto is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "No existe ningún producto activo con categoria='cuota_social'. "
                "Por favor, cargá la 'Cuota Social' base en el sistema."
            ),
        )
    return producto


def calcular_precio_cuota(
    precio_base: Decimal,
    fecha_nacimiento: Optional[date],
    db: Session,
    *,
    descuento_menor_pct: Optional[Decimal] = None,
) -> Decimal:
    """
    Precio final de la cuota social para un socio con esa fecha de nacimiento.

    `descuento_menor_pct`: si se pasa, se usa ese valor y NO se consulta la DB.
    Los endpoints que llaman a esta función dentro de un loop (morosos,
    estadísticas) leen la config UNA vez y la pasan → evita un N+1 de una
    query de ConfiguracionGlobal por socio.
    """
    if not es_menor(fecha_nacimiento):
        return precio_base

    descuento_pct = (
        descuento_menor_pct
        if descuento_menor_pct is not None
        else obtener_descuento_menor_pct(db)
    )
    return precio_base * (Decimal("1") - descuento_pct / Decimal("100"))


def precio_para_socio(
    producto: models.ProductoServicio,
    socio: models.Usuario,
    db: Session,
    *,
    descuento_menor_pct: Optional[Decimal] = None,
) -> Decimal:
    """
    Puerta de entrada recomendada para todo código que arme una orden.

    A diferencia de `calcular_precio_cuota()`, decide por sí sola si
    corresponde descuento mirando `producto.categoria` — quien crea un
    DetalleOrden no necesita saber qué categorías tienen descuento ni
    acordarse de preguntarlo. Para un producto de tienda o un alquiler
    devuelve `precio_actual` sin tocar.
    """
    if producto.categoria not in CATEGORIAS_CON_DESCUENTO_MENOR:
        return producto.precio_actual

    return calcular_precio_cuota(
        producto.precio_actual,
        socio.fecha_nacimiento,
        db,
        descuento_menor_pct=descuento_menor_pct,
    )
