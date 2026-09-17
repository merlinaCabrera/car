# backend/routers/chatbot.py
"""
Router del Asistente Virtual CAR ("Camotero").
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
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

import models
from config import settings
from database import get_db

logger = logging.getLogger("car.chatbot")

router = APIRouter(
    prefix="/chatbot",
    tags=["Chatbot Asistente Virtual CAR"],
)


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


def _construir_contexto_club(db: Session) -> Dict[str, Any]:
    """Extrae en tiempo real los datos institucionales, deportivos y financieros del club."""
    # 1. Configuración financiera e institucional
    config = db.query(models.ConfiguracionGlobal).first()
    alias = (config.alias_transferencia if config and config.alias_transferencia else "clubatleticoroberts.mp")
    valor_cuota_num = int(config.valor_cuota_base) if config and config.valor_cuota_base else None
    valor_cuota_str = f"${valor_cuota_num:,}".replace(",", ".") if valor_cuota_num else "a consultar en secretaría"
    dia_venc = config.dia_vencimiento_cuota if config else 10
    whatsapp_raw = config.whatsapp_club if config and config.whatsapp_club else "2355 123456"
    whatsapp_clean = _normalizar_telefono_ar(whatsapp_raw)

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
- Colores representativos: Rojo y Blanco (🔴⚪).
- Alias oficial para transferencias bancarias: {alias}
- Cuota social actual: {valor_cuota_str} por mes (vence el día {dia_venc} de cada mes). Socios menores de 18 años tienen 40% de descuento.
- WhatsApp de atención de secretaría: {whatsapp_raw}
- Próximo partido / fixture: {info_partido}
- Instalaciones para alquiler: Cancha 1 (fútbol 5/sintético), Cancha 2, Quincho social para cumpleaños, peñas y eventos familiares.
- Preguntas Frecuentes oficiales del club:
{faqs_texto}
- Beneficios en Comercios Adheridos (con carnet/QR al día):
{comercios_texto}

RUTAS INTERNAS DE LA PLATAFORMA WEB:
- Pagar cuota social o ver estado de cuenta: /socio/cuotas
- Ver transmisión en vivo de partidos: /en-vivo
- Ver fixture y partidos: /gestion-eventos o /calendario-deportivo
- Asociarse online (solicitud de alta): /registro
- Reservar Canchas o Quincho: /socio/reservas y /socio/cancha
- Ver comercios con descuento: sección Comercios en /
- Tienda oficial de indumentaria: /shopping
- Preguntas frecuentes completas: /ayuda
"""

    return {
        "contexto_prompt": contexto_prompt,
        "alias": alias,
        "valor_cuota_str": valor_cuota_str,
        "info_partido": info_partido,
        "tiene_stream": tiene_stream,
        "id_evento_stream": id_evento_stream,
        "whatsapp_raw": whatsapp_raw,
        "whatsapp_clean": whatsapp_clean,
        "faqs": faqs,
    }


