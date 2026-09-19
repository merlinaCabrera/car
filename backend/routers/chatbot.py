# backend/routers/chatbot.py
"""
Router del Asistente Virtual CAR ("Camotito").
Permite interactuar en lenguaje natural sobre cuotas, partidos, streaming,
alquileres, trámites y beneficios del Club Atlético Roberts.

Integra Google Gemini Flash con contexto dinámico de la base de datos
(FAQ, próximo partido, alias de transferencia, valor cuota y comercios)
y un motor de contingencia (fallback) por reglas cuando no hay API key configurada.
"""
from __future__ import annotations

import logging
import os
import re
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

import models
from config import settings
from database import get_db
from dependencies import get_current_user_optional
from utils.recordatorios import beca_activa, socios_morosos
from utils.fechas import hoy_club

logger = logging.getLogger("car.chatbot")

router = APIRouter(
    prefix="/chatbot",
    tags=["Chatbot Asistente Virtual CAR"],
)

# Los 3 "super-roles" del chatbot. El rol real y el estado de autenticación
# NUNCA se toman del body (es un dato que manda el cliente y cualquiera podría
# falsear): siempre se derivan del JWT via get_current_user_optional. Por eso
# MensajeChatbotPayload ya no acepta rol/autenticado/nombre_usuario del front.
SUPER_ROL_ADMIN = "admin"
SUPER_ROL_SOCIO = "socio"
SUPER_ROL_NO_REGISTRADO = "no_registrado"

_ROLES_DB_ADMIN = {"admin_general", "personal_administrativo"}


def _super_rol(current_user: Optional[models.Usuario]) -> str:
    if current_user is None:
        return SUPER_ROL_NO_REGISTRADO
    nombres_roles = {
        ur.rol.nombre
        for ur in current_user.roles_asignados
        if ur.rol.es_activo
    }
    if nombres_roles.intersection(_ROLES_DB_ADMIN):
        return SUPER_ROL_ADMIN
    return SUPER_ROL_SOCIO


class MensajeChatbotPayload(BaseModel):
    mensaje: str = Field(..., min_length=1, max_length=1000)
    historial: Optional[List[Dict[str, str]]] = Field(
        default=[],
        description="Historial previo [{'rol': 'user'|'model', 'texto': '...'}]",
    )


def _normalizar_telefono_ar(tel: Optional[str]) -> str:
    if not tel:
        return ""
    digits = re.sub(r"\D", "", tel)
    if digits.startswith("0"):
        digits = digits[1:]
    if len(digits) == 10:
        digits = "549" + digits
    elif digits.startswith("54") and not digits.startswith("549") and len(digits) == 12:
        digits = "549" + digits[2:]
    return digits


_EMOJI_REGEX = re.compile(
    r"[\U0001F600-\U0001F64F"  # emoticons
    r"\U0001F300-\U0001F5FF"  # symbols & pictographs
    r"\U0001F680-\U0001F6FF"  # transport & map
    r"\U0001F1E0-\U0001F1FF"  # flags
    r"\U00002702-\U000027B0"  # dingbats
    r"\U0001F900-\U0001F9FF"  # supplemental symbols
    r"\U0001FA70-\U0001FAFF"  # symbols & pictographs extended-a
    r"]+",
    flags=re.UNICODE,
)


def _sanitizar_respuesta_chatbot(texto: str) -> str:
    """Garantiza la regla estricta de Cero Emojis y renombra 'Camotero' y 'Camote' a 'Camotito'."""
    if not texto:
        return ""
    # Reemplazar 'Camotero' y 'Camote' por 'Camotito'
    texto = re.sub(r"\bCamotero\b", "Camotito", texto, flags=re.IGNORECASE)
    texto = re.sub(r"\bCamote\b", "Camotito", texto, flags=re.IGNORECASE)
    # Limpiar cualquier emoji
    texto = _EMOJI_REGEX.sub("", texto)
    return texto.strip()


def _obtener_sugerencias_socio() -> List[Dict[str, str]]:
    """Opciones rápidas y consultas frecuentes para socios autenticados."""
    return [
        {"id": "partido", "label": "Próximo partido y stream", "prompt": "¿Cuándo juega el CAR y hay transmisión en vivo?"},
        {"id": "cuota", "label": "Mis cuotas y pagos", "prompt": "¿Cómo consulto mis cuotas y cargo mi comprobante?"},
        {"id": "alquiler", "label": "Reservar cancha o quincho", "prompt": "¿Cómo reservo un turno para una cancha o el quincho?"},
        {"id": "comercios", "label": "Comercios con descuento", "prompt": "¿Qué comercios tienen descuentos para socios al día?"},
        {"id": "tour", "label": "Tour guiado por la app", "prompt": "Quiero hacer el tour guiado de la app", "accion": "tour"},
        {"id": "contacto", "label": "Contactar por WhatsApp", "prompt": "¿Cuál es el número de WhatsApp de la secretaría?"},
    ]


def _obtener_sugerencias_publicas() -> List[Dict[str, str]]:
    """Opciones rápidas y consultas frecuentes para visitantes no registrados."""
    return [
        {"id": "partido", "label": "Próximo partido y stream", "prompt": "¿Cuándo juega el CAR y hay transmisión en vivo?"},
        {"id": "cuota", "label": "Cuota social y alias", "prompt": "¿Cuánto sale la cuota y cuál es el alias para transferir?"},
        {"id": "socio", "label": "Cómo hacerme socio", "prompt": "¿Cuáles son los requisitos y cómo me hago socio online?"},
        {"id": "alquiler", "label": "Alquiler de canchas y quincho", "prompt": "¿Cómo hago para alquilar una cancha o el quincho?"},
        {"id": "contacto", "label": "Contactar por WhatsApp", "prompt": "¿Cuál es el número de WhatsApp de la secretaría?"},
    ]


