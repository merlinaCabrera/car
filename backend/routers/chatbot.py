# backend/routers/chatbot.py
"""
Router del Asistente Virtual CAR ("Camote").
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
    rol: Optional[str] = Field(default="anonimo", description="Rol del usuario actual si está logueado")
    autenticado: Optional[bool] = Field(default=False, description="True si tiene sesión iniciada")
    nombre_usuario: Optional[str] = Field(default="", description="Nombre del usuario si está logueado")


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
- Colores representativos: Rojo y Blanco.
- Alias oficial para transferencias bancarias: {alias}
- Cuota social actual: {valor_cuota_str} por mes (vence el día {dia_venc} de cada mes). Socios menores de 18 años tienen 40% de descuento ($2.400 por mes).
- WhatsApp de atención de secretaría: {whatsapp_raw}
- Próximo partido / fixture: {info_partido}
- Instalaciones para alquiler: Cancha 1 (fútbol 5/sintético), Cancha 2, Quincho social para cumpleaños, peñas y eventos familiares. IMPORTANTE: Las reservas online por la web son exclusivas para socios con cuota al día. Si un no socio consulta cómo alquilar, aclárale que el portal web es para socios y que para alquileres particulares debe consultar a Secretaría o asociarse online desde [Completar solicitud de socio](/registro).
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
        "info_partido": info_partido,
        "tiene_stream": tiene_stream,
        "id_evento_stream": id_evento_stream,
        "whatsapp_raw": whatsapp_raw,
        "whatsapp_clean": whatsapp_clean,
        "faqs": faqs,
    }


def _responder_por_reglas_fallback(
    mensaje: str,
    datos: Dict[str, Any],
    autenticado: bool = False,
    rol: str = "anonimo",
    nombre_usuario: str = "",
) -> str:
    """Motor de contingencia por reglas cuando Gemini API no está configurada o excede cuota."""
    msg = mensaje.lower().strip()
    alias = datos["alias"]
    cuota = datos["valor_cuota_str"]
    partido = datos["info_partido"]
    wa = datos["whatsapp_raw"]
    rol_clean = (rol or "anonimo").lower()
    es_admin = rol_clean in ["admin", "tesorero", "profesor"]

    # 1. Saludos breves
    if msg in ["hola", "buenas", "buen dia", "buen día", "buenas tardes", "buenas noches", "hey", "hola camote", "que tal", "qué tal"]:
        nombre_str = f" {nombre_usuario}" if (autenticado and nombre_usuario) else ""
        return (
            f"¡Hola{nombre_str}! Soy **Camote**, el asistente virtual del Club Atlético Roberts.\n\n"
            "¿En qué te puedo ayudar hoy? Podés consultarme sobre cuotas sociales, alquiler de canchas, el próximo partido o cómo asociarte online."
        )

    # 2. Agradecimientos o despedidas
    if any(w in msg for w in ["gracias", "muchas gracias", "joya", "perfecto", "genial", "chau", "adios", "adiós", "nos vemos", "listo"]):
        return "¡De nada! Si te surge cualquier otra duda sobre el club, acá estoy para ayudarte. ¡Vamos Roberts!"

    # 3. Frustración / incomprensión / feedback negativo
    if any(w in msg for w in ["no me sirve", "no entendi", "no entendí", "no entiendo", "no era eso", "no ayuda", "muy malo", "horrible", "nada que ver", "no entiendo nada"]):
        return (
            "Disculpá la confusión. Podés consultarme puntualmente sobre:\n\n"
            "- Valor de cuota social y descuentos para menores de edad\n"
            "- Dónde y cuándo juega el club el fin de semana\n"
            "- Alquiler de canchas de fútbol y quincho (para socios y no socios)\n"
            "- Cómo asociarte online paso a paso\n\n"
            "O si preferís que te atienda una persona de Secretaría, avisame y te paso el contacto directo."
        )

    # 4. Dudas generales preliminares ("no soy socio tengo una duda", "te hago una pregunta")
    if any(w in msg for w in ["tengo una duda", "tengo una pregunta", "te hago una pregunta", "te consulto", "tengo dudas", "consulta"]) and len(msg.split()) <= 7:
        return (
            "¡Por supuesto! Decime qué duda tenés. Te puedo informar sobre cómo hacerte socio, valores de cuotas, alquiler de canchas, partidos o cualquier trámite del club."
        )

    # 5. Menores de edad / Descuento para menores / Hijos / Cadetes
    if any(w in msg for w in ["menor", "menores", "edad", "descuento", "cadete", "cadetes", "chico", "chicos", "hijo", "hijos", "hija", "hijas", "niño", "niños"]):
        return (
            "**Cuota Social para Menores de 18 años:**\n\n"
            "Los socios menores de 18 años cuentan con un **40% de descuento** sobre la cuota social:\n\n"
            f"- Cuota mayores / general: **{cuota}** por mes.\n"
            "- Cuota menores (con 40% de descuento): **$2.400** por mes.\n\n"
            f"Las cuotas se abonan transfiriendo al alias oficial: **`{alias}`**.\n\n"
            "Para asociar a un menor, podés completar la solicitud online en 2 minutos desde [Completar solicitud de socio](/registro)."
        )

    # 6. Alquiler de instalaciones / canchas / quincho (diferenciando socios y no socios)
    if any(w in msg for w in ["cancha", "canchas", "quincho", "alquiler", "alquilar", "alquilo", "alquila", "alquilan", "reserva", "reservar", "reservo", "turno", "turnos"]):
        if any(w in msg for w in ["no socio", "no soy socio", "sin ser socio", "sin socio", "externo", "externos", "particular", "particulares"]):
            return (
                "**Alquiler de Canchas y Quincho para No Socios:**\n\n"
                "El sistema de reservas online a través del portal está disponible exclusivamente para socios activos del club con cuota al día.\n\n"
                "Si no sos socio y querés alquilar la Cancha 1 (sintético), Cancha 2 o el Quincho social para un evento, podés comunicarte directamente con Secretaría para consultar disponibilidad y aranceles para particulares, o asociarte desde [Completar solicitud de socio](/registro)."
            )
        else:
            if autenticado:
                return (
                    "**Alquiler de Canchas y Quincho:**\n\n"
                    "El club cuenta con Cancha 1 (sintético), Cancha 2 y Quincho social para eventos familiares y peñas.\n\n"
                    "Podés consultar la disponibilidad de turnos e iniciar tu reserva online desde [Reservar instalaciones](/socio/reservas) o [Reservar cancha](/socio/cancha)."
                )
            else:
                return (
                    "**Alquiler de Canchas y Quincho:**\n\n"
                    "El club cuenta con Cancha 1 (sintético), Cancha 2 y Quincho social para eventos familiares y peñas.\n\n"
                    "Para reservar turnos online como socio, ingresá a [Iniciar sesión](/login). Si todavía no sos socio, podés asociarte completando tu solicitud en [Completar solicitud de socio](/registro)."
                )

    # 7. Pagos manuales / administración de cobros
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
            )
        else:
            if autenticado:
                return (
                    f"Para abonar tus cuotas podés transferir al alias oficial: **`{alias}`**.\n\n"
                    "Luego ingresá a [Consultar cuotas](/socio/cuotas) para cargar tu comprobante de transferencia y tener tu carnet al día."
                )
            else:
                return (
                    f"Para abonar cuotas sociales podés transferir directamente al alias oficial: **`{alias}`**.\n\n"
                    "Si ya sos socio, ingresá a [Iniciar sesión](/login) para subir tu comprobante. Si todavía no sos socio, podés sumarte completando el formulario en [Completar solicitud de socio](/registro)."
                )

    # 8. Acceso a cuenta / login / contraseña
    if any(w in msg for w in ["no puedo entrar", "no puedo ingresar", "acceder a su cuenta", "acceder a mi cuenta", "olvidé mi contraseña", "olvide mi contraseña", "primer ingreso", "iniciar sesion", "iniciar sesión", "clave"]):
        return (
            "**Acceso a la Cuenta:**\n\n"
            "- Para ingresar al portal, entrá a [Iniciar sesión](/login) con tu número de **DNI** y contraseña.\n"
            "- Si es tu primer ingreso o no recordás la contraseña, podés restablecerla desde [Recuperar contraseña](/recuperar-password) indicando tu email registrado."
        )

    # 9. Partidos y fixture
    if any(w in msg for w in ["partido", "partidos", "juegan", "jugamos", "fixture", "domingo", "stream", "transmision", "transmisión", "en vivo", "hora", "rival", "fecha"]):
        return (
            f"Próximo Partido y Transmisión:\n\n{partido}\n\n"
            "Podés seguir todos los detalles y mirar el partido en vivo desde [Ver transmisión en vivo](/en-vivo)."
        )

    # 10. Cuotas y pagos
    if any(w in msg for w in ["cuota", "cuotas", "pagar", "alias", "cbu", "transferir", "transferencia", "precio", "cuánto sale", "cuanto sale", "banco"]):
        if autenticado:
            return (
                f"Cuota Social y Pagos:\n\n"
                f"La cuota social actual es de **{cuota}** por mes.\n"
                f"Podés transferir directamente al alias oficial del club: **`{alias}`**.\n\n"
                f"Podés consultar tu estado de cuotas y subir tu comprobante desde [Consultar cuotas](/socio/cuotas)."
            )
        else:
            return (
                f"Cuota Social y Pagos:\n\n"
                f"La cuota social actual es de **{cuota}** por mes.\n"
                f"Podés transferir directamente al alias oficial del club: **`{alias}`**.\n\n"
                f"Si ya sos socio, ingresá a [Iniciar sesión](/login) para ver tus cuotas y subir tu comprobante. Si querés asociarte, podés completar tu solicitud online en 2 minutos desde [Completar solicitud de socio](/registro)."
            )

    # 11. Hacerme socio
    if any(w in msg for w in ["hacerme socio", "hacerme socia", "asociarme", "hacerse socio", "cómo ser socio", "como ser socio", "quiero ser socio", "alta de socio", "anotarme", "inscribirme", "registro", "solicitud"]):
        return (
            "Cómo hacerte socio del CAR:\n\n"
            "Podés completar tu solicitud de alta online en 2 minutos desde [Completar solicitud de socio](/registro).\n\n"
            "Una vez aprobada tu solicitud, vas a poder ingresar a tu panel con tu DNI, tener tu carnet QR digital y disfrutar de todos los beneficios."
        )

    # 12. Comercios adheridos
    if any(w in msg for w in ["comercio", "comercios", "descuento", "descuentos", "beneficio", "beneficios", "farmacia", "tienda"]):
        return (
            "Beneficios en Comercios Adheridos:\n\n"
            "Presentando tu carnet QR de socio al día contás con importantes descuentos en comercios de Roberts.\n\n"
            "Podés ver el listado actualizado de comercios y promociones en [Preguntas frecuentes](/ayuda)."
        )

    # 13. Contacto Secretaría / WhatsApp
    if any(w in msg for w in ["contacto", "secretaria", "secretaría", "teléfono", "telefono", "whatsapp", "hablar", "comision", "directiva", "número", "numero"]):
        wa_link = f"https://wa.me/{datos['whatsapp_clean']}" if datos.get("whatsapp_clean") else "https://wa.me/"
        return (
            "Contacto con Secretaría:\n\n"
            f"Podés comunicarte directamente con la secretaría del club al WhatsApp {wa} para consultas administrativas o trámites presenciales:\n\n"
            f"[Escribir a Secretaría por WhatsApp]({wa_link})"
        )

    # 14. Buscar coincidencia en FAQs cargadas (estricta con stopwords)
    STOPWORDS = {"como", "cómo", "para", "donde", "dónde", "cuando", "cuándo", "cual", "cuál", "hago", "hacer", "puedo", "tener", "club", "socio", "socios", "roberts"}
    for faq in datos.get("faqs", []):
        palabras_faq = [p for p in re.findall(r"\w+", faq.pregunta.lower()) if len(p) > 3 and p not in STOPWORDS]
        palabras_msg = [p for p in re.findall(r"\w+", msg) if len(p) > 3 and p not in STOPWORDS]
        coincidencias = set(palabras_faq).intersection(set(palabras_msg))
        if len(coincidencias) >= 2 or (len(palabras_faq) == 1 and len(coincidencias) == 1):
            return f"**{faq.pregunta}**\n\n{faq.respuesta}"

    # 15. Respuesta genérica con bienvenida y opciones
    if autenticado:
        nombre_str = f" {nombre_usuario}" if nombre_usuario else ""
        return (
            f"Hola{nombre_str}. Soy **Camote**, el asistente virtual del Club Atlético Roberts.\n\n"
            "Te puedo ayudar con información sobre:\n"
            "- Próximo partido y streaming en vivo: [Ver transmisión en vivo](/en-vivo)\n"
            "- Estado de cuotas y pagos: [Consultar cuotas](/socio/cuotas)\n"
            "- Alquiler de canchas y quincho: [Reservar instalaciones](/socio/reservas)\n"
            "- Comercios con descuentos: [Preguntas frecuentes](/ayuda)\n\n"
            "Escribime tu consulta o elegí una de las opciones rápidas."
        )
    else:
        return (
            "Hola. Soy **Camote**, el asistente virtual del Club Atlético Roberts.\n\n"
            "Te puedo ayudar con información sobre:\n"
            "- Próximo partido y streaming en vivo: [Ver transmisión en vivo](/en-vivo)\n"
            "- Valor de cuota y alias bancario oficial\n"
            "- Alquiler de canchas y quincho social\n"
            "- Cómo hacerte socio online: [Completar solicitud de socio](/registro)\n"
            "- Acceso a tu cuenta: [Iniciar sesión](/login)\n\n"
            "Escribime tu consulta o elegí una de las opciones rápidas."
        )


@router.get(
    "/info-inicial",
    summary="Obtener estado inicial y sugerencias del chatbot",
)
def obtener_info_inicial(
    rol: Optional[str] = "anonimo",
    autenticado: Optional[bool] = False,
    nombre: Optional[str] = "",
    db: Session = Depends(get_db),
):
    datos = _construir_contexto_club(db)
    api_key = (settings.gemini_api_key or os.getenv("GEMINI_API_KEY", "")).strip()
    usa_ia = bool(api_key)

    if autenticado:
        saludo = f"Hola{f' {nombre}' if nombre else ''}. Soy Camote, el asistente virtual del Club Atlético Roberts. ¿En qué te puedo ayudar hoy?"
        sugerencias = [
            {"id": "partido", "label": "Próximo partido y stream", "prompt": "¿Cuándo juega el CAR y hay transmisión en vivo?"},
            {"id": "cuota", "label": "Mis cuotas y pagos", "prompt": "¿Cómo consulto mis cuotas y cargo mi comprobante?"},
            {"id": "alquiler", "label": "Reservar cancha o quincho", "prompt": "¿Cómo reservo un turno para una cancha o el quincho?"},
            {"id": "comercios", "label": "Comercios con descuento", "prompt": "¿Qué comercios tienen descuentos para socios al día?"},
            {"id": "contacto", "label": "Contactar por WhatsApp", "prompt": "¿Cuál es el número de WhatsApp de la secretaría?"},
        ]
    else:
        saludo = "Hola. Soy Camote, el asistente virtual del Club Atlético Roberts. ¿En qué te puedo ayudar hoy?"
        sugerencias = [
            {"id": "partido", "label": "Próximo partido y stream", "prompt": "¿Cuándo juega el CAR y hay transmisión en vivo?"},
            {"id": "cuota", "label": "Cuota social y alias", "prompt": "¿Cuánto sale la cuota y cuál es el alias para transferir?"},
            {"id": "socio", "label": "Cómo hacerme socio", "prompt": "¿Cuáles son los requisitos y cómo me hago socio online?"},
            {"id": "alquiler", "label": "Alquiler de canchas y quincho", "prompt": "¿Cómo hago para alquilar una cancha o el quincho?"},
            {"id": "contacto", "label": "Contactar por WhatsApp", "prompt": "¿Cuál es el número de WhatsApp de la secretaría?"},
        ]

    return {
        "nombre_asistente": "Camote",
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
):
    mensaje_usuario = payload.mensaje.strip()
    if not mensaje_usuario:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El mensaje no puede estar vacío.",
        )

    datos = _construir_contexto_club(db)
    api_key = (settings.gemini_api_key or os.getenv("GEMINI_API_KEY", "")).strip()

    rol_usuario = (payload.rol or "anonimo").lower()
    autenticado = bool(payload.autenticado)
    nombre_user = (payload.nombre_usuario or "").strip()
    es_admin = rol_usuario in ["admin", "tesorero", "profesor"]

    # Si no hay API key configurada, responder con el motor de contingencia por reglas
    if not api_key:
        respuesta_texto = _responder_por_reglas_fallback(
            mensaje_usuario,
            datos,
            autenticado=autenticado,
            rol=rol_usuario,
            nombre_usuario=nombre_user,
        )
        return {
            "respuesta": respuesta_texto,
            "origen": "fallback_reglas",
            "whatsapp_url": None,
        }

    # Contexto de seguridad y enlaces según el estado de autenticación y rol
    if autenticado:
        if es_admin:
            seguridad_instrucciones = f"""
