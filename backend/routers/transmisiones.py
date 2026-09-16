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


def _verificar_acceso_usuario(
    evento: models.Evento,
    usuario: Optional[models.Usuario],
    db: Session,
) -> tuple[bool, str, bool, bool]:
    """
    Evalúa si un usuario tiene autorización para ver la transmisión.
    Retorna: (tiene_acceso, motivo, es_socio, socio_al_dia)
    """
    if not evento.tiene_transmision:
        return False, "sin_transmision", False, False

    # 1. Si la transmisión es pública y abierta
    if evento.transmision_es_publica:
        return True, "transmision_publica", False, False

    if usuario is None:
        return False, "no_autenticado", False, False

    roles_usuario = {ur.rol.nombre for ur in usuario.roles_asignados}
    es_staff = bool(roles_usuario & set(_ROLES_STAFF))
    es_socio = "socio" in roles_usuario or usuario.tipo_socio is not None

    hoy = date.today()
    socio_al_dia = bool(
        usuario.es_becado
        or (usuario.mes_cubierto_hasta is not None and hoy <= usuario.mes_cubierto_hasta)
    )

    # 2. Staff / Admin / Técnico siempre tiene acceso
    if es_staff:
        return True, "admin", es_socio, socio_al_dia

    # 3. Socios al día si la transmisión es gratis para socios
    if evento.transmision_socio_gratis and es_socio and socio_al_dia:
        return True, "socio_al_dia", es_socio, socio_al_dia

    # 4. Verificar si compró entrada virtual
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
            return True, "entrada_comprada", es_socio, socio_al_dia
        # Entrada asociada a un pago
        if entrada.pago and entrada.pago.estado == "verificado":
            return True, "entrada_comprada", es_socio, socio_al_dia
        if entrada.pago and entrada.pago.estado == "pendiente":
            return False, "pago_pendiente", es_socio, socio_al_dia

    return False, "sin_acceso", es_socio, socio_al_dia


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
    "/{id_evento}/acceso",
    response_model=schemas.TransmisionAccesoResponse,
    summary="Verificar derecho de acceso del usuario al stream",
)
def verificar_acceso_stream(
    id_evento: int,
    db: Session = Depends(get_db),
    usuario: Optional[models.Usuario] = Depends(get_current_user_optional),
) -> schemas.TransmisionAccesoResponse:
    evento = _obtener_evento_transmision_o_404(db, id_evento)
    tiene_acceso, motivo, es_socio, socio_al_dia = _verificar_acceso_usuario(evento, usuario, db)

    return schemas.TransmisionAccesoResponse(
        id_evento=evento.id_evento,
        tiene_acceso=tiene_acceso,
        motivo=motivo,
        precio=evento.transmision_precio,
        socio_al_dia=socio_al_dia,
        es_socio=es_socio,
        estado_transmision=evento.transmision_estado,
        transmision_socio_gratis=evento.transmision_socio_gratis,
        transmision_es_publica=evento.transmision_es_publica,
    )