def _construir_contexto_club(db: Session) -> Dict[str, Any]:
    """Extrae en tiempo real los datos institucionales, deportivos y financieros del club."""
    # 1. Configuración financiera e institucional
    config = db.query(models.ConfiguracionGlobal).first()
    alias = (config.alias_transferencia if config and config.alias_transferencia else "clubatleticoroberts.mp")

    # Extraer precio de cuota base desde ProductoServicio (o configuracion_global de respaldo)
    producto_cuota = (
        db.query(models.ProductoServicio)
        .filter(
            models.ProductoServicio.categoria == "cuota_social",
            models.ProductoServicio.es_activo.is_(True),
        )
        .first()
    )
    if producto_cuota and producto_cuota.precio_actual:
        valor_cuota_num = int(producto_cuota.precio_actual)
    elif config and config.valor_cuota_base:
        valor_cuota_num = int(config.valor_cuota_base)
    else:
        valor_cuota_num = 5000

    valor_cuota_str = f"${valor_cuota_num:,}".replace(",", ".")
    dia_venc = config.dia_vencimiento_cuota if config else 10
    whatsapp_raw = config.whatsapp_club if config and config.whatsapp_club else "2355 123456"
    whatsapp_clean = _normalizar_telefono_ar(whatsapp_raw)

    # Cálculo 100% dinámico de cuota para menores según porcentaje configurado en BD
    descuento_menor_pct = float(config.descuento_menor_pct) if (config and config.descuento_menor_pct is not None) else 40.0
    descuento_menor_str = f"{int(descuento_menor_pct)}%" if descuento_menor_pct.is_integer() else f"{descuento_menor_pct}%"
    valor_menor_num = int(round(valor_cuota_num * (1 - descuento_menor_pct / 100)))
    valor_menor_str = f"${valor_menor_num:,}".replace(",", ".")

    # Tarifas vigentes de alquileres (canchas y quincho) desde ProductoServicio
    alquileres_activos = (
        db.query(models.ProductoServicio)
        .filter(
            models.ProductoServicio.categoria == "alquiler",
            models.ProductoServicio.es_activo.is_(True),
        )
        .all()
    )
    if alquileres_activos:
        tarifas_alquiler_str = "\n".join([f"  * {a.nombre}: ${int(a.precio_actual):,}".replace(",", ".") for a in alquileres_activos])
    else:
        tarifas_alquiler_str = "  * Canchas y Quincho: consultar aranceles vigentes en Secretaría."

    # 2. Próximo partido en agenda / en vivo
    ahora = datetime.now(timezone.utc)
    proximo_partido = (
        db.query(models.Evento)
        .filter(
            models.Evento.tipo.in_(["partido", "torneo"]),
            models.Evento.fecha_inicio >= ahora - timedelta(hours=5),
        )
        .order_by(models.Evento.fecha_inicio.asc())
        .first()
    )

    info_partido = "No hay partidos oficiales programados para los próximos días."
    tiene_stream = False
    id_evento_stream = None

    if proximo_partido:
        rival_str = f" vs {proximo_partido.rival}" if proximo_partido.rival else ""
        fecha_local = proximo_partido.fecha_inicio.astimezone(timezone(timedelta(hours=-3)))
        fecha_str = fecha_local.strftime("%A %d/%m a las %H:%M hs")
        condicion_str = f"({proximo_partido.condicion})" if proximo_partido.condicion else ""

        stream_info = ""
        if proximo_partido.tiene_transmision:
            tiene_stream = True
            id_evento_stream = proximo_partido.id_evento
            stream_info = f" ¡Se transmite en vivo por streaming en la web! (Estado: {proximo_partido.transmision_estado})."
            if proximo_partido.transmision_socio_gratis:
                stream_info += " Socios al día ingresan GRATIS."
            if proximo_partido.transmision_precio and proximo_partido.transmision_precio > 0:
                stream_info += f" Entrada virtual para no-socios: ${int(proximo_partido.transmision_precio)}."

        info_partido = f"{proximo_partido.titulo}{rival_str} {condicion_str} el {fecha_str}.{stream_info}"

    # 3. Preguntas frecuentes activas
    faqs = (
        db.query(models.FaqEntry)
        .filter(models.FaqEntry.es_activa.is_(True))
        .order_by(models.FaqEntry.orden)
        .limit(15)
        .all()
    )
    faqs_texto = "\n".join([f"- Pregunta: {f.pregunta}\n  Respuesta oficial: {f.respuesta}" for f in faqs]) if faqs else "Sin FAQs cargadas."

    # 4. Comercios adheridos
    comercios = (
        db.query(models.ComercioAsociado)
        .filter(models.ComercioAsociado.es_activo.is_(True))
        .limit(10)
        .all()
    )
    comercios_texto = ", ".join([f"{c.nombre_fantasia} ({c.rubro or 'Comercio'}: {c.beneficio_ofrecido})" for c in comercios]) if comercios else "Comercios locales de Roberts con descuentos para socios."

    contexto_prompt = f"""
DATOS OFICIALES Y EN TIEMPO REAL DEL CLUB ATLÉTICO ROBERTS (CAR):
- Entidad: Club Atlético Roberts (CAR), fundado en Roberts, Partido de Lincoln, Provincia de Buenos Aires.
- Apodo del club y sus hinchas: El Camotero / Los Camoteros.
- Colores representativos: Rojo y Blanco.
- Alias oficial para transferencias bancarias: {alias}
- Cuota social actual (mayores / tarifa general): {valor_cuota_str} por mes (vence el día {dia_venc} de cada mes).
- Cuota social menores de 18 años: cuenta con {descuento_menor_str} de descuento, quedando en {valor_menor_str} por mes.
- Tarifas vigentes de alquileres e instalaciones:
{tarifas_alquiler_str}
  IMPORTANTE: Las reservas online por la web son exclusivas para socios con cuota al día. Si un no socio consulta cómo alquilar, aclárale que el portal web es para socios y que para alquileres particulares debe consultar a Secretaría o asociarse online desde [Completar solicitud de socio](/registro).
- WhatsApp de atención de secretaría: {whatsapp_raw}
- Próximo partido / fixture: {info_partido}
- Preguntas Frecuentes oficiales del club:
{faqs_texto}
- Beneficios en Comercios Adheridos (con carnet/QR al día):
{comercios_texto}

RUTAS INTERNAS Y FORMATO DE ENLACES:
Cuando menciones una acción o pantalla, usa SIEMPRE texto descriptivo legible dentro de corchetes en formato markdown. NUNCA escribas la barra sola ni pongas enlaces crudos como (/en-vivo) o [/en-vivo](/en-vivo).
Ejemplos obligatorios:
- Para ver partidos o streaming: [Ver transmisión en vivo](/en-vivo)
- Para pagar cuota o deudas: [Consultar cuotas](/socio/cuotas)
- Para asociarse: [Completar solicitud de socio](/registro)
- Para canchas o quincho: [Reservar instalaciones](/socio/reservas) o [Reservar cancha](/socio/cancha)
- Para preguntas frecuentes o comercios: [Preguntas frecuentes](/ayuda)
- Para indumentaria: [Tienda oficial](/shopping)
- Para administración de socios: [Administración de socios](/admin/socios)
- Para verificar comprobantes: [Verificaciones de pagos](/admin/verificaciones)
"""

    return {
        "contexto_prompt": contexto_prompt,
        "alias": alias,
        "valor_cuota_str": valor_cuota_str,
        "valor_menor_str": valor_menor_str,
        "descuento_menor_str": descuento_menor_str,
        "tarifas_alquiler_str": tarifas_alquiler_str,
        "info_partido": info_partido,
        "tiene_stream": tiene_stream,
        "id_evento_stream": id_evento_stream,
        "whatsapp_raw": whatsapp_raw,
        "whatsapp_clean": whatsapp_clean,
        "faqs": faqs,
    }


