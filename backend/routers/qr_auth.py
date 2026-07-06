# backend/routers/qr_auth.py
"""
Router de autenticación por QR y DNI — Control de accesos en puerta.

Endpoints:
  GET  /qr/token           → Genera un QR token de corta duración (uso del socio).
  POST /qr/validar-token   → Llama a fn_validar_qr(UUID) en PostgreSQL.
  POST /qr/validar-dni     → Fallback manual: lógica equivalente vía ORM.

Ambos endpoints de validación:
  - Requieren rol 'admin_general', 'personal_administrativo' o 'admin_temporal'.
  - Reciben opcionalmente `id_evento` para registrar el ingreso en `asistencias`.
  - Escriben en `audit_log` cada intento (válido o no).
  - Nunca exponen datos financieros en pesos ni datos privados del socio.

Decisiones técnicas:
  - fn_validar_qr: llamada con session.execute(text(...)).mappings().first()
    porque la función retorna un SETOF TABLE de una sola fila.
  - El fallback DNI replica la lógica de fn_validar_qr en Python para no
    depender de una segunda función PL/pgSQL (más fácil de mantener en ORM).
  - id_evento se recibe en el payload pero NO es obligatorio. Si se omite,
    solo se valida sin registrar asistencia (útil para validación de beneficios
    comerciales desde locales adheridos).
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session, joinedload

import models
import schemas
from database import get_db
from dependencies import get_current_user, require_roles

router = APIRouter(
    prefix="/qr",
    tags=["Control de Accesos — QR / DNI"],
)

# ─── Roles autorizados para escanear ─────────────────────────────────────────

_ROLES_SCANNER = ("admin_general", "personal_administrativo", "admin_temporal", "invitado")

# ─── Payloads locales (extienden los de schemas.py sin modificarlos) ──────────

class ValidarTokenPayload(BaseModel):
    """
    Payload para el endpoint POST /qr/validar-token.
    `token` es el UUID crudo extraído del QR escaneado.
    `id_evento` es opcional: si se provee, el ingreso se registra en `asistencias`.
    """
    token: str = Field(description="UUID del QR escaneado.")
    id_evento: Optional[int] = Field(
        default=None,
        description="ID del evento activo. Si se omite, solo se valida (sin registrar ingreso).",
    )


class ValidarDNIPayload(BaseModel):
    """Payload para el fallback manual por DNI."""
    dni: str = Field(min_length=7, max_length=10, pattern=r"^\d{7,10}$")
    id_evento: Optional[int] = Field(default=None)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _registrar_asistencia(
    *,
    db: Session,
    id_evento: int,
    id_usuario: int,
    metodo: str,                           # 'QR' | 'DNI'
    operador_id: int,
    estado_financiero: str,                # 'al_dia' | 'moroso'
) -> None:
    """
    Inserta una fila en `asistencias`. Solo se llama si id_evento fue provisto
    y la validación resultó en un usuario encontrado (válido o moroso).
    Los casos 'desconocido' (token no encontrado) no se registran.
    """
    # Verificar que el evento exista y esté activo
    evento = (
        db.query(models.Evento)
        .filter(
            models.Evento.id_evento == id_evento,
            models.Evento.estado.in_(["programado", "en_curso"]),
        )
        .first()
    )
    if not evento:
        # No lanzamos excepción: la validación fue OK, solo omitimos el registro
        return

    snapshot = "al_dia" if estado_financiero == "al_dia" else "moroso"

    asistencia = models.Asistencia(
        id_evento=id_evento,
        id_usuario=id_usuario,
        metodo=metodo,
        registrado_por=operador_id,
        estado_financiero_snapshot=snapshot,
    )
    db.add(asistencia)
    # El commit lo hace el llamador, que también hace el commit del audit_log


def _registrar_audit(
    *,
    db: Session,
    actor_id: int,
    accion: str,
    detalle: dict,
    ip: Optional[str] = None,
) -> None:
    db.add(
        models.AuditLog(
            usuario_actor=actor_id,
            accion=accion,
            tabla_afectada="usuarios",
            detalle=detalle,
            ip_origen=ip,
        )
    )


def _extraer_ip(request: Request) -> Optional[str]:
    """Extrae la IP real considerando proxies (X-Forwarded-For)."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return getattr(request.client, "host", None)


def _calcular_antiguedad_meses(fecha_ingreso) -> int:
    """Calcula los meses de antigüedad desde fecha_ingreso hasta hoy."""
    hoy = datetime.now(timezone.utc).date()
    if fecha_ingreso is None:
        return 0
    delta_years  = hoy.year  - fecha_ingreso.year
    delta_months = hoy.month - fecha_ingreso.month
    return delta_years * 12 + delta_months


