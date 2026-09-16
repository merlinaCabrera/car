# backend/routers/admin_productos.py
"""
Router de administración de catálogo — Productos y Servicios.

Endpoints:
  GET   /admin/productos              → Listado completo (incluye inactivos).
  POST  /admin/productos              → Alta de producto/servicio.
  PATCH /admin/productos/{id_producto}→ Edición parcial (precio, stock,
                                          es_activo, etc.).

Acá viven también los endpoints de ConfiguracionGlobal, porque comparten
pantalla en el frontend (/admin/productos es "Catálogo y Configuración"):
  GET   /admin/productos/configuracion/dia-vencimiento
  PATCH /admin/productos/configuracion/dia-vencimiento
  GET   /admin/productos/configuracion/descuento-menor
  PATCH /admin/productos/configuracion/descuento-menor
  GET   /admin/productos/configuracion/recordatorio   → plantilla + alias
  PATCH /admin/productos/configuracion/recordatorio

Todos los endpoints requieren rol 'admin_general' o 'personal_administrativo'.

Decisiones técnicas:
  - El catálogo es unificado (cuota_social, alquiler, indumentaria, otro),
    tal como está modelado en ProductoServicio — no se filtra por categoría
    acá; para eso el frontend puede filtrar client-side o pedirlo como query
    param si más adelante hace falta.
  - No hay baja física: "eliminar" un producto se hace alternando es_activo
    vía PATCH, igual que en admin_comercios.py. Esto es intencional porque
    ProductoServicio.id_producto está referenciado desde DetalleOrden — un
    DELETE real rompería el historial de órdenes ya facturadas.
  - PATCH usa exclude_unset=True: solo se tocan los campos que el admin
    realmente envió (por ejemplo, cambiar únicamente el precio sin
    resetear el resto).
"""

from __future__ import annotations

from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from dependencies import get_current_user, require_roles
from utils.recordatorios import (
    MAX_LARGO_PLANTILLA,
    PLANTILLA_DEFAULT,
    VARIABLES_PLANTILLA,
    obtener_plantilla,
    renderizar_plantilla,
)

router = APIRouter(
    prefix="/admin/productos",
    tags=["Admin — Productos y Servicios"],
)

_ROLES_ADMIN_PRODUCTOS = ("admin_general", "personal_administrativo")
_ROLES_ADMIN_GENERAL = ("admin_general",)


# ─── Schemas locales ──────────────────────────────────────────────────────────

class DiaVencimientoResponse(BaseModel):
    dia_vencimiento_cuota: int


class DiaVencimientoUpdatePayload(BaseModel):
    dia_vencimiento_cuota: int = Field(
        ge=1, le=28, description="Día de vencimiento (1-28)"
    )


class DescuentoMenorResponse(BaseModel):
    descuento_menor_pct: Decimal


class DescuentoMenorUpdatePayload(BaseModel):
    descuento_menor_pct: Decimal = Field(
        ge=Decimal("0"), le=Decimal("100"),
        description="Porcentaje (0-100) de descuento en la cuota social para menores de 18 años.",
    )
    

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


def _obtener_producto_o_404(db: Session, id_producto: int) -> models.ProductoServicio:
    producto = (
        db.query(models.ProductoServicio)
        .filter(models.ProductoServicio.id_producto == id_producto)
        .first()
    )
    if producto is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No existe un producto/servicio con id {id_producto}.",
        )
    return producto


# ─── ENDPOINT: Listar productos ───────────────────────────────────────────────

@router.get(
    "",
    response_model=List[schemas.ProductoServicioResponse],
    summary="Listar todos los productos/servicios (incluye inactivos y cuota_social)",
)
def listar_productos(
    db: Session = Depends(get_db),
    _admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN_PRODUCTOS)),
) -> List[models.ProductoServicio]:
    return (
        db.query(models.ProductoServicio)
        .order_by(models.ProductoServicio.id_producto.desc())
        .all()
    )


# ─── ENDPOINT: Crear producto ─────────────────────────────────────────────────

@router.post(
    "",
    response_model=schemas.ProductoServicioResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Dar de alta un producto o servicio",
)
def crear_producto(
    payload: schemas.ProductoServicioCreate,
    request: Request,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN_PRODUCTOS)),
) -> models.ProductoServicio:
    nuevo = models.ProductoServicio(
        nombre=payload.nombre,
        categoria=payload.categoria,
        descripcion=payload.descripcion,
        precio_actual=payload.precio_actual,
        stock=payload.stock,
        es_activo=payload.es_activo,
        imagen_url=payload.imagen_url,
    )
    db.add(nuevo)
    db.flush()  # para obtener id_producto antes del commit

    _registrar_audit(
        db=db,
        actor_id=admin.id_usuario,
        accion="CREAR_PRODUCTO",
        tabla_afectada="productos_servicios",
        registro_id=nuevo.id_producto,
        detalle={"despues": payload.model_dump(mode="json")},
        ip=_extraer_ip(request),
    )
    db.commit()
    db.refresh(nuevo)

    return nuevo


