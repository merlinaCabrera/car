# backend/routers/transmisiones.py
"""
Router de Transmisiones en Vivo (Streaming Pay-Per-View).

Endpoints:
  Públicos / Hincha:
    GET   /transmisiones/partido-actual         → Próximo partido o partido en vivo con transmisión
    GET   /transmisiones/{id_evento}/info        → Metadatos públicos de la transmisión del evento
    GET   /transmisiones/{id_evento}/acceso      → Verifica si el usuario actual tiene acceso al stream
    GET   /transmisiones/{id_evento}/stream      → Devuelve ID/código de video + nuevo token_sesion (protegido)
    POST  /transmisiones/{id_evento}/heartbeat   → Heartbeat cada 30s (anti-compartir cuenta / concurrencia)

  Compras / Entradas Virtuales:
    POST  /transmisiones/{id_evento}/comprar-mp            → Genera checkout de Mercado Pago para entrada virtual
    POST  /transmisiones/{id_evento}/comprar-transferencia → Genera orden para pagar entrada vía transferencia

  Administración / Staff:
    GET   /transmisiones/{id_evento}/espectadores → Métricas de espectadores en vivo y tickets vendidos
    PATCH /transmisiones/{id_evento}/estado       → Cambio rápido de estado de transmisión (en_vivo, pausada, etc.)
"""
from __future__ import annotations

import logging
import secrets
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import List, Optional

import mercadopago
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

import models
import schemas
from config import settings
from database import get_db
from dependencies import get_current_user, get_current_user_optional, require_roles
from utils.cuotas_periodos import calcular_estado_financiero

logger = logging.getLogger("car.transmisiones")

router = APIRouter(
    prefix="/transmisiones",
    tags=["Transmisiones en Vivo — Pay-Per-View"],
)

_ROLES_STAFF = ("admin_general", "personal_administrativo", "tecnico")


def _obtener_evento_transmision_o_404(db: Session, id_evento: int) -> models.Evento:
    evento = (
        db.query(models.Evento)
        .options(joinedload(models.Evento.categoria))
        .filter(models.Evento.id_evento == id_evento)
        .first()
    )
    if not evento:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Evento #{id_evento} no encontrado.",
        )
    return evento


def _estado_socio(usuario: models.Usuario, db: Session) -> tuple[bool, bool, bool]:
    """
    Retorna (es_socio, socio_al_dia, es_moroso) para un usuario autenticado,
    usando el motor oficial de morosidad (igual que /socio/cuotas).
    """
    roles_usuario = {ur.rol.nombre for ur in usuario.roles_asignados}
    es_socio = "socio" in roles_usuario or usuario.tipo_socio is not None

    config = db.query(models.ConfiguracionGlobal).first()
    dia_vencimiento = config.dia_vencimiento_cuota if config else 10
    estado_financiero = calcular_estado_financiero(
        usuario.mes_cubierto_hasta, usuario.fecha_ingreso, dia_vencimiento, date.today()
    )
    es_moroso = estado_financiero.moroso and not usuario.es_becado
    socio_al_dia = bool(usuario.es_becado or not estado_financiero.moroso)
    return es_socio, socio_al_dia, es_moroso


def _precio_aplicable(evento: models.Evento, es_socio: bool, es_moroso: bool) -> Decimal:
    """
    Precio real a cobrar por la entrada virtual: los socios morosos pagan
    `transmision_precio_moroso` si el club lo configuró (si no, el mismo
    precio que un no-socio). Existe para sugerirle al moroso que le conviene
    ponerse al día en vez de pagar entrada por entrada.
    """
    if es_socio and es_moroso and evento.transmision_precio_moroso is not None:
        return evento.transmision_precio_moroso
    return evento.transmision_precio or Decimal("0.00")


