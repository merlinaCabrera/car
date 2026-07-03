# backend/routers/admin_productos.py
"""
Router de administración de catálogo — Productos y Servicios.

Endpoints:
  GET   /admin/productos              → Listado completo (incluye inactivos).
  POST  /admin/productos              → Alta de producto/servicio.
  PATCH /admin/productos/{id_producto}→ Edición parcial (precio, stock,
                                          es_activo, etc.).

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

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from dependencies import get_current_user, require_roles

router = APIRouter(
    prefix="/admin/productos",
    tags=["Admin — Productos y Servicios"],
)

_ROLES_ADMIN_PRODUCTOS = ("admin_general", "personal_administrativo")


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