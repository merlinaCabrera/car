# backend/routers/sponsors.py
"""
Router PÚBLICO de sponsors — consumido por la landing (sin login).

  GET /sponsors → solo sponsors con activo=true, ordenados por 'orden'.

Separado de admin_sponsors.py a propósito: ese requiere admin_general,
este es explícitamente sin autenticación. Mantenerlos en archivos distintos
evita que un descuido futuro (agregar un endpoint acá sin pensarlo) termine
exponiendo algo que debería requerir login.
"""
from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from utils.s3 import url_publica

router = APIRouter(prefix="/sponsors", tags=["Sponsors (público)"])


@router.get("", response_model=List[schemas.SponsorResponse])
def listar_sponsors_publico(db: Session = Depends(get_db)):
    sponsors = (
        db.query(models.Sponsor)
        .filter(models.Sponsor.activo.is_(True))
        .order_by(models.Sponsor.orden.asc())
        .all()
    )
    return [
        schemas.SponsorResponse(
            id_sponsor=s.id_sponsor,
            nombre=s.nombre,
            imagen_url=url_publica(s.imagen_key),
            url_destino=s.url_destino,
            orden=s.orden,
            activo=s.activo,
            creado_at=s.creado_at,
        )
        for s in sponsors
    ]