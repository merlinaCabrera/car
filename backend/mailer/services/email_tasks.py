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

# Pegar al FINAL de mailer/services/email_tasks.py (después de task_convocatoria)

async def task_cuenta_aprobada(email_destino: str, nombre_socio: str) -> None:
    try:
        await email_service.enviar_cuenta_aprobada(email_destino, nombre_socio)
        logger.info(f"Mail 'cuenta_aprobada' enviado a {email_destino}")
    except Exception:
        logger.exception(f"Fallo al enviar mail 'cuenta_aprobada' a {email_destino}")


async def task_recuperar_password(email_destino: str, nombre_socio: str, link_reset: str) -> None:
    try:
        await email_service.enviar_recuperar_password(email_destino, nombre_socio, link_reset)
        logger.info(f"Mail 'recuperar_password' enviado a {email_destino}")
    except Exception:
        logger.exception(f"Fallo al enviar mail 'recuperar_password' a {email_destino}")


async def task_orden_aprobada_cuota(
    email_destino: str,
    nombre_socio: str,
    numero_orden: int,
    meses_pagados: int,
    cubierto_hasta: str,
) -> None:
    try:
        await email_service.enviar_orden_aprobada_cuota(
            email_destino, nombre_socio, numero_orden, meses_pagados, cubierto_hasta
        )
        logger.info(f"Mail 'orden_aprobada_cuota' enviado a {email_destino} (orden #{numero_orden})")
    except Exception:
        logger.exception(f"Fallo al enviar mail 'orden_aprobada_cuota' a {email_destino} (orden #{numero_orden})")


async def task_orden_aprobada_tienda(
    email_destino: str,
    nombre_socio: str,
    numero_orden: int,
    monto: str,
) -> None:
    try:
        await email_service.enviar_orden_aprobada_tienda(
            email_destino, nombre_socio, numero_orden, monto
        )
        logger.info(f"Mail 'orden_aprobada_tienda' enviado a {email_destino} (orden #{numero_orden})")
    except Exception:
        logger.exception(f"Fallo al enviar mail 'orden_aprobada_tienda' a {email_destino} (orden #{numero_orden})")


async def task_aviso_club_pago_recibido(
    nombre_socio: str,
    dni_socio: str,
    numero_orden: int,
    monto: str,
    tipo: str,
) -> None:
    try:
        await email_service.enviar_aviso_club_pago_recibido(
            nombre_socio, dni_socio, numero_orden, monto, tipo
        )
        logger.info(f"Mail 'aviso_club_pago' enviado al club (orden #{numero_orden}, socio {dni_socio})")
    except Exception:
        logger.exception(f"Fallo al enviar mail 'aviso_club_pago' al club (orden #{numero_orden})")

async def task_orden_generada(
    email_destino: str,
    nombre_socio: str,
    numero_pago: int,
    monto: str,
    metodo: str,
) -> None:
    try:
        await email_service.enviar_orden_generada(email_destino, nombre_socio, numero_pago, monto, metodo)
        logger.info(f"Mail 'orden_generada' ({metodo}) enviado a {email_destino} (pago #{numero_pago})")
    except Exception:
        logger.exception(f"Fallo al enviar mail 'orden_generada' a {email_destino} (pago #{numero_pago})")


async def task_aviso_club_efectivo(
    nombre_socio: str,
    dni_socio: str,
    numero_pago: int,
    monto: str,
) -> None:
    try:
        await email_service.enviar_aviso_club_efectivo(nombre_socio, dni_socio, numero_pago, monto)
        logger.info(f"Mail 'aviso_club_efectivo' enviado al club (pago #{numero_pago})")
    except Exception:
        logger.exception(f"Fallo al enviar mail 'aviso_club_efectivo' al club (pago #{numero_pago})")


async def task_aviso_club_comprobante_recibido(
    nombre_socio: str,
    dni_socio: str,
    numero_pago: int,
    monto: str,
    comprobante_url: str,
) -> None:
    try:
        await email_service.enviar_aviso_club_comprobante_recibido(
            nombre_socio, dni_socio, numero_pago, monto, comprobante_url
        )
        logger.info(f"Mail 'comprobante_recibido' enviado al club (pago #{numero_pago}, socio {dni_socio})")
    except Exception:
        logger.exception(f"Fallo al enviar mail 'comprobante_recibido' al club (pago #{numero_pago})")


async def task_orden_expirada(
    email_destino: str,
    nombre_socio: str,
    numero_orden: int,
    monto: str,
) -> None:
    try:
        await email_service.enviar_orden_expirada(email_destino, nombre_socio, numero_orden, monto)
        logger.info(f"Mail 'orden_expirada' enviado a {email_destino} (orden #{numero_orden})")
    except Exception:
        logger.exception(f"Fallo al enviar mail 'orden_expirada' a {email_destino} (orden #{numero_orden})")


async def task_recordatorio_comprobante(
    email_destino: str,
    nombre_socio: str,
    numero_orden: int,
    monto: str,
    horas_restantes: int,
) -> None:
    try:
        await email_service.enviar_recordatorio_comprobante(
            email_destino, nombre_socio, numero_orden, monto, horas_restantes
        )
        logger.info(f"Mail 'recordatorio_comprobante' enviado a {email_destino} (orden #{numero_orden})")
    except Exception:
        logger.exception(f"Fallo al enviar mail 'recordatorio_comprobante' a {email_destino} (orden #{numero_orden})")


async def task_aviso_admin_nuevo_socio(
    nombre_socio: str,
    dni_socio: str,
    email_socio: str,
) -> None:
    try:
        await email_service.enviar_aviso_admin_nuevo_socio(nombre_socio, dni_socio, email_socio)
        logger.info(f"Mail 'aviso_admin_nuevo_socio' enviado al club (DNI {dni_socio})")
    except Exception:
        logger.exception(f"Fallo al enviar mail 'aviso_admin_nuevo_socio' al club (DNI {dni_socio})")


async def task_reserva_suspendida(
    email_destino: str,
    nombre_socio: str,
    instalacion: str,
    fecha_reserva: str,
    monto_acreditado: str,
    motivo: str,
) -> None:
    try:
        await email_service.enviar_reserva_suspendida(
            email_destino, nombre_socio, instalacion, fecha_reserva, monto_acreditado, motivo
        )
        logger.info(f"Mail 'reserva_suspendida' enviado a {email_destino} ({instalacion})")
    except Exception:
        logger.exception(f"Fallo al enviar mail 'reserva_suspendida' a {email_destino} ({instalacion})")


async def task_socio_dado_de_baja(email_destino: str, nombre_socio: str) -> None:
    try:
        await email_service.enviar_socio_dado_de_baja(email_destino, nombre_socio)
        logger.info(f"Mail 'socio_dado_de_baja' enviado a {email_destino}")
    except Exception:
        logger.exception(f"Fallo al enviar mail 'socio_dado_de_baja' a {email_destino}")


async def task_socio_reactivado(email_destino: str, nombre_socio: str) -> None:
    try:
        await email_service.enviar_socio_reactivado(email_destino, nombre_socio)
        logger.info(f"Mail 'socio_reactivado' enviado a {email_destino}")
    except Exception:
        logger.exception(f"Fallo al enviar mail 'socio_reactivado' a {email_destino}")