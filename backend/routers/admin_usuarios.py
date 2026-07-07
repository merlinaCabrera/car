# backend/routers/admin_usuarios.py
"""
Router de administración de usuarios.
Todos los endpoints requieren rol 'admin_general' o 'personal_administrativo'.

── Agregar en main.py ──────────────────────────────────────────────────────────
    from routers import admin_usuarios
    app.include_router(admin_usuarios.router)
────────────────────────────────────────────────────────────────────────────────

── Endpoints de gestión de roles (nuevos) ──────────────────────────────────────
    GET  /admin/roles                          → catálogo de roles disponibles
    PUT  /admin/usuarios/{id_usuario}/roles    → reemplaza los roles de un usuario
────────────────────────────────────────────────────────────────────────────────
"""
from datetime import date, datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import delete, exists, or_
from sqlalchemy.orm import Session, joinedload

import models
import schemas
from database import get_db
from dependencies import get_current_user, require_roles
from security import get_password_hash

router = APIRouter(
    prefix="/admin/usuarios",
    tags=["Admin — Usuarios"],
)

_ADMIN = ("admin_general", "personal_administrativo")


# ══════════════════════════════════════════════════════════════════════════════
# SCHEMAS LOCALES
# Definidos aquí para no contaminar schemas.py con lógica exclusiva del admin.
# ══════════════════════════════════════════════════════════════════════════════

class UsuarioPendienteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id_usuario:   int
    dni:          str
    nombre:       str
    apellido:     str
    email:        Optional[str] = None
    fecha_ingreso: date
    creado_at:    datetime


# ── Schemas de Roles ──────────────────────────────────────────────────────────

class RolCatalogoResponse(BaseModel):
    """
    Respuesta del catálogo de roles.
    Solo expone los campos que el frontend necesita para poblar el selector:
    id, nombre legible y descripción.
    """
    model_config = ConfigDict(from_attributes=True)

    id_rol:          int
    nombre:          str
    descripcion:     Optional[str] = None
    peso_jerarquico: int
    es_activo:       bool


class ActualizarRolesPayload(BaseModel):
    """
    Payload para PUT /admin/usuarios/{id_usuario}/roles.

    `ids_roles` es la lista COMPLETA de roles que el usuario debe tener
    después de la operación. El endpoint hace un reemplazo total (no un merge).

    Restricciones de negocio validadas en el endpoint (no en Pydantic):
      - La lista puede estar vacía → el usuario queda sin roles (pendiente).
      - No se permiten IDs duplicados en la lista.
      - Los IDs deben existir en la tabla `roles` y estar activos.
      - No se puede remover el rol 'admin_general' del propio usuario autenticado
        (para evitar que el admin se quede sin acceso).
    """
    ids_roles: List[int] = Field(
        description="Lista COMPLETA de IDs de roles. Reemplaza los roles actuales del usuario."
    )


class RolAsignadoDetalle(BaseModel):
    """Detalle de un rol asignado — embebido en la respuesta del PUT."""
    model_config = ConfigDict(from_attributes=True)
    id_rol:      int
    nombre:      str
    asignado_at: datetime


class ActualizarRolesResponse(BaseModel):
    """Respuesta del PUT /admin/usuarios/{id_usuario}/roles."""
    ok:              bool
    id_usuario:      int
    dni:             str
    nombre_completo: str
    roles_anteriores: List[str]
    roles_nuevos:     List[str]


# ══════════════════════════════════════════════════════════════════════════════
# HELPERS INTERNOS
# ══════════════════════════════════════════════════════════════════════════════

def _subquery_con_roles_activos():
    ahora = datetime.now(timezone.utc)
    return (
        exists()
        .where(models.UsuarioRol.id_usuario == models.Usuario.id_usuario)
        .where(
            or_(
                models.UsuarioRol.valido_hasta.is_(None),
                models.UsuarioRol.valido_hasta > ahora,
            )
        )
    )


