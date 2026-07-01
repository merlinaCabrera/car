# backend/routers/usuarios.py
"""
Router de usuarios.
Cambios respecto a la versión anterior:
  - Unificado get_db: ahora importa desde database (igual que auth.py).
  - GET  /usuarios/me       → perfil del usuario autenticado (usado por SocioInicio y SocioPerfil).
  - GET  /usuarios/         → requiere auth (antes era público).
  - PATCH /usuarios/{id}    → el socio actualiza su propio teléfono/dirección.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

import models
import schemas
from database import get_db              # ← unificado, ya no hay get_db local
from dependencies import get_current_user, require_roles
from security import get_password_hash

router = APIRouter(
    prefix="/usuarios",
    tags=["Usuarios"],
)


# ─── POST /usuarios/ ─────────────────────────────────────────────────────────

@router.post(
    "/",
    response_model=schemas.UsuarioResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Registrar nuevo usuario (solicitud de alta)",
)
def crear_usuario(
    usuario: schemas.UsuarioCreate,
    db: Session = Depends(get_db),
):
    """
    Crea el usuario SIN asignarle rol.
    Queda como 'pendiente' hasta que el admin lo apruebe desde /admin/usuarios/{id}/aprobar.
    """
    # DNI duplicado
    if db.query(models.Usuario).filter(models.Usuario.dni == usuario.dni).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El DNI ya está registrado en el sistema.",
        )

    # Email duplicado (si se proporcionó)
    if usuario.email and db.query(models.Usuario).filter(models.Usuario.email == usuario.email).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El email ya está registrado en el sistema.",
        )

    hashed_password = get_password_hash(usuario.password)
    user_data = usuario.model_dump(exclude={"password"})

    nuevo_usuario = models.Usuario(**user_data, password_hash=hashed_password)
    db.add(nuevo_usuario)
    db.commit()

    # Refresh con roles (lista vacía en este punto, pero el schema los espera)
    db.refresh(nuevo_usuario)
    return nuevo_usuario


# ─── GET /usuarios/me ────────────────────────────────────────────────────────

@router.get(
    "/me",
    response_model=schemas.UsuarioResponse,
    summary="Perfil completo del usuario autenticado",
)
def get_mi_perfil(
    current_user: models.Usuario = Depends(get_current_user),
):
    """
    Retorna todos los datos del usuario autenticado incluyendo roles activos.
    El get_current_user ya hace eager load de roles_asignados → rol.
    """
    return current_user


# ─── PATCH /usuarios/{id_usuario} ────────────────────────────────────────────

@router.patch(
    "/{id_usuario}",
    response_model=schemas.UsuarioResponse,
    summary="Actualizar datos editables del perfil propio",
)
def actualizar_perfil(
    id_usuario: int,
    datos: schemas.UsuarioUpdate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    """
    Un socio solo puede editar su propio perfil.
    El admin_general puede editar cualquier usuario.
    Campos editables: telefono, direccion, foto_perfil_url, push_token.
    Campos NO editables por aquí: dni, email, roles, estado financiero.
    """
    _roles = {ur.rol.nombre for ur in current_user.roles_asignados}
    es_admin = "admin_general" in _roles

    if current_user.id_usuario != id_usuario and not es_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo podés modificar tu propio perfil.",
        )

    usuario = (
        db.query(models.Usuario)
        .options(
            joinedload(models.Usuario.roles_asignados)
            .joinedload(models.UsuarioRol.rol)
        )
        .filter(models.Usuario.id_usuario == id_usuario)
        .first()
    )
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    if usuario.fecha_baja is not None:
        raise HTTPException(status_code=400, detail="El usuario está dado de baja.")

    # Actualiza solo los campos que vinieron en el request (exclude_unset)
    for campo, valor in datos.model_dump(exclude_unset=True).items():
        setattr(usuario, campo, valor)

    db.commit()
    db.refresh(usuario)
    return usuario


# ─── GET /usuarios/ ──────────────────────────────────────────────────────────

@router.get(
    "/",
    response_model=list[schemas.UsuarioListResponse],
    summary="Listado de usuarios activos (requiere auth)",
)
def listar_usuarios(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    _: models.Usuario = Depends(get_current_user),  # cualquier usuario logueado
):
    return (
        db.query(models.Usuario)
        .filter(models.Usuario.fecha_baja.is_(None))
        .order_by(models.Usuario.apellido)
        .offset(skip)
        .limit(limit)
        .all()
    )