def _verificar_acceso_usuario(
    evento: models.Evento,
    usuario: Optional[models.Usuario],
    db: Session,
    ticket: Optional[str] = None,
) -> tuple[bool, str, bool, bool, bool, Optional[str], Optional[str]]:
    """
    Evalúa si un usuario o poseedor de ticket tiene autorización para ver la transmisión.
    Retorna: (tiene_acceso, motivo, es_socio, socio_al_dia, es_moroso, ticket_token, email_invitado)

    `socio_al_dia`/`es_moroso` se calculan con el motor oficial de morosidad
    (utils/cuotas_periodos.calcular_estado_financiero), el mismo que usa
    /socio/cuotas — antes esta función tenía su propia heurística simplificada
    que podía divergir de "moroso" en el resto del sistema.
    """
    if not evento.tiene_transmision:
        return False, "sin_transmision", False, False, False, None, None

    # 1. Si la transmisión es pública y abierta
    if evento.transmision_es_publica:
        return True, "transmision_publica", False, False, False, ticket, None

    # 2. Si se proporciona un ticket de invitado
    if ticket:
        entrada_ticket = (
            db.query(models.EntradaVirtual)
            .options(joinedload(models.EntradaVirtual.pago))
            .filter(
                models.EntradaVirtual.id_evento == evento.id_evento,
                models.EntradaVirtual.ticket_token == ticket,
            )
            .first()
        )
        if entrada_ticket:
            if entrada_ticket.id_pago is None:
                return True, "entrada_comprada", False, False, False, entrada_ticket.ticket_token, entrada_ticket.email_invitado
            if entrada_ticket.pago and entrada_ticket.pago.estado == "verificado":
                return True, "entrada_comprada", False, False, False, entrada_ticket.ticket_token, entrada_ticket.email_invitado
            if entrada_ticket.pago and entrada_ticket.pago.estado == "pendiente":
                return False, "pago_pendiente", False, False, False, entrada_ticket.ticket_token, entrada_ticket.email_invitado

    if usuario is None:
        return False, "no_autenticado", False, False, False, None, None

    roles_usuario = {ur.rol.nombre for ur in usuario.roles_asignados}
    es_staff = bool(roles_usuario & set(_ROLES_STAFF))
    es_socio, socio_al_dia, es_moroso = _estado_socio(usuario, db)

    # 3. Staff / Admin / Técnico siempre tiene acceso
    if es_staff:
        return True, "admin", es_socio, socio_al_dia, es_moroso, None, None

    # 4. Socios al día si la transmisión es gratis para socios
    if evento.transmision_socio_gratis and es_socio and socio_al_dia:
        return True, "socio_al_dia", es_socio, socio_al_dia, es_moroso, None, None

    # 5. Verificar si compró entrada virtual por cuenta de usuario
    entrada = (
        db.query(models.EntradaVirtual)
        .options(joinedload(models.EntradaVirtual.pago))
        .filter(
            models.EntradaVirtual.id_evento == evento.id_evento,
            models.EntradaVirtual.id_usuario == usuario.id_usuario,
        )
        .first()
    )

    if entrada:
        # Entrada de cortesía / manual
        if entrada.id_pago is None:
            return True, "entrada_comprada", es_socio, socio_al_dia, es_moroso, entrada.ticket_token, None
        # Entrada asociada a un pago
        if entrada.pago and entrada.pago.estado == "verificado":
            return True, "entrada_comprada", es_socio, socio_al_dia, es_moroso, entrada.ticket_token, None
        if entrada.pago and entrada.pago.estado == "pendiente":
            return False, "pago_pendiente", es_socio, socio_al_dia, es_moroso, entrada.ticket_token, None

    return False, "sin_acceso", es_socio, socio_al_dia, es_moroso, None, None


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINTS PÚBLICOS / HINCHA
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/partido-actual",
    response_model=Optional[schemas.EventoResponse],
    summary="Obtener el partido actual o más próximo con transmisión habilitada",
)
def obtener_partido_actual(
    db: Session = Depends(get_db),
) -> Optional[models.Evento]:
    """
    Busca prioritariamente un partido que esté 'en_vivo'.
    Si no hay ninguno en vivo, busca el próximo 'programado' o 'pausado'.
    """
    # 1. En vivo primero
    partido_vivo = (
        db.query(models.Evento)
        .options(joinedload(models.Evento.categoria))
        .filter(
            models.Evento.tiene_transmision.is_(True),
            models.Evento.transmision_estado == "en_vivo",
        )
        .order_by(models.Evento.fecha_inicio.asc())
        .first()
    )
    if partido_vivo:
        return partido_vivo

    # 2. Próximo programado o pausado
    ahora = datetime.now(timezone.utc) - timedelta(hours=4)  # ventana de tolerancia
    proximo_partido = (
        db.query(models.Evento)
        .options(joinedload(models.Evento.categoria))
        .filter(
            models.Evento.tiene_transmision.is_(True),
            models.Evento.transmision_estado.in_(("programada", "pausada")),
            models.Evento.fecha_inicio >= ahora,
        )
        .order_by(models.Evento.fecha_inicio.asc())
        .first()
    )
    return proximo_partido


@router.get(
    "/{id_evento}/info",
    response_model=schemas.EventoResponse,
    summary="Información pública del partido y su transmisión",
)
def obtener_info_transmision(
    id_evento: int,
    db: Session = Depends(get_db),
) -> models.Evento:
    evento = _obtener_evento_transmision_o_404(db, id_evento)
    return evento