# ─── ENDPOINTS: Configuración Global ──────────────────────────────────────────

@router.get(
    "/configuracion/dia-vencimiento",
    response_model=DiaVencimientoResponse,
    summary="Obtener el día de vencimiento de las cuotas",
    tags=["Admin — Configuración Global"],
)
def obtener_dia_vencimiento(
    db: Session = Depends(get_db),
    _admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN_PRODUCTOS)),
) -> DiaVencimientoResponse:
    """
    Devuelve el día del mes configurado globalmente para el vencimiento de cuotas.
    Si no hay configuración, devuelve 10 por defecto.
    """
    config = db.query(models.ConfiguracionGlobal).first()
    dia = config.dia_vencimiento_cuota if config else 10
    return DiaVencimientoResponse(dia_vencimiento_cuota=dia)


@router.patch(
    "/configuracion/dia-vencimiento",
    response_model=schemas.ConfiguracionGlobalResponse,
    summary="Actualizar el día de vencimiento de las cuotas",
    tags=["Admin — Configuración Global"],
)
def actualizar_dia_vencimiento(
    payload: DiaVencimientoUpdatePayload,
    request: Request,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN_GENERAL)),
) -> models.ConfiguracionGlobal:
    """
    Actualiza el día de vencimiento global. Si no existe una configuración,
    la crea. Esta operación requiere rol 'admin_general'.
    """
    config = db.query(models.ConfiguracionGlobal).first()
    
    antes = {
        "dia_vencimiento_cuota": config.dia_vencimiento_cuota if config else None
    }

    if config:
        config.dia_vencimiento_cuota = payload.dia_vencimiento_cuota
        config.actualizado_por = admin.id_usuario
        config.actualizado_at = func.now()
    else:
        producto_cuota = db.query(models.ProductoServicio).filter(
            models.ProductoServicio.categoria == "cuota_social",
            models.ProductoServicio.es_activo.is_(True)
        ).first()
        valor_base = producto_cuota.precio_actual if producto_cuota else Decimal("10000.00")

        config = models.ConfiguracionGlobal(
            valor_cuota_base=valor_base,
            dia_vencimiento_cuota=payload.dia_vencimiento_cuota,
            actualizado_por=admin.id_usuario,
            actualizado_at=func.now()
        )
        db.add(config)
        db.flush()

    _registrar_audit(
        db=db, actor_id=admin.id_usuario, accion="EDITAR_CONFIG_GLOBAL",
        tabla_afectada="configuracion_global", registro_id=config.id,
        detalle={"antes": antes, "despues": {"dia_vencimiento_cuota": payload.dia_vencimiento_cuota}},
        ip=_extraer_ip(request),
    )
    db.commit()
    db.refresh(config)
    return config


@router.get(
    "/configuracion/descuento-menor",
    response_model=DescuentoMenorResponse,
    summary="Obtener el % de descuento de cuota para socios menores de 18 años",
    tags=["Admin — Configuración Global"],
)
def obtener_descuento_menor(
    db: Session = Depends(get_db),
    _admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN_PRODUCTOS)),
) -> DescuentoMenorResponse:
    """
    Devuelve el porcentaje configurado globalmente para el descuento de
    cuota social a menores de edad. Si no hay configuración, devuelve 40
    por defecto (mismo valor que estaba hardcodeado antes de esta config).
    """
    config = db.query(models.ConfiguracionGlobal).first()
    pct = config.descuento_menor_pct if config else Decimal("40")
    return DescuentoMenorResponse(descuento_menor_pct=pct)


