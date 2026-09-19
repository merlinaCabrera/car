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

from database import SessionLocal
from mailer.plantillas import resolver_evento

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
    # Sin API key, httpx arma el header `Authorization: Bearer ` (vacío) y lo
    # rechaza con "Illegal header value b'Bearer '", un error que no dice nada
    # sobre la causa real. Se corta antes, con un mensaje que sí la nombra:
    # pasa siempre en entornos de dev donde RESEND_API_KEY no está seteada.
    if not RESEND_API_KEY:
        raise RuntimeError(
            "RESEND_API_KEY no está configurada: no se puede enviar el mail "
            f"'{template_name}'. Seteala en el .env (dev) o en Render (producción)."
        )

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


async def _enviar_evento(clave: str, destinatarios: list[str], contexto: dict) -> None:
    """
    Envía un evento registrado en mailer/registry.py, resolviendo primero si
    el admin le pisó el asunto y/o el cuerpo desde /admin/mensajeria.

    Abre su propia sesión de DB de vida corta (una sola lectura por PK) en
    vez de recibir `db` por parámetro: así no hace falta tocar la firma de
    ninguna de las funciones de más abajo ni de sus decenas de llamadores en
    los routers y en el scheduler.
    """
    db = SessionLocal()
    try:
        asunto, template_name, body = resolver_evento(db, clave, contexto)
    finally:
        db.close()
    await _enviar(destinatarios=destinatarios, asunto=asunto, template_name=template_name, body=body)


# ── Funciones de envío ────────────────────────────────────────────────────────

async def enviar_orden_aprobada(email_destino: str, nombre_socio: str, numero_orden: int, monto: str) -> None:
    await _enviar_evento(
        "orden_aprobada", [email_destino],
        {"nombre_socio": nombre_socio, "numero_orden": numero_orden, "monto": monto},
    )


async def enviar_orden_rechazada(email_destino: str, nombre_socio: str, numero_orden: int, motivo: str) -> None:
    await _enviar_evento(
        "orden_rechazada", [email_destino],
        {"nombre_socio": nombre_socio, "numero_orden": numero_orden, "motivo": motivo},
    )


async def enviar_cuota_vencida(email_destino: str, nombre_socio: str, fecha_vencimiento: str) -> None:
    await _enviar_evento(
        "cuota_vencida", [email_destino],
        {"nombre_socio": nombre_socio, "fecha_vencimiento": fecha_vencimiento, "frontend_url": FRONTEND_URL},
    )


async def enviar_recordatorio_cuota(email_destino: str, mensaje: str) -> None:
    """
    Aviso masivo de cuota pendiente, disparado a mano por el admin desde el
    panel. El cuerpo ya viene renderizado por utils/recordatorios.py a partir
    de la plantilla configurable — acá no se arma ningún texto.

    Es distinto de `enviar_cuota_vencida`, que manda el scheduler todos los
    días con un texto fijo. Los dos conviven a propósito: uno es automático y
    el otro es una decisión del admin ("mandales a todos ahora").
    """
    await _enviar(
        destinatarios=[email_destino],
        asunto="Recordatorio: tu cuota social del club",
        template_name="recordatorio_cuota.html",
        body={
            "mensaje_lineas": mensaje.splitlines() or [mensaje],
            "frontend_url": FRONTEND_URL,
        },
    )


async def enviar_convocatoria(email_destino: str, nombre_socio: str, titulo_evento: str, fecha_evento: str) -> None:
    await _enviar_evento(
        "convocatoria", [email_destino],
        {"nombre_socio": nombre_socio, "titulo_evento": titulo_evento, "fecha_evento": fecha_evento},
    )


async def enviar_cuenta_aprobada(email_destino: str, nombre_socio: str) -> None:
    await _enviar_evento(
        "cuenta_aprobada", [email_destino],
        {"nombre_socio": nombre_socio, "frontend_url": FRONTEND_URL},
    )


async def enviar_recuperar_password(email_destino: str, nombre_socio: str, link_reset: str, minutos_validez: int = 60) -> None:
    await _enviar_evento(
        "recuperar_password", [email_destino],
        {"nombre_socio": nombre_socio, "link_reset": link_reset, "minutos_validez": minutos_validez},
    )


async def enviar_orden_aprobada_cuota(
    email_destino: str, nombre_socio: str, numero_orden: int, meses_pagados: int, cubierto_hasta: str,
) -> None:
    await _enviar_evento(
        "orden_aprobada_cuota", [email_destino],
        {"nombre_socio": nombre_socio, "numero_orden": numero_orden,
         "meses_pagados": meses_pagados, "cubierto_hasta": cubierto_hasta},
    )