@router.get(
    "/proximos-partidos",
    response_model=List[schemas.EventoResponse],
    summary="Próximos partidos del mes en curso (para la sección Partidos del socio)",
)
def listar_proximos_partidos(
    db: Session = Depends(get_db),
) -> List[models.Evento]:
    """
    Partidos (`tipo == 'partido'`) con `fecha_inicio` entre ahora y el fin del
    mes en curso, ordenados cronológicamente. Sin auth: alimenta tanto la
    página /socio/partidos como, a futuro, un bloque equivalente en la
    landing pública.
    """
    ahora = datetime.now(timezone.utc)
    primer_dia_prox_mes = (ahora.replace(day=1) + timedelta(days=32)).replace(day=1)

    return (
        db.query(models.Evento)
        .options(joinedload(models.Evento.categoria))
        .filter(
            models.Evento.tipo == "partido",
            models.Evento.fecha_inicio >= ahora - timedelta(hours=4),
            models.Evento.fecha_inicio < primer_dia_prox_mes,
        )
        .order_by(models.Evento.fecha_inicio.asc())
        .all()
    )


@router.get(
    "/{id_evento}/acceso",
    response_model=schemas.TransmisionAccesoResponse,
    summary="Verificar derecho de acceso del usuario o invitado al stream",
)
def verificar_acceso_stream(
    id_evento: int,
    ticket: Optional[str] = Query(default=None, description="Token de ticket de invitado (no socio)"),
    db: Session = Depends(get_db),
    usuario: Optional[models.Usuario] = Depends(get_current_user_optional),
) -> schemas.TransmisionAccesoResponse:
    evento = _obtener_evento_transmision_o_404(db, id_evento)
    tiene_acceso, motivo, es_socio, socio_al_dia, es_moroso, ticket_token, email_invitado = _verificar_acceso_usuario(
        evento, usuario, db, ticket=ticket
    )

    return schemas.TransmisionAccesoResponse(
        id_evento=evento.id_evento,
        tiene_acceso=tiene_acceso,
        motivo=motivo,
        precio=evento.transmision_precio or Decimal("0.00"),
        precio_aplicable=_precio_aplicable(evento, es_socio, es_moroso),
        socio_al_dia=socio_al_dia,
        es_socio=es_socio,
        es_moroso=es_moroso,
        estado_transmision=evento.transmision_estado,
        transmision_socio_gratis=evento.transmision_socio_gratis,
        transmision_es_publica=evento.transmision_es_publica,
        ticket_token=ticket_token,
        email_invitado=email_invitado,
    )


@router.get(
    "/{id_evento}/stream",
    response_model=schemas.TransmisionStreamResponse,
    summary="Iniciar sesión y obtener datos de streaming (Protegido)",
)
def obtener_stream(
    id_evento: int,
    ticket: Optional[str] = Query(default=None, description="Token de ticket de invitado (no socio)"),
    db: Session = Depends(get_db),
    usuario: Optional[models.Usuario] = Depends(get_current_user_optional),
) -> schemas.TransmisionStreamResponse:
    """
    Valida el acceso (por cuenta o por ticket). Si está habilitado:
    1. Genera un nuevo `token_sesion` criptográfico único.
    2. Lo almacena en `entradas_virtuales` pisando sesiones anteriores (concurrencia=1).
    3. Retorna la plataforma y el `video_id` / embed junto al token de sesión.
    """
    evento = _obtener_evento_transmision_o_404(db, id_evento)
    tiene_acceso, motivo, _, _, _, ticket_token, _ = _verificar_acceso_usuario(
        evento, usuario, db, ticket=ticket
    )

    if not tiene_acceso:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"No tenés acceso a la transmisión de este partido ({motivo}).",
        )

    # Generar nuevo token de sesión
    nuevo_token = secrets.token_urlsafe(32)
    ahora = datetime.now(timezone.utc)

    entrada = None
    if ticket:
        entrada = (
            db.query(models.EntradaVirtual)
            .filter(
                models.EntradaVirtual.id_evento == evento.id_evento,
                models.EntradaVirtual.ticket_token == ticket,
            )
            .first()
        )
    elif usuario:
        entrada = (
            db.query(models.EntradaVirtual)
            .filter(
                models.EntradaVirtual.id_evento == evento.id_evento,
                models.EntradaVirtual.id_usuario == usuario.id_usuario,
            )
            .first()
        )

    if entrada:
        entrada.token_sesion = nuevo_token
        entrada.ultimo_heartbeat_at = ahora
    elif usuario:
        # Socio o Staff sin registro previo de entrada virtual
        entrada = models.EntradaVirtual(
            id_evento=evento.id_evento,
            id_usuario=usuario.id_usuario,
            id_pago=None,
            token_sesion=nuevo_token,
            ultimo_heartbeat_at=ahora,
        )
        db.add(entrada)

    db.commit()

    return schemas.TransmisionStreamResponse(
        id_evento=evento.id_evento,
        plataforma=evento.transmision_plataforma,
        video_id=evento.transmision_video_id or "",
        token_sesion=nuevo_token,
        estado=evento.transmision_estado,
        ticket_token=ticket_token or (entrada.ticket_token if entrada else None),
    )