@router.get(
    "/{id_evento}/stream",
    response_model=schemas.TransmisionStreamResponse,
    summary="Iniciar sesión y obtener datos de streaming (Protegido)",
)
def obtener_stream(
    id_evento: int,
    db: Session = Depends(get_db),
    usuario: models.Usuario = Depends(get_current_user),
) -> schemas.TransmisionStreamResponse:
    """
    Valida el acceso. Si está habilitado:
    1. Genera un nuevo `token_sesion` criptográfico único.
    2. Lo almacena en `entradas_virtuales` pisando sesiones anteriores (concurrencia=1).
    3. Retorna la plataforma y el `video_id` / embed junto al token de sesión.
    """
    evento = _obtener_evento_transmision_o_404(db, id_evento)
    tiene_acceso, motivo, _, _ = _verificar_acceso_usuario(evento, usuario, db)

    if not tiene_acceso:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"No tenés acceso a la transmisión de este partido ({motivo}).",
        )

    # Generar nuevo token de sesión
    nuevo_token = secrets.token_urlsafe(32)
    ahora = datetime.now(timezone.utc)

    # Buscar o crear la fila de EntradaVirtual para registrar la sesión
    entrada = (
        db.query(models.EntradaVirtual)
        .filter(
            models.EntradaVirtual.id_evento == evento.id_evento,
            models.EntradaVirtual.id_usuario == usuario.id_usuario,
        )
        .first()
    )

    if not entrada:
        entrada = models.EntradaVirtual(
            id_evento=evento.id_evento,
            id_usuario=usuario.id_usuario,
            id_pago=None,
            token_sesion=nuevo_token,
            ultimo_heartbeat_at=ahora,
        )
        db.add(entrada)
    else:
        entrada.token_sesion = nuevo_token
        entrada.ultimo_heartbeat_at = ahora

    db.commit()

    return schemas.TransmisionStreamResponse(
        id_evento=evento.id_evento,
        plataforma=evento.transmision_plataforma,
        video_id=evento.transmision_video_id or "",
        token_sesion=nuevo_token,
        estado=evento.transmision_estado,
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
    usuario: models.Usuario = Depends(get_current_user),
) -> schemas.HeartbeatResponse:
    """
    El reproductor llama a este endpoint cada 30 segundos.
    Si el token recibido no coincide con el token en la base de datos, significa
    que el usuario abrió la transmisión en otro navegador/dispositivo.
    Retorna 409 Conflict para que el cliente pause la reproducción.
    """
    entrada = (
        db.query(models.EntradaVirtual)
        .filter(
            models.EntradaVirtual.id_evento == id_evento,
            models.EntradaVirtual.id_usuario == usuario.id_usuario,
        )
        .first()
    )

    if not entrada or entrada.token_sesion != payload.token_sesion:
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
    summary="Iniciar compra de entrada virtual con Mercado Pago",
)
def comprar_entrada_mp(
    id_evento: int,
    db: Session = Depends(get_db),
    usuario: models.Usuario = Depends(get_current_user),
) -> schemas.ComprarEntradaMPResponse:
    evento = _obtener_evento_transmision_o_404(db, id_evento)

    if not evento.tiene_transmision:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este evento no tiene transmisión en vivo habilitada.",
        )

    # Verificar si ya tiene entrada verificada
    entrada_existente = (
        db.query(models.EntradaVirtual)
        .options(joinedload(models.EntradaVirtual.pago))
        .filter(
            models.EntradaVirtual.id_evento == evento.id_evento,
            models.EntradaVirtual.id_usuario == usuario.id_usuario,
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

    precio = evento.transmision_precio or Decimal("0.00")

    # Si es gratuita
    if precio <= Decimal("0.00"):
        if not entrada_existente:
            entrada_gratis = models.EntradaVirtual(
                id_evento=evento.id_evento,
                id_usuario=usuario.id_usuario,
                id_pago=None,
            )
            db.add(entrada_gratis)
            db.commit()
        return schemas.ComprarEntradaMPResponse(
            id_evento=evento.id_evento,
            id_pago=0,
            preference_id="free",
            init_point=f"{settings.frontend_url}/en-vivo/{evento.id_evento}",
        )

    # Crear Pago en estado 'pendiente'
    nuevo_pago = models.Pago(
        id_usuario=usuario.id_usuario,
        monto_total=precio,
        metodo_pago="mercado_pago",
        estado="pendiente",
    )
    db.add(nuevo_pago)
    db.flush()

    # Vincular EntradaVirtual al nuevo Pago
    if entrada_existente:
        entrada_existente.id_pago = nuevo_pago.id_pago
    else:
        nueva_entrada = models.EntradaVirtual(
            id_evento=evento.id_evento,
            id_usuario=usuario.id_usuario,
            id_pago=nuevo_pago.id_pago,
        )
        db.add(nueva_entrada)

    # Crear Preference en Mercado Pago
    sdk = mercadopago.SDK(settings.mp_access_token)
    titulo_item = f"Entrada Virtual: CAR vs {evento.rival or 'Partido'} (En Vivo)"[:250]

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
            "success": f"{settings.frontend_url}/en-vivo/{evento.id_evento}?pago=exitoso",
            "failure": f"{settings.frontend_url}/en-vivo/{evento.id_evento}?pago=fallido",
            "pending": f"{settings.frontend_url}/en-vivo/{evento.id_evento}?pago=pendiente",
        },
    }

    if not settings.frontend_url.startswith("http://localhost"):
        preference_data["auto_return"] = "approved"

    if usuario.email:
        preference_data["payer"] = {"email": usuario.email}

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
    )


@router.post(
    "/{id_evento}/comprar-transferencia",
    response_model=schemas.ComprarEntradaTransferenciaResponse,
    summary="Generar pedido de entrada virtual para pago por transferencia bancaria",
)
def comprar_entrada_transferencia(
    id_evento: int,
    db: Session = Depends(get_db),
    usuario: models.Usuario = Depends(get_current_user),
) -> schemas.ComprarEntradaTransferenciaResponse:
    evento = _obtener_evento_transmision_o_404(db, id_evento)

    if not evento.tiene_transmision:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este evento no tiene transmisión en vivo habilitada.",
        )

    precio = evento.transmision_precio or Decimal("0.00")

    entrada_existente = (
        db.query(models.EntradaVirtual)
        .filter(
            models.EntradaVirtual.id_evento == evento.id_evento,
            models.EntradaVirtual.id_usuario == usuario.id_usuario,
        )
        .first()
    )

    nuevo_pago = models.Pago(
        id_usuario=usuario.id_usuario,
        monto_total=precio,
        metodo_pago="transferencia",
        estado="pendiente",
    )
    db.add(nuevo_pago)
    db.flush()

    if entrada_existente:
        entrada_existente.id_pago = nuevo_pago.id_pago
    else:
        nueva_entrada = models.EntradaVirtual(
            id_evento=evento.id_evento,
            id_usuario=usuario.id_usuario,
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
                "id_usuario": e.usuario.id_usuario,
                "nombre": f"{e.usuario.nombre} {e.usuario.apellido}",
                "email": e.usuario.email,
                "ultimo_heartbeat": e.ultimo_heartbeat_at.isoformat() if e.ultimo_heartbeat_at else None,
                "en_linea": bool(e.ultimo_heartbeat_at and e.ultimo_heartbeat_at >= hace_un_minuto),
                "tipo_acceso": "pago" if e.id_pago else "socio_o_cortesia",
            }
            for e in entradas
        ],
    }


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
