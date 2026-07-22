# backend/routers/webhooks_mercadopago.py
"""
Webhook de Mercado Pago — aprobación automática de pagos vía Checkout Pro.

Endpoint:
  POST /webhooks/mercadopago

Flujo:
  1. Mercado Pago pega acá cuando el estado de un pago cambia. El body es
     liviano: solo trae el tipo de evento y el ID del pago — NUNCA el
     estado real (por diseño de MP: evita que alguien falsifique un
     webhook diciendo "aprobado" sin haber pagado).
  2. Validamos la firma (header X-Signature) contra MP_WEBHOOK_SECRET.
     Sin esto, cualquiera podría pegarle a esta URL pública simulando un
     pago aprobado sin haber pagado un peso.
  3. Con el ID del pago, consultamos la API de Mercado Pago (nunca
     confiamos en el body del webhook) para obtener el estado REAL.
  4. Buscamos nuestro Pago por external_reference (= id_pago que nosotros
     mismos generamos al crear la Preference en socio_carrito.py).
  5. Si el pago de MP está 'approved': aprobamos automáticamente todas las
     Órdenes hijas de ese Pago que sigan 'pendiente_verificacion', reusando
     EXACTAMENTE la misma lógica de negocio que un admin humano
     (utils/ordenes.py) — actor_id = SISTEMA_USER_ID.
  6. Idempotencia: si pago.mp_payment_id ya coincide con el que llegó, no
     reprocesamos (Mercado Pago reintenta webhooks agresivamente).
  7. Devolvemos 200 rápido en casi todos los casos (incluso 'pending' o
     'rejected'), para que MP no siga reintentando indefinidamente. Solo
     devolvemos error si la firma es inválida.

Registrar en main.py:
    from routers import webhooks_mercadopago
    app.include_router(webhooks_mercadopago.router)
"""
from __future__ import annotations

import hashlib
import hmac
from typing import Optional

import mercadopago
from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session, joinedload

import models
from config import settings
from database import get_db
from utils.ordenes import procesar_aprobacion_orden, verificar_pendiente

router = APIRouter(
    prefix="/webhooks/mercadopago",
    tags=["Webhooks — Mercado Pago"],
)


# ─── Validación de firma ──────────────────────────────────────────────────────