@router.post(
    "/{id_evento}/heartbeat",
    response_model=schemas.HeartbeatResponse,
    summary="Mantener viva la sesión activa (detección de cuenta compartida)",
)
def heartbeat_stream(
    id_evento: int,
    payload: schemas.HeartbeatRequest,
    db: Session = Depends(get_db),
    usuario: Optional[models.Usuario] = Depends(get_current_user_optional),
) -> schemas.HeartbeatResponse:
    """
    El reproductor llama a este endpoint cada 30 segundos.
    Si el token recibido no coincide con el token en la base de datos, significa
    que el usuario abrió la transmisión en otro navegador/dispositivo.
    Retorna 409 Conflict para que el cliente pause la reproducción.
    """
    entrada = None
    if usuario:
        entrada = (
            db.query(models.EntradaVirtual)
            .filter(
                models.EntradaVirtual.id_evento == id_evento,
                models.EntradaVirtual.id_usuario == usuario.id_usuario,
            )
            .first()
        )
    elif payload.ticket_token:
        entrada = (
            db.query(models.EntradaVirtual)
            .filter(
                models.EntradaVirtual.id_evento == id_evento,
                models.EntradaVirtual.ticket_token == payload.ticket_token,
            )
            .first()
        )

    if not entrada:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No se encontró registro de sesión activa para esta transmisión.",
        )

    if entrada.token_sesion != payload.token_sesion:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Tu sesión fue iniciada en otro dispositivo o pestaña.",
        )

    entrada.ultimo_heartbeat_at = datetime.now(timezone.utc)
    db.commit()

    return schemas.HeartbeatResponse(valido=True, mensaje="OK")


