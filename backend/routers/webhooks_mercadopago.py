# backend/routers/webhooks_mercadopago.py
"""
Webhook de Mercado Pago — aprobación automática de pagos vía Checkout Pro.

Endpoint:
  POST /webhooks/mercadopago

Mercado Pago notifica el mismo evento en DOS formatos posibles, a veces
ambos para el mismo pago (se vio en pruebas reales):
  - Formato nuevo:  body JSON {"type": "payment", "data": {"id": "..."}}
                     (o esos mismos datos en query params: ?type=payment&data.id=...)
  - Formato legacy: sin body, solo query params: ?topic=payment&id=...
Este endpoint entiende ambos.

Flujo:
  1. Extraer tipo de evento + ID del pago (de body O de query params).
  2. Si no es un evento de pago, ignorar con 200 (para que MP no reintente
     algo que no vamos a procesar — ej. merchant_order).
  3. Validar la firma (X-Signature) contra MP_WEBHOOK_SECRET.
  4. Consultar el pago REAL contra la API de MP (nunca confiar en el body).
  5. Buscar nuestro Pago por external_reference.
  6. Si approved: aprobar automáticamente las Órdenes hijas pendientes,
     reusando la misma lógica que un admin humano (utils/ordenes.py).
  7. Idempotencia por mp_payment_id, para no reprocesar reintentos de MP.

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
    Header X-Signature: "ts=<timestamp>,v1=<hash>"
    Manifest firmado:   "id:{data_id};request-id:{x_request_id};ts:{ts};"

    Si MP_WEBHOOK_SECRET no está configurado, se omite la validación
    (aceptable solo en desarrollo muy temprano, nunca en producción).
    """
    if not settings.mp_webhook_secret:
        return True

    if not x_signature or not data_id:
        print(f"[MP webhook] falta x_signature o data_id (x_signature={x_signature!r}, data_id={data_id!r})")
        return False

    # .strip() en clave y valor: algunos proxies/reintentos agregan espacios
    # después de la coma ("ts=123, v1=abc") que rompían el parseo original.
    partes = {}
    for parte in x_signature.split(","):
        if "=" in parte:
            clave, valor = parte.split("=", 1)
            partes[clave.strip()] = valor.strip()

    ts = partes.get("ts")
    v1_recibido = partes.get("v1")
    if not ts or not v1_recibido:
        print(f"[MP webhook] X-Signature mal formado: {x_signature!r}")
        return False

    manifest = f"id:{data_id};request-id:{x_request_id or ''};ts:{ts};"
    firma_calculada = hmac.new(
        settings.mp_webhook_secret.encode("utf-8"),
        manifest.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    es_valida = hmac.compare_digest(firma_calculada, v1_recibido)
    if not es_valida:
        # Log de diagnóstico — no se expone en la respuesta HTTP, solo en
        # la terminal del servidor, para poder comparar manifest/firmas.
        print(
            "[MP webhook] Firma inválida.\n"
            f"  manifest        = {manifest!r}\n"
            f"  firma_calculada = {firma_calculada}\n"
            f"  firma_recibida  = {v1_recibido}"
        )
    return es_valida


# ─── Extracción de tipo de evento e ID de pago (body O query params) ─────────

def _extraer_tipo_y_data_id(body: dict, query_params) -> tuple[Optional[str], Optional[str]]:
    """
    Devuelve (tipo_evento_normalizado, data_id) soportando:
      - Formato nuevo:  body={"type": "payment", "data": {"id": "..."}}
      - Formato nuevo (query): ?type=payment&data.id=...
      - Formato legacy (query, sin body): ?topic=payment&id=...
    tipo_evento se normaliza siempre a "payment" para cualquiera de las 3
    variantes que representen un evento de pago; cualquier otra cosa
    (merchant_order, etc.) devuelve tal cual para ser ignorada.
    """
    tipo_evento = (
        body.get("type")
        or body.get("topic")
        or query_params.get("type")
        or query_params.get("topic")
    )

    if tipo_evento != "payment":
        return tipo_evento, None

    data_id_raw = (
        body.get("data", {}).get("id")
        or query_params.get("data.id")
        or query_params.get("id")  # formato legacy: ?topic=payment&id=...
    )
    return "payment", (str(data_id_raw) if data_id_raw else None)


# ─── Endpoint ──────────────────────────────────────────────────────────────

@router.post("", status_code=status.HTTP_200_OK, summary="Recibir notificaciones de Mercado Pago")
async def recibir_webhook_mercadopago(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    x_signature: Optional[str] = Header(default=None, alias="x-signature"),
    x_request_id: Optional[str] = Header(default=None, alias="x-request-id"),
) -> dict:
    try:
        body = await request.json()
    except Exception:
        body = {}  # formato legacy: a veces no manda body, solo query params

    tipo_evento, data_id = _extraer_tipo_y_data_id(body, request.query_params)
    print(f"[MP webhook DEBUG] x_signature crudo = {x_signature!r}")
    print(f"[MP webhook DEBUG] x_request_id crudo = {x_request_id!r}")

    if tipo_evento != "payment" or not data_id:
        return {"status": "ignorado", "tipo_evento": tipo_evento}

    if not _validar_firma(x_signature=x_signature, x_request_id=x_request_id, data_id=data_id):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Firma de Mercado Pago inválida.",
        )

    # ── Consultar el pago REAL contra la API de MP ────────────────────────
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
    if pago.mp_payment_id == str(pago_mp.get("id")):
        return {"status": "ya_procesado", "id_pago": pago.id_pago}

    if estado_mp != "approved":
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
        verificar_pendiente(orden)
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