INFORMACIÓN DEL USUARIO ACTUAL:
- Estado: AUTENTICADO COMO ADMINISTRADOR / DIRECTIVO.
- Nombre del usuario: {nombre_user if nombre_user else "Administrador"}
- Rol: {rol_usuario}
- PERMISOS DE ENLACES:
  * Como este usuario es administrador, PUEDE recibir enlaces a los paneles de gestión administrativa si los solicita:
    - [Administración de socios](/admin/socios)
    - [Verificaciones de pagos](/admin/verificaciones)
    - [Gestión de eventos](/admin/eventos)
    - [Escáner de acceso](/admin/escaner)
  * También puede recibir enlaces de socio y públicos ([Ver transmisión en vivo](/en-vivo), [Consultar cuotas](/socio/cuotas), [Reservar instalaciones](/socio/reservas), [Preguntas frecuentes](/ayuda), [Tienda oficial](/shopping)).
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
Eres "Camote", el asistente virtual oficial del Club Atlético Roberts (CAR), fundado en 1920 en la localidad de Roberts, Provincia de Buenos Aires, Argentina.
Tus colores son el Rojo y el Blanco. Tu nombre es estricta y únicamente "Camote". NUNCA te llames "Camotero".

Tus directivas obligatorias:
1. PROHIBICIÓN ESTRICTA DE EMOJIS: Está terminantemente PROHIBIDO usar emojis, emoticones o pictogramas. No uses pelotas, ni círculos de colores, ni flechitas ni ningún emoji. Respuestas 100% limpias de emojis.
2. Habla en español rioplatense / argentino con tono sobrio, educado, cercano, claro y respetuoso.
3. Respuestas directas, concisas y útiles (máximo 2 o 3 párrafos breves).
4. FORMATO DE ENLACES: NUNCA muestres rutas técnicas crudas como "(/en-vivo)", ni barras sueltas como "/en-vivo", ni "[/en-vivo](/en-vivo)". SIEMPRE utiliza frases legibles en español como texto del enlace en formato markdown. Por ejemplo: [Ver transmisión en vivo](/en-vivo).
5. NUNCA inventes alias bancarios ni números de cuenta que no figuren en los datos oficiales.
6. REGLA ESTRICTA DE WHATSAPP: PROHIBIDO incluir enlaces, números o invitaciones a WhatsApp por defecto o al final de tus respuestas comunes. ÚNICAMENTE debes proporcionar el enlace de WhatsApp si el usuario pregunta EXPLÍCITAMENTE por contactar a Secretaría, hablar con una persona, número de teléfono o WhatsApp. En ese caso particular, incluye el enlace en formato: [Escribir a Secretaría por WhatsApp]({wa_link_oficial}). NUNCA lo agregues en respuestas sobre cuotas, canchas, fixture, transmisiones, etc.

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
                        # Sanitize any accidental Camotero to Camote
                        texto_respuesta = re.sub(r"\bCamotero\b", "Camote", texto_respuesta, flags=re.IGNORECASE)
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
    respuesta_fallback = _responder_por_reglas_fallback(
        mensaje_usuario,
        datos,
        autenticado=autenticado,
        rol=rol_usuario,
        nombre_usuario=nombre_user,
    )
    return {
        "respuesta": respuesta_fallback,
        "origen": "fallback_reglas",
        "whatsapp_url": None,
    }