async def enviar_orden_aprobada_tienda(
    email_destino: str, nombre_socio: str, numero_orden: int, monto: str,
) -> None:
    await _enviar_evento(
        "orden_aprobada_tienda", [email_destino],
        {"nombre_socio": nombre_socio, "numero_orden": numero_orden, "monto": monto},
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
    await _enviar_evento(
        "compra_confirmada", [email_destino],
        {
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
    await _enviar_evento(
        "aviso_club_pago_recibido", [CLUB_EMAIL],
        {"nombre_socio": nombre_socio, "dni_socio": dni_socio,
         "numero_orden": numero_orden, "monto": monto, "tipo": tipo},
    )


# Adónde mandamos al socio a ver el estado de su orden. Las órdenes de cuota
# social NO aparecen en "Mis Compras" (esa pantalla es tienda/alquileres a
# propósito): su estado vive en "Gestión de Cuotas". Mandar siempre a
# /mis-compras hacía que el socio siguiera el link y encontrara la pantalla
# vacía — BUG-06 de la QA del 08-09.
_NOMBRE_PANTALLA = {
    "/mis-compras": "Mis Compras",
    "/socio/cuotas": "Gestión de Cuotas",
}


async def enviar_orden_generada(
    email_destino: str, nombre_socio: str, numero_pago: int, monto: str, metodo: str,
    ruta_estado: str = "/mis-compras",
) -> None:
    await _enviar(
        destinatarios=[email_destino],
        asunto=f"📋 Orden #{numero_pago} generada — Club Atlético Roberts",
        template_name="orden_generada.html",
        body={"nombre_socio": nombre_socio, "numero_pago": numero_pago,
              "monto": monto, "metodo": metodo, "frontend_url": FRONTEND_URL,
              "ruta_estado": ruta_estado,
              "nombre_pantalla": _NOMBRE_PANTALLA.get(ruta_estado, "Mis Compras")},
    )


async def enviar_aviso_club_efectivo(
    nombre_socio: str, dni_socio: str, numero_pago: int, monto: str,
) -> None:
    await _enviar_evento(
        "aviso_club_efectivo", [CLUB_EMAIL],
        {"nombre_socio": nombre_socio, "dni_socio": dni_socio,
         "numero_orden": numero_pago, "monto": monto,
         "tipo": "efectivo (pendiente de cobro presencial)"},
    )


async def enviar_aviso_club_comprobante_recibido(
    nombre_socio: str, dni_socio: str, numero_pago: int, monto: str, comprobante_url: str,
) -> None:
    await _enviar_evento(
        "aviso_club_comprobante_recibido", [CLUB_EMAIL],
        {"nombre_socio": nombre_socio, "dni_socio": dni_socio,
         "numero_pago": numero_pago, "monto": monto,
         # NO se manda un link al archivo: en DB vive el object KEY del
         # bucket privado, así que `FRONTEND_URL + key` armaba una URL que
         # no existe (pestaña en blanco — mismo defecto que BUG-05 de la
         # QA del 08-09). Firmar el archivo tampoco sirve acá: una
         # Presigned URL vive 15 minutos y este mail se lee cuando se lee.
         # El comprobante se mira desde el panel, que además pide sesión.
         # Antes apuntaba a /admin/pagos (solo cuotas) aunque este aviso
         # se dispara para CUALQUIER tipo de pago con comprobante
         # (cuota, alquiler, indumentaria o mixto) — se corrige para
         # que el admin caiga en la bandeja unificada que agrupa por
         # comprobante, no una específica de un solo tipo.
         "admin_url": f"{FRONTEND_URL}/admin/verificaciones"},
    )


async def enviar_orden_expirada(
    email_destino: str, nombre_socio: str, numero_orden: int, monto: str,
) -> None:
    await _enviar_evento(
        "orden_expirada", [email_destino],
        {"nombre_socio": nombre_socio, "numero_orden": numero_orden, "monto": monto},
    )


async def enviar_recordatorio_comprobante(
    email_destino: str, nombre_socio: str, numero_orden: int, monto: str, horas_restantes: int,
    ruta_estado: str = "/mis-compras",
) -> None:
    await _enviar_evento(
        "recordatorio_comprobante", [email_destino],
        {"nombre_socio": nombre_socio, "numero_orden": numero_orden,
         "monto": monto, "horas_restantes": horas_restantes, "frontend_url": FRONTEND_URL,
         "ruta_estado": ruta_estado, "nombre_pantalla": _NOMBRE_PANTALLA.get(ruta_estado, "Mis Compras")},
    )


async def enviar_aviso_admin_nuevo_socio(
    nombre_socio: str, dni_socio: str, email_socio: str,
) -> None:
    await _enviar_evento(
        "aviso_admin_nuevo_socio", [CLUB_EMAIL],
        {"nombre_socio": nombre_socio, "dni_socio": dni_socio,
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
    await _enviar_evento(
        "aviso_admin_jugador_categoria", [CLUB_EMAIL],
        {
            "emoji": "➕" if es_alta else "➖",
            "color_titulo": "#1b5e20" if es_alta else "#b71c1c",
            "titulo": "Jugador agregado a un plantel" if es_alta else "Jugador sacado de un plantel",
            "nombre_tecnico": nombre_tecnico,
            "accion": accion,
            "accion_texto": "Agregó al jugador" if es_alta else "Sacó al jugador",
            "preposicion": "en" if es_alta else "de",
            "nombre_jugador": nombre_jugador,
            "nombre_categoria": nombre_categoria,
            "temporada": temporada,
            "admin_url": f"{FRONTEND_URL}/gestion-planteles?categoria={id_categoria}",
        },
    )


# Nombre lindo de cada instalación para el asunto y el cuerpo del mail: la
# clave interna ("cancha_1") no es algo que el socio deba leer.
_LABEL_INSTALACION = {
    "cancha_1": "Cancha 1",
    "cancha_2": "Cancha 2",
    "quincho":  "Quincho",
}


async def enviar_reserva_suspendida(
    email_destino: str, nombre_socio: str, instalacion: str,
    fecha_reserva: str, monto_acreditado: str, motivo: str,
    metodo_pago: "str | None" = None,
) -> None:
    label = _LABEL_INSTALACION.get(instalacion, instalacion)
    await _enviar_evento(
        "reserva_suspendida", [email_destino],
        {"nombre_socio": nombre_socio, "instalacion": label,
         "fecha_reserva": fecha_reserva, "monto_acreditado": monto_acreditado,
         "motivo": motivo, "metodo_pago": metodo_pago,
         "frontend_url": FRONTEND_URL},
    )


async def enviar_socio_dado_de_baja(email_destino: str, nombre_socio: str) -> None:
    await _enviar_evento(
        "socio_dado_de_baja", [email_destino], {"nombre_socio": nombre_socio},
    )


async def enviar_socio_reactivado(email_destino: str, nombre_socio: str) -> None:
    await _enviar_evento(
        "socio_reactivado", [email_destino],
        {"nombre_socio": nombre_socio, "frontend_url": FRONTEND_URL},
    )

async def enviar_solicitud_recibida(email_destino: str, nombre_socio: str) -> None:
    await _enviar_evento(
        "solicitud_recibida", [email_destino], {"nombre_socio": nombre_socio},
    )


async def enviar_solicitud_rechazada(email_destino: str, nombre_socio: str, motivo: "str | None") -> None:
    await _enviar_evento(
        "solicitud_rechazada", [email_destino],
        {"nombre_socio": nombre_socio, "motivo": motivo},
    )


async def enviar_bienvenida_alta_manual(
    email_destino: str,
    nombre_socio: str,
    dni_socio: str,
    password_temporal: str | None = None,
) -> None:
    """
    Mail de alta manual, con los datos de acceso incluidos (decisión D3 de la
    QA del 08-09).

    `password_temporal` viaja en texto plano dentro del mail a pedido explícito
    del club: sin eso el socio recibía un mail que le decía que usara "la
    contraseña temporal que te compartieron" sin que nadie se la hubiera
    compartido por ningún canal. Es aceptable porque la cuenta nace con
    `requiere_cambio_password=True`: la clave sirve para un único ingreso y el
    sistema fuerza a cambiarla antes de dejar navegar.

    Es opcional para no romper a los llamadores que no la tengan; en ese caso
    el template cae al texto genérico de antes.
    """
    await _enviar_evento(
        "bienvenida_alta_manual", [email_destino],
        {
            "nombre_socio": nombre_socio,
            "dni_socio": dni_socio,
            "password_temporal": password_temporal,
            "frontend_url": FRONTEND_URL,
        },
    )


async def enviar_aviso_admin_solicitud_reactivacion(nombre_socio: str, dni_socio: str) -> None:
    await _enviar_evento(
        "aviso_admin_solicitud_reactivacion", [CLUB_EMAIL],
        {"nombre_socio": nombre_socio, "dni_socio": dni_socio,
         "admin_url": f"{FRONTEND_URL}/admin/socios"},
    )


async def enviar_contacto_publico(email: str, nombre: str, mensaje: str) -> None:
    """
    Formulario de contacto de /ayuda (sin login). Va directo al mail del
    club — no se guarda en base de datos, es un mensaje de una sola vía.
    """
    await _enviar_evento(
        "contacto_publico", [CLUB_EMAIL],
        {"nombre": nombre, "email": email, "mensaje": mensaje},
    )