def _construir_contexto_admin(db: Session) -> Dict[str, Any]:
    """
    Métricas agregadas de SOLO LECTURA para el modo "superusuario" del admin.
    Nunca se usa para ejecutar acciones — únicamente consultas de conteo/suma
    sobre la base, calcadas de la misma lógica que ya usan los paneles admin
    (socios_morosos, beca_activa) para no reimplementar la regla de morosidad.
    """
    hoy = hoy_club()
    config = db.query(models.ConfiguracionGlobal).first()
    dia_venc = config.dia_vencimiento_cuota if config else 10

    total_activos = (
        db.query(models.Usuario).filter(models.Usuario.fecha_baja.is_(None)).count()
    )
    total_bajas = (
        db.query(models.Usuario).filter(models.Usuario.fecha_baja.isnot(None)).count()
    )
    morosos = socios_morosos(db, dia_venc, hoy)
    cantidad_morosos = len(morosos)

    activos_todos = (
        db.query(models.Usuario).filter(models.Usuario.fecha_baja.is_(None)).all()
    )
    cantidad_becados = sum(1 for s in activos_todos if beca_activa(s, hoy))

    ordenes_pendientes = (
        db.query(models.Orden)
        .filter(models.Orden.estado == "pendiente_verificacion")
        .count()
    )
    ordenes_aprobadas_mes = (
        db.query(models.Orden)
        .filter(
            models.Orden.estado == "aprobada",
            models.Orden.aprobada_at.isnot(None),
            models.Orden.aprobada_at >= datetime(hoy.year, hoy.month, 1, tzinfo=timezone.utc),
        )
        .all()
    )
    cantidad_ordenes_mes = len(ordenes_aprobadas_mes)
    recaudacion_mes = sum((o.monto_total for o in ordenes_aprobadas_mes), start=Decimal("0"))

    reservas_pendientes = (
        db.query(models.ReservaInstalacion)
        .filter(models.ReservaInstalacion.estado == "bloqueada")
        .count()
    )

    contexto_prompt_admin = f"""
DATOS INTERNOS EN TIEMPO REAL (SOLO LECTURA — exclusivos de administración, hoy {hoy.isoformat()}):
- Socios activos: {total_activos}
- Socios dados de baja (histórico): {total_bajas}
- Socios morosos actualmente: {cantidad_morosos}
- Socios con beca activa: {cantidad_becados}
- Órdenes/pagos pendientes de verificación: {ordenes_pendientes}
- Órdenes aprobadas este mes: {cantidad_ordenes_mes}
- Recaudación aprobada este mes: ${recaudacion_mes:,.0f}
- Reservas de instalaciones bloqueadas (turno tomado, pago aún no confirmado): {reservas_pendientes}
"""

    return {
        "total_activos": total_activos,
        "total_bajas": total_bajas,
        "cantidad_morosos": cantidad_morosos,
        "cantidad_becados": cantidad_becados,
        "ordenes_pendientes": ordenes_pendientes,
        "cantidad_ordenes_mes": cantidad_ordenes_mes,
        "recaudacion_mes": recaudacion_mes,
        "reservas_pendientes": reservas_pendientes,
        "contexto_prompt_admin": contexto_prompt_admin,
    }


def _responder_consulta_admin_por_reglas(mensaje: str, admin_datos: Dict[str, Any]) -> Optional[str]:
    """
    Intercepta preguntas frecuentes de admin ("¿cuántos socios morosos hay?")
    y responde directo con el número real de la base, sin pasar por el LLM.
    Evita cualquier riesgo de que el modelo invente una cifra.
    """
    msg = re.sub(r"[^\w\s]", "", mensaje.lower()).strip()

    if any(w in msg for w in ["moroso", "morosos", "deudor", "deudores", "deuda"]):
        return f"Actualmente hay **{admin_datos['cantidad_morosos']}** socios morosos."

    if any(w in msg for w in ["cuantos socios", "cantidad de socios", "socios activos", "cuántos socios", "total de socios"]):
        return (
            f"Hay **{admin_datos['total_activos']}** socios activos "
            f"y **{admin_datos['total_bajas']}** dados de baja en el histórico."
        )

    if any(w in msg for w in ["becado", "becados", "beca"]):
        return f"Actualmente hay **{admin_datos['cantidad_becados']}** socios con beca activa."

    if any(w in msg for w in ["pendiente de verificacion", "pendientes de verificacion", "comprobante pendiente", "pagos pendientes", "ordenes pendientes", "órdenes pendientes"]):
        return f"Hay **{admin_datos['ordenes_pendientes']}** órdenes/comprobantes pendientes de verificación."

    if any(w in msg for w in ["recaudacion", "recaudación", "cuanto se recaudo", "cuánto se recaudó", "ingresos del mes"]):
        return (
            f"Este mes se aprobaron **{admin_datos['cantidad_ordenes_mes']}** órdenes, "
            f"por un total de **${admin_datos['recaudacion_mes']:,.0f}**."
        )

    if any(w in msg for w in ["reserva bloqueada", "reservas bloqueadas", "turnos bloqueados", "canchas bloqueadas"]):
        return f"Hay **{admin_datos['reservas_pendientes']}** reservas bloqueadas con el turno tomado y el pago aún sin confirmar."

    return None


