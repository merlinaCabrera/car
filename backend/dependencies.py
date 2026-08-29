# backend/dependencies.py
"""
Dependencias de autenticación y autorización para FastAPI.

REQUISITO: security.py debe exportar SECRET_KEY y ALGORITHM.
Ejemplo mínimo para agregar a security.py si no los tenés:

    SECRET_KEY = "tu-clave-secreta-muy-larga-y-segura"  # os.getenv("SECRET_KEY")
    ALGORITHM  = "HS256"

Librería JWT: python-jose → pip install python-jose[cryptography]
"""
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session, joinedload

import models
from database import get_db
from security import ALGORITHM, SECRET_KEY   # ← asegurate de que existan en security.py

# HTTPBearer extrae el token del header "Authorization: Bearer <token>"
_bearer = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: Session = Depends(get_db),
) -> models.Usuario:
    """
    Decodifica el JWT y retorna el Usuario ORM completo con roles cargados.
    Lanza 401 si el token es inválido/expirado.
    Lanza 401 si el token fue emitido antes del último cambio de password.
    Lanza 403 si el usuario está dado de baja.
    """
    exc_401 = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token inválido o expirado.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            credentials.credentials,
            SECRET_KEY,
            algorithms=[ALGORITHM],
        )
        dni: str | None = payload.get("sub")
        if not dni:
            raise exc_401
    except JWTError:
        raise exc_401

    # Eager load de roles + rol padre para evitar N+1 queries
    user = (
        db.query(models.Usuario)
        .options(
            joinedload(models.Usuario.roles_asignados)
            .joinedload(models.UsuarioRol.rol)
        )
        .filter(models.Usuario.dni == dni)
        .first()
    )

    if user is None:
        raise exc_401

    # Si la contraseña se cambió después de emitido el token, el token queda inválido
    iat = payload.get("iat")
    if user.password_actualizada_en and iat:
        iat_dt = datetime.fromtimestamp(iat, tz=timezone.utc)
        if iat_dt < user.password_actualizada_en:
            raise exc_401

    if user.fecha_baja is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tu cuenta está dada de baja. Contactá al administrador.",
        )
    return user


# HTTPBearer con auto_error=False: no lanza 403 si falta el header — así
# get_current_user_optional puede distinguir "no vino token" (devuelve None)
# de "vino un token roto" (sigue lanzando 401, no lo tapamos).
_bearer_opcional = HTTPBearer(auto_error=False)


def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_opcional),
    db: Session = Depends(get_db),
) -> models.Usuario | None:
    """
    Igual que get_current_user, pero para endpoints públicos que se
    comportan distinto si hay sesión (ej: /faq muestra más preguntas si
    hay un socio logueado). Sin header Authorization → None, sin error.
    Con header presente pero inválido/expirado → sigue lanzando 401
    (no queremos ocultar un token roto como si fuera "usuario anónimo").
    """
    if credentials is None:
        return None
    return get_current_user(credentials=credentials, db=db)


def _roles_activos(user: models.Usuario) -> set[str]:
    """Devuelve el conjunto de nombres de roles vigentes (sin expirar)."""
    now = datetime.now(timezone.utc)
    return {
        ur.rol.nombre
        for ur in user.roles_asignados
        if ur.rol.es_activo
        and (ur.valido_hasta is None or ur.valido_hasta > now)
    }


def require_roles(*allowed: str):
    """
    Dependencia de autorización por rol.

    Uso en un endpoint:
        @router.get("/ruta")
        def mi_ruta(
            current_user: models.Usuario = Depends(require_roles("admin_general"))
        ):
            ...

    Admite múltiples roles (OR lógico):
        Depends(require_roles("admin_general", "personal_administrativo"))
    """
    def dep(
        current_user: models.Usuario = Depends(get_current_user),
    ) -> models.Usuario:
        if not _roles_activos(current_user).intersection(allowed):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Acceso denegado. Roles requeridos: {list(allowed)}",
            )
        return current_user

    return dep