# ─────────────────────────────────────────────────────────────────────────────
# COMPRAS / ENTRADAS VIRTUALES (PAY-PER-VIEW)
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/{id_evento}/comprar-mp",
    response_model=schemas.ComprarEntradaMPResponse,
    summary="Iniciar compra de entrada virtual con Mercado Pago (Socios o Invitados)",
)
def comprar_entrada_mp(
    id_evento: int,
    payload: Optional[schemas.ComprarEntradaInvitadoPayload] = None,
    db: Session = Depends(get_db),
    usuario: Optional[models.Usuario] = Depends(get_current_user_optional),
) -> schemas.ComprarEntradaMPResponse:
    evento = _obtener_evento_transmision_o_404(db, id_evento)

    if not evento.tiene_transmision:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este evento no tiene transmisión en vivo habilitada.",
        )

    email_comprador: Optional[str] = None
    entrada_existente: Optional[models.EntradaVirtual] = None

    if usuario:
        email_comprador = usuario.email
        entrada_existente = (
            db.query(models.EntradaVirtual)
            .options(joinedload(models.EntradaVirtual.pago))
            .filter(
                models.EntradaVirtual.id_evento == evento.id_evento,
                models.EntradaVirtual.id_usuario == usuario.id_usuario,
            )
            .first()
        )
    else:
        # Invitado sin cuenta (No-socio)
        if not payload or not payload.email or not str(payload.email).strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Debés ingresar tu correo electrónico para comprar la entrada virtual.",
            )
        email_comprador = str(payload.email).strip().lower()
        entrada_existente = (
            db.query(models.EntradaVirtual)
            .options(joinedload(models.EntradaVirtual.pago))
            .filter(
                models.EntradaVirtual.id_evento == evento.id_evento,
                models.EntradaVirtual.email_invitado == email_comprador,
            )
            .first()
        )

    if entrada_existente and (
        entrada_existente.id_pago is None
        or (entrada_existente.pago and entrada_existente.pago.estado == "verificado")
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ya contás con una entrada activa para esta transmisión.",
        )

    if usuario:
        es_socio, _, es_moroso = _estado_socio(usuario, db)
        precio = _precio_aplicable(evento, es_socio, es_moroso)
    else:
        precio = evento.transmision_precio or Decimal("0.00")
    ticket_token = (
        entrada_existente.ticket_token
        if (entrada_existente and entrada_existente.ticket_token)
        else secrets.token_urlsafe(24)
    )

    # Si es gratuita
    if precio <= Decimal("0.00"):
        if not entrada_existente:
            entrada_gratis = models.EntradaVirtual(
                id_evento=evento.id_evento,
                id_usuario=usuario.id_usuario if usuario else None,
                email_invitado=email_comprador if not usuario else None,
                ticket_token=ticket_token,
                id_pago=None,
            )
            db.add(entrada_gratis)
            db.commit()
        return schemas.ComprarEntradaMPResponse(
            id_evento=evento.id_evento,
            id_pago=0,
            preference_id="free",
            init_point=f"{settings.frontend_url}/en-vivo/{evento.id_evento}?ticket={ticket_token}",
            ticket_token=ticket_token,
        )

    # Crear Pago en estado 'pendiente'
    id_usuario_pago = usuario.id_usuario if usuario else settings.sistema_user_id
    nuevo_pago = models.Pago(
        id_usuario=id_usuario_pago,
        monto_total=precio,
        metodo_pago="mercado_pago",
        estado="pendiente",
    )
    db.add(nuevo_pago)
    db.flush()

    # Vincular EntradaVirtual al nuevo Pago
    if entrada_existente:
        entrada_existente.id_pago = nuevo_pago.id_pago
        entrada_existente.ticket_token = ticket_token
    else:
        nueva_entrada = models.EntradaVirtual(
            id_evento=evento.id_evento,
            id_usuario=usuario.id_usuario if usuario else None,
            email_invitado=email_comprador if not usuario else None,
            ticket_token=ticket_token,
            id_pago=nuevo_pago.id_pago,
        )
        db.add(nueva_entrada)

    # Crear Preference en Mercado Pago
    sdk = mercadopago.SDK(settings.mp_access_token)
    titulo_item = f"Entrada Virtual: CAR vs {evento.rival or 'Partido'} (En Vivo)"[:250]

    back_url_base = f"{settings.frontend_url}/en-vivo/{evento.id_evento}"
    ticket_query = f"ticket={ticket_token}&" if ticket_token else ""

    preference_data = {
        "items": [
            {
                "title": titulo_item,
                "quantity": 1,
                "unit_price": float(precio),
                "currency_id": "ARS",
            }
        ],
        "external_reference": str(nuevo_pago.id_pago),
        "notification_url": f"{settings.backend_url}/webhooks/mercadopago",
        "back_urls": {
            "success": f"{back_url_base}?{ticket_query}pago=exitoso",
            "failure": f"{back_url_base}?{ticket_query}pago=fallido",
            "pending": f"{back_url_base}?{ticket_query}pago=pendiente",
        },
    }

    if not settings.frontend_url.startswith("http://localhost"):
        preference_data["auto_return"] = "approved"

    if email_comprador:
        preference_data["payer"] = {"email": email_comprador}

    try:
        resultado = sdk.preference().create(preference_data)
    except Exception as exc:
        db.rollback()
        logger.error("Error al conectar con Mercado Pago: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="No se pudo contactar con Mercado Pago. Intentá nuevamente.",
        ) from exc

    if resultado.get("status") not in (200, 201):
        db.rollback()
        detalle = resultado.get("response", {}).get("message", "Error al crear preferencia")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Mercado Pago rechazó la operación: {detalle}",
        )

    preference = resultado["response"]
    nuevo_pago.mp_preference_id = preference["id"]
    db.commit()

    return schemas.ComprarEntradaMPResponse(
        id_evento=evento.id_evento,
        id_pago=nuevo_pago.id_pago,
        preference_id=preference["id"],
        init_point=preference["init_point"],
        ticket_token=ticket_token,
    )


