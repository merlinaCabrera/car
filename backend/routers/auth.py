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
from utils.ratelimit import rate_limit

router = APIRouter(
    prefix="/auth",
    tags=["Autenticación"]
)

MAX_INTENTOS_FALLIDOS = 5
MINUTOS_BLOQUEO = 15


@router.post("/login", response_model=schemas.TokenResponse)
def login_for_access_token(payload: schemas.LoginPayload, db: Session = Depends(get_db)):
    # 1. Buscar usuario por DNI
    user = db.query(models.Usuario).filter(models.Usuario.dni == payload.dni).first()

    # 2. Validar que el usuario exista y la contraseña sea correcta.
    # Se distinguen los dos casos (a diferencia de un login normal, acá el
    # riesgo de seguridad de revelar "el DNI no existe" es bajo: el propio
    # formulario de alta de socio ya confirma o no si un DNI está registrado,
    # así que ocultarlo acá no suma protección real y sí resta claridad).
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Ese DNI no está registrado en el sistema.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Chequeo de baja ANTES que la contraseña: si alguien que dejó el club
    # hace tiempo no recuerda su contraseña vieja, no tiene sentido que se
    # quede trabado en "contraseña incorrecta" sin enterarse de que existe
    # la opción de pedir reactivación. El costo de seguridad de revelar
    # esto sin password correcto es bajo (mismo criterio que con el DNI).
    if user.fecha_baja is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "tipo": "dado_de_baja",
                "mensaje": "Esta cuenta fue dada de baja del club.",
                "id_usuario": user.id_usuario,
            },
        )

    # Chequeo de bloqueo por intentos fallidos (rate limiting de login)
    ahora = datetime.now(timezone.utc)
    if user.bloqueado_hasta and user.bloqueado_hasta > ahora:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiados intentos fallidos. Probá de nuevo en unos minutos.",
        )
    # El bloqueo ya venció: arrancar el contador de cero. Sin esto,
    # intentos_fallidos quedaba en 5 y el primer error posterior re-bloqueaba
    # de una — un solo typo dejaba al usuario dando vueltas.
    if user.bloqueado_hasta and user.bloqueado_hasta <= ahora:
        user.intentos_fallidos = 0
        user.bloqueado_hasta = None

    if not verify_password(payload.password, user.password_hash):
        user.intentos_fallidos += 1
        if user.intentos_fallidos >= MAX_INTENTOS_FALLIDOS:
            user.bloqueado_hasta = datetime.now(timezone.utc) + timedelta(minutes=MINUTOS_BLOQUEO)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="La contraseña es incorrecta.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Login exitoso: resetear contador de intentos fallidos
    user.intentos_fallidos = 0
    user.bloqueado_hasta = None
    db.commit()

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
    dependencies=[Depends(rate_limit("recuperar_password", maximo=5, ventana_seg=3600))],
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
    Rate limit: 5 pedidos por hora por IP (anti mail-bombing).
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


def _token_recuperacion_valido(usuario: models.Usuario | None) -> bool:
    """
    Un token de recuperación sirve solo si existe el usuario, todavía tiene un
    token guardado y no venció. `token_recuperacion` se pone en NULL apenas se
    usa (ver resetear_password), así que esto también cubre el "ya usado".
    """
    if usuario is None or not usuario.token_recuperacion:
        return False
    if usuario.token_recuperacion_expira is None:
        return False
    return usuario.token_recuperacion_expira >= datetime.now(timezone.utc)


# ─── GET /auth/reset-password/estado ─────────────────────────────────────────

@router.get(
    "/reset-password/estado",
    status_code=status.HTTP_200_OK,
    summary="¿El token del link de recuperación sigue siendo válido?",
)
def estado_token_recuperacion(
    token: str,
    db: Session = Depends(get_db),
):
    """
    Lo consulta el frontend al ABRIR el link del mail, antes de mostrar el
    formulario de contraseña nueva.

    Sin esto, un link ya usado (o vencido) se veía idéntico a uno nuevo: la
    pantalla pedía la contraseña como si nada y el error recién aparecía al
    enviar. Para quien testeaba, eso se leía como "el link se puede reusar"
    (BUG-03 de la QA del 08-09) — el backend ya invalidaba el token, lo que
    faltaba era decírselo a la pantalla.

    No revela nada: responde lo mismo (valido=false) para un token inexistente,
    uno vencido y uno ya usado.
    """
    usuario = (
        db.query(models.Usuario)
        .filter(models.Usuario.token_recuperacion == token)
        .first()
    )
    return {"valido": _token_recuperacion_valido(usuario)}


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

    if not _token_recuperacion_valido(usuario):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El link expiró o no es válido. Solicitá uno nuevo.",
        )

    usuario.password_hash = get_password_hash(payload.password)
    usuario.token_recuperacion = None
    usuario.token_recuperacion_expira = None
    usuario.requiere_cambio_password = False
    # Truncado al segundo: el `iat` del JWT son segundos enteros, si guardáramos
    # la fracción el token del login inmediato posterior quedaría "anterior" al
    # cambio y get_current_user lo rechazaría.
    usuario.password_actualizada_en = datetime.now(timezone.utc).replace(microsecond=0)
    db.commit()

    return {"ok": True}