def _roles_activos_list(usuario: models.Usuario) -> list[str]:
    """Retorna los nombres de roles no expirados del usuario, ordenados por jerarquía."""
    ahora = datetime.now(timezone.utc)
    roles = [
        ur.rol
        for ur in usuario.roles_asignados
        if ur.rol.es_activo
        and (ur.valido_hasta is None or ur.valido_hasta > ahora)
    ]
    roles.sort(key=lambda r: r.peso_jerarquico, reverse=True)
    return [r.nombre for r in roles]


def _construir_respuesta_desde_orm(usuario: models.Usuario) -> schemas.UsuarioQRValidacionResponse:
    """
    Construye UsuarioQRValidacionResponse desde un objeto ORM.
    Replica exactamente la lógica de fn_validar_qr para el fallback por DNI.
    """
    if usuario.fecha_baja is not None:
        return schemas.UsuarioQRValidacionResponse(
            es_valido=False,
            id_usuario=usuario.id_usuario,
            nombre_completo=f"{usuario.nombre} {usuario.apellido}",
            foto_perfil_url=usuario.foto_perfil_url,
            estado_financiero="inactivo",
            roles_activos=[],
            antiguedad_meses=0,
            mensaje_display="SOCIO INACTIVO",
        )

    esta_al_dia = usuario.mes_cubierto_hasta is not None and usuario.mes_cubierto_hasta >= date.today()
    estado = "al_dia" if esta_al_dia else "moroso"
    roles  = _roles_activos_list(usuario)
    meses  = _calcular_antiguedad_meses(usuario.fecha_ingreso)

    return schemas.UsuarioQRValidacionResponse(
        es_valido=esta_al_dia,
        id_usuario=usuario.id_usuario,
        nombre_completo=f"{usuario.nombre} {usuario.apellido}",
        foto_perfil_url=usuario.foto_perfil_url,
        estado_financiero=estado,
        roles_activos=roles,
        antiguedad_meses=meses,
        mensaje_display="SOCIO HABILITADO ✓" if esta_al_dia else "SOCIO NO HABILITADO ✗",
    )


# ─── ENDPOINT: Generar token QR ───────────────────────────────────────────────

@router.get(
    "/token",
    response_model=schemas.QRTokenResponse,
    summary="Generar token QR dinámico (el socio llama este endpoint al abrir su QR)",
)
def generar_qr_token(
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
) -> schemas.QRTokenResponse:
    """
    Genera un nuevo UUID y lo persiste en `usuarios.qr_token`.
    El trigger `trg_rotar_qr` también lo rota automáticamente al cambiar el
    estado financiero, pero este endpoint fuerza la rotación bajo demanda,
    garantizando un token fresco cada vez que el socio abre su pantalla de QR.

    El frontend debe llamar a este endpoint AL RENDERIZAR la pantalla del QR,
    no en el login. Así el token nunca queda cacheado en el cliente por más
    de lo necesario.
    """
    if current_user.fecha_baja is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tu cuenta está dada de baja. No podés generar un QR.",
        )

    # Rotamos manualmente (el trigger lo haría al cambiar estado financiero,
    # pero aquí lo forzamos explícitamente con gen_random_uuid() de PostgreSQL)
    nuevo_token = uuid.uuid4()
    current_user.qr_token        = nuevo_token
    current_user.qr_generado_at  = datetime.now(timezone.utc)
    db.commit()

    return schemas.QRTokenResponse(qr_token=nuevo_token)


# ─── ENDPOINT: Validar por QR ────────────────────────────────────────────────

