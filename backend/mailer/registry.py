# backend/mailer/registry.py
"""
Catálogo de los mails transaccionales editables desde /admin/mensajeria.

Cada entrada es un EVENTO, no un archivo .html — dos eventos pueden compartir
el mismo template (aviso_club_pago_recibido y aviso_club_efectivo usan los
dos aviso_club_pago.html, con asuntos distintos). La `clave` es lo que se
guarda en `PlantillaMail.clave` y lo que viaja en la URL de la API.

`editable_cuerpo=False` es para los templates con lógica Jinja2 real
(`{% if %}`, `{% for %}`, o valores calculados en Python como colores/emojis):
un admin editando ese HTML a mano puede romper la sintaxis sin darse cuenta,
y el mail deja de mandarse en silencio (el error solo se loguea, no revienta
el request que lo dispara). Para esos, solo el asunto es editable — es texto
plano, no puede romper nada.

`recordatorio_cuota` (el aviso de WhatsApp/mail al moroso) y `orden_generada`
(función sin uso, ver BUG D5 de la auditoría) quedan afuera a propósito: el
primero ya tiene su propio editor en ConfiguracionGlobal, el segundo no lo
llama nadie.
"""
from __future__ import annotations

from typing import NamedTuple


class EventoMail(NamedTuple):
    etiqueta: str            # Nombre legible para el panel de admin.
    template_default: str    # Archivo en mailer/templates/email/.
    asunto_default: str      # Con placeholders {variable}, nunca f-string.
    variables: tuple[str, ...]
    editable_cuerpo: bool
    destino: str              # "socio" | "club" — quién lo recibe, informativo.