def _nombres_roles_activos(usuario: models.Usuario) -> list[str]:
    """Devuelve los nombres de roles vigentes de un usuario ya cargado con joinedload."""
    ahora = datetime.now(timezone.utc)
    return sorted(
        ur.rol.nombre
        for ur in usuario.roles_asignados
        if ur.rol
        and ur.rol.es_activo
        and (ur.valido_hasta is None or ur.valido_hasta > ahora)
    )


# ══════════════════════════════════════════════════════════════════════════════
# ENDPOINTS EXISTENTES (sin cambios funcionales, se mantienen íntegros)
# ══════════════════════════════════════════════════════════════════════════════

@router.get(
    "/pendientes",
    response_model=list[UsuarioPendienteResponse],
    summary="Solicitudes de alta pendientes de aprobación",
)
def get_usuarios_pendientes(
    db: Session = Depends(get_db),
    _: models.Usuario = Depends(require_roles(*_ADMIN)),
):
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
    ahora = datetime.now(timezone.utc)
    pendientes = []
    for u in usuarios_activos:
        tiene_rol_activo = any(
            ur.rol
            and ur.rol.es_activo
            and (ur.valido_hasta is None or ur.valido_hasta > ahora)
            for ur in u.roles_asignados
        )
        if not tiene_rol_activo:
            pendientes.append(u)
    return pendientes


@router.get(
    "/activos",
    response_model=list[schemas.UsuarioListResponse],
    summary="Listado de socios activos (usuarios con rol 'socio')",
)
def get_socios_activos(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    _: models.Usuario = Depends(require_roles(*_ADMIN)),
):
    """
    Devuelve una lista paginada de todos los usuarios que tienen el rol 'socio'
    activo y vigente.

    Utiliza una subconsulta para filtrar eficientemente por el rol 'socio',
    siguiendo el mismo patrón que el endpoint de listado general.
    """
    ahora = datetime.now(timezone.utc)

    # Subquery para obtener los IDs de los usuarios con el rol 'socio' activo.
    subq_socios_activos = (
        db.query(models.UsuarioRol.id_usuario)
        .join(models.Rol, models.UsuarioRol.id_rol == models.Rol.id_rol)
        .filter(
            models.Rol.nombre == "socio",
            models.Rol.es_activo.is_(True),
            or_(
                models.UsuarioRol.valido_hasta.is_(None),
                models.UsuarioRol.valido_hasta > ahora,
            ),
        )
        .subquery()
    )

    # Query principal que filtra usuarios por los IDs de la subquery.
    return (
        db.query(models.Usuario).filter(models.Usuario.id_usuario.in_(subq_socios_activos))
        .order_by(models.Usuario.apellido, models.Usuario.nombre).offset(skip).limit(limit).all()
    )


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
    usuario = db.query(models.Usuario).filter(models.Usuario.id_usuario == id_usuario).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    if usuario.fecha_baja is not None:
        raise HTTPException(status_code=400, detail="El usuario está dado de baja.")

    rol_socio = (
        db.query(models.Rol)
        .filter(models.Rol.nombre == "socio", models.Rol.es_activo.is_(True))
        .first()
    )
    if not rol_socio:
        raise HTTPException(status_code=500, detail="Rol 'socio' no encontrado. Verificá la migración seed de roles.")

    ya_existe = (
        db.query(models.UsuarioRol)
        .filter(
            models.UsuarioRol.id_usuario == id_usuario,
            models.UsuarioRol.id_rol == rol_socio.id_rol,
        )
        .first()
    )
    if ya_existe:
        raise HTTPException(status_code=409, detail="El usuario ya tiene el rol 'socio' asignado.")

    db.add(models.UsuarioRol(
        id_usuario=id_usuario,
        id_rol=rol_socio.id_rol,
        asignado_por=current_admin.id_usuario,
    ))
    db.add(models.AuditLog(
        usuario_actor=current_admin.id_usuario,
        accion="APROBAR_SOLICITUD_SOCIO",
        tabla_afectada="usuarios_roles",
        registro_id=id_usuario,
        detalle={
            "antes":  {"roles": []},
            "despues": {"roles": ["socio"]},
            "usuario_aprobado_dni": usuario.dni,
            "aprobado_por_dni": current_admin.dni,
        },
    ))
    db.commit()
    return {
        "ok": True,
        "mensaje": f"{usuario.nombre} {usuario.apellido} fue aprobado como socio.",
        "id_usuario": id_usuario,
        "rol_asignado": "socio",
    }


