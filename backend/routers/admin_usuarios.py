# backend/routers/admin_usuarios.py
"""
Router de administración de usuarios.
Todos los endpoints requieren rol 'admin_general' o 'personal_administrativo'.

── Agregar en main.py ──────────────────────────────────────────────────────────
    from routers import admin_usuarios
    app.include_router(admin_usuarios.router)
────────────────────────────────────────────────────────────────────────────────
"""
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Response
from pydantic import BaseModel, ConfigDict
from sqlalchemy import exists, or_, select
from sqlalchemy.orm import Session, joinedload

import models
import schemas
from database import get_db
from dependencies import get_current_user, require_roles

router = APIRouter(
    prefix="/admin/usuarios",
    tags=["Admin — Usuarios"],
)

# ─── Accesos permitidos ───────────────────────────────────────────────────────
# Tanto admin_general como personal_administrativo pueden gestionar socios.
_ADMIN = ("admin_general", "personal_administrativo")


# ─── Schema local (ligero, sin cargar relaciones pesadas) ────────────────────

class UsuarioPendienteResponse(BaseModel):
    """Datos mínimos necesarios para la bandeja de solicitudes."""
    model_config = ConfigDict(from_attributes=True)

    id_usuario: int
    dni: str
    nombre: str
    apellido: str
    email: Optional[str] = None
    fecha_ingreso: date
    creado_at: datetime


# ─── Helper ──────────────────────────────────────────────────────────────────

def _subquery_con_roles_activos():
    """
    Subquery EXISTS: True si el usuario tiene al menos un rol no expirado.
    Se usa para filtrar los 'pendientes' (usuarios SIN ningún rol activo).
    """
    return (
        exists()
        .where(models.UsuarioRol.id_usuario == models.Usuario.id_usuario)
        .where(
            or_(
                models.UsuarioRol.valido_hasta.is_(None),
                models.UsuarioRol.valido_hasta > datetime.now(timezone.utc),
            )
        )
    )


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.get(
    "/pendientes",
    response_model=list[UsuarioPendienteResponse],
    summary="Solicitudes de alta pendientes de aprobación",
)
def get_usuarios_pendientes(
    db: Session = Depends(get_db),
    _: models.Usuario = Depends(require_roles(*_ADMIN)),
):
    """
    Retorna usuarios activos que NO tienen ningún rol activo asignado.
    Son los que se registraron pero aún no fueron aprobados. Incluye un print
    de debug en la consola del servidor para inspeccionar los roles de cada usuario.
    """
    # 1. Obtener todos los usuarios activos, cargando sus roles para inspección
    usuarios_activos = (
        db.query(models.Usuario)
        .options(
            joinedload(models.Usuario.roles_asignados)
            .joinedload(models.UsuarioRol.rol)
        )
        .filter(models.Usuario.fecha_baja.is_(None))
        .order_by(models.Usuario.creado_at.desc())
        .all()
    )

    pendientes = []
    now = datetime.now(timezone.utc)

    print("\n--- [DEBUG] INICIO DE VERIFICACIÓN DE USUARIOS PENDIENTES ---")
    for u in usuarios_activos:
        # El print de debug que solicitaste
        print(f"DEBUG: Usuario {u.dni} ({u.apellido}) tiene roles: {u.roles_asignados}")

        # Lógica para determinar si tiene roles activos y válidos
        tiene_rol_activo = any(
            ur.rol and ur.rol.es_activo and (ur.valido_hasta is None or ur.valido_hasta > now)
            for ur in u.roles_asignados
        )

        if not tiene_rol_activo:
            pendientes.append(u)
            print(f"  └──> AÑADIDO A PENDIENTES. No tiene roles activos válidos.")
    print("--- [DEBUG] FIN DE VERIFICACIÓN ---\n")

    return pendientes


@router.post(
    "/{id_usuario}/aprobar",
    status_code=status.HTTP_200_OK,
    summary="Aprobar solicitud — asigna el rol 'socio'",
)
def aprobar_usuario(
    id_usuario: int,
    db: Session = Depends(get_db),
    current_admin: models.Usuario = Depends(require_roles(*_ADMIN)),
):
    """
    Flujo de aprobación:
      1. Verifica que el usuario exista, esté activo y no tenga el rol ya.
      2. Inserta la fila en usuarios_roles (sin fecha de expiración).
      3. Registra la acción en audit_log.
    Todo ocurre en una única transacción.
    """
    # 1 — Cargar usuario destino
    usuario = (
        db.query(models.Usuario)
        .filter(models.Usuario.id_usuario == id_usuario)
        .first()
    )
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    if usuario.fecha_baja is not None:
        raise HTTPException(status_code=400, detail="El usuario está dado de baja.")

    # 2 — Verificar que el rol 'socio' exista en el catálogo
    rol_socio = (
        db.query(models.Rol)
        .filter(models.Rol.nombre == "socio", models.Rol.es_activo.is_(True))
        .first()
    )
    if not rol_socio:
        raise HTTPException(
            status_code=500,
            detail="Rol 'socio' no encontrado. Verificá la migración seed de roles.",
        )

    # 3 — Prevenir duplicados
    ya_existe = (
        db.query(models.UsuarioRol)
        .filter(
            models.UsuarioRol.id_usuario == id_usuario,
            models.UsuarioRol.id_rol == rol_socio.id_rol,
        )
        .first()
    )
    if ya_existe:
        raise HTTPException(
            status_code=409,
            detail="El usuario ya tiene el rol 'socio' asignado.",
        )

    # 4 — Asignar rol (validez permanente: valido_hasta=None)
    nuevo_rol = models.UsuarioRol(
        id_usuario=id_usuario,
        id_rol=rol_socio.id_rol,
        asignado_por=current_admin.id_usuario,
    )
    db.add(nuevo_rol)

    # 5 — Audit log
    db.add(
        models.AuditLog(
            usuario_actor=current_admin.id_usuario,
            accion="APROBAR_SOLICITUD_SOCIO",
            tabla_afectada="usuarios_roles",
            registro_id=id_usuario,
            detalle={
                "usuario_aprobado_dni": usuario.dni,
                "usuario_aprobado_nombre": f"{usuario.nombre} {usuario.apellido}",
                "rol_asignado": "socio",
                "aprobado_por_dni": current_admin.dni,
            },
        )
    )

    db.commit()

    return {
        "ok": True,
        "mensaje": f"{usuario.nombre} {usuario.apellido} fue aprobado como socio.",
        "id_usuario": id_usuario,
        "rol_asignado": "socio",
    }


@router.get(
    "/",
    response_model=list[schemas.UsuarioListResponse],
    summary="Listado general de todos los usuarios activos",
)
def listar_todos_los_usuarios(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    _: models.Usuario = Depends(require_roles(*_ADMIN)),
):
    """
    Listado paginado de usuarios activos (con y sin roles).
    Ordenado alfabéticamente por apellido.
    """
    return (
        db.query(models.Usuario)
        .filter(models.Usuario.fecha_baja.is_(None))
        .order_by(models.Usuario.apellido, models.Usuario.nombre)
        .offset(skip)
        .limit(limit)
        .all()
    )