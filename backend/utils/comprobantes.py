# backend/utils/comprobantes.py
"""
Validación y subida de comprobantes de pago a S3.

Se extrajo de `routers/socio_cuotas.subir_comprobante` cuando se agregó el
camino del admin (`routers/admin_pagos.reemplazar_comprobante`, BUG-05 de
docs/qa-manual-2026-09-08.md): las dos rutas tienen que aceptar exactamente
los mismos formatos y el mismo tamaño máximo. Con la validación duplicada,
el día que se agregue un formato en una sola de las dos, el club sube un
archivo por un camino y no por el otro sin ninguna razón visible.

El comprobante cuelga del PAGO, no de la Orden (patrón Split-Order): un mismo
comprobante puede cubrir la orden de cuota_social y la de tienda del mismo
checkout.
"""
from __future__ import annotations

import os
import uuid

from fastapi import HTTPException, UploadFile, status

from utils.s3 import eliminar_archivo, subir_archivo

EXTENSIONES_PERMITIDAS = {".jpg", ".jpeg", ".png", ".pdf", ".webp"}
CONTENT_TYPES_PERMITIDOS = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
}
TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024  # 10 MB


async def validar_y_subir_comprobante(
    file: UploadFile,
    id_pago: int,
) -> tuple[str, str, int]:
    """
    Valida extensión, content-type y tamaño del archivo, lo sube a S3 y
    devuelve `(s3_key, nombre_original, tamano_bytes)`.

    No toca la base: quien llama es el responsable de guardar el key en
    `pago.comprobante_url`, de auditar y de commitear.
    """
    nombre_original = file.filename or ""
    extension = os.path.splitext(nombre_original)[-1].lower()

    if extension not in EXTENSIONES_PERMITIDAS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Extensión '{extension or 'desconocida'}' no permitida. "
                f"Formatos aceptados: {', '.join(sorted(EXTENSIONES_PERMITIDAS))}."
            ),
        )

    if file.content_type not in CONTENT_TYPES_PERMITIDOS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tipo de archivo '{file.content_type}' no permitido.",
        )

    # Lectura acotada a (límite + 1): no cargamos en memoria un archivo enorme
    # aunque el cliente mienta en Content-Length (la instancia de Render tiene
    # 512 MB).
    contenido = await file.read(TAMANO_MAXIMO_BYTES + 1)
    await file.close()

    if len(contenido) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo recibido está vacío.",
        )
    if len(contenido) > TAMANO_MAXIMO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="El archivo supera el tamaño máximo permitido (10 MB).",
        )

    nombre_archivo = f"{uuid.uuid4().hex}{extension}"
    s3_key = f"comprobantes/{id_pago}/{nombre_archivo}"
    subir_archivo(contenido, s3_key, file.content_type)

    return s3_key, nombre_original, len(contenido)


def borrar_comprobante_anterior(comprobante_anterior: str | None) -> None:
    """
    Borra de S3 el comprobante que se está reemplazando.

    Ignora las rutas locales legacy (`/uploads/...`) de filas viejas: no viven
    en S3, así que no hay nada que borrar allá.
    """
    if comprobante_anterior and not comprobante_anterior.startswith("/"):
        eliminar_archivo(comprobante_anterior)
