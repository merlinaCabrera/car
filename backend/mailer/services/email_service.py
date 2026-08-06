"""
services/email_service.py — Capa de servicio de correo via Resend HTTP API

Usa httpx para llamar directamente a la API REST de Resend (api.resend.com),
evitando SMTP que está bloqueado en Render free tier.
Renderiza los templates Jinja2 localmente antes de enviar.
"""

import os
from pathlib import Path

import httpx
from jinja2 import Environment, FileSystemLoader, select_autoescape

# ── Configuración ─────────────────────────────────────────────────────────────

RESEND_API_KEY  = os.getenv("RESEND_API_KEY", "")
MAIL_FROM       = os.getenv("MAIL_FROM", "onboarding@resend.dev")
MAIL_FROM_NAME  = os.getenv("MAIL_FROM_NAME", "Club Atlético Roberts")
CLUB_EMAIL      = os.getenv("CLUB_EMAIL", "clubatleticoroberts1@gmail.com")
FRONTEND_URL    = os.getenv("FRONTEND_URL", "http://localhost:5173")

TEMPLATE_FOLDER = Path(__file__).resolve().parent.parent / "templates" / "email"

_jinja_env = Environment(
    loader=FileSystemLoader(str(TEMPLATE_FOLDER)),
    autoescape=select_autoescape(["html"]),
)


# ── Core ──────────────────────────────────────────────────────────────────────

def _render(template_name: str, body: dict) -> str:
    return _jinja_env.get_template(template_name).render(**body)


async def _enviar(destinatarios: list[str], asunto: str, template_name: str, body: dict) -> None:
    html = _render(template_name, body)
    from_field = f"{MAIL_FROM_NAME} <{MAIL_FROM}>"

    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {RESEND_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "from":    from_field,
                "to":      destinatarios,
                "subject": asunto,
                "html":    html,
            },
        )
        if res.status_code >= 400:
            raise RuntimeError(f"Resend API error {res.status_code}: {res.text}")


# ── Funciones de envío ────────────────────────────────────────────────────────

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
        body={"nombre_socio": nombre_socio, "fecha_vencimiento": fecha_vencimiento, "frontend_url": FRONTEND_URL},
    )


async def enviar_convocatoria(email_destino: str, nombre_socio: str, titulo_evento: str, fecha_evento: str) -> None:
    await _enviar(
        destinatarios=[email_destino],
        asunto=f"Fuiste convocado: {titulo_evento}",
        template_name="convocatoria.html",
        body={"nombre_socio": nombre_socio, "titulo_evento": titulo_evento, "fecha_evento": fecha_evento},
    )


async def enviar_cuenta_aprobada(email_destino: str, nombre_socio: str) -> None:
    await _enviar(
        destinatarios=[email_destino],
        asunto="¡Tu cuenta fue aprobada! 🎉",
        template_name="cuenta_aprobada.html",
        body={"nombre_socio": nombre_socio, "frontend_url": FRONTEND_URL},
    )


async def enviar_recuperar_password(email_destino: str, nombre_socio: str, link_reset: str, minutos_validez: int = 60) -> None:
    await _enviar(
        destinatarios=[email_destino],
        asunto="Recuperar tu contraseña",
        template_name="recuperar_password.html",
        body={"nombre_socio": nombre_socio, "link_reset": link_reset, "minutos_validez": minutos_validez},
    )


async def enviar_orden_aprobada_cuota(
    email_destino: str, nombre_socio: str, numero_orden: int, meses_pagados: int, cubierto_hasta: str,
) -> None:
    await _enviar(
        destinatarios=[email_destino],
        asunto=f"✅ Tu pago de cuota #{numero_orden} fue aprobado",
        template_name="orden_aprobada_cuota.html",
        body={"nombre_socio": nombre_socio, "numero_orden": numero_orden,
              "meses_pagados": meses_pagados, "cubierto_hasta": cubierto_hasta},
    )


