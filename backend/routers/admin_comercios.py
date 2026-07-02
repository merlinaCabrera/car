# backend/routers/admin_comercios.py
"""
Router de administración de Comercios Asociados (beneficios para socios).

Endpoints:
  GET    /admin/comercios              → Listado (con filtro opcional ?solo_activos=true)
  GET    /admin/comercios/{id}         → Detalle de un comercio
  POST   /admin/comercios              → Alta
  PATCH  /admin/comercios/{id}         → Edición parcial
  DELETE /admin/comercios/{id}         → Baja (lógica por defecto, física con ?fisica=true)

Todos los endpoints requieren rol 'admin_general'.

Decisiones técnicas:
  - Por defecto DELETE hace baja lógica (es_activo=False), coherente con el
    resto del sistema (nunca se borra a un Usuario, por ejemplo). Se admite
    baja física opcional vía query param para limpiar registros de prueba.
  - Si se asigna id_usuario_acceso, se valida que el Usuario exista.
  - Cada operación de escritura deja rastro en audit_log, igual que el resto
    de los routers administrativos del sistema.
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session, joinedload

import models
import schemas
from database import get_db
from dependencies import get_current_user, require_roles

router = APIRouter(
    prefix="/admin/comercios",
    tags=["Admin — Comercios Asociados"],
)

_ROLES_ADMIN_COMERCIOS = ("admin_general",)


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
    registro_id: Optional[int],
    detalle: dict,
    ip: Optional[str] = None,
) -> None:
    db.add(
        models.AuditLog(
            usuario_actor=actor_id,
            accion=accion,
            tabla_afectada="comercios_asociados",
            registro_id=registro_id,
            detalle=detalle,
            ip_origen=ip,
        )
    )


def _obtener_comercio_o_404(db: Session, id_comercio: int) -> models.ComercioAsociado:
    comercio = (
        db.query(models.ComercioAsociado)
        .options(joinedload(models.ComercioAsociado.usuario_acceso))
        .filter(models.ComercioAsociado.id_comercio == id_comercio)
        .first()
    )
    if comercio is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No existe un comercio asociado con id {id_comercio}.",
        )
    return comercio


def _validar_usuario_acceso(db: Session, id_usuario_acceso: Optional[int]) -> None:
    """Verifica que el usuario a vincular exista, si se proveyó uno."""
    if id_usuario_acceso is None:
        return
    existe = (
        db.query(models.Usuario.id_usuario)
        .filter(models.Usuario.id_usuario == id_usuario_acceso)
        .first()
    )
    if existe is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No existe un usuario con id {id_usuario_acceso} para vincular como acceso.",
        )


# ─── ENDPOINT: Listar comercios ───────────────────────────────────────────────

@router.get(
    "",
    response_model=List[schemas.ComercioAsociadoResponse],
    summary="Listar comercios asociados",
)
def listar_comercios(
    solo_activos: bool = Query(
        default=False,
        description="Si es true, devuelve únicamente los comercios con es_activo=True.",
    ),
    db: Session = Depends(get_db),
    _admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN_COMERCIOS)),
) -> List[models.ComercioAsociado]:
    query = db.query(models.ComercioAsociado).options(
        joinedload(models.ComercioAsociado.usuario_acceso)
    )
    if solo_activos:
        query = query.filter(models.ComercioAsociado.es_activo.is_(True))

    return query.order_by(models.ComercioAsociado.nombre_fantasia.asc()).all()


# ─── ENDPOINT: Detalle de un comercio ─────────────────────────────────────────

@router.get(
    "/{id_comercio}",
    response_model=schemas.ComercioAsociadoResponse,
    summary="Obtener un comercio asociado por ID",
)
def obtener_comercio(
    id_comercio: int,
    db: Session = Depends(get_db),
    _admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN_COMERCIOS)),
) -> models.ComercioAsociado:
    return _obtener_comercio_o_404(db, id_comercio)


# ─── ENDPOINT: Crear comercio ─────────────────────────────────────────────────

@router.post(
    "",
    response_model=schemas.ComercioAsociadoResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Dar de alta un comercio asociado",
)
def crear_comercio(
    payload: schemas.ComercioAsociadoCreate,
    request: Request,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN_COMERCIOS)),
) -> models.ComercioAsociado:
    _validar_usuario_acceso(db, payload.id_usuario_acceso)

    nuevo = models.ComercioAsociado(
        nombre_fantasia=payload.nombre_fantasia,
        rubro=payload.rubro,
        beneficio_ofrecido=payload.beneficio_ofrecido,
        es_activo=payload.es_activo,
        id_usuario_acceso=payload.id_usuario_acceso,
    )
    db.add(nuevo)
    db.flush()  # Para obtener id_comercio antes del commit

    _registrar_audit(
        db=db,
        actor_id=admin.id_usuario,
        accion="ALTA_COMERCIO",
        registro_id=nuevo.id_comercio,
        detalle={"despues": payload.model_dump(mode="json")},
        ip=_extraer_ip(request),
    )
    db.commit()
    db.refresh(nuevo)

    return _obtener_comercio_o_404(db, nuevo.id_comercio)


# ─── ENDPOINT: Editar comercio (PATCH parcial) ────────────────────────────────

@router.patch(
    "/{id_comercio}",
    response_model=schemas.ComercioAsociadoResponse,
    summary="Editar parcialmente un comercio asociado",
)
def editar_comercio(
    id_comercio: int,
    payload: schemas.ComercioAsociadoUpdate,
    request: Request,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN_COMERCIOS)),
) -> models.ComercioAsociado:
    comercio = _obtener_comercio_o_404(db, id_comercio)

    cambios = payload.model_dump(exclude_unset=True)
    if not cambios:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se envió ningún campo para actualizar.",
        )

    if "id_usuario_acceso" in cambios:
        _validar_usuario_acceso(db, cambios["id_usuario_acceso"])

    antes = {
        "nombre_fantasia": comercio.nombre_fantasia,
        "rubro": comercio.rubro,
        "beneficio_ofrecido": comercio.beneficio_ofrecido,
        "es_activo": comercio.es_activo,
        "id_usuario_acceso": comercio.id_usuario_acceso,
    }

    for campo, valor in cambios.items():
        setattr(comercio, campo, valor)

    _registrar_audit(
        db=db,
        actor_id=admin.id_usuario,
        accion="EDITAR_COMERCIO",
        registro_id=comercio.id_comercio,
        detalle={"antes": antes, "despues": cambios},
        ip=_extraer_ip(request),
    )
    db.commit()
    db.refresh(comercio)

    return _obtener_comercio_o_404(db, comercio.id_comercio)


# ─── ENDPOINT: Baja de comercio (lógica por defecto, física opcional) ─────────

@router.delete(
    "/{id_comercio}",
    status_code=status.HTTP_200_OK,
    summary="Dar de baja un comercio asociado (lógica por defecto)",
)
def eliminar_comercio(
    id_comercio: int,
    request: Request,
    fisica: bool = Query(
        default=False,
        description="Si es true, borra el registro definitivamente en vez de desactivarlo.",
    ),
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN_COMERCIOS)),
) -> dict:
    comercio = _obtener_comercio_o_404(db, id_comercio)

    if fisica:
        _registrar_audit(
            db=db,
            actor_id=admin.id_usuario,
            accion="BAJA_FISICA_COMERCIO",
            registro_id=comercio.id_comercio,
            detalle={"nombre_fantasia": comercio.nombre_fantasia},
            ip=_extraer_ip(request),
        )
        db.delete(comercio)
        db.commit()
        return {"mensaje": f"Comercio {id_comercio} eliminado permanentemente."}

    comercio.es_activo = False
    _registrar_audit(
        db=db,
        actor_id=admin.id_usuario,
        accion="BAJA_LOGICA_COMERCIO",
        registro_id=comercio.id_comercio,
        detalle={"nombre_fantasia": comercio.nombre_fantasia},
        ip=_extraer_ip(request),
    )
    db.commit()

    return {"mensaje": f"Comercio {id_comercio} desactivado (es_activo=False)."}