@router.post(
    "/{id_evento}/comprar-transferencia",
    response_model=schemas.ComprarEntradaTransferenciaResponse,
    summary="Generar pedido de entrada virtual para pago por transferencia bancaria",
)
def comprar_entrada_transferencia(
    id_evento: int,
    payload: Optional[schemas.ComprarEntradaInvitadoPayload] = None,
    db: Session = Depends(get_db),
    usuario: Optional[models.Usuario] = Depends(get_current_user_optional),
) -> schemas.ComprarEntradaTransferenciaResponse:
    evento = _obtener_evento_transmision_o_404(db, id_evento)

    if not evento.tiene_transmision:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este evento no tiene transmisión en vivo habilitada.",
        )

    email_comprador: Optional[str] = None
    entrada_existente: Optional[models.EntradaVirtual] = None

    if usuario:
        email_comprador = usuario.email
        entrada_existente = (
            db.query(models.EntradaVirtual)
            .filter(
                models.EntradaVirtual.id_evento == evento.id_evento,
                models.EntradaVirtual.id_usuario == usuario.id_usuario,
            )
            .first()
        )
        es_socio, _, es_moroso = _estado_socio(usuario, db)
        precio = _precio_aplicable(evento, es_socio, es_moroso)
    else:
        precio = evento.transmision_precio or Decimal("0.00")
        if not payload or not payload.email or not str(payload.email).strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Debés ingresar tu correo electrónico para generar el pedido de entrada.",
            )
        email_comprador = str(payload.email).strip().lower()
        entrada_existente = (
            db.query(models.EntradaVirtual)
            .filter(
                models.EntradaVirtual.id_evento == evento.id_evento,
                models.EntradaVirtual.email_invitado == email_comprador,
            )
            .first()
        )

    ticket_token = (
        entrada_existente.ticket_token
        if (entrada_existente and entrada_existente.ticket_token)
        else secrets.token_urlsafe(24)
    )
    id_usuario_pago = usuario.id_usuario if usuario else settings.sistema_user_id

    nuevo_pago = models.Pago(
        id_usuario=id_usuario_pago,
        monto_total=precio,
        metodo_pago="transferencia",
        estado="pendiente",
    )
    db.add(nuevo_pago)
    db.flush()

    if entrada_existente:
        entrada_existente.id_pago = nuevo_pago.id_pago
        entrada_existente.ticket_token = ticket_token
    else:
        nueva_entrada = models.EntradaVirtual(
            id_evento=evento.id_evento,
            id_usuario=usuario.id_usuario if usuario else None,
            email_invitado=email_comprador if not usuario else None,
            ticket_token=ticket_token,
            id_pago=nuevo_pago.id_pago,
        )
        db.add(nueva_entrada)

    db.commit()

    return schemas.ComprarEntradaTransferenciaResponse(
        id_evento=evento.id_evento,
        id_pago=nuevo_pago.id_pago,
        monto=precio,
        mensaje=(
            f"Pedido #{nuevo_pago.id_pago} registrado. Realizá la transferencia "
            "por el monto indicado con tu alias/CBU oficial y envianos el comprobante."
        ),
        ticket_token=ticket_token,
    )


# ─────────────────────────────────────────────────────────────────────────────
# GESTIÓN Y MÉTRICAS (STAFF / ADMIN / TÉCNICO)
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/{id_evento}/espectadores",
    summary="Métricas de audiencia y entradas vendidas para el partido",
)
def obtener_metricas_espectadores(
    id_evento: int,
    db: Session = Depends(get_db),
    _staff: models.Usuario = Depends(require_roles(*_ROLES_STAFF)),
):
    evento = _obtener_evento_transmision_o_404(db, id_evento)

    hace_un_minuto = datetime.now(timezone.utc) - timedelta(seconds=60)

    # Entradas emitidas
    entradas = (
        db.query(models.EntradaVirtual)
        .options(
            joinedload(models.EntradaVirtual.usuario),
            joinedload(models.EntradaVirtual.pago),
        )
        .filter(models.EntradaVirtual.id_evento == id_evento)
        .all()
    )

    total_entradas = len(entradas)
    espectadores_activos = sum(
        1 for e in entradas
        if e.ultimo_heartbeat_at is not None and e.ultimo_heartbeat_at >= hace_un_minuto
    )

    entradas_pagas = sum(1 for e in entradas if e.id_pago is not None)
    recaudacion_estimada = sum(
        (e.pago.monto_total for e in entradas if e.pago and e.pago.estado == "verificado"),
        Decimal("0.00"),
    )

    return {
        "id_evento": evento.id_evento,
        "titulo": evento.titulo,
        "transmision_estado": evento.transmision_estado,
        "espectadores_activos": espectadores_activos,
        "total_espectadores_registrados": total_entradas,
        "entradas_pagas": entradas_pagas,
        "recaudacion_verificada": float(recaudacion_estimada),
        "espectadores": [
            {
                "id_entrada": e.id_entrada,
                "id_usuario": e.usuario.id_usuario if e.usuario else None,
                "nombre": f"{e.usuario.nombre} {e.usuario.apellido}" if e.usuario else (e.email_invitado or "Invitado"),
                "email": e.usuario.email if e.usuario else e.email_invitado,
                "ticket_token": e.ticket_token,
                "link_acceso": (
                    f"{settings.frontend_url}/en-vivo/{evento.id_evento}?ticket={e.ticket_token}"
                    if e.ticket_token
                    else f"{settings.frontend_url}/en-vivo/{evento.id_evento}"
                ),
                "ultimo_heartbeat": e.ultimo_heartbeat_at.isoformat() if e.ultimo_heartbeat_at else None,
                "en_linea": bool(e.ultimo_heartbeat_at and e.ultimo_heartbeat_at >= hace_un_minuto),
                "id_pago": e.id_pago,
                "estado_pago": e.pago.estado if e.pago else "cortesia",
                "metodo_pago": e.pago.metodo_pago if e.pago else "manual",
                "monto": float(e.pago.monto_total) if (e.pago and e.pago.monto_total) else 0.0,
                "creado_at": e.creado_at.isoformat() if e.creado_at else None,
                "tipo_acceso": "invitado_pago" if not e.usuario else ("pago" if e.id_pago else "socio_o_cortesia"),
            }
            for e in entradas
        ],
    }