def _responder_por_reglas_fallback(mensaje: str, datos: Dict[str, Any]) -> str:
    """Motor de contingencia por reglas cuando Gemini API no está configurada o excede cuota."""
    msg = mensaje.lower().strip()
    alias = datos["alias"]
    cuota = datos["valor_cuota_str"]
    partido = datos["info_partido"]
    wa = datos["whatsapp_raw"]

    if any(w in msg for w in ["partido", "partidos", "juegan", "jugamos", "fixture", "domingo", "stream", "transmision", "en vivo", "hora", "rival", "fecha"]):
        resp = f"⚽ **Próximo Partido y Transmisión:**\n\n{partido}\n\nPodés seguir todos los detalles y mirar el partido en vivo desde nuestra sección [/en-vivo](/en-vivo) de la web."
        return resp

    if any(w in msg for w in ["cuota", "pagar", "alias", "cbu", "transferir", "transferencia", "precio", "cuánto sale", "cuanto sale", "banco"]):
        resp = (
            f"💳 **Cuota Social y Pagos:**\n\n"
            f"La cuota social actual es de **{cuota}** por mes.\n"
            f"Podés transferir directamente al alias oficial del club: **`{alias}`**.\n\n"
            f"Si ya sos socio, podés gestionar tus cuotas y subir tu comprobante desde [/socio/cuotas](/socio/cuotas)."
        )
        return resp

    if any(w in msg for w in ["cancha", "canchas", "quincho", "alquiler", "alquilar", "reserva", "reservar", "turno", "pelota"]):
        resp = (
            "🏟️ **Alquiler de Canchas y Quincho:**\n\n"
            "El club cuenta con Cancha 1 (sintético), Cancha 2 y el Quincho social para eventos familiares o peñas.\n\n"
            "Podés consultar la disponibilidad de turnos e iniciar tu reserva online desde [/socio/reservas](/socio/reservas) o [/socio/cancha](/socio/cancha)."
        )
        return resp

    if any(w in msg for w in ["socio", "hacerme socio", "asociarme", "anotarme", "inscribirme", "registro", "alta", "carnet"]):
        resp = (
            "📝 **Cómo hacerte socio del CAR:**\n\n"
            "¡Sumate a la familia camotera! Podés completar tu solicitud de alta online en 2 minutos desde [/registro](/registro).\n\n"
            "Una vez aprobada tu solicitud, vas a poder ingresar a tu panel con tu DNI, tener tu carnet QR digital y disfrutar de todos los beneficios."
        )
        return resp

    if any(w in msg for w in ["comercio", "comercios", "descuento", "descuentos", "beneficio", "beneficios", "farmacia", "tienda"]):
        resp = (
            "🛍️ **Beneficios en Comercios Adheridos:**\n\n"
            "Presentando tu carnet QR de socio al día contás con importantes descuentos en comercios de Roberts.\n\n"
            "Podés ver el listado actualizado de comercios y promociones en la página principal de la web o en [/ayuda](/ayuda)."
        )
        return resp

    if any(w in msg for w in ["contacto", "secretaria", "teléfono", "telefono", "whatsapp", "hablar", "comision", "directiva"]):
        resp = (
            f"📲 **Contacto con Secretaría:**\n\n"
            f"Podés comunicarte directamente con la secretaría del club al WhatsApp **{wa}** para consultas administrativas o trámites presenciales."
        )
        return resp

    # Buscar coincidencia en FAQs cargadas
    for faq in datos.get("faqs", []):
        palabras_pregunta = [p for p in re.findall(r"\w+", faq.pregunta.lower()) if len(p) > 3]
        if any(p in msg for p in palabras_pregunta):
            return f"ℹ️ **{faq.pregunta}**\n\n{faq.respuesta}"

    # Respuesta genérica con bienvenida y opciones
    return (
        "¡Hola! Soy **Camotero**, el asistente virtual del Club Atlético Roberts 🔴⚪.\n\n"
        "Te puedo ayudar con información sobre:\n"
        "• ⚽ **Próximo partido y transmisiones en vivo** ([/en-vivo](/en-vivo))\n"
        "• 💳 **Valor de cuota y alias para transferir** (`" + alias + "`)\n"
        "• 🏟️ **Alquiler de canchas y quincho** ([/socio/reservas](/socio/reservas))\n"
        "• 📝 **Hacerte socio online** ([/registro](/registro))\n"
        "• 📲 **Contacto directo con Secretaría**\n\n"
        "Escribime tu consulta o elegí una de las opciones rápidas."
    )


@router.get(
    "/info-inicial",
    summary="Obtener estado inicial y sugerencias del chatbot",
)
def obtener_info_inicial(db: Session = Depends(get_db)):
    datos = _construir_contexto_club(db)
    api_key = settings.gemini_api_key or os.getenv("GEMINI_API_KEY", "")
    usa_ia = bool(api_key.strip())

    sugerencias = [
        {"id": "partido", "label": "⚽ Próximo partido y stream", "prompt": "¿Cuándo juega el CAR y hay transmisión en vivo?"},
        {"id": "cuota", "label": "💳 Cuota social y Alias", "prompt": "¿Cuánto sale la cuota y cuál es el alias para transferir?"},
        {"id": "alquiler", "label": "🏟️ Alquiler de canchas y quincho", "prompt": "¿Cómo hago para alquilar una cancha o el quincho?"},
        {"id": "socio", "label": "📝 Cómo hacerme socio", "prompt": "¿Cuáles son los requisitos y cómo me hago socio?"},
        {"id": "contacto", "label": "📲 Contactar por WhatsApp", "prompt": "¿Cuál es el número de WhatsApp de la secretaría?"},
    ]

    return {
        "nombre_asistente": "Camotero",
        "saludo_inicial": "¡Hola! Soy Camotero, el asistente virtual del Club Atlético Roberts 🔴⚪. ¿En qué te puedo ayudar hoy?",
        "sugerencias": sugerencias,
        "alias_transferencia": datos["alias"],
        "whatsapp_club": datos["whatsapp_raw"],
        "whatsapp_url": f"https://wa.me/{datos['whatsapp_clean']}" if datos["whatsapp_clean"] else "https://wa.me/",
        "modo_ia_activo": usa_ia,
    }