def _responder_por_reglas_fallback(
    mensaje: str,
    datos: Dict[str, Any],
    autenticado: bool = False,
    rol: str = "anonimo",
    nombre_usuario: str = "",
) -> Tuple[str, Optional[List[Dict[str, str]]]]:
    """Motor de contingencia por reglas cuando Gemini API no está configurada o excede cuota."""
    msg_raw = mensaje.lower().strip()
    msg = re.sub(r"[^\w\s]", "", msg_raw).strip()
    alias = datos["alias"]
    cuota = datos["valor_cuota_str"]
    cuota_menor = datos.get("valor_menor_str", "$3.000")
    descuento_menor = datos.get("descuento_menor_str", "40%")
    partido = datos["info_partido"]
    wa = datos["whatsapp_raw"]
    rol_clean = (rol or "anonimo").lower()
    es_admin = rol_clean in ["admin", "tesorero", "profesor"]

    # 1. Saludos breves
    if msg in [
        "hola", "buenas", "buen dia", "buenas tardes", "buenas noches",
        "hey", "hola camotito", "hola camote", "que tal", "como estas",
        "como andas", "todo bien", "buenas", "saludos", "hola como estas",
        "hola como andas", "buenas como andas", "buenas como estas"
    ]:
        nombre_str = f" {nombre_usuario}" if (autenticado and nombre_usuario) else ""
        return (
            f"¡Hola{nombre_str}! Soy **Camotito**, el asistente virtual del Club Atlético Roberts.\n\n"
            "¿En qué te puedo ayudar hoy? Podés consultarme sobre cuotas sociales, alquiler de canchas, el próximo partido o cómo asociarte online."
        ), None

    # 2. Agradecimientos o despedidas
    if any(w in msg for w in ["gracias", "muchas gracias", "joya", "perfecto", "genial", "chau", "adios", "adiós", "nos vemos", "listo"]):
        return "¡De nada! Si te surge cualquier otra duda sobre el club, acá estoy para ayudarte. ¡Vamos Roberts!", None

    # 3. Solicitud de Tour Guiado interactivo de la app
    if any(w in msg for w in ["tour", "guia", "guía", "recorrer", "tutorial", "como funciona la app", "cómo funciona la app", "explicame la app", "explicar la app"]):
        if autenticado:
            return (
                "¡Excelente! Te acompaño a recorrer tu portal paso a paso con la **Guía interactiva de Camotito** para que conozcas tu carnet digital con QR dinámico, cuotas, reservas de canchas y servicios del club.\n\n"
                "[Iniciar Tour Guiado](/socio?tour=1)"
            ), None
        else:
            return (
                "El tour interactivo guiado por Camotito está disponible para socios dentro de su portal personal.\n\n"
                "Si ya sos socio del club, podés [Iniciar sesión](/login) para recorrer la plataforma. Si todavía no te asociaste, podés [Completar solicitud de socio](/registro) en 2 minutos."
            ), None

    # 4. Solicitud explícita de Menú / Opciones / Consultas frecuentes
    if msg in ["menu", "menú", "opciones", "ayuda", "consultas", "consultas frecuentes", "que podes hacer", "qué podés hacer", "comandos"]:
        nombre_str = f" {nombre_usuario}" if (autenticado and nombre_usuario) else ""
        texto = (
            f"Hola{nombre_str}. Soy **Camotito**, el asistente virtual del Club Atlético Roberts.\n\n"
            "Escribime tu consulta o elegí una de las opciones frecuentes acá abajo:"
        )
        sugs = _obtener_sugerencias_socio() if autenticado else _obtener_sugerencias_publicas()
        return texto, sugs

    # 5. Frustración / incomprensión / feedback negativo
    if any(w in msg for w in ["no me sirve", "no entendi", "no entendí", "no entiendo", "no era eso", "no ayuda", "muy malo", "horrible", "nada que ver", "no entiendo nada"]):
        return (
            "Disculpá la confusión. Podés consultarme puntualmente sobre:\n\n"
            "- Valor de cuota social y descuentos para menores de edad\n"
            "- Dónde y cuándo juega el club el fin de semana\n"
            "- Alquiler de canchas de fútbol y quincho (para socios y no socios)\n"
            "- Cómo asociarte online paso a paso\n\n"
            "O si preferís que te atienda una persona de Secretaría, avisame y te paso el contacto directo."
        ), None

    # 6. Dudas generales preliminares
    if any(w in msg for w in ["tengo una duda", "tengo una pregunta", "te hago una pregunta", "te consulto", "tengo dudas", "consulta"]) and len(msg.split()) <= 7:
        return (
            "¡Por supuesto! Decime qué duda tenés. Te puedo informar sobre cómo hacerte socio, valores de cuotas, alquiler de canchas, partidos o cualquier trámite del club."
        ), None

    # 7. Menores de edad / Descuento para menores / Hijos / Cadetes
    if any(w in msg for w in ["menor", "menores", "edad", "descuento", "cadete", "cadetes", "chico", "chicos", "hijo", "hijos", "hija", "hijas", "niño", "niños"]):
        return (
            "**Cuota Social para Menores de 18 años:**\n\n"
            f"Los socios menores de 18 años cuentan con un **{descuento_menor} de descuento** sobre la cuota social:\n\n"
            f"- Cuota mayores / general: **{cuota}** por mes.\n"
            f"- Cuota menores (con {descuento_menor} de descuento): **{cuota_menor}** por mes.\n\n"
            f"Las cuotas se abonan transfiriendo al alias oficial: **`{alias}`**.\n\n"
            "Para asociar a un menor, podés completar la solicitud online en 2 minutos desde [Completar solicitud de socio](/registro)."
        ), None

    # 8. Alquiler de instalaciones / canchas / quincho (diferenciando socios y no socios)
    if any(w in msg for w in ["cancha", "canchas", "quincho", "alquiler", "alquilar", "alquilo", "alquila", "alquilan", "reserva", "reservar", "reservo", "turno", "turnos"]):
        if any(w in msg for w in ["no socio", "no soy socio", "sin ser socio", "sin socio", "externo", "externos", "particular", "particulares"]):
            return (
                "**Alquiler de Canchas y Quincho para No Socios:**\n\n"
                "El sistema de reservas online a través del portal está disponible exclusivamente para socios activos del club con cuota al día.\n\n"
                "Si no sos socio y querés alquilar la Cancha 1 (sintético), Cancha 2 o el Quincho social para un evento, podés comunicarte directamente con Secretaría para consultar disponibilidad y aranceles para particulares, o asociarte desde [Completar solicitud de socio](/registro)."
            ), None
        else:
            if autenticado:
                return (
                    "**Alquiler de Canchas y Quincho:**\n\n"
                    "El club cuenta con Cancha 1 (sintético), Cancha 2 y Quincho social para eventos familiares y peñas.\n\n"
                    "Podés consultar la disponibilidad de turnos e iniciar tu reserva online desde [Reservar instalaciones](/socio/reservas) o [Reservar cancha](/socio/cancha)."
                ), None
            else:
                return (
                    "**Alquiler de Canchas y Quincho:**\n\n"
                    "El club cuenta con Cancha 1 (sintético), Cancha 2 y Quincho social para eventos familiares y peñas.\n\n"
                    "Para reservar turnos online como socio, ingresá a [Iniciar sesión](/login). Si todavía no sos socio, podés asociarte completando tu solicitud en [Completar solicitud de socio](/registro)."
                ), None

    # 9. Pagos manuales / administración de cobros
    if any(w in msg for w in ["pago manual", "pagos manuales", "cobro manual", "cargar pago", "asentar pago", "registrar pago", "cobrar cuota", "cobrar manual"]):
        if es_admin:
            return (
                "**Registro de Pago Manual (Administración):**\n\n"
                "Para registrarle un pago en efectivo o imputarle cuotas a un socio:\n\n"
                "1. Ingresá a [Administración de socios](/admin/socios).\n"
                "2. Buscá al socio por nombre, apellido o número de DNI.\n"
                "3. En las acciones del socio, seleccioná **Cobro manual**.\n"
                "4. Seleccioná los meses a cubrir y confirmá la operación.\n\n"
                "Si el socio transfirió por banco o Mercado Pago y subió comprobante, podés verificarlo y aprobarlo desde [Verificaciones de pagos](/admin/verificaciones)."
            ), None
        else:
            if autenticado:
                return (
                    f"Para abonar tus cuotas podés transferir al alias oficial: **`{alias}`**.\n\n"
                    "Luego ingresá a [Consultar cuotas](/socio/cuotas) para cargar tu comprobante de transferencia y tener tu carnet al día."
                ), None
            else:
                return (
                    f"Para abonar cuotas sociales podés transferir directamente al alias oficial: **`{alias}`**.\n\n"
                    "Si ya sos socio, ingresá a [Iniciar sesión](/login) para subir tu comprobante. Si todavía no sos socio, podés sumarte completando el formulario en [Completar solicitud de socio](/registro)."
                ), None

    # 10. Acceso a cuenta / login / contraseña
    if any(w in msg for w in ["no puedo entrar", "no puedo ingresar", "acceder a su cuenta", "acceder a mi cuenta", "olvidé mi contraseña", "olvide mi contraseña", "primer ingreso", "iniciar sesion", "iniciar sesión", "clave"]):
        return (
            "**Acceso a la Cuenta:**\n\n"
            "- Para ingresar al portal, entrá a [Iniciar sesión](/login) con tu número de **DNI** y contraseña.\n"
            "- Si es tu primer ingreso o no recordás la contraseña, podés restablecerla desde [Recuperar contraseña](/recuperar-password) indicando tu email registrado."
        ), None

    # 11. Partidos y fixture
    if any(w in msg for w in ["partido", "partidos", "juegan", "jugamos", "fixture", "domingo", "stream", "transmision", "transmisión", "en vivo", "hora", "rival", "fecha"]):
        return (
            f"Próximo Partido y Transmisión:\n\n{partido}\n\n"
            "Podés seguir todos los detalles y mirar el partido en vivo desde [Ver transmisión en vivo](/en-vivo)."
        ), None

    # 12. Cuotas y pagos
    if any(w in msg for w in ["cuota", "cuotas", "pagar", "alias", "cbu", "transferir", "transferencia", "precio", "cuánto sale", "cuanto sale", "banco"]):
        if autenticado:
            return (
                f"Cuota Social y Pagos:\n\n"
                f"La cuota social actual es de **{cuota}** por mes.\n"
                f"Podés transferir directamente al alias oficial del club: **`{alias}`**.\n\n"
                f"Podés consultar tu estado de cuotas y subir tu comprobante desde [Consultar cuotas](/socio/cuotas)."
            ), None
        else:
            return (
                f"Cuota Social y Pagos:\n\n"
                f"La cuota social actual es de **{cuota}** por mes.\n"
                f"Podés transferir directamente al alias oficial del club: **`{alias}`**.\n\n"
                f"Si ya sos socio, ingresá a [Iniciar sesión](/login) para ver tus cuotas y subir tu comprobante. Si querés asociarte, podés completar tu solicitud online en 2 minutos desde [Completar solicitud de socio](/registro)."
            ), None

    # 13. Hacerme socio
    if any(w in msg for w in ["hacerme socio", "hacerme socia", "asociarme", "hacerse socio", "cómo ser socio", "como ser socio", "quiero ser socio", "alta de socio", "anotarme", "inscribirme", "registro", "solicitud"]):
        return (
            "Cómo hacerte socio del CAR:\n\n"
            "Podés completar tu solicitud de alta online en 2 minutos desde [Completar solicitud de socio](/registro).\n\n"
            "Una vez aprobada tu solicitud, vas a poder ingresar a tu panel con tu DNI, tener tu carnet QR digital y disfrutar de todos los beneficios."
        ), None

    # 14. Comercios adheridos
    if any(w in msg for w in ["comercio", "comercios", "descuento", "descuentos", "beneficio", "beneficios", "farmacia", "tienda"]):
        return (
            "Beneficios en Comercios Adheridos:\n\n"
            "Presentando tu carnet QR de socio al día contás con importantes descuentos en comercios de Roberts.\n\n"
            "Podés ver el listado actualizado de comercios y promociones en [Preguntas frecuentes](/ayuda)."
        ), None

    # 15. Contacto Secretaría / WhatsApp
    if any(w in msg for w in ["contacto", "secretaria", "secretaría", "teléfono", "telefono", "whatsapp", "hablar", "comision", "directiva", "número", "numero"]):
        wa_link = f"https://wa.me/{datos['whatsapp_clean']}" if datos.get("whatsapp_clean") else "https://wa.me/"
        return (
            "Contacto con Secretaría:\n\n"
            f"Podés comunicarte directamente con la secretaría del club al WhatsApp {wa} para consultas administrativas o trámites presenciales:\n\n"
            f"[Escribir a Secretaría por WhatsApp]({wa_link})"
        ), None

    # 16. Buscar coincidencia en FAQs cargadas (estricta con stopwords)
    STOPWORDS = {"como", "cómo", "para", "donde", "dónde", "cuando", "cuándo", "cual", "cuál", "hago", "hacer", "puedo", "tener", "club", "socio", "socios", "roberts"}
    for faq in datos.get("faqs", []):
        palabras_faq = [p for p in re.findall(r"\w+", faq.pregunta.lower()) if len(p) > 3 and p not in STOPWORDS]
        palabras_msg = [p for p in re.findall(r"\w+", msg) if len(p) > 3 and p not in STOPWORDS]
        coincidencias = set(palabras_faq).intersection(set(palabras_msg))
        if len(coincidencias) >= 2 or (len(palabras_faq) == 1 and len(coincidencias) == 1):
            return f"**{faq.pregunta}**\n\n{faq.respuesta}", None

    # 17. Respuesta genérica cuando no reconoce la consulta: envía el menú interactivo
    if autenticado:
        nombre_str = f" {nombre_usuario}" if nombre_usuario else ""
        texto = (
            f"Hola{nombre_str}. Soy **Camotito**, el asistente virtual del Club Atlético Roberts. ¿En qué te puedo ayudar hoy?\n\n"
            "Escribime tu consulta o elegí una de las opciones frecuentes acá abajo:"
        )
        return texto, _obtener_sugerencias_socio()
    else:
        texto = (
            "Hola. Soy **Camotito**, el asistente virtual del Club Atlético Roberts. ¿En qué te puedo ayudar hoy?\n\n"
            "Escribime tu consulta o elegí una de las opciones frecuentes acá abajo:"
        )
        return texto, _obtener_sugerencias_publicas()


