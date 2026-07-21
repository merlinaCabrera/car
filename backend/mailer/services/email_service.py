"""
services/email_service.py — Capa de servicio de correo

Diseño:
  - Una única instancia de FastMail (reutiliza la conexión/config, no la recrea
    en cada request).
  - Funciones "puras" async que arman el mensaje y lo envían.
  - Usa templates Jinja2 en /templates/email para que el HTML no viva
    hardcodeado en el código Python (más mantenible y escalable).
  - Cada función acá NO decide "cuándo" enviar; eso lo decide la ruta,
    que la delega a BackgroundTasks. Esta capa solo sabe "cómo" enviar.
"""

from pathlib import Path

from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType

from ..config import email_settings

TEMPLATE_FOLDER = Path(__file__).resolve().parent.parent / "templates" / "email"

conf = ConnectionConfig(
    MAIL_USERNAME=email_settings.MAIL_USERNAME,
    MAIL_PASSWORD=email_settings.MAIL_PASSWORD,
    MAIL_FROM=email_settings.MAIL_FROM,
    MAIL_FROM_NAME=email_settings.MAIL_FROM_NAME,
    MAIL_PORT=email_settings.MAIL_PORT,
    MAIL_SERVER=email_settings.MAIL_SERVER,
    MAIL_STARTTLS=email_settings.MAIL_STARTTLS,
    MAIL_SSL_TLS=email_settings.MAIL_SSL_TLS,
    USE_CREDENTIALS=email_settings.USE_CREDENTIALS,
    VALIDATE_CERTS=email_settings.VALIDATE_CERTS,
    TEMPLATE_FOLDER=TEMPLATE_FOLDER,
)

# Instancia única reutilizable en toda la app
fm = FastMail(conf)


async def _enviar(destinatarios: list[str], asunto: str, template_name: str, body: dict) -> None:
    """
    Función interna genérica: arma y envía un mail usando una plantilla Jinja2.
    Si falla (Gmail caído, credenciales vencidas, etc.), la excepción se propaga
    y quien la llama (la background task) debe loguearla — ver email_tasks.py.
    """
    message = MessageSchema(
        subject=asunto,
        recipients=destinatarios,
        template_body=body,
        subtype=MessageType.html,
    )
    await fm.send_message(message, template_name=template_name)


async def enviar_orden_aprobada(email_destino: str, nombre_socio: str, numero_orden: int, monto: str) -> None:
    await _enviar(
        destinatarios=[email_destino],
        asunto=f"Tu orden #{numero_orden} fue aprobada ✅",
        template_name="orden_aprobada.html",
        body={"nombre_socio": nombre_socio, "numero_orden": numero_orden, "monto": monto},
    )


async def enviar_orden_rechazada(email_destino: str, nombre_socio: str, numero_orden: int, motivo: str) -> None:
    await _enviar(
        destinatarios=[email_destino],
        asunto=f"Tu orden #{numero_orden} fue rechazada",
        template_name="orden_rechazada.html",
        body={"nombre_socio": nombre_socio, "numero_orden": numero_orden, "motivo": motivo},
    )


async def enviar_cuota_vencida(email_destino: str, nombre_socio: str, fecha_vencimiento: str) -> None:
    await _enviar(
        destinatarios=[email_destino],
        asunto="Tu cuota social está vencida",
        template_name="cuota_vencida.html",
        body={"nombre_socio": nombre_socio, "fecha_vencimiento": fecha_vencimiento},
    )


async def enviar_convocatoria(email_destino: str, nombre_socio: str, titulo_evento: str, fecha_evento: str) -> None:
    await _enviar(
        destinatarios=[email_destino],
        asunto=f"Fuiste convocado: {titulo_evento}",
        template_name="convocatoria.html",
        body={"nombre_socio": nombre_socio, "titulo_evento": titulo_evento, "fecha_evento": fecha_evento},
    )


# Pegar al FINAL de mailer/services/email_service.py (después de enviar_convocatoria)

async def enviar_cuenta_aprobada(email_destino: str, nombre_socio: str) -> None:
    await _enviar(
        destinatarios=[email_destino],
        asunto="¡Tu cuenta fue aprobada! 🎉",
        template_name="cuenta_aprobada.html",
        body={"nombre_socio": nombre_socio},
    )


async def enviar_recuperar_password(email_destino: str, nombre_socio: str, link_reset: str, minutos_validez: int = 60) -> None:
    await _enviar(
        destinatarios=[email_destino],
        asunto="Recuperar tu contraseña",
        template_name="recuperar_password.html",
        body={"nombre_socio": nombre_socio, "link_reset": link_reset, "minutos_validez": minutos_validez},
    )