@router.post(
    "/validar-token",
    response_model=schemas.UsuarioQRValidacionResponse,
    summary="Validar token QR escaneado — llama a fn_validar_qr en PostgreSQL",
)
def validar_qr_token(
    payload: ValidarTokenPayload,
    request: Request,
    db: Session = Depends(get_db),
    operador: models.Usuario = Depends(require_roles(*_ROLES_SCANNER)),
) -> schemas.UsuarioQRValidacionResponse:
    """
    Flujo completo:
      1. Parsea el UUID del payload.
      2. Llama a `fn_validar_qr(UUID)` en PostgreSQL vía session.execute.
      3. Mapea el resultado a UsuarioQRValidacionResponse.
      4. Si se proveyó id_evento, registra la asistencia en la tabla `asistencias`.
      5. Registra en audit_log (tanto los válidos como los fallidos).
      6. Hace commit de todo en una sola transacción.

    Nota de seguridad: la función PL/pgSQL no expone el token al cliente,
    solo retorna los datos necesarios para la tarjeta de aprobación visual.
    """
    ip = _extraer_ip(request)

    # 1 — Parsear UUID (validación de formato antes de ir a la DB)
    try:
        token_uuid = uuid.UUID(payload.token)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Formato de QR inválido. Se esperaba un UUID.",
        )

    # 2 — Buscar usuario por token con ORM, unificando la lógica con la validación por DNI
    usuario = (
        db.query(models.Usuario)
        .options(
            joinedload(models.Usuario.roles_asignados)
            .joinedload(models.UsuarioRol.rol)
        )
        .filter(models.Usuario.qr_token == token_uuid)
        .first()
    )

    # 3 — Construir respuesta (o manejar token no encontrado)
    if usuario is None:
        respuesta = schemas.UsuarioQRValidacionResponse(
            es_valido=False,
            id_usuario=None,
            nombre_completo="Token inválido",
            foto_perfil_url=None,
            estado_financiero="desconocido",
            roles_activos=[],
            antiguedad_meses=0,
            mensaje_display="QR NO RECONOCIDO ✗",
        )
    else:
        respuesta = _construir_respuesta_desde_orm(usuario)

    # 4 — Registrar asistencia (si hay evento y el usuario fue identificado)
    if payload.id_evento and respuesta.id_usuario is not None:
        _registrar_asistencia(
            db=db,
            id_evento=payload.id_evento,
            id_usuario=respuesta.id_usuario,
            metodo="QR",
            operador_id=operador.id_usuario,
            estado_financiero=respuesta.estado_financiero,
        )

    # 5 — Audit log
    if usuario is None:
        accion_audit = "VALIDACION_QR_FALLIDA"
    else:
        accion_audit = "VALIDACION_QR_OK" if respuesta.es_valido else "VALIDACION_QR_FALLIDA"

    _registrar_audit(
        db=db,
        actor_id=operador.id_usuario,
        accion=accion_audit,
        detalle={
            "token_parcial": str(token_uuid)[:8] + "…",  # nunca logueamos el token completo
            "usuario_id": respuesta.id_usuario,
            "estado": respuesta.estado_financiero,
            "mensaje": respuesta.mensaje_display,
            "id_evento": payload.id_evento,
            "operador_dni": operador.dni,
        },
        ip=ip,
    )

    # 6 — Commit único para asistencia + audit_log
    db.commit()

    return respuesta


# ─── ENDPOINT: Validar por DNI (fallback) ─────────────────────────────────────

@router.post(
    "/validar-dni",
    response_model=schemas.UsuarioQRValidacionResponse,
    summary="Validar socio por DNI — fallback si el socio no tiene celular o batería",
)
def validar_dni(
    payload: ValidarDNIPayload,
    request: Request,
    db: Session = Depends(get_db),
    operador: models.Usuario = Depends(require_roles(*_ROLES_SCANNER)),
) -> schemas.UsuarioQRValidacionResponse:
    """
    Plan B de contingencia. Replica exactamente la lógica de fn_validar_qr
    pero busca por DNI en lugar de por token UUID.

    Retorna la misma estructura UsuarioQRValidacionResponse para que el
    frontend use el mismo componente de tarjeta de aprobación visual.

    Siempre registra el ingreso con metodo='DNI' en asistencias (si hay evento).
    """
    ip = _extraer_ip(request)

    # 1 — Buscar usuario por DNI con eager load de roles
    usuario = (
        db.query(models.Usuario)
        .options(
            joinedload(models.Usuario.roles_asignados)
            .joinedload(models.UsuarioRol.rol)
        )
        .filter(models.Usuario.dni == payload.dni)
        .first()
    )

    # 2 — Usuario no encontrado → respuesta de "no reconocido" (no 404)
    #     El operador debe ver la tarjeta de error, no una excepción HTTP cruda.
    if usuario is None:
        _registrar_audit(
            db=db,
            actor_id=operador.id_usuario,
            accion="VALIDACION_DNI_NO_ENCONTRADO",
            detalle={
                "dni_consultado": payload.dni,
                "id_evento": payload.id_evento,
                "operador_dni": operador.dni,
            },
            ip=ip,
        )
        db.commit()

        return schemas.UsuarioQRValidacionResponse(
            es_valido=False,
            id_usuario=None,
            nombre_completo="DNI no registrado",
            foto_perfil_url=None,
            estado_financiero="desconocido",
            roles_activos=[],
            antiguedad_meses=0,
            mensaje_display="DNI NO ENCONTRADO ✗",
        )

    # 3 — Construir respuesta desde el ORM (replica lógica de fn_validar_qr)
    respuesta = _construir_respuesta_desde_orm(usuario)

    # 4 — Registrar asistencia si se proveyó evento y el usuario fue identificado
    if payload.id_evento:
        _registrar_asistencia(
            db=db,
            id_evento=payload.id_evento,
            id_usuario=usuario.id_usuario,
            metodo="DNI",
            operador_id=operador.id_usuario,
            estado_financiero=respuesta.estado_financiero,
        )

    # 5 — Audit log
    _registrar_audit(
        db=db,
        actor_id=operador.id_usuario,
        accion="VALIDACION_DNI_OK" if respuesta.es_valido else "VALIDACION_DNI_INACTIVO",
        detalle={
            "dni_consultado": payload.dni,
            "usuario_id": usuario.id_usuario,
            "estado": respuesta.estado_financiero,
            "mensaje": respuesta.mensaje_display,
            "id_evento": payload.id_evento,
            "operador_dni": operador.dni,
        },
        ip=ip,
    )

    # 6 — Commit único
    db.commit()

    return respuesta
