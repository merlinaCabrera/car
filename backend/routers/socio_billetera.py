# backend/routers/socio_billetera.py
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

import models
import schemas
from database import get_db
from dependencies import get_current_user

router = APIRouter(prefix="/socio/billetera", tags=["Socio — Billetera"])


@router.get("/", response_model=schemas.BilleteraResponse)
def ver_billetera(
    db: Session = Depends(get_db),
    usuario: models.Usuario = Depends(get_current_user),
) -> schemas.BilleteraResponse:
    historial = (
        db.query(models.ReintegroQR)
        .options(joinedload(models.ReintegroQR.usuario))
        .filter(models.ReintegroQR.id_usuario == usuario.id_usuario)
        .order_by(models.ReintegroQR.escaneado_at.desc())
        .all()
    )
    return schemas.BilleteraResponse(
        saldo_a_favor=usuario.saldo_a_favor,
        historial=[
            schemas.ReintegroQRResponse(
                id_reintegro=r.id_reintegro,
                id_reserva=r.id_reserva,
                id_usuario=r.id_usuario,
                nombre_socio=f"{usuario.nombre} {usuario.apellido}",
                monto=r.monto,
                forma=r.forma,
                escaneado_at=r.escaneado_at,
            )
            for r in historial
        ],
    )