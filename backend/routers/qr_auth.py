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
  - Tanto /validar-token como /validar-dni construyen la respuesta vía ORM con
    `_construir_respuesta_desde_orm`, que a su vez usa `_calcular_estado_financiero`
    (puerto 1:1 de `calcularEstadoFinanciero` en SocioCuotas.jsx). Se abandonó
    la dependencia de fn_validar_qr en PL/pgSQL para esta lógica: mantener la
    regla de negocio en un solo lugar (Python) evita que backend y frontend
    diverjan, como ocurría antes.
  - id_evento se recibe en el payload pero NO es obligatorio. Si se omite,
    solo se valida sin registrar asistencia (útil para validación de beneficios
    comerciales desde locales adheridos).
"""

from __future__ import annotations

import calendar
import uuid
from datetime import date, datetime, timezone
from typing import Optional
from zoneinfo import ZoneInfo

# ─── Timezone de referencia para "hoy" ────────────────────────────────────────
# CRÍTICO: el frontend calcula `new Date()` en la hora LOCAL del navegador
# (Argentina). Si acá usáramos datetime.now(timezone.utc).date(), entre las
# 21:00 y las 00:00 hora ARG el backend ya estaría "un día adelantado"
# respecto al frontend (ARG = UTC-3), pudiendo marcar como moroso a un socio
# que el frontend todavía muestra al día. Por eso NUNCA se usa timezone.utc
# para el cálculo de estado financiero: siempre se usa esta zona horaria.
_TZ_ARG = ZoneInfo("America/Argentina/Buenos_Aires")


def _hoy_local() -> date:
    """Fecha de 'hoy' en hora local de Argentina (consistente con el frontend)."""
    return datetime.now(_TZ_ARG).date()

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
    hoy = _hoy_local()
    if fecha_ingreso is None:
        return 0
    delta_years  = hoy.year  - fecha_ingreso.year
    delta_months = hoy.month - fecha_ingreso.month
    return delta_years * 12 + delta_months


def _obtener_dia_vencimiento(db: Session) -> int:
    """
    Trae `dia_vencimiento_cuota` desde ConfiguracionGlobal (fila única de config).
    Es la misma fuente que usa `estado.dia_vencimiento_cuota` en el frontend
    (ver SocioCuotas.jsx, línea ~644: `estado.dia_vencimiento_cuota ?? 10`).
    Si por algún motivo no hay fila de configuración, cae al default de 10
    (mismo default que usa el frontend con el `??`).
    """
    config = db.query(models.ConfiguracionGlobal).first()
    if config is None or config.dia_vencimiento_cuota is None:
        return 10
    return config.dia_vencimiento_cuota


def _calcular_estado_financiero(
    mes_cubierto_hasta: Optional[date],
    fecha_ingreso: Optional[date],
    dia_vencimiento: int = 10,
) -> tuple[bool, int]:
    """
    Puerto 1:1 de `calcularEstadoFinanciero` (SocioCuotas.jsx).

    Reglas (idénticas al frontend):
      1. fecha_base = mes_cubierto_hasta si NO es None (sin importar si está
         en el pasado o el futuro).
      2. Si mes_cubierto_hasta es None → fecha_base = fecha_ingreso, con el
         día de vencimiento clampeado al último día de ESE mes (socio nuevo:
         su primer "corte" es el día de vencimiento del mes en que ingresó).
      3. Si tampoco hay fecha_ingreso → no hay nada que evaluar: al día,
         0 meses adeudados (mismo comportamiento defensivo que el frontend).
      4. Moroso SOLO si hoy > fecha_base (periodo de gracia: el mismo día
         de vencimiento todavía cuenta como al día, igual que en JS con
         `hoy <= fechaBase`).
      5. meses_adeudados se calcula por diferencia de año/mes, +1 si ya pasó
         el día de corte dentro del mes actual — igual que el JS.

    Devuelve (moroso, meses_adeudados).
    """
    fecha_base: Optional[date] = mes_cubierto_hasta

    if fecha_base is None and fecha_ingreso is not None:
        ultimo_dia_mes = calendar.monthrange(fecha_ingreso.year, fecha_ingreso.month)[1]
        dia_clamp = min(dia_vencimiento, ultimo_dia_mes)
        fecha_base = date(fecha_ingreso.year, fecha_ingreso.month, dia_clamp)

    # Defensivo: sin mes_cubierto_hasta ni fecha_ingreso no hay nada que evaluar.
    if fecha_base is None:
        return False, 0

    hoy = _hoy_local()

    if hoy <= fecha_base:
        return False, 0

    meses_adeudados = (hoy.year - fecha_base.year) * 12 + (hoy.month - fecha_base.month)
    if hoy.day > fecha_base.day:
        meses_adeudados += 1

    return True, meses_adeudados


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


def _construir_respuesta_desde_orm(
    usuario: models.Usuario,
    dia_vencimiento: int,
) -> schemas.UsuarioQRValidacionResponse:
    """
    Construye UsuarioQRValidacionResponse desde un objeto ORM.
    Usa el mismo motor que el frontend (`_calcular_estado_financiero`,
    puerto de `calcularEstadoFinanciero` en SocioCuotas.jsx) para que un
    socio nunca vea un resultado distinto entre su pantalla de cuotas y
    el escáner de la puerta.
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
            meses_adeudados=0,
            mensaje_display="SOCIO INACTIVO",
        )

    roles = _roles_activos_list(usuario)
    meses = _calcular_antiguedad_meses(usuario.fecha_ingreso)

    if "socio" not in roles:
        return schemas.UsuarioQRValidacionResponse(
            es_valido=False,
            id_usuario=usuario.id_usuario,
            nombre_completo=f"{usuario.nombre} {usuario.apellido}",
            foto_perfil_url=usuario.foto_perfil_url,
            estado_financiero="no_aprobado",
            roles_activos=roles,
            antiguedad_meses=meses,
            meses_adeudados=0,
            mensaje_display="SOCIO NO APROBADO ✗",
        )

    moroso, meses_adeudados = _calcular_estado_financiero(
        usuario.mes_cubierto_hasta,
        usuario.fecha_ingreso,
        dia_vencimiento,
    )
    esta_al_dia = not moroso
    estado = "al_dia" if esta_al_dia else "moroso"

    return schemas.UsuarioQRValidacionResponse(
        es_valido=esta_al_dia,
        id_usuario=usuario.id_usuario,
        nombre_completo=f"{usuario.nombre} {usuario.apellido}",
        foto_perfil_url=usuario.foto_perfil_url,
        estado_financiero=estado,
        roles_activos=roles,
        antiguedad_meses=meses,
        meses_adeudados=meses_adeudados,
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
    summary="Validar token QR escaneado",
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
      2. Busca el usuario por `qr_token` vía ORM.
      3. Mapea el resultado a UsuarioQRValidacionResponse usando el mismo
         motor de estado financiero que el frontend (ver
         `_calcular_estado_financiero`).
      4. Si se proveyó id_evento, registra la asistencia en la tabla `asistencias`.
      5. Registra en audit_log (tanto los válidos como los fallidos).
      6. Hace commit de todo en una sola transacción.
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
            meses_adeudados=0,
            mensaje_display="QR NO RECONOCIDO ✗",
        )
    else:
        dia_vencimiento = _obtener_dia_vencimiento(db)
        respuesta = _construir_respuesta_desde_orm(usuario, dia_vencimiento)

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
    Plan B de contingencia. Usa el mismo motor de estado financiero que
    /validar-token (`_calcular_estado_financiero`), pero busca por DNI en
    lugar de por token UUID.

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
            meses_adeudados=0,
            mensaje_display="DNI NO ENCONTRADO ✗",
        )

    # 3 — Construir respuesta desde el ORM (mismo motor que el frontend)
    dia_vencimiento = _obtener_dia_vencimiento(db)
    respuesta = _construir_respuesta_desde_orm(usuario, dia_vencimiento)

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