def _validar_firma(
    *,
    x_signature: Optional[str],
    x_request_id: Optional[str],
    data_id: Optional[str],
) -> bool:
    """
    Validación HMAC-SHA256 documentada por Mercado Pago para webhooks.

    El header X-Signature trae: ts=<timestamp>,v1=<hash>
    El "manifest" que se firma es: "id:{data_id};request-id:{x_request_id};ts:{ts};"

    Si MP_WEBHOOK_SECRET todavía no está configurado (antes de dar de alta
    el webhook en el panel de MP), se omite la validación — esto es
    aceptable solo mientras se desarrolla, NUNCA en producción.
    """
    if not settings.mp_webhook_secret:
        return True  # sin secret configurado: no validamos (solo dev temprano)

    if not x_signature or not data_id:
        return False

    partes = dict(
        parte.split("=", 1) for parte in x_signature.split(",") if "=" in parte
    )
    ts = partes.get("ts")
    v1_recibido = partes.get("v1")
    if not ts or not v1_recibido:
        return False

    manifest = f"id:{data_id};request-id:{x_request_id or ''};ts:{ts};"
    firma_calculada = hmac.new(
        settings.mp_webhook_secret.encode("utf-8"),
        manifest.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(firma_calculada, v1_recibido)


# ─── Endpoint ──────────────────────────────────────────────────────────────

@router.post("", status_code=status.HTTP_200_OK, summary="Recibir notificaciones de Mercado Pago")
async def recibir_webhook_mercadopago(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    x_signature: Optional[str] = Header(default=None, alias="x-signature"),
    x_request_id: Optional[str] = Header(default=None, alias="x-request-id"),
) -> dict:
    body = await request.json()

    # MP manda distintos tipos de evento; el que nos interesa es "payment".
    # Otros (merchant_order, etc.) se ignoran devolviendo 200 igual, para
    # que MP no reintente algo que no vamos a procesar.
    tipo_evento = body.get("type") or body.get("topic")
    data_id_raw = body.get("data", {}).get("id") or request.query_params.get("data.id")
    data_id = str(data_id_raw) if data_id_raw else None

    if tipo_evento != "payment" or not data_id:
        return {"status": "ignorado", "motivo": "evento no es de tipo payment"}

    if not _validar_firma(x_signature=x_signature, x_request_id=x_request_id, data_id=data_id):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Firma de Mercado Pago inválida.",
        )

    # ── Consultar el pago REAL contra la API de MP ────────────────────────
    # Nunca confiamos en el body del webhook para el estado — solo lo usamos
    # para saber a qué pago consultar.
    sdk = mercadopago.SDK(settings.mp_access_token)
    try:
        resultado = sdk.payment().get(data_id)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="No se pudo consultar el pago en Mercado Pago.",
        ) from exc

    if resultado.get("status") != 200:
        return {"status": "no_encontrado_en_mp", "mp_payment_id": data_id}

    pago_mp = resultado["response"]
    estado_mp = pago_mp.get("status")  # approved | pending | rejected | in_process | ...
    external_reference = pago_mp.get("external_reference")

    if not external_reference:
        return {"status": "sin_referencia"}

    try:
        id_pago = int(external_reference)
    except (TypeError, ValueError):
        return {"status": "referencia_invalida", "external_reference": external_reference}

    pago = (
        db.query(models.Pago)
        .options(
            joinedload(models.Pago.ordenes)
            .joinedload(models.Orden.detalles)
            .joinedload(models.DetalleOrden.producto),
            joinedload(models.Pago.ordenes)
            .joinedload(models.Orden.detalles)
            .joinedload(models.DetalleOrden.reserva),
            joinedload(models.Pago.ordenes).joinedload(models.Orden.usuario),
        )
        .filter(models.Pago.id_pago == id_pago)
        .first()
    )
    if pago is None:
        return {"status": "pago_no_encontrado", "id_pago": id_pago}

    # ── Idempotencia ────────────────────────────────────────────────────────
    # Mercado Pago reintenta webhooks agresivamente, incluso duplicados del
    # mismo evento. Si ya procesamos este mp_payment_id, no repetimos nada.
    if pago.mp_payment_id == str(pago_mp.get("id")):
        return {"status": "ya_procesado", "id_pago": pago.id_pago}

    if estado_mp != "approved":
        # pending / in_process / rejected: no aprobamos todavía, pero
        # guardamos el payment_id para trazabilidad de a qué intento de
        # pago corresponde este Pago.
        pago.mp_payment_id = str(pago_mp.get("id"))
        db.commit()
        return {"status": "registrado_sin_aprobar", "estado_mp": estado_mp}

    # ── Aprobación automática ─────────────────────────────────────────────
    pago.mp_payment_id = str(pago_mp.get("id"))

    ordenes_a_aprobar = [
        orden for orden in pago.ordenes
        if orden.estado == "pendiente_verificacion"
    ]

    for orden in ordenes_a_aprobar:
        verificar_pendiente(orden)  # defensivo, aunque ya filtramos arriba
        procesar_aprobacion_orden(
            db=db,
            orden=orden,
            actor_id=settings.sistema_user_id,
            background_tasks=background_tasks,
            notas_admin="Aprobado automáticamente por Mercado Pago (Checkout Pro).",
            ip=None,
        )

    db.commit()

    return {
        "status": "aprobado",
        "id_pago": pago.id_pago,
        "ordenes_aprobadas": [o.id_orden for o in ordenes_a_aprobar],
    }