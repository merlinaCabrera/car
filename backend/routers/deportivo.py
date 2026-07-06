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
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

import models
import schemas
from database import get_db
from dependencies import get_current_user, require_roles

router = APIRouter(
    prefix="/deportivo",
    tags=["Deportivo — Categorías, Eventos y Asistencias"],
)

_ROLES_TECNICO = ("tecnico", "admin_general")
_ROLES_PUERTA = ("admin_temporal", "tecnico", "admin_general", "personal_administrativo")
_ROLES_JUGADOR = ("socio", "jugador")


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
    summary="Editar una categoría (incluye baja lógica con es_activa=False)",
)
def editar_categoria(
    id_categoria: int,
    payload: schemas.CategoriaDeportivaCreate,
    request: Request,
    db: Session = Depends(get_db),
    tecnico: models.Usuario = Depends(require_roles(*_ROLES_TECNICO)),
) -> models.CategoriaDeportiva:
    categoria = _obtener_categoria_o_404(db, id_categoria)

    antes = {
        "nombre": categoria.nombre,
        "descripcion": categoria.descripcion,
        "es_activa": categoria.es_activa,
    }

    categoria.nombre = payload.nombre
    categoria.descripcion = payload.descripcion
    categoria.es_activa = payload.es_activa

    _registrar_audit(
        db=db,
        actor_id=tecnico.id_usuario,
        accion="EDITAR_CATEGORIA_DEPORTIVA",
        tabla_afectada="categorias_deportivas",
        registro_id=categoria.id_categoria,
        detalle={"antes": antes, "despues": payload.model_dump(mode="json")},
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
    _tecnico: models.Usuario = Depends(require_roles(*_ROLES_TECNICO)),
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

    query = db.query(models.Evento).options(joinedload(models.Evento.categoria))

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
        .options(joinedload(models.Evento.categoria))
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
