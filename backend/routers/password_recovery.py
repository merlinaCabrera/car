"""
backend/routers/password_recovery.py

Flujo:
  1. POST /auth/recuperar-password {email}
     - Genera un token opaco random (no reversible, no es un JWT).
     - Lo guarda hasheado NO — se guarda el token plano en DB porque es
       de un solo uso y vida corta (1h); igual se compara con secrets.compare_digest.
     - Devuelve 200 SIEMPRE, exista o no el email, para no filtrar
       qué emails están registrados (previene enumeración de usuarios).
     - Manda el mail en background con el link.

  2. POST /auth/reset-password {token, password_nuevo, password_nuevo_confirmacion}
     - Busca por token, valida que no haya expirado.
     - Hashea la nueva contraseña y limpia el token (un solo uso).

Ajustá:
  - El import de "mailer.services..." al nombre real de tu carpeta.
  - FRONTEND_URL: la URL de tu app donde vive la pantalla de "nueva contraseña".
    Se recomienda ponerla en tu .env / config, no hardcodeada.
"""

import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from security import get_password_hash

# Ajustar import según dónde quede tu carpeta de mail
from mailer.services.email_tasks import task_recuperar_password

router = APIRouter(prefix="/auth", tags=["Recuperación de contraseña"])

TOKEN_VIDA_MINUTOS = 60
# TODO: mover a tu config.py / .env — ej: FRONTEND_URL=https://app.clubroberts.com
FRONTEND_URL = "http://localhost:5173"


@router.post("/recuperar-password", status_code=status.HTTP_200_OK)
def recuperar_password(
    payload: schemas.RecuperarPasswordRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    usuario = db.query(models.Usuario).filter(models.Usuario.email == payload.email).first()

    # Respuesta genérica SIEMPRE — no revela si el email existe o no.
    respuesta = {"mensaje": "Si el email está registrado, vas a recibir un link para restablecer tu contraseña."}

    if not usuario:
        return respuesta

    token = secrets.token_urlsafe(32)
    usuario.token_recuperacion = token
    usuario.token_recuperacion_expira = datetime.now(timezone.utc) + timedelta(minutes=TOKEN_VIDA_MINUTOS)
    db.commit()

    link_reset = f"{FRONTEND_URL}/reset-password?token={token}"

    background_tasks.add_task(
        task_recuperar_password,
        email_destino=usuario.email,
        nombre_socio=f"{usuario.nombre} {usuario.apellido}",
        link_reset=link_reset,
    )

    return respuesta


@router.post("/reset-password", status_code=status.HTTP_200_OK)
def reset_password(
    payload: schemas.ResetPasswordRequest,
    db: Session = Depends(get_db),
):
    usuario = db.query(models.Usuario).filter(
        models.Usuario.token_recuperacion == payload.token,
    ).first()

    if not usuario or not usuario.token_recuperacion_expira:
        raise HTTPException(status_code=400, detail="Token inválido o expirado.")

    # Comparación segura contra timing attacks
    if not secrets.compare_digest(usuario.token_recuperacion, payload.token):
        raise HTTPException(status_code=400, detail="Token inválido o expirado.")

    if datetime.now(timezone.utc) > usuario.token_recuperacion_expira:
        raise HTTPException(status_code=400, detail="El token expiró, solicitá uno nuevo.")

    usuario.password_hash = get_password_hash(payload.password_nuevo)
    usuario.token_recuperacion = None
    usuario.token_recuperacion_expira = None
    usuario.requiere_cambio_password = False
    db.commit()

    return {"mensaje": "Contraseña actualizada correctamente. Ya podés iniciar sesión."}