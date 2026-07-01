# backend/routers/qr_auth.py
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

import models
import schemas
from database import get_db
from dependencies import get_current_user, require_roles

router = APIRouter(
    prefix="/qr",
    tags=["Autenticación por QR"],
)


@router.get(
    "/token",
    response_model=schemas.QRTokenResponse,
    summary="Generar un nuevo token QR dinámico y de corta duración",
)
def generar_qr_token(
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    """
    Genera un nuevo UUID, lo asigna al usuario actual y lo devuelve.
    Este token es válido por 60 segundos para ser escaneado.
    """
    if current_user.fecha_baja is not None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuario inactivo.")

    new_token = uuid.uuid4()
    current_user.qr_token = new_token
    current_user.qr_generado_at = datetime.now(timezone.utc)
    db.commit()

    return {"qr_token": new_token}


@router.post(
    "/validar",
    response_model=schemas.ValidationResponse,
    summary="Validar un token QR escaneado",
    dependencies=[Depends(require_roles("admin_general", "personal_administrativo", "admin_temporal"))],
)
def validar_qr_token(
    payload: schemas.QRValidationPayload,
    db: Session = Depends(get_db),
):
    """
    Busca un usuario por su token QR.
    Valida que el token no haya expirado (60 segundos de vida).
    Devuelve el estado del socio para el control de acceso.
    """
    try:
        token_uuid = uuid.UUID(payload.token)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Formato de QR inválido.")

    expiration_time = datetime.now(timezone.utc) - timedelta(seconds=60)
    
    usuario = db.query(models.Usuario).options(
        joinedload(models.Usuario.roles_asignados).joinedload(models.UsuarioRol.rol)
    ).filter(
        models.Usuario.qr_token == token_uuid,
        models.Usuario.qr_generado_at > expiration_time
    ).first()

    if not usuario:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="QR inválido o expirado.")

    es_socio_activo = any(
        ur.rol.nombre == 'socio' and ur.rol.es_activo and (ur.valido_hasta is None or ur.valido_hasta > datetime.now(timezone.utc))
        for ur in usuario.roles_asignados
    ) and usuario.fecha_baja is None
    
    estado_financiero = "Al día" if usuario.deuda_historica_meses == 0 else "Moroso"

    return schemas.ValidationResponse(
        nombre=usuario.nombre,
        apellido=usuario.apellido,
        dni=usuario.dni,
        estado_financiero=estado_financiero,
        es_socio_activo=es_socio_activo,
    )


@router.post(
    "/validar-dni",
    response_model=schemas.ValidationResponse,
    summary="Validar un socio por DNI (ingreso manual)",
    dependencies=[Depends(require_roles("admin_general", "personal_administrativo", "admin_temporal"))],
)
def validar_dni(
    payload: schemas.DNIValidationPayload,
    db: Session = Depends(get_db),
):
    usuario = db.query(models.Usuario).options(
        joinedload(models.Usuario.roles_asignados).joinedload(models.UsuarioRol.rol)
    ).filter(models.Usuario.dni == payload.dni).first()

    if not usuario:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="DNI no encontrado.")

    es_socio_activo = any(
        ur.rol.nombre == 'socio' and ur.rol.es_activo and (ur.valido_hasta is None or ur.valido_hasta > datetime.now(timezone.utc))
        for ur in usuario.roles_asignados
    ) and usuario.fecha_baja is None
    
    estado_financiero = "Al día" if usuario.deuda_historica_meses == 0 else "Moroso"

    return schemas.ValidationResponse(
        nombre=usuario.nombre,
        apellido=usuario.apellido,
        dni=usuario.dni,
        estado_financiero=estado_financiero,
        es_socio_activo=es_socio_activo,
    )