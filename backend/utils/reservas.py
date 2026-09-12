# backend/utils/reservas.py
"""
Resolución del `ProductoServicio` de alquiler que corresponde a un turno.

Por qué existe
──────────────
`reservas_instalaciones.id_producto` es NOT NULL (ver models.ReservaInstalacion
y la migración 0001). El camino del socio siempre lo tiene a mano —el frontend
elige el producto para mostrar el precio y lo manda en la pre-reserva—, pero el
admin no: cuando inhabilita un turno o lo asigna en ventanilla está parado
sobre una CELDA de la grilla (instalación + horario), no sobre un producto.

Eso fue exactamente BUG-19: `bloquear_turno()` insertaba la fila sin
`id_producto`, Postgres rechazaba con NOT NULL, la excepción subía sin
manejar y FastAPI devolvía un 500 *sin* los headers del CORSMiddleware —
por eso el navegador reportaba "No 'Access-Control-Allow-Origin' header"
en vez del error real.

La regla de nombres es la MISMA que usa `frontend/src/utils/reservas.js`
(`TURNOS_QUINCHO[*].nombreProducto` y `CANCHAS[*].nombreProducto`): el socio
resuelve el precio del turno buscando el producto por nombre exacto. Si acá
usáramos otro criterio, el admin y el socio podrían terminar mirando dos
precios distintos para la misma celda.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

import models
from utils.fechas import TZ_CLUB

# Nombres EXACTOS de los ProductoServicio (categoria='alquiler') que el club
# tiene dados de alta. Tienen que coincidir con los del frontend.
NOMBRE_PRODUCTO_QUINCHO_DIA = "Quincho — Turno Día"
NOMBRE_PRODUCTO_QUINCHO_NOCHE = "Quincho — Turno Noche"
NOMBRES_PRODUCTO_CANCHA = {
    "cancha_1": "Cancha 1",
    "cancha_2": "Cancha 2",
}

# El turno Noche del quincho arranca a las 19:00 hora del club (idem frontend).
HORA_INICIO_QUINCHO_NOCHE = 19


def nombre_producto_de_turno(instalacion: str, fecha_inicio) -> Optional[str]:
    """
    Nombre del producto de alquiler que corresponde a esa celda de la grilla.

    `fecha_inicio` llega en UTC (el frontend manda `toISOString()`), así que
    hay que pasarlo a hora del club antes de decidir Día vs Noche: un turno
    Noche del 27/09 a las 19:00 ARG viaja como 27/09 22:00 UTC, y a las 21:00
    ARG ya cambió el día en UTC.
    """
    if instalacion in NOMBRES_PRODUCTO_CANCHA:
        return NOMBRES_PRODUCTO_CANCHA[instalacion]

    if instalacion == "quincho":
        inicio = fecha_inicio
        if inicio.tzinfo is not None:
            inicio = inicio.astimezone(TZ_CLUB)
        return (
            NOMBRE_PRODUCTO_QUINCHO_NOCHE
            if inicio.hour >= HORA_INICIO_QUINCHO_NOCHE
            else NOMBRE_PRODUCTO_QUINCHO_DIA
        )

    return None


def buscar_producto_de_turno(
    db: Session, instalacion: str, fecha_inicio,
) -> Optional[models.ProductoServicio]:
    """
    El producto de alquiler activo de ese turno, o None si no está cargado.

    Devuelve None en vez de romper: cada llamador decide si la ausencia es
    fatal (asignarle el turno a un socio necesita el PRECIO) o si alcanza con
    un reemplazo (un bloqueo de agenda solo necesita llenar la FK).
    """
    nombre = nombre_producto_de_turno(instalacion, fecha_inicio)
    if nombre is None:
        return None
    return (
        db.query(models.ProductoServicio)
        .filter(
            models.ProductoServicio.nombre == nombre,
            models.ProductoServicio.categoria == "alquiler",
            models.ProductoServicio.es_activo.is_(True),
        )
        .first()
    )


def producto_para_bloqueo(
    db: Session, instalacion: str, fecha_inicio,
) -> Optional[models.ProductoServicio]:
    """
    Producto con el que llenar `id_producto` en una franja SIN cobro.

    En un bloqueo de agenda el producto es puro relleno de la FK: no hay plata
    de por medio y nadie lee el precio (`_es_bloqueo_manual()` reconoce la
    franja por `id_usuario IS NULL AND id_orden IS NULL`). Por eso, si el
    producto propio del turno no está cargado, sirve cualquier alquiler activo
    antes que negarle al admin poder cerrar la cancha por mantenimiento.
    """
    producto = buscar_producto_de_turno(db, instalacion, fecha_inicio)
    if producto is not None:
        return producto
    return (
        db.query(models.ProductoServicio)
        .filter(
            models.ProductoServicio.categoria == "alquiler",
            models.ProductoServicio.es_activo.is_(True),
        )
        .order_by(models.ProductoServicio.id_producto)
        .first()
    )
