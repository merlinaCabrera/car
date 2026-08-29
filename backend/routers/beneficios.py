# backend/routers/beneficios.py
"""
Router PÚBLICO de "Beneficios" — comercios asociados con foto, para la
sección Beneficios de la landing (sin login).

  GET /beneficios → solo comercios con es_activo=true Y con imagen_key
                     seteada (uno sin foto no tiene sentido mostrarlo acá,
                     rompería el diseño de la sección).

Nota: esto es DISTINTO del listado de /admin/comercios (que trae todos,
con o sin foto, activos o no, para gestión interna). Este es el recorte
público, sin datos internos (no expone id_usuario_acceso).
"""
from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db

router = APIRouter(prefix="/beneficios", tags=["Beneficios (público)"])


@router.get("", response_model=List[schemas.BeneficioPublico])
def listar_beneficios_publico(db: Session = Depends(get_db)):
    return (
        db.query(models.ComercioAsociado)
        .filter(
            models.ComercioAsociado.es_activo.is_(True),
            models.ComercioAsociado.imagen_key.isnot(None),
        )
        .order_by(models.ComercioAsociado.nombre_fantasia.asc())
        .all()
    )