async def enviar_orden_aprobada_tienda(
    email_destino: str, nombre_socio: str, numero_orden: int, monto: str,
) -> None:
    await _enviar(
        destinatarios=[email_destino],
        asunto=f"✅ Tu compra #{numero_orden} fue aprobada",
        template_name="orden_aprobada_tienda.html",
        body={"nombre_socio": nombre_socio, "numero_orden": numero_orden, "monto": monto},
    )


async def enviar_compra_confirmada(
    email_destino: str,
    nombre_socio: str,
    numero_pago: int,
    metodo_pago_label: str,
    secciones: list,
    subtotal: str,
    saldo_aplicado: "str | None",
    total_pagado: str,
) -> None:
    """
    Mail único con el detalle COMPLETO de una compra (todas las categorías
    de un mismo Pago juntas), en vez de mails partidos por cada Orden.
    """
    await _enviar(
        destinatarios=[email_destino],
        asunto=f"✅ Compra confirmada — Comprobante #{numero_pago}",
        template_name="compra_confirmada.html",
        body={
            "nombre_socio": nombre_socio,
            "numero_pago": numero_pago,
            "metodo_pago_label": metodo_pago_label,
            "secciones": secciones,
            "subtotal": subtotal,
            "saldo_aplicado": saldo_aplicado,
            "total_pagado": total_pagado,
        },
    )


async def enviar_aviso_club_pago_recibido(
    nombre_socio: str, dni_socio: str, numero_orden: int, monto: str, tipo: str,
) -> None:
    await _enviar(
        destinatarios=[CLUB_EMAIL],
        asunto=f"💰 Pago aprobado — Orden #{numero_orden} ({tipo})",
        template_name="aviso_club_pago.html",
        body={"nombre_socio": nombre_socio, "dni_socio": dni_socio,
              "numero_orden": numero_orden, "monto": monto, "tipo": tipo},
    )


async def enviar_orden_generada(
    email_destino: str, nombre_socio: str, numero_pago: int, monto: str, metodo: str,
) -> None:
    await _enviar(
        destinatarios=[email_destino],
        asunto=f"📋 Orden #{numero_pago} generada — Club Atlético Roberts",
        template_name="orden_generada.html",
        body={"nombre_socio": nombre_socio, "numero_pago": numero_pago,
              "monto": monto, "metodo": metodo, "frontend_url": FRONTEND_URL},
    )


async def enviar_aviso_club_efectivo(
    nombre_socio: str, dni_socio: str, numero_pago: int, monto: str,
) -> None:
    await _enviar(
        destinatarios=[CLUB_EMAIL],
        asunto=f"💵 Pago en efectivo pendiente — Orden #{numero_pago}",
        template_name="aviso_club_pago.html",
        body={"nombre_socio": nombre_socio, "dni_socio": dni_socio,
              "numero_orden": numero_pago, "monto": monto,
              "tipo": "efectivo (pendiente de cobro presencial)"},
    )


async def enviar_aviso_club_comprobante_recibido(
    nombre_socio: str, dni_socio: str, numero_pago: int, monto: str, comprobante_url: str,
) -> None:
    await _enviar(
        destinatarios=[CLUB_EMAIL],
        asunto=f"📎 Comprobante recibido — Pago #{numero_pago} ({nombre_socio})",
        template_name="aviso_club_comprobante.html",
        body={"nombre_socio": nombre_socio, "dni_socio": dni_socio,
              "numero_pago": numero_pago, "monto": monto,
              "comprobante_url": f"{FRONTEND_URL}{comprobante_url}",
              "admin_url": f"{FRONTEND_URL}/admin/pagos"},
    )


async def enviar_orden_expirada(
    email_destino: str, nombre_socio: str, numero_orden: int, monto: str,
) -> None:
    await _enviar(
        destinatarios=[email_destino],
        asunto=f"⏰ Tu orden #{numero_orden} expiró",
        template_name="orden_expirada.html",
        body={"nombre_socio": nombre_socio, "numero_orden": numero_orden, "monto": monto},
    )