REGISTRY: dict[str, EventoMail] = {
    "orden_aprobada": EventoMail(
        "Orden aprobada", "orden_aprobada.html",
        "Tu orden #{numero_orden} fue aprobada ✅",
        ("nombre_socio", "numero_orden", "monto"), True, "socio",
    ),
    "orden_rechazada": EventoMail(
        "Orden rechazada", "orden_rechazada.html",
        "Tu orden #{numero_orden} fue rechazada",
        ("nombre_socio", "numero_orden", "motivo"), True, "socio",
    ),
    "cuota_vencida": EventoMail(
        "Cuota vencida (automático diario)", "cuota_vencida.html",
        "Tu cuota social está vencida",
        ("nombre_socio", "fecha_vencimiento", "frontend_url"), True, "socio",
    ),
    "convocatoria": EventoMail(
        "Convocatoria a un evento", "convocatoria.html",
        "Fuiste convocado: {titulo_evento}",
        ("nombre_socio", "titulo_evento", "fecha_evento"), True, "socio",
    ),
    "cuenta_aprobada": EventoMail(
        "Cuenta de socio aprobada", "cuenta_aprobada.html",
        "¡Tu cuenta fue aprobada! 🎉",
        ("nombre_socio", "frontend_url"), True, "socio",
    ),
    "recuperar_password": EventoMail(
        "Recuperar contraseña", "recuperar_password.html",
        "Recuperar tu contraseña",
        ("nombre_socio", "link_reset", "minutos_validez"), True, "socio",
    ),
    "orden_aprobada_cuota": EventoMail(
        "Pago de cuota aprobado", "orden_aprobada_cuota.html",
        "✅ Tu pago de cuota #{numero_orden} fue aprobado",
        ("nombre_socio", "numero_orden", "meses_pagados", "cubierto_hasta"), True, "socio",
    ),
    "orden_aprobada_tienda": EventoMail(
        "Compra de tienda aprobada", "orden_aprobada_tienda.html",
        "✅ Tu compra #{numero_orden} fue aprobada",
        ("nombre_socio", "numero_orden", "monto"), True, "socio",
    ),
    "aviso_club_pago_recibido": EventoMail(
        "Aviso al club: pago aprobado", "aviso_club_pago.html",
        "💰 Pago aprobado — Orden #{numero_orden} ({tipo})",
        ("nombre_socio", "dni_socio", "numero_orden", "monto", "tipo"), True, "club",
    ),
    "aviso_club_efectivo": EventoMail(
        "Aviso al club: pago en efectivo pendiente", "aviso_club_pago.html",
        "💵 Pago en efectivo pendiente — Orden #{numero_orden}",
        ("nombre_socio", "dni_socio", "numero_orden", "monto", "tipo"), True, "club",
    ),
    "aviso_club_comprobante_recibido": EventoMail(
        "Aviso al club: comprobante recibido", "aviso_club_comprobante.html",
        "📎 Comprobante recibido — Pago #{numero_pago} ({nombre_socio})",
        ("nombre_socio", "dni_socio", "numero_pago", "monto", "admin_url"), True, "club",
    ),
    "orden_expirada": EventoMail(
        "Orden expirada", "orden_expirada.html",
        "⏰ Tu orden #{numero_orden} expiró",
        ("nombre_socio", "numero_orden", "monto"), True, "socio",
    ),
    "recordatorio_comprobante": EventoMail(
        "Recordatorio: falta subir el comprobante", "recordatorio_comprobante.html",
        "⚠️ Recordatorio: subí el comprobante de tu orden #{numero_orden}",
        ("nombre_socio", "numero_orden", "monto", "horas_restantes", "frontend_url",
         "ruta_estado", "nombre_pantalla"), True, "socio",
    ),
    "aviso_admin_nuevo_socio": EventoMail(
        "Aviso al club: nuevo socio registrado", "aviso_admin_nuevo_socio.html",
        "🙋 Nuevo socio registrado: {nombre_socio}",
        ("nombre_socio", "dni_socio", "email_socio", "admin_url"), True, "club",
    ),
    "socio_dado_de_baja": EventoMail(
        "Socio dado de baja", "socio_dado_de_baja.html",
        "Tu cuenta en el Club Atlético Roberts fue dada de baja",
        ("nombre_socio",), True, "socio",
    ),
    "socio_reactivado": EventoMail(
        "Socio reactivado", "socio_reactivado.html",
        "✅ Tu cuenta fue reactivada — Club Atlético Roberts",
        ("nombre_socio", "frontend_url"), True, "socio",
    ),
    "solicitud_recibida": EventoMail(
        "Solicitud de alta recibida", "solicitud_recibida.html",
        "✅ Recibimos tu solicitud — Club Atlético Roberts",
        ("nombre_socio",), True, "socio",
    ),
    "aviso_admin_solicitud_reactivacion": EventoMail(
        "Aviso al club: pedido de reactivación", "aviso_admin_solicitud_reactivacion.html",
        "🔄 Pedido de reactivación: {nombre_socio}",
        ("nombre_socio", "dni_socio", "admin_url"), True, "club",
    ),
    "contacto_publico": EventoMail(
        "Aviso al club: formulario de contacto", "contacto_publico.html",
        "✉️ Contacto desde la web: {nombre}",
        ("nombre", "email", "mensaje"), True, "club",
    ),

    # ── Cuerpo fijo: tienen {% if %}, {% for %} o estilos calculados en
    #    Python. Solo el asunto es editable. ──────────────────────────────
    "solicitud_rechazada": EventoMail(
        "Solicitud de alta rechazada", "solicitud_rechazada.html",
        "Novedades sobre tu solicitud — Club Atlético Roberts",
        ("nombre_socio", "motivo"), False, "socio",
    ),
    "bienvenida_alta_manual": EventoMail(
        "Bienvenida por alta manual", "bienvenida_alta_manual.html",
        "¡Bienvenido al Club Atlético Roberts! 🎉",
        ("nombre_socio", "dni_socio", "password_temporal", "frontend_url"), False, "socio",
    ),
    "reserva_suspendida": EventoMail(
        "Reserva suspendida", "reserva_suspendida.html",
        "❌ Tu reserva de {instalacion} fue suspendida",
        ("nombre_socio", "instalacion", "fecha_reserva", "monto_acreditado",
         "motivo", "metodo_pago", "frontend_url"), False, "socio",
    ),
    "aviso_admin_jugador_categoria": EventoMail(
        "Aviso al club: movimiento en un plantel", "aviso_admin_jugador_categoria.html",
        "{emoji} {nombre_tecnico} {accion} a {nombre_jugador} {preposicion} {nombre_categoria}",
        ("emoji", "color_titulo", "titulo", "nombre_tecnico", "accion_texto", "accion",
         "preposicion", "nombre_jugador", "nombre_categoria", "temporada", "admin_url"), False, "club",
    ),
    "compra_confirmada": EventoMail(
        "Compra confirmada (comprobante detallado)", "compra_confirmada.html",
        "✅ Compra confirmada — Comprobante #{numero_pago}",
        ("nombre_socio", "numero_pago", "metodo_pago_label", "secciones",
         "subtotal", "saldo_aplicado", "total_pagado"), False, "socio",
    ),
}
