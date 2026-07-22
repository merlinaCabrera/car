import secrets
from datetime import timedelta, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

import models
import schemas
import os
from database import get_db
from security import ACCESS_TOKEN_EXPIRE_MINUTES, create_access_token, verify_password, get_password_hash
from mailer.services.email_service import enviar_recuperar_password

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


# ─── POST /auth/recuperar-password ───────────────────────────────────────────

@router.post(
    "/recuperar-password",
    status_code=status.HTTP_200_OK,
    summary="Solicitar link de recuperación de contraseña",
)
async def solicitar_recuperacion(
    payload: schemas.RecuperarPasswordRequest,
    db: Session = Depends(get_db),
):
    """
    Acepta DNI o email. Siempre responde 200 para no revelar
    si el usuario existe en el sistema.
    Genera un token de un solo uso con 1 hora de vigencia y
    envía el mail con el link de reset.
    """
    identificador = payload.identificador.strip()

    usuario = (
        db.query(models.Usuario)
        .filter(
            (models.Usuario.dni == identificador) |
            (models.Usuario.email == identificador)
        )
        .first()
    )

    if usuario and usuario.email:
        token = secrets.token_urlsafe(32)
        usuario.token_recuperacion = token
        usuario.token_recuperacion_expira = datetime.now(timezone.utc) + timedelta(hours=1)
        db.commit()

        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
        link_reset = f"{frontend_url}/recuperar-password?token={token}"

        await enviar_recuperar_password(
            email_destino=usuario.email,
            nombre_socio=usuario.nombre,
            link_reset=link_reset,
            minutos_validez=60,
        )

    return {"ok": True}


# ─── POST /auth/reset-password ───────────────────────────────────────────────

@router.post(
    "/reset-password",
    status_code=status.HTTP_200_OK,
    summary="Establecer nueva contraseña con el token del mail",
)
def resetear_password(
    payload: schemas.ResetPasswordRequest,
    db: Session = Depends(get_db),
):
    """
    Valida el token, hashea la nueva contraseña, limpia el token
    y marca requiere_cambio_password = False.
    """
    usuario = (
        db.query(models.Usuario)
        .filter(models.Usuario.token_recuperacion == payload.token)
        .first()
    )

    if not usuario or usuario.token_recuperacion_expira < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El link expiró o no es válido. Solicitá uno nuevo.",
        )

    usuario.password_hash = get_password_hash(payload.password)
    usuario.token_recuperacion = None
    usuario.token_recuperacion_expira = None
    usuario.requiere_cambio_password = False
    db.commit()

    return {"ok": True}