@router.post(
    "/{id_evento}/dar-acceso-manual",
    summary="Emitir o habilitar entrada virtual manualmente (Staff)",
)
def dar_acceso_manual(
    id_evento: int,
    payload: schemas.DarAccesoManualPayload,
    db: Session = Depends(get_db),
    _staff: models.Usuario = Depends(require_roles(*_ROLES_STAFF)),
):
    evento = _obtener_evento_transmision_o_404(db, id_evento)

    if not payload.id_usuario and not (payload.email and str(payload.email).strip()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Debés indicar un socio (id_usuario) o un correo electrónico de invitado.",
        )

    entrada = None
    email_dest = None
    nombre_dest = payload.nombre or "Hincha"

    if payload.id_usuario:
        usuario = db.query(models.Usuario).filter(models.Usuario.id_usuario == payload.id_usuario).first()
        if not usuario:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado.")
        email_dest = usuario.email
        nombre_dest = f"{usuario.nombre} {usuario.apellido}"
        entrada = (
            db.query(models.EntradaVirtual)
            .filter(
                models.EntradaVirtual.id_evento == id_evento,
                models.EntradaVirtual.id_usuario == usuario.id_usuario,
            )
            .first()
        )
    else:
        email_dest = str(payload.email).strip().lower()
        entrada = (
            db.query(models.EntradaVirtual)
            .filter(
                models.EntradaVirtual.id_evento == id_evento,
                models.EntradaVirtual.email_invitado == email_dest,
            )
            .first()
        )

    ticket_token = secrets.token_urlsafe(24)

    if entrada:
        # Si tenía pago pendiente y lo aprueban manualmente o le dan cortesía
        if entrada.pago and entrada.pago.estado != "verificado":
            entrada.pago.estado = "verificado"
            entrada.pago.fecha_pago = datetime.now(timezone.utc)
        if not entrada.ticket_token:
            entrada.ticket_token = ticket_token
        else:
            ticket_token = entrada.ticket_token
    else:
        entrada = models.EntradaVirtual(
            id_evento=id_evento,
            id_usuario=payload.id_usuario,
            email_invitado=email_dest if not payload.id_usuario else None,
            ticket_token=ticket_token,
            id_pago=None,  # Cortesía / Habilitación directa por Staff
        )
        db.add(entrada)

    db.commit()
    db.refresh(entrada)

    link = f"{settings.frontend_url}/en-vivo/{id_evento}?ticket={entrada.ticket_token}"
    rival_str = f" vs {evento.rival}" if evento.rival else ""
    mensaje_wa = (
        f"¡Hola {nombre_dest}! ⚽ Acá tenés tu entrada para ver Club Atlético Roberts{rival_str} en vivo.\n\n"
        f"Ingresá directamente desde este link en tu celular o Smart TV:\n{link}\n\n"
        f"¡Vamos CAR!"
    )

    return {
        "ok": True,
        "id_entrada": entrada.id_entrada,
        "id_evento": entrada.id_evento,
        "id_usuario": entrada.id_usuario,
        "email": email_dest,
        "nombre": nombre_dest,
        "ticket_token": entrada.ticket_token,
        "link_acceso": link,
        "mensaje_whatsapp": mensaje_wa,
    }