@router.post(
    "/mensaje",
    summary="Enviar mensaje al Asistente Virtual CAR",
)
async def procesar_mensaje_chatbot(
    payload: MensajeChatbotPayload,
    db: Session = Depends(get_db),
):
    mensaje_usuario = payload.mensaje.strip()
    if not mensaje_usuario:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El mensaje no puede estar vacío.",
        )

    datos = _construir_contexto_club(db)
    api_key = (settings.gemini_api_key or os.getenv("GEMINI_API_KEY", "")).strip()

    # Si no hay API key configurada, responder con el motor de contingencia por reglas
    if not api_key:
        respuesta_texto = _responder_por_reglas_fallback(mensaje_usuario, datos)
        return {
            "respuesta": respuesta_texto,
            "origen": "fallback_reglas",
            "whatsapp_url": f"https://wa.me/{datos['whatsapp_clean']}" if datos["whatsapp_clean"] else None,
        }

    # Llamar a Google Gemini Flash API con streaming o content generation
    system_instruction = f"""
Eres "Camotero", el asistente virtual oficial del Club Atlético Roberts (CAR), fundado en 1920 en la localidad de Roberts, Provincia de Buenos Aires, Argentina.
Tus colores son el Rojo y el Blanco (🔴⚪).

Tu personalidad y estilo:
- Habla en español rioplatense / argentino con tono cálido, educado, entusiasta y futbolero de club de pueblo.
- Eres servicial y siempre dispuesto a ayudar a socios, hinchas, jugadores y vecinos.
- Usa emoticones con buen gusto (⚽, 🔴⚪, 💳, 🏟️).
- Respuestas directas, concisas y útiles (máximo 2 o 3 párrafos breves).
- Cuando menciones una sección de la web, indícala con formato markdown como link interno, por ejemplo:
  * Para pagar cuota o deudas: [/socio/cuotas](/socio/cuotas)
  * Para transmisiones en vivo: [/en-vivo](/en-vivo)
  * Para asociarse: [/registro](/registro)
  * Para canchas o quincho: [/socio/reservas](/socio/reservas) o [/socio/cancha](/socio/cancha)
  * Para ayuda o preguntas frecuentes: [/ayuda](/ayuda)
  * Para la tienda de indumentaria: [/shopping](/shopping)
- NUNCA inventes alias bancarios ni números de cuenta que no figuren en los datos oficiales.
- Si te preguntan algo que no figura en los datos oficiales o que requiere atención humana particular (casos de directiva, trámites específicos de tesorería), invítalos amablemente a escribir al WhatsApp de secretaría ({datos['whatsapp_raw']}).

{datos['contexto_prompt']}
"""

    modelo = settings.gemini_model or "gemini-2.5-flash"
    url_gemini = f"https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent?key={api_key}"

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

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            res = await client.post(
                url_gemini,
                json=cuerpo_request,
                headers={"Content-Type": "application/json"},
            )

            if res.status_code == 200:
                data = res.json()
                try:
                    texto_respuesta = (
                        data["candidates"][0]["content"]["parts"][0]["text"]
                    ).strip()
                    return {
                        "respuesta": texto_respuesta,
                        "origen": "gemini_ai",
                        "whatsapp_url": f"https://wa.me/{datos['whatsapp_clean']}" if datos["whatsapp_clean"] else None,
                    }
                except (KeyError, IndexError) as e:
                    logger.warning(f"Respuesta inesperada de Gemini API: {data} ({e})")
            else:
                logger.warning(
                    f"Gemini API devolvió HTTP {res.status_code}: {res.text}. Usando fallback."
                )

    except Exception as exc:
        logger.error(f"Error conectando con Gemini API: {exc}. Usando fallback.")

    # Si falló la llamada a Gemini, usamos el motor de contingencia
    respuesta_fallback = _responder_por_reglas_fallback(mensaje_usuario, datos)
    return {
        "respuesta": respuesta_fallback,
        "origen": "fallback_reglas",
        "whatsapp_url": f"https://wa.me/{datos['whatsapp_clean']}" if datos["whatsapp_clean"] else None,
    }