@router.post(
    "/",
    response_model=schemas.UsuarioResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Crear un nuevo socio manualmente (Admin)",
)
def crear_socio_manual(
    usuario_in: schemas.UsuarioCreate,
    db: Session = Depends(get_db),
    current_admin: models.Usuario = Depends(require_roles(*_ADMIN)),
):
    if db.query(models.Usuario).filter(models.Usuario.dni == usuario_in.dni).first():
        raise HTTPException(status_code=400, detail="El DNI ya está registrado.")
    if usuario_in.email and db.query(models.Usuario).filter(models.Usuario.email == usuario_in.email).first():
        raise HTTPException(status_code=400, detail="El email ya está registrado.")

    hashed_password = get_password_hash(usuario_in.password)
    user_data = usuario_in.model_dump(exclude={"password"})
    nuevo_usuario = models.Usuario(**user_data, password_hash=hashed_password, requiere_cambio_password=True)
    db.add(nuevo_usuario)
    db.flush()

    rol_socio = db.query(models.Rol).filter(models.Rol.nombre == "socio").first()
    if not rol_socio:
        raise HTTPException(status_code=500, detail="Rol 'socio' no encontrado en la base de datos.")

    db.add(models.UsuarioRol(
        id_usuario=nuevo_usuario.id_usuario,
        id_rol=rol_socio.id_rol,
        asignado_por=current_admin.id_usuario,
    ))
    db.add(models.AuditLog(
        usuario_actor=current_admin.id_usuario,
        accion="CREAR_SOCIO_MANUAL",
        tabla_afectada="usuarios",
        registro_id=nuevo_usuario.id_usuario,
        detalle={"socio_creado_dni": nuevo_usuario.dni, "creado_por_dni": current_admin.dni},
    ))
    db.commit()
    db.refresh(nuevo_usuario)
    return nuevo_usuario


@router.patch(
    "/{id_usuario}",
    response_model=schemas.UsuarioResponse,
    summary="Editar datos de un socio (Admin)",
)
def editar_socio(
    id_usuario: int,
    datos: schemas.UsuarioUpdate,
    db: Session = Depends(get_db),
    current_admin: models.Usuario = Depends(require_roles(*_ADMIN)),
):
    usuario = db.query(models.Usuario).filter(models.Usuario.id_usuario == id_usuario).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")

    update_data = datos.model_dump(exclude_unset=True)
    for campo, valor in update_data.items():
        setattr(usuario, campo, valor)

    db.add(models.AuditLog(
        usuario_actor=current_admin.id_usuario,
        accion="EDITAR_SOCIO",
        tabla_afectada="usuarios",
        registro_id=id_usuario,
        detalle={"cambios": update_data, "editado_por_dni": current_admin.dni},
    ))
    db.commit()
    db.refresh(usuario)
    return usuario