@router.patch(
    "/configuracion/descuento-menor",
    response_model=schemas.ConfiguracionGlobalResponse,
    summary="Actualizar el % de descuento de cuota para socios menores de 18 años",
    tags=["Admin — Configuración Global"],
)
def actualizar_descuento_menor(
    payload: DescuentoMenorUpdatePayload,
    request: Request,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN_GENERAL)),
) -> models.ConfiguracionGlobal:
    """
    Actualiza el % de descuento para menores. Si no existe una
    configuración, la crea. Requiere rol 'admin_general'.

    Efecto inmediato: socio_cuotas.py y admin_pagos.py leen este valor en
    cada cálculo de precio de cuota (no hay caché) — el cambio aplica
    desde la próxima vez que un socio menor consulte su estado o genere
    una orden de pago, sin necesidad de reiniciar el backend.
    """
    config = db.query(models.ConfiguracionGlobal).first()

    antes = {
        "descuento_menor_pct": config.descuento_menor_pct if config else None
    }

    if config:
        config.descuento_menor_pct = payload.descuento_menor_pct
        config.actualizado_por = admin.id_usuario
        config.actualizado_at = func.now()
    else:
        producto_cuota = db.query(models.ProductoServicio).filter(
            models.ProductoServicio.categoria == "cuota_social",
            models.ProductoServicio.es_activo.is_(True)
        ).first()
        valor_base = producto_cuota.precio_actual if producto_cuota else Decimal("10000.00")

        config = models.ConfiguracionGlobal(
            valor_cuota_base=valor_base,
            descuento_menor_pct=payload.descuento_menor_pct,
            actualizado_por=admin.id_usuario,
            actualizado_at=func.now()
        )
        db.add(config)
        db.flush()

    _registrar_audit(
        db=db, actor_id=admin.id_usuario, accion="EDITAR_CONFIG_GLOBAL",
        tabla_afectada="configuracion_global", registro_id=config.id,
        detalle={"antes": antes, "despues": {"descuento_menor_pct": str(payload.descuento_menor_pct)}},
        ip=_extraer_ip(request),
    )
    db.commit()
    db.refresh(config)
    return config

# ─── ENDPOINTS: Recordatorio de cuota (plantilla + alias) ─────────────────────
#
# La misma plantilla alimenta los dos caminos de aviso al socio moroso:
#   · el deep link de WhatsApp de /admin/usuarios/{id}/whatsapp-recordatorio
#   · el mail masivo de POST /admin/cuotas/aviso-mail-masivo
# El texto se renderiza en utils/recordatorios.py, que es el único lugar que
# sabe cómo se arma el mensaje.

#: Socio de mentira para la vista previa. Los valores son evidentemente
#: inventados a propósito: el admin tiene que ver que es un ejemplo y no
#: confundirlo con un mensaje que ya se mandó.
_EJEMPLO_VISTA_PREVIA = {
    "nombre": "Juan",
    "meses": "3",
    "mes": "julio",
    "monto": "37.500",
    "link_pago": "https://www.clubatleticoroberts.com/socio/cuotas",
}


def _armar_respuesta_recordatorio(
    config: Optional[models.ConfiguracionGlobal],
) -> schemas.ConfiguracionRecordatorioResponse:
    plantilla = obtener_plantilla(config)
    alias = config.alias_transferencia if config else None

    return schemas.ConfiguracionRecordatorioResponse(
        plantilla=plantilla,
        es_default=not (config and config.plantilla_recordatorio),
        alias_transferencia=alias,
        whatsapp_club=config.whatsapp_club if config else None,
        variables_disponibles=list(VARIABLES_PLANTILLA),
        vista_previa=renderizar_plantilla(
            plantilla, {**_EJEMPLO_VISTA_PREVIA, "alias": alias or "club.atletico.roberts"},
        ),
    )


@router.get(
    "/configuracion/recordatorio",
    response_model=schemas.ConfiguracionRecordatorioResponse,
    summary="Obtener la plantilla del recordatorio de cuota y el alias del club",
    tags=["Admin — Configuración Global"],
)
def obtener_config_recordatorio(
    db: Session = Depends(get_db),
    _admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN_PRODUCTOS)),
) -> schemas.ConfiguracionRecordatorioResponse:
    """
    Devuelve la plantilla vigente, el alias de transferencia y una vista
    previa con datos de ejemplo.

    Si nunca se editó nada, `plantilla` trae la de fábrica y `es_default`
    viene en True. Nunca devuelve la plantilla vacía: el frontend siempre
    tiene algo que mostrar en el textarea.
    """
    return _armar_respuesta_recordatorio(db.query(models.ConfiguracionGlobal).first())


