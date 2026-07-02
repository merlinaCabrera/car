# backend/routers/socio_cuotas.py
"""
Router de autogestión de Cuotas Sociales — pantalla "Mis Cuotas" del socio.

Endpoints:
  GET  /socio/cuotas/estado           → Estado financiero del socio logueado.
  GET  /socio/cuotas/historial        → Historial de pagos de cuota ya aprobados.
  POST /socio/cuotas/generar-orden    → El socio pide pagar N meses (queda pendiente
                                          de verificación por un admin, o de que suba
                                          comprobante — igual que cualquier otra orden).

Todos los endpoints requieren rol 'socio'.

Decisiones técnicas:
  - Igual que en admin_pagos.py, el precio de referencia es siempre
    ProductoServicio.precio_actual (categoria='cuota_social'), porque es el
    valor que se congela en cada DetalleOrden.
  - generar-orden crea la orden en estado 'pendiente_verificacion' (NO
    'aprobada' — a diferencia del cobro manual de admin_pagos, acá no hay
    plata en mano todavía; el socio tiene que subir comprobante o coordinar
    el pago, y un admin la aprueba después). No toca deuda_historica_meses:
    eso solo se actualiza cuando la orden pasa a 'aprobada'.
  - Se bloquea la creación de una nueva orden de cuota si el socio ya tiene
    una orden de cuota 'pendiente_verificacion' sin resolver, para evitar
    duplicados que el admin tendría que desenredar a mano.
  - El historial solo muestra órdenes 'aprobada' (pagos confirmados), no
    intentos pendientes ni rechazados — para eso está la bandeja de "Mis
    Órdenes" general, si existe.
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from pathlib import Path
from typing import List, Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Request,
    UploadFile,
    status,
)
from sqlalchemy.orm import Session, joinedload

import models
import schemas
from database import get_db
from dependencies import get_current_user, require_roles

router = APIRouter(
    prefix="/socio/cuotas",
    tags=["Socio — Mis Cuotas"],
)

_ROLES_SOCIO = ("socio",)

# ─── Configuración de subida de comprobantes ─────────────────────────────────
# Debe coincidir con el directorio creado/montado en main.py
# (os.makedirs(...) al arrancar la app y app.mount("/uploads", ...)).
UPLOAD_DIR = Path("uploads/comprobantes")
_EXTENSIONES_PERMITIDAS = {".jpg", ".jpeg", ".png", ".pdf", ".webp"}
_CONTENT_TYPES_PERMITIDOS = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
}
_TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024  # 10 MB


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _extraer_ip(request: Request) -> Optional[str]:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return getattr(request.client, "host", None)


def _registrar_audit(
    *,
    db: Session,
    actor_id: int,
    accion: str,
    tabla_afectada: str,
    registro_id: Optional[int],
    detalle: dict,
    ip: Optional[str] = None,
) -> None:
    db.add(
        models.AuditLog(
            usuario_actor=actor_id,
            accion=accion,
            tabla_afectada=tabla_afectada,
            registro_id=registro_id,
            detalle=detalle,
            ip_origen=ip,
        )
    )


def _obtener_producto_cuota_social(db: Session) -> models.ProductoServicio:
    """Mismo criterio que admin_pagos.py: producto activo más reciente."""
    producto = (
        db.query(models.ProductoServicio)
        .filter(
            models.ProductoServicio.categoria == "cuota_social",
            models.ProductoServicio.es_activo.is_(True),
        )
        .order_by(models.ProductoServicio.id_producto.desc())
        .first()
    )
    if producto is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "No existe un producto activo con categoria='cuota_social'. "
                "Contactá a administración."
            ),
        )
    return producto


# ─── ENDPOINT: Estado financiero del socio ────────────────────────────────────

@router.get(
    "/estado",
    response_model=schemas.EstadoCuotaSocioResponse,
    summary="Estado actual de la cuota social del socio logueado",
)
def obtener_estado_cuota(
    db: Session = Depends(get_db),
    socio: models.Usuario = Depends(require_roles(*_ROLES_SOCIO)),
) -> schemas.EstadoCuotaSocioResponse:
    producto_cuota = _obtener_producto_cuota_social(db)

    return schemas.EstadoCuotaSocioResponse(
        deuda_historica_meses=socio.deuda_historica_meses,
        mes_cubierto_hasta=socio.mes_cubierto_hasta,
        precio_cuota_actual=producto_cuota.precio_actual,
        deuda_total_pesos=Decimal(socio.deuda_historica_meses) * producto_cuota.precio_actual,
    )


# ─── ENDPOINT: Historial de pagos ─────────────────────────────────────────────

@router.get(
    "/historial",
    response_model=List[schemas.HistorialPagoCuotaResponse],
    summary="Historial de pagos de cuota social ya aprobados",
)
def obtener_historial_pagos(
    db: Session = Depends(get_db),
    socio: models.Usuario = Depends(require_roles(*_ROLES_SOCIO)),
) -> List[schemas.HistorialPagoCuotaResponse]:
    producto_cuota = _obtener_producto_cuota_social(db)

    detalles = (
        db.query(models.DetalleOrden)
        .join(models.Orden, models.DetalleOrden.id_orden == models.Orden.id_orden)
        .options(joinedload(models.DetalleOrden.orden))
        .filter(
            models.Orden.id_usuario == socio.id_usuario,
            models.Orden.estado == "aprobada",
            models.DetalleOrden.id_producto == producto_cuota.id_producto,
        )
        .order_by(models.Orden.aprobada_at.desc())
        .all()
    )

    return [
        schemas.HistorialPagoCuotaResponse(
            id_orden=d.id_orden,
            fecha_pago=d.orden.aprobada_at,
            cantidad_meses=d.cantidad,
            monto_pagado=d.precio_unitario_historico * d.cantidad,
            mes_referencia=d.mes_referencia,
        )
        for d in detalles
    ]


# ─── ENDPOINT: Generar orden de pago ──────────────────────────────────────────

@router.post(
    "/generar-orden",
    response_model=schemas.GenerarOrdenCuotaResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generar una orden de pago por N meses de cuota social",
)
def generar_orden_cuota(
    payload: schemas.GenerarOrdenCuotaPayload,
    request: Request,
    db: Session = Depends(get_db),
    socio: models.Usuario = Depends(require_roles(*_ROLES_SOCIO)),
) -> schemas.GenerarOrdenCuotaResponse:
    producto_cuota = _obtener_producto_cuota_social(db)

    # Evitar duplicados: si ya hay una orden de cuota sin resolver, no dejamos
    # generar otra (el socio debería subir el comprobante de esa o esperar).
    orden_pendiente_existente = (
        db.query(models.Orden.id_orden)
        .join(models.DetalleOrden, models.DetalleOrden.id_orden == models.Orden.id_orden)
        .filter(
            models.Orden.id_usuario == socio.id_usuario,
            models.Orden.estado == "pendiente_verificacion",
            models.DetalleOrden.id_producto == producto_cuota.id_producto,
        )
        .first()
    )
    if orden_pendiente_existente is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Ya tenés una orden de cuota pendiente (#{orden_pendiente_existente.id_orden}). "
                "Subí el comprobante o esperá a que se resuelva antes de generar otra."
            ),
        )

    precio_congelado = producto_cuota.precio_actual
    monto_total = precio_congelado * payload.meses_a_pagar

    nueva_orden = models.Orden(
        id_usuario=socio.id_usuario,
        estado="pendiente_verificacion",
        monto_total=monto_total,
    )
    db.add(nueva_orden)
    db.flush()  # necesitamos nueva_orden.id_orden para el detalle

    detalle = models.DetalleOrden(
        id_orden=nueva_orden.id_orden,
        id_producto=producto_cuota.id_producto,
        cantidad=payload.meses_a_pagar,
        precio_unitario_historico=precio_congelado,
    )
    db.add(detalle)

    _registrar_audit(
        db=db,
        actor_id=socio.id_usuario,
        accion="SOLICITAR_PAGO_CUOTA",
        tabla_afectada="ordenes",
        registro_id=nueva_orden.id_orden,
        detalle={
            "meses_a_pagar": payload.meses_a_pagar,
            "precio_unitario_historico": str(precio_congelado),
            "monto_total": str(monto_total),
        },
        ip=_extraer_ip(request),
    )

    db.commit()
    db.refresh(nueva_orden)

    return schemas.GenerarOrdenCuotaResponse(
        id_orden=nueva_orden.id_orden,
        estado=nueva_orden.estado,
        monto_total=nueva_orden.monto_total,
        meses_a_pagar=payload.meses_a_pagar,
        expira_at=nueva_orden.expira_at,
    )


# ─── ENDPOINT: Subir comprobante de pago ──────────────────────────────────────

@router.post(
    "/ordenes/{id_orden}/comprobante",
    response_model=schemas.ComprobanteUploadResponse,
    summary="Subir el comprobante de pago de una orden propia",
)
async def subir_comprobante(
    id_orden: int,
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    socio: models.Usuario = Depends(require_roles(*_ROLES_SOCIO)),
) -> schemas.ComprobanteUploadResponse:
    orden = (
        db.query(models.Orden)
        .filter(models.Orden.id_orden == id_orden)
        .first()
    )
    if orden is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="La orden indicada no existe.",
        )

    # No revelamos si la orden existe pero es de otro socio: mismo mensaje que "no existe".
    if orden.id_usuario != socio.id_usuario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="La orden indicada no existe.",
        )

    if orden.estado != "pendiente_verificacion":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"No se puede subir comprobante: la orden está en estado "
                f"'{orden.estado}', no 'pendiente_verificacion'."
            ),
        )

    nombre_original = file.filename or ""
    extension = Path(nombre_original).suffix.lower()

    if extension not in _EXTENSIONES_PERMITIDAS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Extensión '{extension or 'desconocida'}' no permitida. "
                f"Formatos aceptados: {', '.join(sorted(_EXTENSIONES_PERMITIDAS))}."
            ),
        )

    if file.content_type not in _CONTENT_TYPES_PERMITIDOS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tipo de archivo '{file.content_type}' no permitido.",
        )

    # Nombre físico con UUID para evitar colisiones y no exponer el nombre original.
    nombre_archivo = f"{uuid.uuid4().hex}{extension}"

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    destino = UPLOAD_DIR / nombre_archivo

    tamano_escrito = 0
    try:
        with destino.open("wb") as buffer:
            while chunk := await file.read(1024 * 1024):
                tamano_escrito += len(chunk)
                if tamano_escrito > _TAMANO_MAXIMO_BYTES:
                    buffer.close()
                    destino.unlink(missing_ok=True)
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="El archivo supera el tamaño máximo permitido (10 MB).",
                    )
                buffer.write(chunk)
    except HTTPException:
        raise
    except Exception:
        destino.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No se pudo guardar el comprobante. Intentá nuevamente.",
        )
    finally:
        await file.close()

    if tamano_escrito == 0:
        destino.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo recibido está vacío.",
        )

    comprobante_url = f"/uploads/comprobantes/{nombre_archivo}"
    comprobante_anterior = orden.comprobante_url
    orden.comprobante_url = comprobante_url

    _registrar_audit(
        db=db,
        actor_id=socio.id_usuario,
        accion="SUBIR_COMPROBANTE_CUOTA",
        tabla_afectada="ordenes",
        registro_id=orden.id_orden,
        detalle={
            "comprobante_url": comprobante_url,
            "comprobante_anterior": comprobante_anterior,
            "nombre_original": nombre_original,
            "tamano_bytes": tamano_escrito,
        },
        ip=_extraer_ip(request),
    )

    db.commit()
    db.refresh(orden)

    return schemas.ComprobanteUploadResponse(
        id_orden=orden.id_orden,
        comprobante_url=orden.comprobante_url,
    )