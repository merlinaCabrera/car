# backend/routers/faq.py
"""
Router de Preguntas Frecuentes + Contacto.

  GET    /faq                    → según haya o no sesión (ver abajo)
  POST   /contacto                → formulario de contacto, sin login
  GET    /admin/comercios/faq     → listado completo (admin_general)
  POST   /admin/comercios/faq     → alta
  PATCH  /admin/comercios/faq/{id}→ edición parcial
  DELETE /admin/comercios/faq/{id}→ baja física (no hay razón para
                                     conservar una pregunta borrada; a
                                     diferencia de un Usuario o una Orden,
                                     no hay historial de negocio atado)

GET /faq usa get_current_user_optional: sin token → solo es_publica=True.
Con token válido de un socio logueado → todas las activas (públicas +
privadas). Esto evita duplicar el endpoint o la pantalla del frontend:
la MISMA página /ayuda le pide a este único endpoint y muestra lo que
venga, sea cual sea el motivo por el que vino más o menos contenido.

Los endpoints de administración viven bajo el mismo prefijo que
admin_comercios.py (/admin/comercios) a pedido explícito: en el frontend,
la gestión de FAQ se agrupa como un bloque más dentro de la pantalla de
Comercios/Beneficios, junto a Comercios Adheridos y Sponsors.
"""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from dependencies import get_current_user_optional, require_roles
from mailer.services.email_tasks import task_contacto_publico

router = APIRouter(tags=["FAQ y Contacto"])

_ROLES_ADMIN_FAQ = ("admin_general",)


# ─── Helpers (mismo patrón que admin_comercios.py) ──────────────────────────

def _extraer_ip(request: Request) -> Optional[str]:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return getattr(request.client, "host", None)


def _registrar_audit(
    *, db: Session, actor_id: int, accion: str,
    registro_id: Optional[int], detalle: dict, ip: Optional[str] = None,
) -> None:
    db.add(
        models.AuditLog(
            usuario_actor=actor_id,
            accion=accion,
            tabla_afectada="faq_entries",
            registro_id=registro_id,
            detalle=detalle,
            ip_origen=ip,
        )
    )


def _obtener_faq_o_404(db: Session, id_faq: int) -> models.FaqEntry:
    entry = db.query(models.FaqEntry).filter(models.FaqEntry.id_faq == id_faq).first()
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pregunta no encontrada.")
    return entry


# ─── Público / privado según sesión ─────────────────────────────────────────

@router.get("/faq", response_model=List[schemas.FaqEntryResponse])
def listar_faq(
    db: Session = Depends(get_db),
    usuario: Optional[models.Usuario] = Depends(get_current_user_optional),
) -> List[models.FaqEntry]:
    query = db.query(models.FaqEntry).filter(models.FaqEntry.es_activa.is_(True))
    if usuario is None:
        query = query.filter(models.FaqEntry.es_publica.is_(True))
    return query.order_by(models.FaqEntry.categoria.asc(), models.FaqEntry.orden.asc()).all()


@router.post("/contacto", status_code=status.HTTP_202_ACCEPTED)
def enviar_contacto(
    payload: schemas.ContactoPayload,
    background_tasks: BackgroundTasks,
) -> dict:
    """
    Sin login a propósito — es el formulario de contacto de la página
    pública de Ayuda. Se manda por mail al club en background; no se
    persiste en base de datos porque es un mensaje de una sola vía, sin
    necesidad de historial ni de que el club "responda" desde el sistema.
    """
    background_tasks.add_task(
        task_contacto_publico,
        email=payload.email,
        nombre=payload.nombre or "Sin nombre",
        mensaje=payload.mensaje,
    )
    return {"mensaje": "Tu mensaje fue enviado. Te vamos a responder a la brevedad."}


# ─── Administración (agrupada bajo /admin/comercios, ver docstring) ────────

@router.get(
    "/admin/comercios/faq",
    response_model=List[schemas.FaqEntryResponse],
    summary="Listar TODAS las preguntas (activas e inactivas) — solo Admin General",
)
def listar_faq_admin(
    db: Session = Depends(get_db),
    _admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN_FAQ)),
) -> List[models.FaqEntry]:
    return (
        db.query(models.FaqEntry)
        .order_by(models.FaqEntry.categoria.asc(), models.FaqEntry.orden.asc())
        .all()
    )


@router.post(
    "/admin/comercios/faq",
    response_model=schemas.FaqEntryResponse,
    status_code=status.HTTP_201_CREATED,
)
def crear_faq(
    payload: schemas.FaqEntryCreate,
    request: Request,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN_FAQ)),
) -> models.FaqEntry:
    entry = models.FaqEntry(**payload.model_dump())
    db.add(entry)
    db.flush()

    _registrar_audit(
        db=db, actor_id=admin.id_usuario, accion="CREAR_FAQ",
        registro_id=entry.id_faq, detalle=payload.model_dump(), ip=_extraer_ip(request),
    )
    db.commit()
    db.refresh(entry)
    return entry


@router.patch(
    "/admin/comercios/faq/{id_faq}",
    response_model=schemas.FaqEntryResponse,
)
def editar_faq(
    id_faq: int,
    payload: schemas.FaqEntryUpdate,
    request: Request,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN_FAQ)),
) -> models.FaqEntry:
    entry = _obtener_faq_o_404(db, id_faq)
    cambios = payload.model_dump(exclude_unset=True)
    for campo, valor in cambios.items():
        setattr(entry, campo, valor)

    _registrar_audit(
        db=db, actor_id=admin.id_usuario, accion="EDITAR_FAQ",
        registro_id=id_faq, detalle=cambios, ip=_extraer_ip(request),
    )
    db.commit()
    db.refresh(entry)
    return entry


@router.delete(
    "/admin/comercios/faq/{id_faq}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def eliminar_faq(
    id_faq: int,
    request: Request,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN_FAQ)),
) -> None:
    entry = _obtener_faq_o_404(db, id_faq)

    _registrar_audit(
        db=db, actor_id=admin.id_usuario, accion="ELIMINAR_FAQ",
        registro_id=id_faq, detalle={"pregunta": entry.pregunta}, ip=_extraer_ip(request),
    )
    db.delete(entry)
    db.commit()