async def enviar_recordatorio_comprobante(
    email_destino: str, nombre_socio: str, numero_orden: int, monto: str, horas_restantes: int,
) -> None:
    await _enviar(
        destinatarios=[email_destino],
        asunto=f"⚠️ Recordatorio: subí el comprobante de tu orden #{numero_orden}",
        template_name="recordatorio_comprobante.html",
        body={"nombre_socio": nombre_socio, "numero_orden": numero_orden,
              "monto": monto, "horas_restantes": horas_restantes, "frontend_url": FRONTEND_URL},
    )


async def enviar_aviso_admin_nuevo_socio(
    nombre_socio: str, dni_socio: str, email_socio: str,
) -> None:
    await _enviar(
        destinatarios=[CLUB_EMAIL],
        asunto=f"🙋 Nuevo socio registrado: {nombre_socio}",
        template_name="aviso_admin_nuevo_socio.html",
        body={"nombre_socio": nombre_socio, "dni_socio": dni_socio,
              "email_socio": email_socio, "admin_url": f"{FRONTEND_URL}/admin/solicitudes"},
    )


async def enviar_aviso_admin_jugador_categoria(
    nombre_tecnico: str,
    nombre_jugador: str,
    nombre_categoria: str,
    temporada: str,
    id_categoria: int,
    accion: str,  # 'agregado' | 'sacado'
) -> None:
    """
    Aviso al club (no al técnico, no al jugador) cuando un técnico agrega o
    saca manualmente a un jugador de un plantel — fuera del autocompletado
    masivo por edad, que ya es admin_general-only. Es solo informativo: no
    bloquea la acción ni requiere aprobación (a diferencia de una solicitud).
    """
    es_alta = accion == "agregado"
    await _enviar(
        destinatarios=[CLUB_EMAIL],
        asunto=(
            f"{'➕' if es_alta else '➖'} {nombre_tecnico} {accion} a {nombre_jugador} "
            f"{'en' if es_alta else 'de'} {nombre_categoria}"
        ),
        template_name="aviso_admin_jugador_categoria.html",
        body={
            "emoji": "➕" if es_alta else "➖",
            "color_titulo": "#1b5e20" if es_alta else "#b71c1c",
            "titulo": "Jugador agregado a un plantel" if es_alta else "Jugador sacado de un plantel",
            "nombre_tecnico": nombre_tecnico,
            "accion_texto": "Agregó al jugador" if es_alta else "Sacó al jugador",
            "nombre_jugador": nombre_jugador,
            "nombre_categoria": nombre_categoria,
            "temporada": temporada,
            "admin_url": f"{FRONTEND_URL}/gestion-planteles?categoria={id_categoria}",
        },
    )


async def enviar_reserva_suspendida(
    email_destino: str, nombre_socio: str, instalacion: str,
    fecha_reserva: str, monto_acreditado: str, motivo: str,
) -> None:
    await _enviar(
        destinatarios=[email_destino],
        asunto=f"❌ Tu reserva de {instalacion} fue suspendida",
        template_name="reserva_suspendida.html",
        body={"nombre_socio": nombre_socio, "instalacion": instalacion,
              "fecha_reserva": fecha_reserva, "monto_acreditado": monto_acreditado,
              "motivo": motivo, "frontend_url": FRONTEND_URL},
    )


async def enviar_socio_dado_de_baja(email_destino: str, nombre_socio: str) -> None:
    await _enviar(
        destinatarios=[email_destino],
        asunto="Tu cuenta en el Club Atlético Roberts fue dada de baja",
        template_name="socio_dado_de_baja.html",
        body={"nombre_socio": nombre_socio},
    )


async def enviar_socio_reactivado(email_destino: str, nombre_socio: str) -> None:
    await _enviar(
        destinatarios=[email_destino],
        asunto="✅ Tu cuenta fue reactivada — Club Atlético Roberts",
        template_name="socio_reactivado.html",
        body={"nombre_socio": nombre_socio, "frontend_url": FRONTEND_URL},
    )

async def enviar_solicitud_recibida(email_destino: str, nombre_socio: str) -> None:
    await _enviar(
        destinatarios=[email_destino],
        asunto="✅ Recibimos tu solicitud — Club Atlético Roberts",
        template_name="solicitud_recibida.html",
        body={"nombre_socio": nombre_socio},
    )