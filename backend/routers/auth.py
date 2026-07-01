from datetime import timedelta, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from security import ACCESS_TOKEN_EXPIRE_MINUTES, create_access_token, verify_password

router = APIRouter(
    prefix="/auth",
    tags=["Autenticación"]
)

@router.post("/login", response_model=schemas.TokenResponse)
def login_for_access_token(payload: schemas.LoginPayload, db: Session = Depends(get_db)):
    # 1. Buscar usuario por DNI
    user = db.query(models.Usuario).filter(models.Usuario.dni == payload.dni).first()

    # 2. Validar que el usuario exista y la contraseña sea correcta
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="El DNI o la contraseña son incorrectos.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # 3. Validar que el usuario esté activo
    if user.fecha_baja is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Este usuario ha sido dado de baja y no puede iniciar sesión.",
        )

    # 4. Obtener roles activos del usuario
    active_roles = [
        rol_asignado.rol.nombre
        for rol_asignado in user.roles_asignados
        if rol_asignado.rol.es_activo and (rol_asignado.valido_hasta is None or rol_asignado.valido_hasta > datetime.now(timezone.utc))
    ]

    # 5. Validar que el usuario tenga al menos un rol activo (aprobado)
    if not active_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tu cuenta está pendiente de aprobación por el administrador.",
        )

    # 6. Crear el token JWT
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.dni, "id": user.id_usuario, "roles": active_roles}, expires_delta=access_token_expires
    )

    # 7. Devolver la respuesta según el schema TokenResponse
    return schemas.TokenResponse(
        access_token=access_token,
        token_type="bearer",
        requiere_cambio_password=user.requiere_cambio_password,
        roles=active_roles
    )