@router.get(
    "/info-inicial",
    summary="Obtener estado inicial y sugerencias del chatbot",
)
def obtener_info_inicial(
    db: Session = Depends(get_db),
    current_user: Optional[models.Usuario] = Depends(get_current_user_optional),
):
    datos = _construir_contexto_club(db)
    api_key = (settings.gemini_api_key or os.getenv("GEMINI_API_KEY", "")).strip()
    usa_ia = bool(api_key)

    super_rol = _super_rol(current_user)
    nombre = current_user.nombre if current_user else ""

    if super_rol != SUPER_ROL_NO_REGISTRADO:
        saludo = f"Hola{f' {nombre}' if nombre else ''}. Soy Camotito, el asistente virtual del Club Atlético Roberts. ¿En qué te puedo ayudar hoy?"
        sugerencias = _obtener_sugerencias_socio()
    else:
        saludo = "Hola. Soy Camotito, el asistente virtual del Club Atlético Roberts. ¿En qué te puedo ayudar hoy?"
        sugerencias = _obtener_sugerencias_publicas()

    return {
        "nombre_asistente": "Camotito",
        "saludo_inicial": saludo,
        "sugerencias": sugerencias,
        "alias_transferencia": datos["alias"],
        "whatsapp_club": datos["whatsapp_raw"],
        "whatsapp_url": None,
        "modo_ia_activo": usa_ia,
    }