@router.patch(
    "/entradas/{id_entrada}/aprobar",
    summary="Aprobar pago de entrada virtual pendiente (Staff)",
)
def aprobar_pago_entrada(
    id_entrada: int,
    db: Session = Depends(get_db),
    _staff: models.Usuario = Depends(require_roles(*_ROLES_STAFF)),
):
    entrada = (
        db.query(models.EntradaVirtual)
        .options(joinedload(models.EntradaVirtual.pago))
        .filter(models.EntradaVirtual.id_entrada == id_entrada)
        .first()
    )
    if not entrada:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entrada no encontrada.")

    if entrada.pago:
        entrada.pago.estado = "verificado"
        entrada.pago.fecha_pago = datetime.now(timezone.utc)

    db.commit()
    db.refresh(entrada)

    link = (
        f"{settings.frontend_url}/en-vivo/{entrada.id_evento}?ticket={entrada.ticket_token}"
        if entrada.ticket_token
        else f"{settings.frontend_url}/en-vivo/{entrada.id_evento}"
    )

    return {
        "ok": True,
        "id_entrada": entrada.id_entrada,
        "estado": "verificado",
        "ticket_token": entrada.ticket_token,
        "link_acceso": link,
    }


@router.delete(
    "/entradas/{id_entrada}",
    summary="Revocar / eliminar entrada virtual (Staff)",
)
def revocar_entrada(
    id_entrada: int,
    db: Session = Depends(get_db),
    _staff: models.Usuario = Depends(require_roles(*_ROLES_STAFF)),
):
    entrada = (
        db.query(models.EntradaVirtual)
        .filter(models.EntradaVirtual.id_entrada == id_entrada)
        .first()
    )
    if not entrada:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entrada no encontrada.")

    db.delete(entrada)
    db.commit()
    return {"ok": True, "mensaje": "Entrada revocada exitosamente."}


@router.patch(
    "/{id_evento}/estado",
    summary="Cambiar estado de transmisión en vivo (Staff)",
)
def actualizar_estado_transmision(
    id_evento: int,
    estado: str = Query(..., description="programada | en_vivo | pausada | finalizada"),
    video_id: Optional[str] = Query(default=None, description="Nuevo ID o URL de video si cambia"),
    db: Session = Depends(get_db),
    _staff: models.Usuario = Depends(require_roles(*_ROLES_STAFF)),
):
    if estado not in schemas.ESTADOS_TRANSMISION:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Estado inválido. Opciones: {schemas.ESTADOS_TRANSMISION}",
        )

    evento = _obtener_evento_transmision_o_404(db, id_evento)
    evento.transmision_estado = estado
    if video_id is not None:
        evento.transmision_video_id = video_id

    db.commit()
    db.refresh(evento)

    return {
        "id_evento": evento.id_evento,
        "transmision_estado": evento.transmision_estado,
        "mensaje": f"Estado de transmisión actualizado a '{estado}'.",
    }


@router.get(
    "/buscar-usuarios",
    summary="Buscar usuarios/socios para asignación manual de entradas (Staff)",
)
def buscar_usuarios_transmision(
    q: str = Query(default="", min_length=0, description="Buscar por nombre, apellido, DNI o email"),
    db: Session = Depends(get_db),
    _staff: models.Usuario = Depends(require_roles(*_ROLES_STAFF)),
):
    query = (
        db.query(models.Usuario)
        .options(joinedload(models.Usuario.roles_asignados).joinedload(models.UsuarioRol.rol))
        .filter(models.Usuario.fecha_baja.is_(None))
    )

    q_clean = q.strip()
    if q_clean:
        filtro = f"%{q_clean}%"
        query = query.filter(
            (models.Usuario.nombre.ilike(filtro))
            | (models.Usuario.apellido.ilike(filtro))
            | (models.Usuario.dni.ilike(filtro))
            | (models.Usuario.email.ilike(filtro))
        )

    usuarios = query.order_by(models.Usuario.apellido, models.Usuario.nombre).limit(20).all()

    hoy = date.today()
    resultados = []
    for u in usuarios:
        roles_u = {ur.rol.nombre for ur in u.roles_asignados if ur.rol}
        es_socio = "socio" in roles_u or getattr(u, "tipo_socio", None) is not None
        socio_al_dia = bool(
            u.es_becado
            or (u.mes_cubierto_hasta is not None and hoy <= u.mes_cubierto_hasta)
        )
        resultados.append({
            "id_usuario": u.id_usuario,
            "nombre": u.nombre,
            "apellido": u.apellido,
            "nombre_completo": f"{u.apellido}, {u.nombre}",
            "dni": u.dni,
            "email": u.email,
            "telefono": u.telefono,
            "es_socio": es_socio,
            "socio_al_dia": socio_al_dia,
            "mes_cubierto_hasta": u.mes_cubierto_hasta.isoformat() if u.mes_cubierto_hasta else None,
            "es_becado": u.es_becado,
        })

    return resultados

