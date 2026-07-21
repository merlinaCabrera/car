"""
services/email_tasks.py — Wrappers seguros para usar con BackgroundTasks

¿Por qué este archivo y no llamar email_service directo desde la ruta?

BackgroundTasks de FastAPI NO recaptura excepciones: si el envío de mail
falla (SMTP caído, credenciales vencidas, timeout), la excepción se pierde
en el logging estándar del server y el admin no se entera de nada — pero
el socio tampoco recibió el mail. Esta capa:

  1. Atrapa cualquier excepción del email_service.
  2. La loguea con detalle (para poder auditar fallos de envío).
  3. Nunca revienta el proceso ni afecta al usuario que ya recibió su
     respuesta HTTP 200 hace rato.

Estas son las funciones que se pasan a `background_tasks.add_task(...)`
desde las rutas — nunca las funciones crudas de email_service.
"""

import logging

from . import email_service

logger = logging.getLogger("email_tasks")


async def task_orden_aprobada(email_destino: str, nombre_socio: str, numero_orden: int, monto: str) -> None:
    try:
        await email_service.enviar_orden_aprobada(email_destino, nombre_socio, numero_orden, monto)
        logger.info(f"Mail 'orden_aprobada' enviado a {email_destino} (orden #{numero_orden})")
    except Exception:
        logger.exception(f"Fallo al enviar mail 'orden_aprobada' a {email_destino} (orden #{numero_orden})")


async def task_orden_rechazada(email_destino: str, nombre_socio: str, numero_orden: int, motivo: str) -> None:
    try:
        await email_service.enviar_orden_rechazada(email_destino, nombre_socio, numero_orden, motivo)
        logger.info(f"Mail 'orden_rechazada' enviado a {email_destino} (orden #{numero_orden})")
    except Exception:
        logger.exception(f"Fallo al enviar mail 'orden_rechazada' a {email_destino} (orden #{numero_orden})")


async def task_cuota_vencida(email_destino: str, nombre_socio: str, fecha_vencimiento: str) -> None:
    try:
        await email_service.enviar_cuota_vencida(email_destino, nombre_socio, fecha_vencimiento)
        logger.info(f"Mail 'cuota_vencida' enviado a {email_destino}")
    except Exception:
        logger.exception(f"Fallo al enviar mail 'cuota_vencida' a {email_destino}")


async def task_convocatoria(email_destino: str, nombre_socio: str, titulo_evento: str, fecha_evento: str) -> None:
    try:
        await email_service.enviar_convocatoria(email_destino, nombre_socio, titulo_evento, fecha_evento)
        logger.info(f"Mail 'convocatoria' enviado a {email_destino} ({titulo_evento})")
    except Exception:
        logger.exception(f"Fallo al enviar mail 'convocatoria' a {email_destino} ({titulo_evento})")
