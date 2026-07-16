# backend/routers/deportivo.py
"""
Router del Módulo Deportivo & Eventos.

Endpoints:
  Categorías
    GET    /deportivo/categorias                              → Listado (activas por default)
    POST   /deportivo/categorias                               → Alta de categoría
    PATCH  /deportivo/categorias/{id_categoria}                → Edición (incluye baja lógica es_activa)

  Jugadores (tabla puente UsuarioCategoria)
    GET    /deportivo/categorias/{id_categoria}/jugadores       → Plantel de una temporada
    POST   /deportivo/categorias/{id_categoria}/jugadores       → Inscribir un socio
    DELETE /deportivo/categorias/{id_categoria}/jugadores/{id_usuario} → Baja del plantel

  Eventos
    GET    /deportivo/eventos                                   → Listado con filtros
    GET    /deportivo/mis-eventos                                → Atajo: eventos del jugador logueado
    GET    /deportivo/eventos/hoy                                → Eventos de hoy (selector del Admin Temporal)
    POST   /deportivo/eventos                                    → Alta de evento
    PATCH  /deportivo/eventos/{id_evento}                        → Edición (incluye cambio de estado)

  Convocatorias (citación previa al evento, la arma el técnico)
    GET    /deportivo/eventos/{id_evento}/convocatorias          → Listado (técnico/admin)
    POST   /deportivo/eventos/{id_evento}/convocar                → Fija la lista de convocados
                                                                     (upsert: agrega los nuevos,
                                                                     quita los que ya no están,
                                                                     NO pisa el estado de los que
                                                                     se mantienen — ver nota abajo)
    DELETE /deportivo/eventos/{id_evento}/convocatorias/{id_usuario} → Sacar un convocado puntual
    PATCH  /deportivo/mis-eventos/{id_evento}/confirmar          → El jugador confirma/rechaza
    POST   /deportivo/eventos/{id_evento}/convocatorias/cerrar   → Cierre: cruza convocatorias
                                                                     contra asistencias reales y
                                                                     marca presente/ausente

  Asistencias (control de puerta)
    POST   /deportivo/eventos/{id_evento}/asistencias            → Registrar ingreso (QR o DNI)
    GET    /deportivo/eventos/{id_evento}/asistencias            → Planilla de presentismo

Roles:
  - "tecnico" y "admin_general" administran categorías, planteles y eventos.
    ("tecnico" es un rol de datos — una fila más en la tabla `roles` que ya
    tenés, asignable desde admin_usuarios.py — no requiere ninguna columna
    ni tabla nueva.)
  - "admin_temporal" (el controlador de puerta) solo puede leer "eventos de
    hoy" y registrar/listar asistencias; no administra categorías ni eventos.
  - Cualquier usuario autenticado puede leer el listado general de eventos
    (GET /deportivo/eventos) y el jugador tiene su atajo dedicado.

Decisiones técnicas:
  - `estado_financiero_snapshot` se calcula EN EL MOMENTO del escaneo, nunca
    se recibe del frontend: 'al_dia' si deuda_historica_meses == 0, si no
    'moroso'. Es un snapshot inmutable — cambios posteriores en la deuda del
    socio no alteran registros de Asistencia ya creados.
  - `AsistenciaCreate` ya trae `id_evento` en el body (así está definido en
    schemas.py); igual se exige el mismo id en la URL y se valida que
    coincidan, para que la ruta sea inequívoca y no se pueda registrar una
    asistencia en un evento distinto al que dice la URL por error de cliente.
  - La resolución de "qué Usuario es este QR" ya la hace el flujo existente
    de qr_auth.py (que devuelve id_usuario a partir del qr_token). Este
    router recibe siempre `id_usuario` ya resuelto — mantiene una única
    responsabilidad (registrar la asistencia), sin duplicar lógica de
    decodificación de QR que ya vive en otro lado.
  - Jugadores del plantel: se filtra siempre por `temporada` (default: año
    actual), porque la PK de UsuarioCategoria es compuesta
    (id_usuario, id_categoria, temporada) — el mismo socio puede repetirse
    en distintas temporadas.
  - `convocar_jugadores_evento` hace UPSERT, no reemplazo destructivo: si el
    técnico corrige la lista y vuelve a enviarla, los jugadores que ya habían
    confirmado/rechazado NO pierden ese estado solo por seguir en la lista.
    Se borran únicamente los que quedaron afuera, y se agregan (en 'citado')
    los que son nuevos. Antes esto hacía DELETE+INSERT total, lo que reseteaba
    a 'citado' cualquier confirmación ya hecha — se corrige acá.
  - El cierre de convocatorias (`/convocatorias/cerrar`) NO depende de que el
    técnico marque nada a mano: cruza automáticamente contra `asistencias`
    (quien escaneó QR/DNI en la puerta de ESE evento) y decide presente/ausente.
    Es idempotente — correrlo dos veces da el mismo resultado.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import List, Optional, Set

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel, Field

import models
import schemas
from database import get_db
from dependencies import get_current_user, require_roles

router = APIRouter(
    prefix="/deportivo",
    tags=["Deportivo — Categorías, Eventos y Asistencias"],
)

_ROLES_TECNICO = ("personal_tecnico", "admin_general")
_ROLES_PUERTA = ("admin_temporal", "personal_tecnico", "admin_general", "personal_administrativo")
_ROLES_JUGADOR = ("socio", "jugador")
_ROLES_AUTOCOMPLETAR = ("admin_general",)  # Solo el Admin General ve y usa este botón.


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _extraer_ip(request: Request) -> Optional[str]:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return getattr(request.client, "host", None)


def _registrar_audit(
    *,
    db: Session,
    actor_id: int,
    accion: str,
    tabla_afectada: str,
    registro_id: Optional[int],
    detalle: dict,
    ip: Optional[str] = None,
) -> None:
    db.add(
        models.AuditLog(
            usuario_actor=actor_id,
            accion=accion,
            tabla_afectada=tabla_afectada,
            registro_id=registro_id,
            detalle=detalle,
            ip_origen=ip,
        )
    )


def _obtener_categoria_o_404(db: Session, id_categoria: int) -> models.CategoriaDeportiva:
    categoria = (
        db.query(models.CategoriaDeportiva)
        .filter(models.CategoriaDeportiva.id_categoria == id_categoria)
        .first()
    )
    if categoria is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No existe una categoría deportiva con id {id_categoria}.",
        )
    return categoria


def _obtener_evento_o_404(db: Session, id_evento: int) -> models.Evento:
    evento = (
        db.query(models.Evento)
        .options(joinedload(models.Evento.categoria))
        .filter(models.Evento.id_evento == id_evento)
        .first()
    )
    if evento is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No existe un evento con id {id_evento}.",
        )
    return evento


def _temporada_actual() -> str:
    return str(date.today().year)


def _tiene_rol_jugador(db: Session, id_usuario: int) -> bool:
    return (
        db.query(models.UsuarioRol)
        .join(models.Rol, models.Rol.id_rol == models.UsuarioRol.id_rol)
        .filter(
            models.UsuarioRol.id_usuario == id_usuario,
            models.Rol.nombre == "jugador",
        )
        .first()
        is not None
    )


# ═════════════════════════════════════════════════════════════════════════════
# CATEGORÍAS DEPORTIVAS
# ═════════════════════════════════════════════════════════════════════════════

@router.get(
    "/categorias",
    response_model=List[schemas.CategoriaDeportivaResponse],
    summary="Listar categorías deportivas",
)
def listar_categorias(
    incluir_inactivas: bool = Query(
        default=False,
        description="Si es true, incluye también las categorías con es_activa=False.",
    ),
    db: Session = Depends(get_db),
    _usuario: models.Usuario = Depends(get_current_user),
) -> List[models.CategoriaDeportiva]:
    query = db.query(models.CategoriaDeportiva)
    if not incluir_inactivas:
        query = query.filter(models.CategoriaDeportiva.es_activa.is_(True))
    return query.order_by(models.CategoriaDeportiva.nombre.asc()).all()


@router.post(
    "/categorias",
    response_model=schemas.CategoriaDeportivaResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Crear una nueva categoría deportiva",
)
def crear_categoria(
    payload: schemas.CategoriaDeportivaCreate,
    request: Request,
    db: Session = Depends(get_db),
    tecnico: models.Usuario = Depends(require_roles(*_ROLES_TECNICO)),
) -> models.CategoriaDeportiva:
    ya_existe = (
        db.query(models.CategoriaDeportiva.id_categoria)
        .filter(func.lower(models.CategoriaDeportiva.nombre) == payload.nombre.lower())
        .first()
    )
    if ya_existe is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Ya existe una categoría llamada '{payload.nombre}'.",
        )

    nueva = models.CategoriaDeportiva(
        nombre=payload.nombre,
        descripcion=payload.descripcion,
        es_activa=payload.es_activa,
        fecha_corte_min=payload.fecha_corte_min,
        fecha_corte_max=payload.fecha_corte_max,
    )
    db.add(nueva)
    db.flush()

    _registrar_audit(
        db=db,
        actor_id=tecnico.id_usuario,
        accion="CREAR_CATEGORIA_DEPORTIVA",
        tabla_afectada="categorias_deportivas",
        registro_id=nueva.id_categoria,
        detalle={"despues": payload.model_dump(mode="json")},
        ip=_extraer_ip(request),
    )
    db.commit()
    db.refresh(nueva)

    return nueva


@router.patch(
    "/categorias/{id_categoria}",
    response_model=schemas.CategoriaDeportivaResponse,
    summary="Editar una categoría (incluye baja lógica con es_activa=False y cortes de edad)",
)
def editar_categoria(
    id_categoria: int,
    payload: schemas.CategoriaDeportivaUpdate,
    request: Request,
    db: Session = Depends(get_db),
    tecnico: models.Usuario = Depends(require_roles(*_ROLES_TECNICO)),
) -> models.CategoriaDeportiva:
    categoria = _obtener_categoria_o_404(db, id_categoria)

    cambios = payload.model_dump(exclude_unset=True)
    if not cambios:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se envió ningún campo para actualizar.",
        )

    # Validamos el rango de cortes considerando el valor final (viejo + nuevo combinado),
    # ya que un PATCH puede tocar un solo corte y dejar el otro con el valor ya existente.
    corte_min_final = cambios.get("fecha_corte_min", categoria.fecha_corte_min)
    corte_max_final = cambios.get("fecha_corte_max", categoria.fecha_corte_max)
    if (
        corte_min_final is not None
        and corte_max_final is not None
        and corte_min_final > corte_max_final
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="fecha_corte_min no puede ser posterior a fecha_corte_max.",
        )

    if "nombre" in cambios:
        ya_existe = (
            db.query(models.CategoriaDeportiva.id_categoria)
            .filter(
                func.lower(models.CategoriaDeportiva.nombre) == cambios["nombre"].lower(),
                models.CategoriaDeportiva.id_categoria != id_categoria,
            )
            .first()
        )
        if ya_existe is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Ya existe una categoría llamada '{cambios['nombre']}'.",
            )

    antes = {
        "nombre": categoria.nombre,
        "descripcion": categoria.descripcion,
        "es_activa": categoria.es_activa,
        "fecha_corte_min": categoria.fecha_corte_min.isoformat() if categoria.fecha_corte_min else None,
        "fecha_corte_max": categoria.fecha_corte_max.isoformat() if categoria.fecha_corte_max else None,
    }

    for campo, valor in cambios.items():
        setattr(categoria, campo, valor)

    _registrar_audit(
        db=db,
        actor_id=tecnico.id_usuario,
        accion="EDITAR_CATEGORIA_DEPORTIVA",
        tabla_afectada="categorias_deportivas",
        registro_id=categoria.id_categoria,
        detalle={"antes": antes, "despues": payload.model_dump(mode="json", exclude_unset=True)},
        ip=_extraer_ip(request),
    )
    db.commit()
    db.refresh(categoria)

    return categoria


# ═════════════════════════════════════════════════════════════════════════════
# JUGADORES DEL PLANTEL (UsuarioCategoria)
# ═════════════════════════════════════════════════════════════════════════════

@router.get(
    "/categorias/{id_categoria}/jugadores",
    response_model=List[schemas.UsuarioCategoriaResponse],
    summary="Listar el plantel de una categoría en una temporada",
)
def listar_jugadores_categoria(
    id_categoria: int,
    temporada: str = Query(
        default=None,
        description="Año de temporada. Si se omite, usa la temporada actual.",
    ),
    db: Session = Depends(get_db),
    # NOTA: se usa nombre explícito (sin guión bajo) para garantizar que FastAPI
    # resuelva la dependencia require_roles correctamente en todos los entornos.
    # El 403 previo ocurría porque el prefijo /deportivo no estaba registrado en
    # el router principal o el token JWT no incluía el rol "tecnico" exactamente
    # así (verificar tabla `roles` y la función require_roles en dependencies.py).
    tecnico: models.Usuario = Depends(require_roles(*_ROLES_TECNICO)),
) -> List[models.UsuarioCategoria]:
    _obtener_categoria_o_404(db, id_categoria)
    temporada_filtro = temporada or _temporada_actual()

    return (
        db.query(models.UsuarioCategoria)
        .options(
            joinedload(models.UsuarioCategoria.usuario),
            joinedload(models.UsuarioCategoria.categoria),
        )
        .filter(
            models.UsuarioCategoria.id_categoria == id_categoria,
            models.UsuarioCategoria.temporada == temporada_filtro,
        )
        .all()
    )


@router.post(
    "/categorias/{id_categoria}/jugadores",
    response_model=schemas.UsuarioCategoriaResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Inscribir un socio en el plantel de una categoría",
)
def inscribir_jugador(
    id_categoria: int,
    payload: schemas.UsuarioCategoriaCreate,
    request: Request,
    db: Session = Depends(get_db),
    tecnico: models.Usuario = Depends(require_roles(*_ROLES_TECNICO)),
) -> models.UsuarioCategoria:
    if payload.id_categoria != id_categoria:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El id_categoria del body no coincide con el de la URL.",
        )

    _obtener_categoria_o_404(db, id_categoria)

    usuario = (
        db.query(models.Usuario)
        .filter(models.Usuario.id_usuario == payload.id_usuario)
        .first()
    )
    if usuario is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No existe un usuario con id {payload.id_usuario}.",
        )
    if usuario.fecha_baja is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se puede inscribir a un socio dado de baja.",
        )
    if not _tiene_rol_jugador(db, usuario.id_usuario):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se pueden inscribir en un plantel socios con el rol 'jugador'.",
        )

    ya_inscripto = (
        db.query(models.UsuarioCategoria)
        .filter(
            models.UsuarioCategoria.id_usuario == payload.id_usuario,
            models.UsuarioCategoria.id_categoria == id_categoria,
            models.UsuarioCategoria.temporada == payload.temporada,
        )
        .first()
    )
    if ya_inscripto is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"El socio {payload.id_usuario} ya está inscripto en esta "
                f"categoría para la temporada {payload.temporada}."
            ),
        )

    nueva_inscripcion = models.UsuarioCategoria(
        id_usuario=payload.id_usuario,
        id_categoria=id_categoria,
        temporada=payload.temporada,
        es_capitan=payload.es_capitan,
    )
    db.add(nueva_inscripcion)
    db.flush()

    _registrar_audit(
        db=db,
        actor_id=tecnico.id_usuario,
        accion="INSCRIBIR_JUGADOR",
        tabla_afectada="usuarios_categorias",
        registro_id=payload.id_usuario,
        detalle={
            "id_categoria": id_categoria,
            "id_usuario": payload.id_usuario,
            "temporada": payload.temporada,
            "es_capitan": payload.es_capitan,
        },
        ip=_extraer_ip(request),
    )
    db.commit()
    db.refresh(nueva_inscripcion)

    return nueva_inscripcion


@router.delete(
    "/categorias/{id_categoria}/jugadores/{id_usuario}",
    status_code=status.HTTP_200_OK,
    summary="Dar de baja a un jugador del plantel (de una temporada puntual)",
)
def eliminar_jugador(
    id_categoria: int,
    id_usuario: int,
    request: Request,
    temporada: str = Query(
        default=None,
        description="Año de temporada. Si se omite, usa la temporada actual.",
    ),
    db: Session = Depends(get_db),
    tecnico: models.Usuario = Depends(require_roles(*_ROLES_TECNICO)),
) -> dict:
    temporada_filtro = temporada or _temporada_actual()

    inscripcion = (
        db.query(models.UsuarioCategoria)
        .filter(
            models.UsuarioCategoria.id_categoria == id_categoria,
            models.UsuarioCategoria.id_usuario == id_usuario,
            models.UsuarioCategoria.temporada == temporada_filtro,
        )
        .first()
    )
    if inscripcion is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"El socio {id_usuario} no está inscripto en la categoría "
                f"{id_categoria} para la temporada {temporada_filtro}."
            ),
        )

    db.delete(inscripcion)

    _registrar_audit(
        db=db,
        actor_id=tecnico.id_usuario,
        accion="ELIMINAR_JUGADOR",
        tabla_afectada="usuarios_categorias",
        registro_id=id_usuario,
        detalle={
            "id_categoria": id_categoria,
            "id_usuario": id_usuario,
            "temporada": temporada_filtro,
        },
        ip=_extraer_ip(request),
    )
    db.commit()

    return {"mensaje": f"Socio {id_usuario} dado de baja del plantel."}


@router.patch(
    "/categorias/{id_categoria}/jugadores/{id_usuario}",
    response_model=schemas.UsuarioCategoriaResponse,
    summary="Alternar la capitanía de un jugador en una temporada",
)
def actualizar_capitan(
    id_categoria: int,
    id_usuario: int,
    payload: schemas.CapitanUpdate,
    request: Request,
    db: Session = Depends(get_db),
    tecnico: models.Usuario = Depends(require_roles(*_ROLES_TECNICO)),
) -> models.UsuarioCategoria:
    """
    Recibe {"temporada": "2026", "es_capitan": true/false} y actualiza
    el campo es_capitan de la inscripción correspondiente.

    Solo un técnico o admin_general puede ejecutar esta acción.
    """
    inscripcion = (
        db.query(models.UsuarioCategoria)
        .options(
            joinedload(models.UsuarioCategoria.usuario),
            joinedload(models.UsuarioCategoria.categoria),
        )
        .filter(
            models.UsuarioCategoria.id_categoria == id_categoria,
            models.UsuarioCategoria.id_usuario == id_usuario,
            models.UsuarioCategoria.temporada == payload.temporada,
        )
        .first()
    )
    if inscripcion is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"El socio {id_usuario} no está inscripto en la categoría "
                f"{id_categoria} para la temporada {payload.temporada}."
            ),
        )

    antes_capitan = inscripcion.es_capitan
    inscripcion.es_capitan = payload.es_capitan

    _registrar_audit(
        db=db,
        actor_id=tecnico.id_usuario,
        accion="ACTUALIZAR_CAPITAN",
        tabla_afectada="usuarios_categorias",
        registro_id=id_usuario,
        detalle={
            "id_categoria": id_categoria,
            "id_usuario": id_usuario,
            "temporada": payload.temporada,
            "antes": {"es_capitan": antes_capitan},
            "despues": {"es_capitan": payload.es_capitan},
        },
        ip=_extraer_ip(request),
    )
    db.commit()
    db.refresh(inscripcion)

    return inscripcion


# ═════════════════════════════════════════════════════════════════════════════
# BÚSQUEDA DE JUGADORES (excepciones manuales)
# ═════════════════════════════════════════════════════════════════════════════

@router.get(
    "/jugadores/buscar",
    response_model=List[schemas.JugadorBusquedaResponse],
    summary="Buscar socios con rol 'jugador' para agregarlos como excepción manual",
)
def buscar_jugadores(
    q: str = Query(min_length=2, description="Busca por nombre, apellido o DNI."),
    db: Session = Depends(get_db),
    _tecnico: models.Usuario = Depends(require_roles(*_ROLES_TECNICO)),
) -> List[models.Usuario]:
    patron = f"%{q.strip()}%"

    return (
        db.query(models.Usuario)
        .join(models.UsuarioRol, models.UsuarioRol.id_usuario == models.Usuario.id_usuario)
        .join(models.Rol, models.Rol.id_rol == models.UsuarioRol.id_rol)
        .filter(
            models.Rol.nombre == "jugador",
            models.Usuario.fecha_baja.is_(None),
            (
                models.Usuario.nombre.ilike(patron)
                | models.Usuario.apellido.ilike(patron)
                | models.Usuario.dni.ilike(patron)
            ),
        )
        .distinct()
        .order_by(models.Usuario.apellido.asc(), models.Usuario.nombre.asc())
        .limit(20)
        .all()
    )


# ═════════════════════════════════════════════════════════════════════════════
# AUTOCOMPLETAR PLANTEL (masivo, por fecha_nacimiento — solo admin_general)
# ═════════════════════════════════════════════════════════════════════════════

@router.post(
    "/categorias/{id_categoria}/autocompletar",
    response_model=schemas.AutocompletarPlantelResponse,
    summary="Autocompletar plantel: inscribe masivamente por fecha_nacimiento (solo Admin General)",
)
def autocompletar_plantel(
    id_categoria: int,
    payload: schemas.AutocompletarPlantelPayload,
    request: Request,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(require_roles(*_ROLES_AUTOCOMPLETAR)),
) -> schemas.AutocompletarPlantelResponse:
    categoria = _obtener_categoria_o_404(db, id_categoria)

    if categoria.fecha_corte_min is None or categoria.fecha_corte_max is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"La categoría '{categoria.nombre}' no tiene definidos ambos cortes de edad "
                "(fecha_corte_min / fecha_corte_max). Configuralos desde PATCH "
                "/deportivo/categorias/{id_categoria} antes de autocompletar."
            ),
        )

    # Universo de candidatos: rol 'jugador', activos, con fecha_nacimiento dentro del corte.
    candidatos = (
        db.query(models.Usuario.id_usuario)
        .join(models.UsuarioRol, models.UsuarioRol.id_usuario == models.Usuario.id_usuario)
        .join(models.Rol, models.Rol.id_rol == models.UsuarioRol.id_rol)
        .filter(
            models.Rol.nombre == "jugador",
            models.Usuario.fecha_baja.is_(None),
            models.Usuario.fecha_nacimiento.is_not(None),
            models.Usuario.fecha_nacimiento >= categoria.fecha_corte_min,
            models.Usuario.fecha_nacimiento <= categoria.fecha_corte_max,
        )
        .distinct()
        .all()
    )
    ids_candidatos = [fila.id_usuario for fila in candidatos]

    if not ids_candidatos:
        return schemas.AutocompletarPlantelResponse(
            id_categoria=id_categoria,
            temporada=payload.temporada,
            candidatos_encontrados=0,
            inscriptos_nuevos=0,
        )

    # INSERT ... ON CONFLICT (id_usuario, id_categoria, temporada) DO NOTHING
    # apoyado en la constraint uq_usuario_categoria_temporada ya aplicada en Postgres.
    tabla = models.UsuarioCategoria.__table__
    stmt = pg_insert(tabla).values(
        [
            {
                "id_usuario": id_usuario,
                "id_categoria": id_categoria,
                "temporada": payload.temporada,
                "es_capitan": False,
            }
            for id_usuario in ids_candidatos
        ]
    ).on_conflict_do_nothing(constraint="uq_usuario_categoria_temporada")

    resultado = db.execute(stmt)
    inscriptos_nuevos = resultado.rowcount or 0

    _registrar_audit(
        db=db,
        actor_id=admin.id_usuario,
        accion="AUTOCOMPLETAR_PLANTEL",
        tabla_afectada="usuarios_categorias",
        registro_id=id_categoria,
        detalle={
            "id_categoria": id_categoria,
            "temporada": payload.temporada,
            "candidatos_encontrados": len(ids_candidatos),
            "inscriptos_nuevos": inscriptos_nuevos,
        },
        ip=_extraer_ip(request),
    )
    db.commit()

    return schemas.AutocompletarPlantelResponse(
        id_categoria=id_categoria,
        temporada=payload.temporada,
        candidatos_encontrados=len(ids_candidatos),
        inscriptos_nuevos=inscriptos_nuevos,
    )


# ═════════════════════════════════════════════════════════════════════════════
# EVENTOS
# ═════════════════════════════════════════════════════════════════════════════

@router.get(
    "/eventos",
    response_model=List[schemas.EventoResponse],
    summary="Listar eventos con filtros opcionales",
)
def listar_eventos(
    id_categoria: Optional[int] = Query(default=None),
    desde: Optional[datetime] = Query(default=None, description="Filtra fecha_inicio >= desde."),
    hasta: Optional[datetime] = Query(default=None, description="Filtra fecha_inicio <= hasta."),
    estado: Optional[str] = Query(default=None, description="programado | en_curso | finalizado | cancelado"),
    db: Session = Depends(get_db),
    _usuario: models.Usuario = Depends(get_current_user),
) -> List[models.Evento]:
    if estado is not None and estado not in schemas.ESTADOS_EVENTO:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Estado inválido. Opciones: {schemas.ESTADOS_EVENTO}",
        )

    query = db.query(models.Evento).options(
        joinedload(models.Evento.categoria),
        joinedload(models.Evento.convocatorias).joinedload(models.Convocatoria.usuario),
    )

    if id_categoria is not None:
        query = query.filter(models.Evento.id_categoria == id_categoria)
    if desde is not None:
        query = query.filter(models.Evento.fecha_inicio >= desde)
    if hasta is not None:
        query = query.filter(models.Evento.fecha_inicio <= hasta)
    if estado is not None:
        query = query.filter(models.Evento.estado == estado)

    return query.order_by(models.Evento.fecha_inicio.asc()).all()


@router.get(
    "/mis-eventos",
    response_model=List[schemas.EventoResponse],
    summary="Próximos eventos de todas las categorías del jugador logueado",
)
def listar_mis_eventos(
    db: Session = Depends(get_db),
    jugador: models.Usuario = Depends(require_roles(*_ROLES_JUGADOR)),
) -> List[models.Evento]:
    temporada_actual = _temporada_actual()

    categorias_ids = [
        row.id_categoria
        for row in (
            db.query(models.UsuarioCategoria.id_categoria)
            .filter(
                models.UsuarioCategoria.id_usuario == jugador.id_usuario,
                models.UsuarioCategoria.temporada == temporada_actual,
            )
            .all()
        )
    ]

    if not categorias_ids:
        return []

    ahora = datetime.now(timezone.utc)

    return (
        db.query(models.Evento)
        .options(
            joinedload(models.Evento.categoria),
            joinedload(models.Evento.convocatorias).joinedload(models.Convocatoria.usuario),
        )
        .filter(
            models.Evento.id_categoria.in_(categorias_ids),
            models.Evento.fecha_inicio >= ahora,
            models.Evento.estado.in_(("programado", "en_curso")),
        )
        .order_by(models.Evento.fecha_inicio.asc())
        .all()
    )


@router.get(
    "/eventos/hoy",
    response_model=List[schemas.EventoResponse],
    summary="Eventos de hoy — selector previo al escaneo del Admin Temporal",
)
def listar_eventos_de_hoy(
    db: Session = Depends(get_db),
    _operador: models.Usuario = Depends(require_roles(*_ROLES_PUERTA)),
) -> List[models.Evento]:
    hoy = date.today()

    return (
        db.query(models.Evento)
        .options(joinedload(models.Evento.categoria))
        .filter(
            func.date(models.Evento.fecha_inicio) == hoy,
            models.Evento.estado.in_(("programado", "en_curso")),
        )
        .order_by(models.Evento.fecha_inicio.asc())
        .all()
    )


@router.post(
    "/eventos",
    response_model=schemas.EventoResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Programar un nuevo evento (partido, entrenamiento, etc.)",
)
def crear_evento(
    payload: schemas.EventoCreate,
    request: Request,
    db: Session = Depends(get_db),
    tecnico: models.Usuario = Depends(require_roles(*_ROLES_TECNICO)),
) -> models.Evento:
    if payload.id_categoria is not None:
        _obtener_categoria_o_404(db, payload.id_categoria)

    if payload.fecha_fin is not None and payload.fecha_fin < payload.fecha_inicio:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="fecha_fin no puede ser anterior a fecha_inicio.",
        )

    nuevo_evento = models.Evento(
        titulo=payload.titulo,
        tipo=payload.tipo,
        descripcion=payload.descripcion,
        id_categoria=payload.id_categoria,
        fecha_inicio=payload.fecha_inicio,
        fecha_fin=payload.fecha_fin,
        ubicacion=payload.ubicacion,
        creado_por=tecnico.id_usuario,
    )
    db.add(nuevo_evento)
    db.flush()

    _registrar_audit(
        db=db,
        actor_id=tecnico.id_usuario,
        accion="CREAR_EVENTO",
        tabla_afectada="eventos",
        registro_id=nuevo_evento.id_evento,
        detalle={"despues": payload.model_dump(mode="json")},
        ip=_extraer_ip(request),
    )
    db.commit()
    db.refresh(nuevo_evento)

    return nuevo_evento


@router.patch(
    "/eventos/{id_evento}",
    response_model=schemas.EventoResponse,
    summary="Editar un evento (incluye cambiar su estado)",
)
def editar_evento(
    id_evento: int,
    payload: schemas.EventoUpdate,
    request: Request,
    db: Session = Depends(get_db),
    tecnico: models.Usuario = Depends(require_roles(*_ROLES_TECNICO)),
) -> models.Evento:
    evento = _obtener_evento_o_404(db, id_evento)

    cambios = payload.model_dump(exclude_unset=True)
    if not cambios:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se envió ningún campo para actualizar.",
        )

    nueva_fecha_inicio = cambios.get("fecha_inicio", evento.fecha_inicio)
    nueva_fecha_fin = cambios.get("fecha_fin", evento.fecha_fin)
    if nueva_fecha_fin is not None and nueva_fecha_fin < nueva_fecha_inicio:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="fecha_fin no puede ser anterior a fecha_inicio.",
        )

    antes = {
        "titulo": evento.titulo,
        "descripcion": evento.descripcion,
        "fecha_inicio": evento.fecha_inicio.isoformat(),
        "fecha_fin": evento.fecha_fin.isoformat() if evento.fecha_fin else None,
        "ubicacion": evento.ubicacion,
        "estado": evento.estado,
    }

    for campo, valor in cambios.items():
        setattr(evento, campo, valor)

    _registrar_audit(
        db=db,
        actor_id=tecnico.id_usuario,
        accion="EDITAR_EVENTO",
        tabla_afectada="eventos",
        registro_id=evento.id_evento,
        detalle={
            "antes": antes,
            "despues": {
                k: (v.isoformat() if isinstance(v, datetime) else v)
                for k, v in cambios.items()
            },
        },
        ip=_extraer_ip(request),
    )
    db.commit()
    db.refresh(evento)

    return evento


# ═════════════════════════════════════════════════════════════════════════════
# CONVOCATORIAS
# ═════════════════════════════════════════════════════════════════════════════

class ConvocatoriaMasivaPayload(BaseModel):
    ids_usuarios: List[int] = Field(
        min_length=1, description="Lista de IDs de usuarios a convocar."
    )


@router.get(
    "/eventos/{id_evento}/convocatorias",
    response_model=List[schemas.ConvocatoriaResponse],
    summary="Listar la convocatoria de un evento",
)
def listar_convocatorias_evento(
    id_evento: int,
    db: Session = Depends(get_db),
    _tecnico: models.Usuario = Depends(require_roles(*_ROLES_TECNICO)),
) -> List[models.Convocatoria]:
    _obtener_evento_o_404(db, id_evento)

    return (
        db.query(models.Convocatoria)
        .options(joinedload(models.Convocatoria.usuario))
        .filter(models.Convocatoria.id_evento == id_evento)
        .join(models.Usuario, models.Usuario.id_usuario == models.Convocatoria.id_usuario)
        .order_by(models.Usuario.apellido.asc(), models.Usuario.nombre.asc())
        .all()
    )


@router.post(
    "/eventos/{id_evento}/convocar",
    response_model=List[schemas.ConvocatoriaResponse],
    status_code=status.HTTP_200_OK,
    summary="Fijar la lista de convocados a un evento (upsert, no destructivo)",
)
def convocar_jugadores_evento(
    id_evento: int,
    payload: ConvocatoriaMasivaPayload,
    request: Request,
    db: Session = Depends(get_db),
    tecnico: models.Usuario = Depends(require_roles(*_ROLES_TECNICO)),
) -> List[models.Convocatoria]:
    """
    Sincroniza la lista de convocados contra `payload.ids_usuarios`:
      - a los NUEVOS (no estaban convocados) los agrega en estado 'citado'.
      - a los que YA NO están en la lista los elimina.
      - a los que se MANTIENEN no los toca — si un jugador ya había
        confirmado o rechazado, ese estado se conserva. Reenviar la lista
        completa (p. ej. tras agregar un jugador desde la búsqueda) no
        resetea las respuestas que ya dio el resto del plantel.
    """
    evento = _obtener_evento_o_404(db, id_evento)
    if evento.estado not in ("programado",):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Solo se pueden gestionar convocatorias de eventos en estado 'programado'. Estado actual: '{evento.estado}'.",
        )

    ids_deseados = set(payload.ids_usuarios)

    # Validar que todos los usuarios existan, estén activos y sean jugadores
    usuarios_validos = db.query(models.Usuario.id_usuario).filter(
        models.Usuario.id_usuario.in_(ids_deseados),
        models.Usuario.fecha_baja.is_(None),
        models.Usuario.roles_asignados.any(
            models.UsuarioRol.rol.has(nombre="jugador")
        )
    ).all()

    ids_encontrados = {u.id_usuario for u in usuarios_validos}
    ids_invalidos = ids_deseados - ids_encontrados
    if ids_invalidos:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Los siguientes IDs de usuario son inválidos, no son jugadores o están inactivos: {sorted(list(ids_invalidos))}",
        )

    ids_actuales = {
        fila.id_usuario
        for fila in db.query(models.Convocatoria.id_usuario).filter(
            models.Convocatoria.id_evento == id_evento
        ).all()
    }

    ids_a_quitar   = ids_actuales - ids_deseados
    ids_a_agregar  = ids_deseados - ids_actuales

    if ids_a_quitar:
        db.query(models.Convocatoria).filter(
            models.Convocatoria.id_evento == id_evento,
            models.Convocatoria.id_usuario.in_(ids_a_quitar),
        ).delete(synchronize_session=False)

    if ids_a_agregar:
        db.add_all(
            models.Convocatoria(id_evento=id_evento, id_usuario=id_usr, citado_por=tecnico.id_usuario)
            for id_usr in ids_a_agregar
        )

    _registrar_audit(
        db=db,
        actor_id=tecnico.id_usuario,
        accion="CONVOCAR_JUGADORES",
        tabla_afectada="convocatorias",
        registro_id=id_evento,
        detalle={
            "id_evento": id_evento,
            "titulo_evento": evento.titulo,
            "total_convocados": len(ids_deseados),
            "agregados": sorted(ids_a_agregar),
            "quitados": sorted(ids_a_quitar),
        },
        ip=_extraer_ip(request),
    )

    db.commit()

    return (
        db.query(models.Convocatoria)
        .options(joinedload(models.Convocatoria.usuario))
        .filter(models.Convocatoria.id_evento == id_evento)
        .all()
    )


@router.delete(
    "/eventos/{id_evento}/convocatorias/{id_usuario}",
    status_code=status.HTTP_200_OK,
    summary="Sacar a un jugador puntual de la convocatoria",
)
def eliminar_convocatoria(
    id_evento: int,
    id_usuario: int,
    request: Request,
    db: Session = Depends(get_db),
    tecnico: models.Usuario = Depends(require_roles(*_ROLES_TECNICO)),
) -> dict:
    convocatoria = (
        db.query(models.Convocatoria)
        .filter(
            models.Convocatoria.id_evento == id_evento,
            models.Convocatoria.id_usuario == id_usuario,
        )
        .first()
    )
    if convocatoria is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"El usuario {id_usuario} no está convocado al evento {id_evento}.",
        )

    db.delete(convocatoria)

    _registrar_audit(
        db=db,
        actor_id=tecnico.id_usuario,
        accion="ELIMINAR_CONVOCATORIA",
        tabla_afectada="convocatorias",
        registro_id=id_evento,
        detalle={"id_evento": id_evento, "id_usuario": id_usuario},
        ip=_extraer_ip(request),
    )
    db.commit()

    return {"mensaje": f"Usuario {id_usuario} sacado de la convocatoria."}


@router.patch(
    "/mis-eventos/{id_evento}/confirmar",
    response_model=schemas.ConvocatoriaResponse,
    summary="Confirmar o rechazar asistencia a una convocatoria",
)
def confirmar_asistencia_convocatoria(
    id_evento: int,
    payload: schemas.ConvocatoriaUpdate,
    request: Request,
    db: Session = Depends(get_db),
    jugador: models.Usuario = Depends(require_roles(*_ROLES_JUGADOR)),
) -> models.Convocatoria:
    # Validar que el evento exista y esté en un estado válido para confirmar
    evento = _obtener_evento_o_404(db, id_evento)
    if evento.estado not in ("programado", "en_curso"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No se puede confirmar asistencia a un evento '{evento.estado}'.",
        )

    # Buscar la convocatoria específica para el jugador y el evento
    convocatoria = (
        db.query(models.Convocatoria)
        .options(joinedload(models.Convocatoria.usuario))
        .filter(
            models.Convocatoria.id_evento == id_evento,
            models.Convocatoria.id_usuario == jugador.id_usuario,
        )
        .first()
    )

    if convocatoria is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No estás convocado a este evento.",
        )

    # El schema ConvocatoriaUpdate acepta los 5 estados (también los usa el
    # técnico en el cierre), pero un jugador respondiendo su propia
    # convocatoria SOLO puede confirmar o rechazar — nunca marcarse
    # 'presente'/'ausente'/'citado' a sí mismo.
    if payload.estado not in ("confirmado", "rechazado"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo podés responder 'confirmado' o 'rechazado'.",
        )

    estado_anterior = convocatoria.estado
    convocatoria.estado = payload.estado
    convocatoria.respondido_at = datetime.now(timezone.utc)
    if payload.notas is not None:
        convocatoria.notas = payload.notas

    _registrar_audit(
        db=db,
        actor_id=jugador.id_usuario,
        accion="CONFIRMAR_CONVOCATORIA",
        tabla_afectada="convocatorias",
        registro_id=id_evento,
        detalle={
            "id_evento": id_evento,
            "id_usuario": jugador.id_usuario,
            "estado_anterior": estado_anterior,
            "estado_nuevo": payload.estado,
        },
        ip=_extraer_ip(request),
    )

    db.commit()
    db.refresh(convocatoria)

    return convocatoria


@router.post(
    "/eventos/{id_evento}/convocatorias/cerrar",
    response_model=schemas.ConvocatoriaCierreResponse,
    summary="Cerrar la convocatoria: cruza contra asistencias reales y marca presente/ausente",
)
def cerrar_convocatoria_evento(
    id_evento: int,
    request: Request,
    db: Session = Depends(get_db),
    tecnico: models.Usuario = Depends(require_roles(*_ROLES_TECNICO)),
) -> schemas.ConvocatoriaCierreResponse:
    """
    No depende de que nadie marque nada a mano: un convocado queda
    'presente' si tiene una fila en `asistencias` para este evento
    (entró por la puerta, con QR o DNI), y 'ausente' si no la tiene.
    Se puede correr las veces que haga falta (ej. si alguien entró tarde
    y volvés a cerrar) — es idempotente, siempre refleja el estado actual
    de `asistencias`.
    """
    evento = _obtener_evento_o_404(db, id_evento)

    convocatorias = (
        db.query(models.Convocatoria)
        .filter(models.Convocatoria.id_evento == id_evento)
        .all()
    )
    if not convocatorias:
        return schemas.ConvocatoriaCierreResponse(
            id_evento=id_evento, presentes=0, ausentes=0, total=0,
        )

    ids_presentes = {
        fila.id_usuario
        for fila in db.query(models.Asistencia.id_usuario).filter(
            models.Asistencia.id_evento == id_evento,
            models.Asistencia.id_usuario.in_([c.id_usuario for c in convocatorias]),
        ).all()
    }

    presentes = ausentes = 0
    for c in convocatorias:
        c.estado = "presente" if c.id_usuario in ids_presentes else "ausente"
        presentes += c.id_usuario in ids_presentes
        ausentes += c.id_usuario not in ids_presentes

    _registrar_audit(
        db=db,
        actor_id=tecnico.id_usuario,
        accion="CERRAR_CONVOCATORIA",
        tabla_afectada="convocatorias",
        registro_id=id_evento,
        detalle={
            "id_evento": id_evento,
            "titulo_evento": evento.titulo,
            "presentes": presentes,
            "ausentes": ausentes,
        },
        ip=_extraer_ip(request),
    )
    db.commit()

    return schemas.ConvocatoriaCierreResponse(
        id_evento=id_evento,
        presentes=presentes,
        ausentes=ausentes,
        total=len(convocatorias),
    )


# ═════════════════════════════════════════════════════════════════════════════
# ASISTENCIAS (control de puerta)
# ═════════════════════════════════════════════════════════════════════════════

@router.post(
    "/eventos/{id_evento}/asistencias",
    response_model=schemas.AsistenciaResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Registrar el ingreso de un socio a un evento (QR o DNI)",
)
def registrar_asistencia(
    id_evento: int,
    payload: schemas.AsistenciaCreate,
    request: Request,
    db: Session = Depends(get_db),
    operador: models.Usuario = Depends(require_roles(*_ROLES_PUERTA)),
) -> models.Asistencia:
    if payload.id_evento != id_evento:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El id_evento del body no coincide con el de la URL.",
        )

    evento = _obtener_evento_o_404(db, id_evento)
    if evento.estado not in ("programado", "en_curso"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"El evento #{id_evento} está '{evento.estado}'. Solo se pueden "
                "registrar asistencias en eventos 'programado' o 'en_curso'."
            ),
        )

    socio = (
        db.query(models.Usuario)
        .filter(models.Usuario.id_usuario == payload.id_usuario)
        .first()
    )
    if socio is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No existe un usuario con id {payload.id_usuario}.",
        )
    if socio.fecha_baja is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Este socio está dado de baja y no puede registrar ingreso.",
        )

    # Snapshot financiero calculado EN ESTE INSTANTE — nunca se recibe del frontend.
    # Un socio está "al día" si su cobertura está vigente (>= hoy).
    esta_al_dia = socio.mes_cubierto_hasta is not None and socio.mes_cubierto_hasta >= date.today()
    estado_financiero = "al_dia" if esta_al_dia else "moroso"

    nueva_asistencia = models.Asistencia(
        id_evento=id_evento,
        id_usuario=socio.id_usuario,
        metodo=payload.metodo,
        registrado_por=operador.id_usuario,
        estado_financiero_snapshot=estado_financiero,
    )
    db.add(nueva_asistencia)
    db.flush()

    _registrar_audit(
        db=db,
        actor_id=operador.id_usuario,
        accion="REGISTRAR_ASISTENCIA",
        tabla_afectada="asistencias",
        registro_id=nueva_asistencia.id_asistencia,
        detalle={
            "id_evento": id_evento,
            "id_usuario": socio.id_usuario,
            "metodo": payload.metodo,
            "estado_financiero_snapshot": estado_financiero,
        },
        ip=_extraer_ip(request),
    )
    db.commit()
    db.refresh(nueva_asistencia)

    return nueva_asistencia


@router.get(
    "/eventos/{id_evento}/asistencias",
    response_model=List[schemas.AsistenciaResponse],
    summary="Planilla de presentismo de un evento",
)
def listar_asistencias_evento(
    id_evento: int,
    db: Session = Depends(get_db),
    _tecnico: models.Usuario = Depends(require_roles(*_ROLES_TECNICO)),
) -> List[models.Asistencia]:
    _obtener_evento_o_404(db, id_evento)

    return (
        db.query(models.Asistencia)
        .options(joinedload(models.Asistencia.usuario))
        .filter(models.Asistencia.id_evento == id_evento)
        .order_by(models.Asistencia.fecha_hora_ingreso.asc())
        .all()
    )