@router.delete(
    "/{id_usuario}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Dar de baja a un socio (Baja Lógica)",
)
def dar_baja_socio(
    id_usuario: int,
    db: Session = Depends(get_db),
    current_admin: models.Usuario = Depends(require_roles(*_ADMIN)),
):
    usuario = db.query(models.Usuario).filter(models.Usuario.id_usuario == id_usuario).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    if usuario.fecha_baja is not None:
        raise HTTPException(status_code=400, detail="El usuario ya se encuentra dado de baja.")

    usuario.fecha_baja = date.today()
    db.add(models.AuditLog(
        usuario_actor=current_admin.id_usuario,
        accion="BAJA_SOCIO",
        tabla_afectada="usuarios",
        registro_id=id_usuario,
        detalle={
            "socio_baja_dni": usuario.dni,
            "fecha_baja": usuario.fecha_baja.isoformat(),
            "dado_de_baja_por_dni": current_admin.dni,
        },
    ))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch(
    "/{id_usuario}/reactivar",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Reactivar un socio dado de baja",
)
def reactivar_socio(
    id_usuario: int,
    db: Session = Depends(get_db),
    current_admin: models.Usuario = Depends(require_roles(*_ADMIN)),
):
    usuario = db.query(models.Usuario).filter(models.Usuario.id_usuario == id_usuario).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    if usuario.fecha_baja is None:
        raise HTTPException(status_code=400, detail="El usuario ya se encuentra activo.")

    usuario.fecha_baja = None
    db.add(models.AuditLog(
        usuario_actor=current_admin.id_usuario,
        accion="REACTIVAR_SOCIO",
        tabla_afectada="usuarios",
        registro_id=id_usuario,
        detalle={"socio_reactivado_dni": usuario.dni, "reactivado_por_dni": current_admin.dni},
    ))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/",
    response_model=list[schemas.UsuarioListResponse],
    summary="Listado general de todos los socios aprobados",
)
def listar_todos_los_usuarios(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    _: models.Usuario = Depends(require_roles(*_ADMIN)),
):
    """
    Lista todos los socios aprobados (con rol 'socio' activo), ordenados por
    apellido/nombre.

    Este endpoint alimenta la tabla principal de socios en el panel de
    administración. Los usuarios pendientes de aprobación (sin rol) se listan
    en el endpoint /pendientes.
    """
    ahora = datetime.now(timezone.utc)
    # Subquery: IDs de usuarios que tienen el rol 'socio', activo y no expirado.
    subq_socios = (
        db.query(models.UsuarioRol.id_usuario)
        .join(models.Rol, models.UsuarioRol.id_rol == models.Rol.id_rol)
        .filter(
            models.Rol.nombre == "socio",
            models.Rol.es_activo.is_(True),
            or_(
                models.UsuarioRol.valido_hasta.is_(None),
                models.UsuarioRol.valido_hasta > ahora,
            ),
        )
        .subquery()
    )

    query = db.query(models.Usuario).filter(models.Usuario.id_usuario.in_(subq_socios))

    return (
        query
        .order_by(models.Usuario.apellido, models.Usuario.nombre)
        .offset(skip)
        .limit(limit)
        .all()
    )


# ══════════════════════════════════════════════════════════════════════════════
# ENDPOINTS NUEVOS — GESTIÓN DE ROLES
# ══════════════════════════════════════════════════════════════════════════════

@router.get(
    "/roles",                                  # ← IMPORTANTE: declarar ANTES de /{id_usuario}
    response_model=list[RolCatalogoResponse],
    summary="Catálogo de roles disponibles en el sistema",
    tags=["Admin — Roles"],
)
def listar_roles(
    solo_activos: bool = True,
    db: Session = Depends(get_db),
    _: models.Usuario = Depends(require_roles(*_ADMIN)),
):
    """
    Devuelve todos los roles del sistema ordenados por jerarquía descendente.

    `solo_activos=true` (default): omite roles desactivados.
    `solo_activos=false`: devuelve el catálogo completo (útil para auditoría).

    El frontend usa esta respuesta para poblar el selector de roles en la UI
    de edición de un socio.

    ⚠️  Ruta declarada ANTES de /{id_usuario} para que FastAPI no interprete
        "roles" como un id_usuario dinámico.
    """
    query = db.query(models.Rol)

    if solo_activos:
        query = query.filter(models.Rol.es_activo.is_(True))

    return query.order_by(models.Rol.peso_jerarquico.desc()).all()


