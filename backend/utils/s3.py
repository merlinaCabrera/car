"""
utils/s3.py
-----------
Módulo centralizado para operaciones con Amazon S3.

Todas las subidas van al bucket definido en S3_BUCKET_NAME.
Los archivos siempre se guardan como privados (ACL no public-read).
Para servir archivos se generan Presigned URLs con vigencia limitada.
"""

import io
import os
import boto3
from botocore.exceptions import ClientError
from fastapi import HTTPException, status

# Cliente S3 — las credenciales se leen de variables de entorno:
# AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
_s3 = boto3.client(
    "s3",
    region_name=os.getenv("AWS_REGION", "sa-east-1"),
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
)

BUCKET = os.getenv("S3_BUCKET_NAME", "car-archivos-produccion")

# Tiempo de vigencia de las Presigned URLs (segundos)
PRESIGNED_URL_EXPIRATION = 15 * 60  # 15 minutos


def subir_archivo(
    contenido: bytes,
    key: str,
    content_type: str,
) -> str:
    """
    Sube bytes a S3 y devuelve el object key.
    El archivo se guarda como privado (sin acceso público directo).

    Args:
        contenido: bytes del archivo
        key: ruta dentro del bucket, ej: "comprobantes/123/archivo.pdf"
        content_type: MIME type, ej: "application/pdf"

    Returns:
        El object key (para guardar en DB)

    Raises:
        HTTPException 500 si falla la subida
    """
    try:
        _s3.upload_fileobj(
            io.BytesIO(contenido),
            BUCKET,
            key,
            ExtraArgs={"ContentType": content_type},
        )
        return key
    except ClientError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"No se pudo guardar el archivo en S3. Intentá nuevamente.",
        )


def eliminar_archivo(key: str) -> None:
    """
    Elimina un archivo de S3. No lanza excepción si no existe.

    Args:
        key: object key del archivo a eliminar
    """
    try:
        _s3.delete_object(Bucket=BUCKET, Key=key)
    except ClientError:
        pass  # Si no existe o falla, ignoramos silenciosamente


def generar_presigned_url(key: str, expiracion_segundos: int = PRESIGNED_URL_EXPIRATION) -> str:
    """
    Genera una URL temporal firmada para acceder a un archivo privado de S3.

    Args:
        key: object key del archivo
        expiracion_segundos: tiempo de vigencia (default: 15 minutos)

    Returns:
        URL firmada válida por el tiempo indicado

    Raises:
        HTTPException 500 si falla la generación
    """
    try:
        url = _s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": BUCKET, "Key": key},
            ExpiresIn=expiracion_segundos,
        )
        return url
    except ClientError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No se pudo generar el enlace de descarga. Intentá nuevamente.",
        )


def es_key_s3(url: str) -> bool:
    """
    Detecta si un valor almacenado en DB es un object key de S3
    (no una ruta local /uploads/...).
    """
    return url is not None and not url.startswith("/")


# ─────────────────────────────────────────────────────────────────────────────
# Bucket PÚBLICO (car-sponsors-produccion) — distinto del bucket privado de
# arriba. Se usa para archivos que necesitan ser accesibles por URL directa,
# sin presigned URLs (ej: logos de sponsors en la landing). NO usar este
# bucket para nada que tenga datos sensibles — cualquiera con el link puede
# verlo, para siempre, sin expiración.
# ─────────────────────────────────────────────────────────────────────────────

BUCKET_PUBLICO = os.getenv("S3_BUCKET_PUBLICO", "car-sponsors-produccion")


def subir_archivo_publico(contenido: bytes, key: str, content_type: str) -> str:
    """
    Sube bytes al bucket público y devuelve el object key.
    El bucket entero es de lectura pública vía bucket policy (no se necesita
    ACL por objeto) — ver la policy configurada en car-sponsors-produccion.

    Returns:
        El object key (para guardar en DB junto con url_publica(key))
    """
    try:
        _s3.upload_fileobj(
            io.BytesIO(contenido),
            BUCKET_PUBLICO,
            key,
            ExtraArgs={"ContentType": content_type},
        )
        return key
    except ClientError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No se pudo guardar la imagen en S3. Intentá nuevamente.",
        )


def eliminar_archivo_publico(key: str) -> None:
    """Elimina un archivo del bucket público. No lanza excepción si no existe."""
    try:
        _s3.delete_object(Bucket=BUCKET_PUBLICO, Key=key)
    except ClientError:
        pass


def url_publica(key: str) -> str:
    """
    Construye la URL pública directa de un objeto del bucket público.
    No hay presigned URL acá a propósito: es contenido público (logos de
    sponsors), no hace falta firmarlo ni que expire.
    """
    region = os.getenv("AWS_REGION", "sa-east-1")
    return f"https://{BUCKET_PUBLICO}.s3.{region}.amazonaws.com/{key}"