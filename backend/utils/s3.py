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