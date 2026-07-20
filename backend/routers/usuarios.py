# backend/routers/usuarios.py
"""
Router de usuarios.
Cambios respecto a la versión anterior:
  - Unificado get_db: ahora importa desde database (igual que auth.py).
  - GET  /usuarios/me       → perfil del usuario autenticado (usado por SocioInicio y SocioPerfil).
  - GET  /usuarios/         → requiere auth (antes era público).
  - PATCH /usuarios/{id}    → el socio actualiza su propio teléfono/dirección.
  - PATCH /usuarios/{id}    → ahora SÍ valida en código la whitelist de campos
    editables por un socio (antes solo estaba en el docstring: cualquier campo
    de UsuarioUpdate se aplicaba sin chequeo, incluyendo es_becado/is_directivo).
  - POST /usuarios/me/foto  → nuevo. Sube la foto de perfil del usuario logueado
    a uploads/fotos_perfil/ (reutiliza el mount /uploads que ya existe en main.py).
"""
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session, joinedload

import models
import schemas
from database import get_db              # ← unificado, ya no hay get_db local
from dependencies import get_current_user, require_roles
from security import get_password_hash, verify_password

router = APIRouter(
    prefix="/usuarios",
    tags=["Usuarios"],
)

# Campos que un socio puede tocar de SU PROPIO perfil vía PATCH /usuarios/{id}.
# Todo lo demás (dni, email, roles, es_becado, becado_hasta, is_directivo,
# deuda/estado financiero, etc.) solo lo puede tocar un admin_general — ver
# actualizar_perfil() más abajo. UsuarioUpdate declara más campos que estos
# porque el mismo schema también lo usa el admin; la restricción se aplica acá,
# no en el schema.
_CAMPOS_EDITABLES_SOCIO = {"telefono", "direccion", "foto_perfil_url", "push_token"}

# Fotos de perfil: se guardan localmente y se sirven como archivo estático.
# Reutiliza la misma carpeta base "uploads/" que ya monta main.py en "/uploads"
# (junto a uploads/comprobantes) — no requiere ningún mount nuevo.
_DIR_FOTOS_PERFIL = Path("uploads/fotos_perfil")
_DIR_FOTOS_PERFIL.mkdir(parents=True, exist_ok=True)
_TIPOS_IMAGEN_PERMITIDOS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
_TAMANIO_MAXIMO_BYTES = 5 * 1024 * 1024  # 5 MB


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

    cambios = datos.model_dump(exclude_unset=True)

    # Un socio (no admin) solo puede tocar su propio perfil "de contacto".
    # Cualquier otro campo (dni, email, roles, es_becado, becado_hasta,
    # is_directivo, etc.) requiere admin_general, aunque venga en el body.
    if not es_admin:
        campos_no_permitidos = set(cambios) - _CAMPOS_EDITABLES_SOCIO
        if campos_no_permitidos:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"No podés modificar: {', '.join(sorted(campos_no_permitidos))}. "
                    "Esos campos solo los puede cambiar un administrador."
                ),
            )

    # Actualiza solo los campos que vinieron en el request (exclude_unset)
    for campo, valor in cambios.items():
        setattr(usuario, campo, valor)

    db.commit()
    db.refresh(usuario)
    return usuario


# ─── POST /usuarios/me/foto ──────────────────────────────────────────────────

@router.post(
    "/me/foto",
    response_model=schemas.UsuarioResponse,
    summary="Subir/reemplazar la foto de perfil del usuario autenticado",
)
async def subir_foto_perfil(
    archivo: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    """
    Guarda la imagen en `uploads/fotos_perfil/` con un nombre único (uuid4) y
    actualiza `foto_perfil_url` del propio usuario autenticado. No acepta
    id_usuario por body/URL a propósito: un socio solo puede reemplazar SU
    PROPIA foto por esta vía (mismo criterio que el resto de este router).

    Si el usuario ya tenía una foto anterior guardada localmente (prefijo
    "/uploads/fotos_perfil/"), se borra del disco para no acumular archivos
    huérfanos. No se toca si la foto anterior era una URL externa.
    """
    if archivo.content_type not in _TIPOS_IMAGEN_PERMITIDOS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Formato no soportado. Subí una imagen JPG, PNG o WEBP.",
        )

    contenido = await archivo.read()
    if len(contenido) > _TAMANIO_MAXIMO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La imagen no puede pesar más de 5 MB.",
        )
    if not contenido:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo está vacío.",
        )

    extension = _TIPOS_IMAGEN_PERMITIDOS[archivo.content_type]
    nombre_archivo = f"{uuid4().hex}{extension}"
    destino = _DIR_FOTOS_PERFIL / nombre_archivo
    destino.write_bytes(contenido)

    foto_anterior = current_user.foto_perfil_url
    current_user.foto_perfil_url = f"/uploads/fotos_perfil/{nombre_archivo}"
    db.commit()
    db.refresh(current_user)

    if foto_anterior and foto_anterior.startswith("/uploads/fotos_perfil/"):
        archivo_anterior = Path("." + foto_anterior)
        if archivo_anterior.is_file():
            archivo_anterior.unlink(missing_ok=True)

    return current_user


# ─── POST /usuarios/me/password ──────────────────────────────────────────────

@router.post(
    "/me/password",
    status_code=status.HTTP_200_OK,
    summary="Cambiar la contraseña del usuario autenticado",
)
def cambiar_password(
    datos: schemas.UsuarioCambiarPassword,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    """
    El schema ya valida que password_nuevo == password_nuevo_confirmacion y
    que password_nuevo != password_actual. Acá solo falta validar la
    contraseña actual contra el hash guardado.
    """
    if not verify_password(datos.password_actual, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La contraseña actual no es correcta.",
        )

    current_user.password_hash = get_password_hash(datos.password_nuevo)
    current_user.requiere_cambio_password = False
    db.commit()

    return {"mensaje": "Contraseña actualizada correctamente."}


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
