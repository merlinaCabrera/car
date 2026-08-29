# backend/routers/admin_sponsors.py
"""
Router de administración de Sponsors — landing pública.

Endpoints:
  GET    /admin/sponsors              → Listado completo (incluye inactivos).
  POST   /admin/sponsors              → Alta (multipart: nombre, url_destino,
                                          orden, imagen).
  PATCH  /admin/sponsors/{id_sponsor} → Edición de metadata (no toca la imagen).
  POST   /admin/sponsors/{id_sponsor}/imagen → Reemplaza solo la imagen.
  DELETE /admin/sponsors/{id_sponsor} → Baja física (borra fila + objeto S3).

Todos los endpoints requieren rol 'admin_general' exclusivamente — a
diferencia de otros catálogos (productos, comercios) que también dejan
editar a 'personal_administrativo', acá se restringió a pedido explícito.

Decisiones técnicas:
  - Delete es físico (no hay soft-delete con es_activo como en productos)
    porque nada referencia a Sponsor desde otra tabla — no hay riesgo de
    romper historial. 'activo' igual existe, pensado para ocultar un
    sponsor temporalmente sin perder el registro (ej: sponsor de temporada).
  - La imagen va a car-sponsors-produccion (bucket público, separado del
    bucket privado de comprobantes) — ver utils/s3.py. Se guarda el
    imagen_key en DB, la URL se arma al responder con url_publica().
  - Tamaño de imagen limitado a 3MB y solo image/* — son logos, no hace
    falta más, y evita que alguien suba un archivo gigante sin querer.
"""
from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from dependencies import require_roles
from utils.s3 import eliminar_archivo_publico, subir_archivo_publico, url_publica

router = APIRouter(prefix="/admin/sponsors", tags=["Admin · Sponsors"])

MAX_TAMANO_IMAGEN = 3 * 1024 * 1024  # 3MB
CONTENT_TYPES_PERMITIDOS = {"image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"}


def _a_response(sponsor: models.Sponsor) -> schemas.SponsorResponse:
    return schemas.SponsorResponse(
        id_sponsor=sponsor.id_sponsor,
        nombre=sponsor.nombre,
        imagen_url=url_publica(sponsor.imagen_key),
        url_destino=sponsor.url_destino,
        orden=sponsor.orden,
        activo=sponsor.activo,
        creado_at=sponsor.creado_at,
    )


async def _validar_y_leer_imagen(imagen: UploadFile) -> bytes:
    if imagen.content_type not in CONTENT_TYPES_PERMITIDOS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Formato de imagen no soportado. Usá PNG, JPG, WEBP o SVG.",
        )
    contenido = await imagen.read()
    if len(contenido) > MAX_TAMANO_IMAGEN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La imagen no puede pesar más de 3MB.",
        )
    return contenido


@router.get("", response_model=List[schemas.SponsorResponse])
def listar_sponsors(
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles("admin_general")),
):
    sponsors = db.query(models.Sponsor).order_by(models.Sponsor.orden.asc()).all()
    return [_a_response(s) for s in sponsors]


@router.post("", response_model=schemas.SponsorResponse, status_code=status.HTTP_201_CREATED)
async def crear_sponsor(
    nombre: str = Form(...),
    url_destino: str = Form(...),
    orden: int = Form(0),
    imagen: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles("admin_general")),
):
    contenido = await _validar_y_leer_imagen(imagen)

    sponsor = models.Sponsor(
        nombre=nombre,
        url_destino=url_destino,
        orden=orden,
        imagen_key="",  # se completa abajo, necesitamos el id_sponsor primero
    )
    db.add(sponsor)
    db.flush()  # asigna id_sponsor sin comitear todavía

    extension = (imagen.filename or "").rsplit(".", 1)[-1].lower() if "." in (imagen.filename or "") else "png"
    key = f"sponsors/{sponsor.id_sponsor}/logo.{extension}"
    subir_archivo_publico(contenido, key, imagen.content_type)

    sponsor.imagen_key = key
    db.commit()
    db.refresh(sponsor)
    return _a_response(sponsor)


@router.patch("/{id_sponsor}", response_model=schemas.SponsorResponse)
def actualizar_sponsor(
    id_sponsor: int,
    payload: schemas.SponsorUpdate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles("admin_general")),
):
    sponsor = db.query(models.Sponsor).filter(models.Sponsor.id_sponsor == id_sponsor).first()
    if sponsor is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sponsor no encontrado.")

    datos = payload.model_dump(exclude_unset=True)
    for campo, valor in datos.items():
        setattr(sponsor, campo, valor)

    db.commit()
    db.refresh(sponsor)
    return _a_response(sponsor)


@router.post("/{id_sponsor}/imagen", response_model=schemas.SponsorResponse)
async def reemplazar_imagen_sponsor(
    id_sponsor: int,
    imagen: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles("admin_general")),
):
    sponsor = db.query(models.Sponsor).filter(models.Sponsor.id_sponsor == id_sponsor).first()
    if sponsor is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sponsor no encontrado.")

    contenido = await _validar_y_leer_imagen(imagen)

    extension = (imagen.filename or "").rsplit(".", 1)[-1].lower() if "." in (imagen.filename or "") else "png"
    nueva_key = f"sponsors/{sponsor.id_sponsor}/logo.{extension}"
    subir_archivo_publico(contenido, nueva_key, imagen.content_type)

    # Si cambió la extensión, la key vieja queda huérfana en S3 — la borramos.
    if sponsor.imagen_key and sponsor.imagen_key != nueva_key:
        eliminar_archivo_publico(sponsor.imagen_key)

    sponsor.imagen_key = nueva_key
    db.commit()
    db.refresh(sponsor)
    return _a_response(sponsor)


@router.delete("/{id_sponsor}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_sponsor(
    id_sponsor: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles("admin_general")),
):
    sponsor = db.query(models.Sponsor).filter(models.Sponsor.id_sponsor == id_sponsor).first()
    if sponsor is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sponsor no encontrado.")

    eliminar_archivo_publico(sponsor.imagen_key)
    db.delete(sponsor)
    db.commit()