@router.patch(
    "/configuracion/recordatorio",
    response_model=schemas.ConfiguracionRecordatorioResponse,
    summary="Actualizar la plantilla del recordatorio de cuota y el alias del club",
    tags=["Admin — Configuración Global"],
)
def actualizar_config_recordatorio(
    payload: schemas.ConfiguracionRecordatorioUpdatePayload,
    request: Request,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN_GENERAL)),
) -> schemas.ConfiguracionRecordatorioResponse:
    """
    Guarda plantilla, alias y/o número de WhatsApp de la secretaría. Requiere
    rol 'admin_general', igual que el resto de la configuración global.

    `whatsapp_club` es informativo y se guarda tal cual se escribió: no se
    normaliza como el teléfono del socio (`normalizar_telefono_ar`) porque no
    va a formar parte de ninguna URL — lo lee una persona para saber desde qué
    celular de la secretaría mandar los mensajes.

    Semántica de los campos (los tres son opcionales):
      · ausente        → no se toca.
      · cadena vacía   → se borra (NULL). Para la plantilla eso significa
                         volver a la de fábrica, no quedarse sin mensaje.
      · con contenido  → se guarda tal cual, con los espacios de los bordes
                         recortados.

    Validación de la plantilla: se exige que mencione `{monto}` y `{mes}`. Sin
    esos dos el recordatorio no dice cuánto se debe ni de cuándo, y el socio
    recibe un mensaje inútil que además obliga a un ida y vuelta con la
    administración. Las demás variables son opcionales.
    """
    config = db.query(models.ConfiguracionGlobal).first()

    plantilla_nueva: Optional[str] = None
    if payload.plantilla is not None:
        plantilla_nueva = payload.plantilla.strip() or None
        if plantilla_nueva:
            if len(plantilla_nueva) > MAX_LARGO_PLANTILLA:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"La plantilla no puede superar los {MAX_LARGO_PLANTILLA} caracteres.",
                )
            faltantes = [v for v in ("mes", "monto") if "{" + v + "}" not in plantilla_nueva]
            if faltantes:
                nombres = " y ".join("{" + f + "}" for f in faltantes)
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=(
                        f"La plantilla tiene que incluir {nombres}. Sin eso el socio "
                        "no sabe cuánto debe ni de qué período."
                    ),
                )

    alias_nuevo: Optional[str] = None
    if payload.alias_transferencia is not None:
        alias_nuevo = payload.alias_transferencia.strip() or None

    whatsapp_nuevo: Optional[str] = None
    if payload.whatsapp_club is not None:
        whatsapp_nuevo = payload.whatsapp_club.strip() or None

    antes = {
        "plantilla_recordatorio": config.plantilla_recordatorio if config else None,
        "alias_transferencia": config.alias_transferencia if config else None,
        "whatsapp_club": config.whatsapp_club if config else None,
    }

    if config is None:
        # Misma salvaguarda que los otros PATCH de configuración: si la fila
        # singleton todavía no existe, se crea tomando el precio del producto
        # de cuota social como valor base.
        producto_cuota = db.query(models.ProductoServicio).filter(
            models.ProductoServicio.categoria == "cuota_social",
            models.ProductoServicio.es_activo.is_(True),
        ).first()
        config = models.ConfiguracionGlobal(
            valor_cuota_base=producto_cuota.precio_actual if producto_cuota else Decimal("10000.00"),
            actualizado_por=admin.id_usuario,
            actualizado_at=func.now(),
        )
        db.add(config)
        db.flush()

    if payload.plantilla is not None:
        config.plantilla_recordatorio = plantilla_nueva
    if payload.alias_transferencia is not None:
        config.alias_transferencia = alias_nuevo
    if payload.whatsapp_club is not None:
        config.whatsapp_club = whatsapp_nuevo
    config.actualizado_por = admin.id_usuario
    config.actualizado_at = func.now()

    _registrar_audit(
        db=db, actor_id=admin.id_usuario, accion="EDITAR_CONFIG_GLOBAL",
        tabla_afectada="configuracion_global", registro_id=config.id,
        detalle={
            "antes": antes,
            "despues": {
                "plantilla_recordatorio": config.plantilla_recordatorio,
                "alias_transferencia": config.alias_transferencia,
                "whatsapp_club": config.whatsapp_club,
            },
        },
        ip=_extraer_ip(request),
    )
    db.commit()
    db.refresh(config)
    return _armar_respuesta_recordatorio(config)


# ─── ENDPOINT: Editar producto (PATCH parcial) ────────────────────────────────

@router.patch(
    "/{id_producto}",
    response_model=schemas.ProductoServicioResponse,
    summary="Editar parcialmente un producto/servicio (precio, stock, es_activo, etc.)",
)
def editar_producto(
    id_producto: int,
    payload: schemas.ProductoServicioUpdate,
    request: Request,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN_PRODUCTOS)),
) -> models.ProductoServicio:
    producto = _obtener_producto_o_404(db, id_producto)

    cambios = payload.model_dump(exclude_unset=True)
    if not cambios:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se envió ningún campo para actualizar.",
        )

    antes = {
        "nombre": producto.nombre,
        "categoria": producto.categoria,
        "descripcion": producto.descripcion,
        "precio_actual": str(producto.precio_actual),
        "stock": producto.stock,
        "es_activo": producto.es_activo,
        "imagen_url": producto.imagen_url,
    }

    for campo, valor in cambios.items():
        setattr(producto, campo, valor)

    _registrar_audit(
        db=db,
        actor_id=admin.id_usuario,
        accion="EDITAR_PRODUCTO",
        tabla_afectada="productos_servicios",
        registro_id=producto.id_producto,
        detalle={
            "antes": antes,
            "despues": {
                k: (str(v) if k == "precio_actual" else v)
                for k, v in cambios.items()
            },
        },
        ip=_extraer_ip(request),
    )
    db.commit()
    db.refresh(producto)

    return producto