@router.put(
    "/{id_usuario}/roles",
    response_model=ActualizarRolesResponse,
    summary="Reemplazar los roles de un usuario (operación total)",
    tags=["Admin — Roles"],
)
def actualizar_roles_usuario(
    id_usuario: int,
    payload: ActualizarRolesPayload,
    db: Session = Depends(get_db),
    current_admin: models.Usuario = Depends(require_roles("admin_general")),
    #                                        ↑ Solo admin_general puede cambiar roles.
    #                                          personal_administrativo no tiene este permiso.
):
    """
    Reemplaza el conjunto de roles de un usuario en una única transacción.
    El rol 'admin_general' está PROTEGIDO y no puede ser tocado por este endpoint:
      - Si aparece en el payload → 403 inmediato.
      - El DELETE del paso 3 lo PRESERVA (no lo elimina aunque no esté en el payload).
    Para modificar el rol admin_general hay que operar directamente en la base de datos.

    Flujo atómico:
      1. Cargar el usuario con sus roles actuales (para el snapshot de auditoría).
      2. Validar restricciones de negocio (incluyendo guardia sobre admin_general).
      3. DELETE de las filas de `usuarios_roles` del usuario, EXCEPTO admin_general.
      4. INSERT de los nuevos roles (que no incluirán admin_general).
      5. Insertar en `audit_log` con estado antes/después.
      6. Commit único.

    Restricciones de negocio aplicadas:
      - admin_general en el payload → 403 (solo se modifica desde la BD).
      - IDs de roles duplicados en el payload → 400.
      - Algún id_rol no existe o está inactivo → 422 con detalle.
      - El admin no puede quitarse su propio rol 'admin_general' → 403.
      - El usuario destino no puede estar dado de baja → 400.
    """

    # ── 1. Cargar usuario con roles actuales ─────────────────────────────────
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
        raise HTTPException(
            status_code=400,
            detail="No se pueden modificar roles de un usuario dado de baja.",
        )

    # Snapshot del estado previo ANTES de cualquier cambio
    roles_anteriores = _nombres_roles_activos(usuario)

    # ── 2. Validaciones de negocio ────────────────────────────────────────────

    ids_nuevos = payload.ids_roles

    # ─────────────────────────────────────────────────────────────────────────
    # 2a. GUARDIA DE SEGURIDAD: admin_general protegido de la API
    #
    # Buscamos el rol admin_general UNA SOLA VEZ y reutilizamos su ID en los
    # pasos siguientes (validación, DELETE, INSERT). Si la BD no tiene ese rol
    # (seeds no ejecutados), id_admin_general queda None y las guardas se omiten
    # de forma segura.
    # ─────────────────────────────────────────────────────────────────────────
    rol_admin_general_obj = (
        db.query(models.Rol)
        .filter(models.Rol.nombre == "admin_general")
        .first()
    )
    id_admin_general = rol_admin_general_obj.id_rol if rol_admin_general_obj else None

    if id_admin_general is not None and id_admin_general in set(ids_nuevos):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "El rol 'Admin General' solo puede modificarse directamente "
                "en la base de datos. No está permitido asignarlo o quitarlo "
                "desde esta interfaz."
            ),
        )

    # 2b. IDs duplicados en el payload
    if len(ids_nuevos) != len(set(ids_nuevos)):
        raise HTTPException(
            status_code=400,
            detail="La lista de roles contiene IDs duplicados.",
        )

    # 2c. Auto-remoción del propio rol admin_general
    #     (protección redundante con 2a, pero se mantiene por claridad semántica)
    if current_admin.id_usuario == id_usuario and id_admin_general is not None:
        if id_admin_general not in set(ids_nuevos):
            tiene_admin = any(
                ur.rol and ur.rol.nombre == "admin_general"
                for ur in usuario.roles_asignados
            )
            if tiene_admin:
                raise HTTPException(
                    status_code=403,
                    detail=(
                        "No podés quitarte tu propio rol de 'admin_general'. "
                        "Pedile a otro administrador que lo haga."
                    ),
                )

    # 2d. Verificar que todos los IDs existan y estén activos
    roles_validos: dict = {}
    if ids_nuevos:
        roles_db = (
            db.query(models.Rol)
            .filter(models.Rol.id_rol.in_(ids_nuevos))
            .all()
        )
        ids_encontrados = {r.id_rol for r in roles_db}
        ids_faltantes   = set(ids_nuevos) - ids_encontrados
        if ids_faltantes:
            raise HTTPException(
                status_code=422,
                detail=f"Los siguientes IDs de rol no existen: {sorted(ids_faltantes)}",
            )
        ids_inactivos = [r.id_rol for r in roles_db if not r.es_activo]
        if ids_inactivos:
            raise HTTPException(
                status_code=422,
                detail=f"Los siguientes roles están desactivados y no se pueden asignar: {ids_inactivos}",
            )
        roles_validos = {r.id_rol: r for r in roles_db}

    # ── 3. DELETE de roles del usuario, PRESERVANDO admin_general ─────────────
    #
    # El DELETE excluye explícitamente las filas de admin_general para que este
    # endpoint nunca pueda quitar ese rol, ni siquiera por omisión en el payload.
    # Admin_general solo se puede agregar o quitar directamente en la BD.
    #
    # Usamos sqlalchemy.delete() (Core) en lugar de ORM para hacer la operación
    # en un único round-trip a la BD, sin N+1 queries.
    #
    stmt_delete = (
        delete(models.UsuarioRol)
        .where(models.UsuarioRol.id_usuario == id_usuario)
    )
    if id_admin_general is not None:
        # Excluir la fila de admin_general si existe: así no la tocamos
        stmt_delete = stmt_delete.where(
            models.UsuarioRol.id_rol != id_admin_general
        )
    db.execute(stmt_delete)

    # ── 4. INSERT de los nuevos roles ─────────────────────────────────────────
    #
    # ids_nuevos ya fue validado en 2a para no contener admin_general.
    # Cada rol se asigna como permanente (valido_hasta=None).
    #
    nuevos_roles_orm = [
        models.UsuarioRol(
            id_usuario=id_usuario,
            id_rol=id_rol,
            asignado_por=current_admin.id_usuario,
            # valido_hasta=None → permanente
        )
        for id_rol in ids_nuevos
    ]
    if nuevos_roles_orm:
        db.add_all(nuevos_roles_orm)

    # ── 5. Audit log ──────────────────────────────────────────────────────────
    roles_nuevos_nombres = sorted(
        roles_validos[id_rol].nombre
        for id_rol in ids_nuevos
    ) if ids_nuevos else []

    db.add(
        models.AuditLog(
            usuario_actor=current_admin.id_usuario,
            accion="CAMBIO_ROLES",
            tabla_afectada="usuarios_roles",
            registro_id=id_usuario,
            detalle={
                "antes":   {"roles": roles_anteriores},
                "despues": {"roles": roles_nuevos_nombres},
                "usuario_afectado_dni": usuario.dni,
                "modificado_por_dni":   current_admin.dni,
                "admin_general_preservado": id_admin_general is not None,
            },
        )
    )

    # ── 6. Commit único (todo o nada) ─────────────────────────────────────────
    db.commit()

    return ActualizarRolesResponse(
        ok=True,
        id_usuario=id_usuario,
        dni=usuario.dni,
        nombre_completo=f"{usuario.nombre} {usuario.apellido}",
        roles_anteriores=roles_anteriores,
        roles_nuevos=roles_nuevos_nombres,
    )
    
    
@router.get(
    "/{id_usuario}",
    response_model=schemas.UsuarioResponse,
    summary="Detalle completo de un usuario (incluye roles_asignados)",
)
def get_usuario_detalle(
    id_usuario: int,
    db: Session = Depends(get_db),
    _: models.Usuario = Depends(require_roles(*_ADMIN)),
):
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
    return usuario