@router.post(
    "/mensaje",
    summary="Enviar mensaje al Asistente Virtual CAR",
)
async def procesar_mensaje_chatbot(
    payload: MensajeChatbotPayload,
    db: Session = Depends(get_db),
    current_user: Optional[models.Usuario] = Depends(get_current_user_optional),
):
    mensaje_usuario = payload.mensaje.strip()
    if not mensaje_usuario:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El mensaje no puede estar vacío.",
        )

    datos = _construir_contexto_club(db)
    api_key = (settings.gemini_api_key or os.getenv("GEMINI_API_KEY", "")).strip()

    # El rol/autenticación NUNCA sale del payload (lo puede mandar cualquiera):
    # se deriva siempre del JWT verificado en get_current_user_optional.
    super_rol = _super_rol(current_user)
    autenticado = super_rol != SUPER_ROL_NO_REGISTRADO
    es_admin = super_rol == SUPER_ROL_ADMIN
    nombre_user = (current_user.nombre if current_user else "") or ""
    rol_usuario = super_rol

    admin_datos = _construir_contexto_admin(db) if es_admin else None

    # Modo "superusuario" de solo lectura: si el admin pregunta algo que
    # matchea una métrica conocida, se responde directo con el dato real de
    # la base (sin pasar por el LLM, así no hay riesgo de que se invente un
    # número) y sin ofrecer ninguna acción de escritura.
    if es_admin and admin_datos is not None:
        respuesta_admin_directa = _responder_consulta_admin_por_reglas(mensaje_usuario, admin_datos)
        if respuesta_admin_directa is not None:
            return {
                "respuesta": respuesta_admin_directa,
                "origen": "consulta_admin_db",
                "sugerencias": None,
                "whatsapp_url": None,
            }

    # Interceptar solicitudes directas de saludo, menú o de tour guiado para responder inmediatamente
    msg_clean = mensaje_usuario.lower().strip()
    msg_letras = re.sub(r"[^\w\s]", "", msg_clean).strip()
    es_saludo = msg_letras in [
        "hola", "buenas", "buen dia", "buenas tardes", "buenas noches",
        "hey", "hola camotito", "hola camote", "que tal", "como estas",
        "como andas", "todo bien", "buenas", "saludos", "hola como estas",
        "hola como andas", "buenas como andas", "buenas como estas"
    ]
    es_menu = msg_letras in ["menu", "opciones", "ayuda", "consultas", "consultas frecuentes", "que podes hacer", "comandos"]
    es_tour = any(w in msg_clean for w in ["tour", "guia", "guía", "recorrer", "tutorial", "como funciona la app", "cómo funciona la app", "explicame la app"])

    if es_saludo or es_menu or es_tour:
        resp_dir, sugs_dir = _responder_por_reglas_fallback(
            mensaje_usuario,
            datos,
            autenticado=autenticado,
            rol=rol_usuario,
            nombre_usuario=nombre_user,
        )
        return {
            "respuesta": resp_dir,
            "origen": "regla_directa",
            "sugerencias": sugs_dir,
            "whatsapp_url": None,
        }

    # Si no hay API key configurada, responder con el motor de contingencia por reglas
    if not api_key:
        respuesta_texto, sugs_resp = _responder_por_reglas_fallback(
            mensaje_usuario,
            datos,
            autenticado=autenticado,
            rol=rol_usuario,
            nombre_usuario=nombre_user,
        )
        return {
            "respuesta": respuesta_texto,
            "origen": "fallback_reglas",
            "sugerencias": sugs_resp,
            "whatsapp_url": None,
        }

    # Contexto de seguridad y enlaces según el estado de autenticación y rol
    if autenticado:
        if es_admin:
            seguridad_instrucciones = f"""
INFORMACIÓN DEL USUARIO ACTUAL:
- Estado: AUTENTICADO COMO ADMINISTRADOR / DIRECTIVO (superusuario de SOLO LECTURA).
- Nombre del usuario: {nombre_user if nombre_user else "Administrador"}
- Rol: {rol_usuario}
- PERMISOS DE ENLACES:
  * Como este usuario es administrador, PUEDE recibir enlaces a los paneles de gestión administrativa si los solicita:
    - [Administración de socios](/admin/socios)
    - [Verificaciones de pagos](/admin/verificaciones)
    - [Gestión de eventos](/admin/eventos)
    - [Escáner de acceso](/admin/escaner)
  * También puede recibir enlaces de socio y públicos ([Ver transmisión en vivo](/en-vivo), [Consultar cuotas](/socio/cuotas), [Reservar instalaciones](/socio/reservas), [Preguntas frecuentes](/ayuda), [Tienda oficial](/shopping)).
- MODO SUPERUSUARIO DE SOLO LECTURA:
  * Podés responder con los datos reales de la sección "DATOS INTERNOS EN TIEMPO REAL" de más abajo (cantidad de socios, morosos, becados, órdenes pendientes, recaudación, etc.). Son datos reales de la base, no los inventes ni los redondees de más.
  * PROHIBICIÓN ABSOLUTA DE ACCIONES: NUNCA digas que dieron de baja, aprobaron, rechazaron, cobraron o modificaron algo. Vos NO ejecutás ninguna acción, solo leés y reportás información.
  * Si el admin pide "dar de baja a X", "aprobar la orden Y", "cobrarle a Z" o cualquier acción de escritura, respondé que Camotito solo puede consultar información y que esa acción se hace manualmente desde el panel correspondiente (indicá el enlace si corresponde), nunca la ejecutes ni digas que la hiciste.
  * Si te preguntan un dato que no está en "DATOS INTERNOS EN TIEMPO REAL", decí que no tenés esa información cargada en este momento en vez de estimarla o inventarla.
{admin_datos['contexto_prompt_admin'] if admin_datos else ""}
"""
        else:
            seguridad_instrucciones = f"""
INFORMACIÓN DEL USUARIO ACTUAL:
- Estado: AUTENTICADO COMO SOCIO DEL CLUB.
- Nombre del socio: {nombre_user if nombre_user else "Socio"}
- Rol: {rol_usuario}
- REGLAS DE SEGURIDAD ESTRICTAS PARA ENLACES:
  * PROHIBICIÓN ABSOLUTA DE ENLACES /admin/*: Este usuario NO es administrador. ESTÁ TOTALMENTE PROHIBIDO incluir enlaces que comiencen con /admin (como /admin/socios, /admin/verificaciones, etc.).
  * Enlaces permitidos para este socio:
    - [Consultar cuotas](/socio/cuotas)
    - [Reservar instalaciones](/socio/reservas) o [Reservar cancha](/socio/cancha)
    - [Ver transmisión en vivo](/en-vivo)
    - [Iniciar Tour Guiado](/socio?tour=1)
    - [Preguntas frecuentes](/ayuda)
    - [Tienda oficial](/shopping)
    - [Mi perfil](/socio/perfil)
"""
    else:
        seguridad_instrucciones = """
INFORMACIÓN DEL USUARIO ACTUAL:
- Estado: VISITANTE ANÓNIMO / NO REGISTRADO (NO TIENE SESIÓN INICIADA).
- REGLAS DE SEGURIDAD ESTRICTAS PARA ENLACES:
  * ESTÁ TOTALMENTE PROHIBIDO incluir enlaces privados que comiencen con /socio/ o con /admin/.
  * NUNCA proporciones enlaces como /socio/cuotas, /socio/reservas, /admin/socios, /admin/verificaciones a un visitante anónimo.
  * Si el usuario pregunta cómo pagar cuotas, ver deudas, reservar canchas o trámites de socio: explícale que esas gestiones se realizan desde su cuenta y sugiérele [Iniciar sesión](/login) si ya es socio, o [Completar solicitud de socio](/registro) si desea asociarse.
  * Enlaces públicos permitidos para visitantes anónimos:
    - [Ver transmisión en vivo](/en-vivo)
    - [Completar solicitud de socio](/registro)
    - [Iniciar sesión](/login)
    - [Preguntas frecuentes](/ayuda)
    - [Tienda oficial](/shopping)
    - Si el visitante solicita expresamente contacto humano o WhatsApp: [Escribir a Secretaría por WhatsApp](url)
"""

    wa_clean = datos.get("whatsapp_clean", "")
    wa_link_oficial = f"https://wa.me/{wa_clean}" if wa_clean else "https://wa.me/"

    # Llamar a Google Gemini Flash API
    system_instruction = f"""
Eres "Camotito", el asistente virtual oficial del Club Atlético Roberts (CAR), fundado en 1920 en la localidad de Roberts, Provincia de Buenos Aires, Argentina.
Tus colores son el Rojo y el Blanco. Tu nombre es estricta y únicamente "Camotito". NUNCA te llames "Camote" ni "Camotero".

Tus directivas obligatorias:
1. PROHIBICIÓN ESTRICTA DE EMOJIS: Está terminantemente PROHIBIDO usar emojis, emoticones o pictogramas. No uses pelotas, ni círculos de colores, ni flechitas ni ningún emoji. Respuestas 100% limpias de emojis.
2. Habla en español rioplatense / argentino con tono sobrio, educado, cercano, claro y respetuoso.
3. Respuestas directas, concisas y útiles (máximo 2 o 3 párrafos breves).
4. FORMATO DE PRECIOS Y CIFRAS: Expresa SIEMPRE los importes, valores de cuota, aranceles, descuentos y porcentajes con formato numérico y símbolos correspondientes (por ejemplo: $5.000, $3.000, 40%, $25.000). NUNCA escribas los números de precios o porcentajes con palabras (evita 'tres mil pesos' o 'cuarenta por ciento').
5. FORMATO DE ENLACES: NUNCA muestres rutas técnicas crudas como "(/en-vivo)", ni barras sueltas como "/en-vivo", ni "[/en-vivo](/en-vivo)". SIEMPRE utiliza frases legibles en español como texto del enlace en formato markdown. Por ejemplo: [Ver transmisión en vivo](/en-vivo).
6. NUNCA inventes alias bancarios ni números de cuenta que no figuren en los datos oficiales.
7. REGLA ESTRICTA DE WHATSAPP: PROHIBIDO incluir enlaces, números o invitaciones a WhatsApp por defecto o al final de tus respuestas comunes. ÚNICAMENTE debes proporcionar el enlace de WhatsApp si el usuario pregunta EXPLÍCITAMENTE por contactar a Secretaría, hablar con una persona, número de teléfono o WhatsApp. En ese caso particular, incluye el enlace en formato: [Escribir a Secretaría por WhatsApp]({wa_link_oficial}). NUNCA lo agregues en respuestas sobre cuotas, canchas, fixture, transmisiones, etc.
8. GUÍA Y TOUR INTERACTIVO: Si el socio pregunta por un tour guiado, tutorial o cómo usar la app o el portal, invítalo con entusiasmo y facilítale el enlace: [Iniciar Tour Guiado](/socio?tour=1).
9. SOS DE SOLO LECTURA, SIEMPRE: aunque hables con un administrador, vos NUNCA ejecutás altas, bajas, aprobaciones, rechazos, cobros ni ninguna escritura sobre la base de datos. Como máximo informás los datos que ya te dieron o indicás en qué pantalla del panel se hace esa acción manualmente.

{seguridad_instrucciones}

{datos['contexto_prompt']}
"""

    # Candidatos de modelos con alta disponibilidad y cuota amplia
    modelos_candidatos = [
        settings.gemini_model or "gemini-3.5-flash-lite",
        "gemini-flash-lite-latest",
        "gemini-3.5-flash",
    ]

    # Construir historial para Gemini
    contents = []
    if payload.historial:
        for h in payload.historial[-6:]:  # últimos turnos para mantener contexto sin saturar tokens
            rol_gemini = "user" if h.get("rol") == "user" else "model"
            texto_h = h.get("texto", "").strip()
            if texto_h:
                contents.append({
                    "role": rol_gemini,
                    "parts": [{"text": texto_h}],
                })

    contents.append({
        "role": "user",
        "parts": [{"text": mensaje_usuario}],
    })

    cuerpo_request = {
        "system_instruction": {
            "parts": [{"text": system_instruction}]
        },
        "contents": contents,
        "generationConfig": {
            "temperature": 0.4,
            "maxOutputTokens": 600,
        },
    }

    # Intentar con la lista de modelos candidatos
    for modelo in modelos_candidatos:
        url_gemini = f"https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent?key={api_key}"
        try:
            async with httpx.AsyncClient(timeout=22.0) as client:
                res = await client.post(
                    url_gemini,
                    json=cuerpo_request,
                    headers={"Content-Type": "application/json"},
                )

                if res.status_code == 200:
                    data = res.json()
                    try:
                        parts = data["candidates"][0]["content"]["parts"]
                        text_parts = [p["text"] for p in parts if "text" in p and not p.get("thought", False)]
                        texto_respuesta = "\n".join(text_parts).strip() if text_parts else parts[0].get("text", "").strip()
                        texto_respuesta = _sanitizar_respuesta_chatbot(texto_respuesta)
                        return {
                            "respuesta": texto_respuesta,
                            "origen": "gemini_ai",
                            "whatsapp_url": None,
                        }
                    except (KeyError, IndexError) as e:
                        logger.warning(f"Respuesta inesperada de Gemini API ({modelo}): {data} ({e})")
                else:
                    logger.warning(
                        f"Gemini API ({modelo}) devolvió HTTP {res.status_code}: {res.text[:120]}. Probando siguiente candidato..."
                    )
        except Exception as exc:
            logger.warning(f"Error conectando con Gemini API ({modelo}): {exc}. Probando siguiente candidato...")

    # Si falló la llamada a Gemini, usamos el motor de contingencia
    respuesta_fallback, sugs_fallback = _responder_por_reglas_fallback(
        mensaje_usuario,
        datos,
        autenticado=autenticado,
        rol=rol_usuario,
        nombre_usuario=nombre_user,
    )
    return {
        "respuesta": _sanitizar_respuesta_chatbot(respuesta_fallback),
        "origen": "fallback_reglas",
        "sugerencias": sugs_fallback,
        "whatsapp_url": None,
    }

