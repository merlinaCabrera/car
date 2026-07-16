"""
schemas.py — Pydantic v2 Schemas
Club Atlético — Sistema de Gestión

Convenciones de nomenclatura:
  XxxBase       → campos comunes (no instanciable directamente)
  XxxCreate     → payload de entrada para POST
  XxxUpdate     → payload de entrada para PATCH (todos los campos opcionales)
  XxxResponse   → payload de salida (serializa desde ORM con from_attributes=True)
  XxxDetail     → respuesta enriquecida con objetos anidados

Todos los Response usan:
  model_config = ConfigDict(from_attributes=True)

Reglas de validación relevantes:
  - DNI: 7–8 dígitos numéricos
  - Estado financiero se calcula en backend; nunca lo envía el frontend
  - El frontend NUNCA envía password_hash; siempre envía `password` en texto plano
  - qr_token es de solo lectura desde el backend

── Cambios (refactor motor de cuotas) ─────────────────────────────────────────
  ConfiguracionGlobalBase:
    + dia_vencimiento_cuota (int, ge=1, le=28, default=10)

  ConfiguracionGlobalUpdate:
    + dia_vencimiento_cuota (Optional[int], ge=1, le=28)

  ConfiguracionGlobalResponse:
    Hereda dia_vencimiento_cuota de ConfiguracionGlobalBase — sin cambios manuales.

  UsuarioResponse.mes_cubierto_hasta:
    Ya era Optional[date]. Pydantic v2 serializa date → "YYYY-MM-DD" (ISO 8601)
    de forma automática. Se agrega Field con description para documentar la semántica.

  UsuarioListResponse.mes_cubierto_hasta:
    Idem — ya era Optional[date], se agrega description para alinearlo.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, List, Optional

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)


# ─────────────────────────────────────────────────────────────────────────────
# TIPOS ANOTADOS REUTILIZABLES
# ─────────────────────────────────────────────────────────────────────────────

DNI = Annotated[str, Field(min_length=7, max_length=10, pattern=r"^\d{7,10}$")]
Porcentaje = Annotated[Decimal, Field(ge=Decimal("0"), le=Decimal("100"))]
MontoPositivo = Annotated[Decimal, Field(gt=Decimal("0"))]


# ─────────────────────────────────────────────────────────────────────────────
# MÓDULO 0 · CONFIGURACIÓN GLOBAL
# ─────────────────────────────────────────────────────────────────────────────

class ConfiguracionGlobalBase(BaseModel):
    valor_cuota_base: MontoPositivo = Field(
        description="Precio vigente de la cuota social."
    )
    dia_vencimiento_cuota: int = Field(
        default=10,
        ge=1,
        le=28,
        description=(
            "Día del mes en que vence el período de cobertura del socio (1–28). "
            "Límite superior = 28 para garantizar que la fecha sea válida en todos "
            "los meses, incluido febrero no bisiesto. "
            "Ejemplo: 10 → el acceso expira el día 10 de cada mes. "
            "Todo el backend usa este valor para calcular la fecha exacta de "
            "mes_cubierto_hasta al aprobar una orden de cuota_social."
        ),
    )
    meses_antiguedad_beneficio: int = Field(
        ge=1, description="Meses requeridos para acceder al descuento por antigüedad."
    )
    descuento_beneficio: Porcentaje = Field(
        description="Porcentaje de descuento en alquileres por antigüedad (0–100)."
    )


class ConfiguracionGlobalUpdate(BaseModel):
    """Todos los campos son opcionales — PATCH parcial."""
    valor_cuota_base: Optional[MontoPositivo] = None
    dia_vencimiento_cuota: Optional[int] = Field(
        default=None,
        ge=1,
        le=28,
        description="Día de vencimiento mensual del período del socio (1–28).",
    )
    meses_antiguedad_beneficio: Optional[int] = Field(default=None, ge=1)
    descuento_beneficio: Optional[Porcentaje] = None


class ConfiguracionGlobalResponse(ConfiguracionGlobalBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    actualizado_por: Optional[int] = None
    actualizado_at: datetime


# ─────────────────────────────────────────────────────────────────────────────
# MÓDULO 1 · ROLES
# ─────────────────────────────────────────────────────────────────────────────

class RolBase(BaseModel):
    nombre: str = Field(max_length=50)
    descripcion: Optional[str] = None
    peso_jerarquico: int = Field(default=0, ge=0)
    es_activo: bool = True


class RolCreate(RolBase):
    pass


class RolUpdate(BaseModel):
    nombre: Optional[str] = Field(default=None, max_length=50)
    descripcion: Optional[str] = None
    peso_jerarquico: Optional[int] = Field(default=None, ge=0)
    es_activo: Optional[bool] = None


class RolResponse(RolBase):
    model_config = ConfigDict(from_attributes=True)

    id_rol: int


# ─────────────────────────────────────────────────────────────────────────────
# MÓDULO 1 · USUARIOS
# ─────────────────────────────────────────────────────────────────────────────

class UsuarioBase(BaseModel):
    dni: DNI
    nombre: str = Field(min_length=1, max_length=100)
    apellido: str = Field(min_length=1, max_length=100)
    email: Optional[EmailStr] = None
    telefono: Optional[str] = Field(default=None, max_length=30)
    direccion: Optional[str] = Field(default=None, max_length=200)
    foto_perfil_url: Optional[str] = None
    fecha_nacimiento: Optional[date] = None
    id_titular: Optional[int] = Field(
        default=None,
        description="ID del socio titular (para adherentes/familia).",
    )
    push_token: Optional[str] = Field(default=None, max_length=255)
    es_becado: bool = Field(
        default=False,
        description="TRUE si el socio está becado (exento de cuota).",
    )
    becado_hasta: Optional[date] = Field(
        default=None,
        description=(
            "Fecha de vencimiento de la beca (inclusive). "
            "NULL = beca indefinida. "
            "La beca está activa si es_becado=True AND (becado_hasta IS NULL OR becado_hasta >= hoy)."
        ),
    )


class UsuarioCreate(UsuarioBase):
    """
    Payload para dar de alta un nuevo usuario.
    El backend hashea `password` antes de guardarlo como `password_hash`.
    """
    password: str = Field(min_length=8, description="Contraseña en texto plano.")
    fecha_nacimiento: date = Field(description="Fecha de nacimiento (obligatoria).")

    @field_validator("password")
    @classmethod
    def password_no_trivial(cls, v: str) -> str:
        if v.isdigit():
            raise ValueError("La contraseña no puede ser solo números.")
        return v

    @field_validator("fecha_nacimiento")
    @classmethod
    def fecha_nacimiento_en_pasado(cls, v: date) -> date:
        """Valida que la fecha de nacimiento no sea en el futuro."""
        if v >= date.today():
            raise ValueError("La fecha de nacimiento debe ser anterior a la fecha actual.")
        return v


class UsuarioCreateMigracion(UsuarioBase):
    """
    Payload del script de migración desde Excel.
    La contraseña se genera automáticamente en el backend como
    'car' + últimos 5 dígitos del DNI y se envía por email.
    """
    fecha_ingreso: Optional[date] = None
    deuda_historica_meses: int = Field(default=0, ge=0)


class UsuarioUpdate(BaseModel):
    """Todos los campos opcionales — PATCH parcial."""
    nombre: Optional[str] = Field(default=None, min_length=1, max_length=100)
    apellido: Optional[str] = Field(default=None, min_length=1, max_length=100)
    email: Optional[EmailStr] = None
    telefono: Optional[str] = Field(default=None, max_length=30)
    direccion: Optional[str] = Field(default=None, max_length=200)
    foto_perfil_url: Optional[str] = None
    fecha_nacimiento: Optional[date] = None
    push_token: Optional[str] = Field(default=None, max_length=255)
    is_directivo: Optional[bool] = None   # Solo Admin General; backend valida antigüedad
    es_becado: Optional[bool] = None
    becado_hasta: Optional[date] = Field(
        default=None,
        description="NULL = beca indefinida. Fecha de vencimiento inclusive.",
    )


class UsuarioCambiarPassword(BaseModel):
    """Payload para el forzado de cambio de contraseña en primer ingreso."""
    password_actual: str
    password_nuevo: str = Field(min_length=8)
    password_nuevo_confirmacion: str

    @model_validator(mode="after")
    def passwords_coinciden(self) -> "UsuarioCambiarPassword":
        if self.password_nuevo != self.password_nuevo_confirmacion:
            raise ValueError("Las contraseñas nuevas no coinciden.")
        if self.password_actual == self.password_nuevo:
            raise ValueError("La nueva contraseña debe ser diferente a la actual.")
        return self


class UsuarioBaja(BaseModel):
    """Payload para dar de baja a un usuario (baja lógica, nunca DELETE)."""
    fecha_baja: date = Field(default_factory=date.today)
    motivo: Optional[str] = None


# ── Respuestas ────────────────────────────────────────────────────────────────

class RolResponseSimple(BaseModel):
    """Versión ligera de Rol para embeber en UsuarioResponse."""
    model_config = ConfigDict(from_attributes=True)

    id_rol: int
    nombre: str
    peso_jerarquico: int


class UsuarioRolResponse(BaseModel):
    """Asignación de rol con metadata de expiración."""
    model_config = ConfigDict(from_attributes=True)

    id_rol: int
    valido_hasta: Optional[datetime] = None
    asignado_at: datetime
    rol: RolResponseSimple


class UsuarioResponse(UsuarioBase):
    """
    Respuesta estándar. No expone password_hash.
    qr_token y estado financiero son de solo lectura.

    mes_cubierto_hasta: serializado por Pydantic v2 como "YYYY-MM-DD" (ISO 8601)
    automáticamente, sin configuración adicional. NULL = nunca pagó o sin cobertura.
    El frontend evalúa: new Date() <= new Date(mes_cubierto_hasta) → habilitado.
    """
    model_config = ConfigDict(from_attributes=True)

    id_usuario: int
    qr_token: uuid.UUID
    qr_generado_at: datetime
    mes_cubierto_hasta: Optional[date] = Field(
        default=None,
        description=(
            "Fecha hasta la cual el socio tiene acceso habilitado (ISO 8601: YYYY-MM-DD). "
            "NULL → nunca pagó o sin cobertura activa. "
            "Evaluación de estado en frontend: today <= mes_cubierto_hasta → 'al_dia'. "
            "El día de corte dentro del mes es configurable via "
            "ConfiguracionGlobal.dia_vencimiento_cuota."
        ),
    )
    deuda_historica_meses: int
    fecha_ingreso: date
    fecha_baja: Optional[date] = None
    is_directivo: bool
    requiere_cambio_password: bool
    ultimo_login_at: Optional[datetime] = None
    creado_at: datetime
    es_becado: bool = False
    becado_hasta: Optional[date] = None
    roles_asignados: List[UsuarioRolResponse] = []


class UsuarioListResponse(BaseModel):
    """Versión condensada para listados (sin roles completos ni QR)."""
    model_config = ConfigDict(from_attributes=True)

    id_usuario: int
    dni: str
    nombre: str
    apellido: str
    email: Optional[str] = None
    fecha_baja: Optional[date] = None
    deuda_historica_meses: int
    mes_cubierto_hasta: Optional[date] = Field(
        default=None,
        description="Fecha de cobertura vigente (ISO 8601). NULL = sin cobertura activa.",
    )


class UsuarioQRValidacionResponse(BaseModel):
    """
    Respuesta del lector de puerta al escanear un QR.
    Mínima información necesaria: no expone deuda en pesos ni datos privados.

    estado_financiero y es_valido se calculan con el mismo motor que usa el
    frontend en SocioCuotas.jsx (`calcularEstadoFinanciero`): contempla
    período de gracia, socios nuevos (fecha_ingreso sin mes_cubierto_hasta
    aún) y el día de vencimiento configurado en ConfiguracionGlobal.
    """
    es_valido: bool
    id_usuario: Optional[int] = None
    nombre_completo: Optional[str] = None
    foto_perfil_url: Optional[str] = None
    estado_financiero: str  # 'al_dia' | 'moroso' | 'inactivo' | 'desconocido'
    roles_activos: List[str] = []
    antiguedad_meses: int = 0
    meses_adeudados: int = Field(
        default=0,
        description=(
            "Meses de cuota vencidos sin pagar, calculados igual que "
            "`mesesAdeudadosReal` en el frontend. 0 si está al día. "
            "Permite al operador distinguir un atraso leve de uno grave "
            "sin exponer montos en pesos."
        ),
    )
    mensaje_display: str  # 'SOCIO HABILITADO ✓' | 'SOCIO NO HABILITADO ✗' | 'SOCIO BECADO ✓' | etc.
    es_becado: bool = Field(
        default=False,
        description="TRUE si el acceso fue habilitado por beca activa (no por pago de cuota).",
    )


# ── Asignación de roles ───────────────────────────────────────────────────────

class AsignarRolPayload(BaseModel):
    """Payload para asignar un rol a un usuario."""
    id_usuario: int
    id_rol: int
    valido_hasta: Optional[datetime] = Field(
        default=None,
        description="Completar solo para roles temporales (ej: admin_temporal).",
    )


class RemoverRolPayload(BaseModel):
    id_usuario: int
    id_rol: int


# ─────────────────────────────────────────────────────────────────────────────
# MÓDULO 2 · AUDITORÍA
# ─────────────────────────────────────────────────────────────────────────────

class AuditLogResponse(BaseModel):
    """Solo lectura — el audit_log nunca se crea desde el frontend."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    usuario_actor: Optional[int] = None
    accion: str
    tabla_afectada: str
    registro_id: Optional[int] = None
    detalle: Optional[dict] = None
    ip_origen: Optional[str] = None
    created_at: datetime


class AuditLogFiltros(BaseModel):
    """Filtros para el endpoint GET /audit-log."""
    accion: Optional[str] = None
    tabla_afectada: Optional[str] = None
    usuario_actor: Optional[int] = None
    desde: Optional[datetime] = None
    hasta: Optional[datetime] = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=50, ge=1, le=200)


# ─────────────────────────────────────────────────────────────────────────────
# MÓDULO 3 · PRODUCTOS & SERVICIOS
# ─────────────────────────────────────────────────────────────────────────────

CATEGORIAS_PRODUCTO = ("cuota_social", "alquiler", "indumentaria", "otro")


class ProductoServicioBase(BaseModel):
    nombre: str = Field(min_length=1, max_length=150)
    categoria: str = Field(description="cuota_social | alquiler | indumentaria | otro")
    descripcion: Optional[str] = None
    precio_actual: MontoPositivo
    stock: Optional[int] = Field(default=None, ge=0)
    es_activo: bool = True
    imagen_url: Optional[str] = None

    @field_validator("categoria")
    @classmethod
    def categoria_valida(cls, v: str) -> str:
        if v not in CATEGORIAS_PRODUCTO:
            raise ValueError(f"Categoría inválida. Opciones: {CATEGORIAS_PRODUCTO}")
        return v


class ProductoServicioCreate(ProductoServicioBase):
    pass


class ProductoServicioUpdate(BaseModel):
    nombre: Optional[str] = Field(default=None, min_length=1, max_length=150)
    descripcion: Optional[str] = None
    precio_actual: Optional[MontoPositivo] = None
    stock: Optional[int] = Field(default=None, ge=0)
    es_activo: Optional[bool] = None
    imagen_url: Optional[str] = None


class ProductoServicioResponse(ProductoServicioBase):
    model_config = ConfigDict(from_attributes=True)

    id_producto: int
    creado_at: datetime
    actualizado_at: datetime


# ─────────────────────────────────────────────────────────────────────────────
# MÓDULO 3 · RESERVAS DE INSTALACIONES
# ─────────────────────────────────────────────────────────────────────────────

ESTADOS_RESERVA = ("bloqueada", "confirmada", "liberada", "expirada")


class ReservaInstalacionCreate(BaseModel):
    id_producto: int
    instalacion: str = Field(max_length=100, description="'quincho', 'cancha_1', etc.")
    fecha_inicio: datetime
    fecha_fin: datetime

    @model_validator(mode="after")
    def fechas_coherentes(self) -> "ReservaInstalacionCreate":
        if self.fecha_fin <= self.fecha_inicio:
            raise ValueError("fecha_fin debe ser posterior a fecha_inicio.")
        return self


class ReservaInstalacionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id_reserva: int
    id_producto: int
    instalacion: str
    fecha_inicio: datetime
    fecha_fin: datetime
    estado: str
    id_orden: Optional[int] = None
    creado_at: datetime


class DisponibilidadReservaResponse(BaseModel):
    """
    Vista pública/liviana de una franja ocupada, para pintar el calendario
    de disponibilidad. A propósito NO incluye `id_orden` ni `id_producto`:
    cualquier socio puede consultar la agenda de una instalación y no debe
    ver a qué orden (de qué otro socio) corresponde cada bloqueo.
    """
    model_config = ConfigDict(from_attributes=True)

    id_reserva: int
    fecha_inicio: datetime
    fecha_fin: datetime
    estado: str


# ─────────────────────────────────────────────────────────────────────────────
# MÓDULO 3 · ÓRDENES & DETALLES
# ─────────────────────────────────────────────────────────────────────────────

ESTADOS_ORDEN = (
    "pendiente_verificacion",
    "aprobada",
    "rechazada",
    "cancelada_socio",
    "expirada",
)


class PagoResponse(BaseModel):
    """
    Cabecera de cobro — patrón "Split-Order bajo un único Pago".
    Un Pago agrupa una o más Órdenes bajo un único comprobante/transferencia.
    """
    model_config = ConfigDict(from_attributes=True)

    id_pago: int
    id_usuario: int
    monto_total: Decimal
    comprobante_url: Optional[str] = None
    estado: str
    fecha_creacion: datetime


class DetalleOrdenCreate(BaseModel):
    """Un ítem dentro del carrito. El precio se resuelve en el backend."""
    id_producto: int
    cantidad: int = Field(default=1, ge=1)
    mes_referencia: Optional[date] = Field(
        default=None,
        description="Para cuotas: primer día del mes a pagar (ej: 2025-06-01).",
    )
    id_reserva: Optional[int] = Field(
        default=None,
        description=(
            "Para alquileres: id de la ReservaInstalacion ya creada (estado "
            "'bloqueada') vía POST /socio/reservas/pre-reserva. El checkout "
            "la vincula a la orden nueva; no crea reservas por su cuenta."
        ),
    )


class DetalleOrdenResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id_detalle: int
    id_producto: int
    cantidad: int
    precio_unitario_historico: Decimal
    mes_referencia: Optional[date] = None
    id_reserva: Optional[int] = None
    producto: Optional[ProductoServicioResponse] = None


class OrdenCreate(BaseModel):
    """
    El socio envía los ítems; el backend calcula monto_total y bloquea stock/reservas.
    El frontend NUNCA envía monto_total para evitar manipulación.
    """
    items: List[DetalleOrdenCreate] = Field(min_length=1)

    @field_validator("items")
    @classmethod
    def items_no_vacio(cls, v: List[DetalleOrdenCreate]) -> List[DetalleOrdenCreate]:
        if not v:
            raise ValueError("Una orden debe tener al menos un ítem.")
        return v


class OrdenSubirComprobante(BaseModel):
    """El socio sube la URL del comprobante de transferencia."""
    comprobante_url: str = Field(min_length=1)


class OrdenAprobar(BaseModel):
    """Payload del Personal Administrativo para aprobar una orden."""
    notas_admin: Optional[str] = None
    meses_corregidos: Optional[int] = Field(
        default=None,
        gt=0,
        description=(
            "Si se especifica, sobreescribe la cantidad de meses del ítem de cuota_social "
            "y recalcula el monto_total de la orden antes de aprobarla. "
            "Útil cuando el comprobante muestra un importe diferente al solicitado."
        ),
    )


class OrdenRechazar(BaseModel):
    """Payload del Personal Administrativo para rechazar una orden."""
    motivo_rechazo: str = Field(
        min_length=5,
        description="Motivo obligatorio para rechazar (ej: 'Monto no coincide').",
    )


class OrdenResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id_orden: int
    id_usuario: int
    id_pago: int
    fecha_creacion: datetime
    estado: str
    monto_total: Decimal
    motivo_rechazo: Optional[str] = None
    aprobada_por: Optional[int] = None
    aprobada_at: Optional[datetime] = None
    expira_at: datetime
    notas_admin: Optional[str] = None
    detalles: List[DetalleOrdenResponse] = []
    pago: Optional[PagoResponse] = None


class OrdenListResponse(BaseModel):
    """Versión condensada para la bandeja de entrada del admin."""
    model_config = ConfigDict(from_attributes=True)

    id_orden: int
    id_usuario: int
    id_pago: int
    fecha_creacion: datetime
    estado: str
    monto_total: Decimal
    expira_at: datetime


# ─────────────────────────────────────────────────────────────────────────────
# SOCIO · SUBIDA DE COMPROBANTE (upload directo, sin formularios externos)
# ─────────────────────────────────────────────────────────────────────────────

class ComprobanteUploadResponse(BaseModel):
    """Confirmación de que el archivo se guardó y quedó asociado al Pago."""
    id_pago: int
    comprobante_url: str
    mensaje: str = "Comprobante subido correctamente. Un administrador verificará tu pago."


# ─────────────────────────────────────────────────────────────────────────────
# ADMIN · PANEL DE VERIFICACIÓN DE ÓRDENES
# ─────────────────────────────────────────────────────────────────────────────

class UsuarioOrdenSimple(BaseModel):
    """Versión ligera de Usuario para embeber en la vista admin de órdenes."""
    model_config = ConfigDict(from_attributes=True)

    id_usuario: int
    dni: str
    nombre: str
    apellido: str
    email: Optional[str] = None
    telefono: Optional[str] = None


class OrdenAdminResponse(OrdenResponse):
    """OrdenResponse enriquecida con los datos del socio, para el panel admin."""
    usuario: Optional[UsuarioOrdenSimple] = None


class OrdenAprobarResponse(BaseModel):
    """Confirmación de aprobación, incluyendo el impacto en la deuda del socio."""
    id_orden: int
    estado: str
    aprobada_por: int
    aprobada_at: datetime
    deuda_historica_meses_restante: Optional[int] = Field(
        default=None,
        description="Solo se completa si la orden tenía ítems de categoría 'cuota_social'.",
    )


class OrdenRechazarResponse(BaseModel):
    """Confirmación de rechazo."""
    id_orden: int
    estado: str
    motivo_rechazo: str



# ─────────────────────────────────────────────────────────────────────────────
# ADMIN · GESTIÓN DE PAGOS / CUOTAS SOCIALES
# ─────────────────────────────────────────────────────────────────────────────

class EstadisticasPagosResponse(BaseModel):
    """Resumen financiero para el dashboard de administración."""
    total_socios_al_dia: int
    total_socios_morosos: int
    precio_cuota_actual: Decimal
    deuda_total_estimada: Decimal = Field(
        description="Suma de deuda_historica_meses de todos los morosos, "
                     "multiplicada por el precio_actual vigente del producto 'cuota_social'.",
    )
    dia_vencimiento_cuota: int


class MorosoResponse(BaseModel):
    """Un socio con deuda, listo para mostrar en la bandeja de morosos."""
    model_config = ConfigDict(from_attributes=True)

    id_usuario: int
    dni: str
    nombre: str
    apellido: str
    email: Optional[str] = None
    telefono: Optional[str] = None
    fecha_ingreso: date = Field(
        description="Fecha de alta original del socio."
    )
    mes_cubierto_hasta: Optional[date] = Field(
        default=None,
        description="Último período cubierto por un pago. NULL si nunca pagó.",
    )
    deuda_historica_meses: int
    deuda_estimada: Decimal = Field(
        description="deuda_historica_meses × precio_actual de la cuota social."
    )


class OrdenParaReservaAdmin(BaseModel):
    """Vista simple de una Orden para anidar en la respuesta de reservas del admin."""
    model_config = ConfigDict(from_attributes=True)
    id_orden: int
    estado: str
    usuario: Optional[UsuarioOrdenSimple] = None


class ReservaAdminResponse(BaseModel):
    """Respuesta para la tabla de reservas del admin, con datos de la orden y el socio."""
    model_config = ConfigDict(from_attributes=True)

    id_reserva: int
    instalacion: str
    fecha_inicio: datetime
    fecha_fin: datetime
    estado: str  # 'bloqueada', 'confirmada', etc.
    creado_at: datetime
    orden: Optional[OrdenParaReservaAdmin] = None


class RegistrarPagoManualPayload(BaseModel):
    """Payload para que el admin registre un cobro por ventanilla (efectivo/transferencia)."""
    id_usuario: int
    meses_a_pagar: int = Field(gt=0, description="Cantidad de meses que se están saldando.")


class RegistrarPagoManualResponse(BaseModel):
    """Confirmación del pago manual registrado."""
    id_orden: int
    id_usuario: int
    meses_pagados: int
    monto_total: Decimal
    deuda_restante_meses: int


# ─────────────────────────────────────────────────────────────────────────────
# SOCIO · ORDEN PENDIENTE & CANCELACIÓN
# ─────────────────────────────────────────────────────────────────────────────

class OrdenSocioPendienteResponse(BaseModel):
    """
    Orden de cuota social en estado 'pendiente_verificacion' del socio logueado.
    Devuelta por GET /socio/cuotas/orden-pendiente.
    Incluye los detalles con el producto para que el frontend pueda
    mostrar el monto, los meses solicitados y el estado del comprobante
    (accesible vía `orden.pago.comprobante_url`).
    """
    model_config = ConfigDict(from_attributes=True)

    id_orden: int
    id_pago: int
    estado: str
    monto_total: Decimal
    fecha_creacion: datetime
    expira_at: datetime
    detalles: List[DetalleOrdenResponse] = []
    pago: Optional[PagoResponse] = None


class OrdenCancelarResponse(BaseModel):
    """Confirmación de que el socio canceló su propia orden pendiente."""
    id_orden: int
    estado: str
    mensaje: str = "Tu orden fue cancelada exitosamente."


# ─────────────────────────────────────────────────────────────────────────────
# SOCIO · MIS CUOTAS
# ─────────────────────────────────────────────────────────────────────────────

class EstadoCuotaSocioResponse(BaseModel):
    """Estado financiero del socio logueado, para su propia pantalla de cuotas."""
    id_producto: int = Field(
        description="ID del ProductoServicio de categoría 'cuota_social' vigente."
    )
    deuda_historica_meses: int
    mes_cubierto_hasta: Optional[date] = Field(
        default=None,
        description=(
            "Fecha exacta hasta la que el socio tiene acceso habilitado (ISO 8601). "
            "NULL = sin cobertura activa (nunca pagó o deuda total). "
            "El frontend puede mostrar: 'Tu acceso está activo hasta el {mes_cubierto_hasta}'."
        ),
    )
    precio_cuota_actual: Decimal
    deuda_total_pesos: Decimal = Field(
        description="deuda_historica_meses × precio_cuota_actual."
    )
    dia_vencimiento_cuota: int = Field(
        description=(
            "Día del mes configurado como fecha de corte (de ConfiguracionGlobal). "
            "El frontend lo usa para construir el mensaje de vencimiento: "
            "'Tu cuota vence el día {dia_vencimiento_cuota} de cada mes'."
        ),
    )
    fecha_ingreso: date = Field(
        description=(
            "Fecha en que el socio se unió al club (fecha de alta original). "
            "El frontend la usa para el Calendario Anual: cualquier mes anterior "
            "a esta fecha se muestra como 'Inactivo / No era socio'."
        ),
    )
    es_becado: bool = Field(
        default=False,
        description=(
            "TRUE si la respuesta fue generada con beca activa. "
            "El frontend debe usar este campo para ocultar el botón de pago "
            "y mostrar el aviso de bonificación total."
        ),
    )
    becado_hasta: Optional[date] = Field(
        default=None,
        description="Fecha de vencimiento de la beca. NULL = indefinida.",
    )


class HistorialPagoCuotaResponse(BaseModel):
    """Un pago de cuota ya aprobado, para el historial del socio."""
    id_orden: int
    fecha_pago: Optional[datetime] = Field(
        default=None, description="Orden.aprobada_at del pago."
    )
    cantidad_meses: int
    monto_pagado: Decimal = Field(description="precio_unitario_historico × cantidad_meses.")
    mes_referencia: Optional[date] = None
    comprobante_url: Optional[str] = None


class GenerarOrdenCuotaPayload(BaseModel):
    """El socio pide generar una orden de pago por N meses de cuota."""
    meses_a_pagar: int = Field(gt=0, description="Cantidad de meses que quiere abonar.")


class GenerarOrdenCuotaResponse(BaseModel):
    id_orden: int
    id_pago: int    
    estado: str
    monto_total: Decimal
    meses_a_pagar: int
    expira_at: datetime


# ─────────────────────────────────────────────────────────────────────────────
# MÓDULO 4 · DEPORTIVO & EVENTOS
# ─────────────────────────────────────────────────────────────────────────────

TIPOS_EVENTO = ("partido", "torneo", "entrenamiento", "institucional", "otro")
ESTADOS_EVENTO = ("programado", "en_curso", "finalizado", "cancelado")


class CategoriaDeportivaBase(BaseModel):
    nombre: str = Field(min_length=1, max_length=100)
    descripcion: Optional[str] = None
    es_activa: bool = True
    fecha_corte_min: Optional[date] = Field(
        default=None,
        description=(
            "Fecha de nacimiento mínima (inclusive) admitida en la categoría. "
            "Junto a fecha_corte_max define el rango que usa el autocompletado masivo."
        ),
    )
    fecha_corte_max: Optional[date] = Field(
        default=None,
        description=(
            "Fecha de nacimiento máxima (inclusive) admitida en la categoría. "
            "Si falta cualquiera de los dos cortes, la categoría no admite Autocompletar."
        ),
    )

    @model_validator(mode="after")
    def cortes_en_orden(self) -> "CategoriaDeportivaBase":
        if (
            self.fecha_corte_min is not None
            and self.fecha_corte_max is not None
            and self.fecha_corte_min > self.fecha_corte_max
        ):
            raise ValueError("fecha_corte_min no puede ser posterior a fecha_corte_max.")
        return self


class CategoriaDeportivaCreate(CategoriaDeportivaBase):
    pass


class CategoriaDeportivaUpdate(BaseModel):
    """Todos los campos opcionales — PATCH parcial."""
    nombre: Optional[str] = Field(default=None, min_length=1, max_length=100)
    descripcion: Optional[str] = None
    es_activa: Optional[bool] = None
    fecha_corte_min: Optional[date] = None
    fecha_corte_max: Optional[date] = None

    @model_validator(mode="after")
    def cortes_en_orden(self) -> "CategoriaDeportivaUpdate":
        if (
            self.fecha_corte_min is not None
            and self.fecha_corte_max is not None
            and self.fecha_corte_min > self.fecha_corte_max
        ):
            raise ValueError("fecha_corte_min no puede ser posterior a fecha_corte_max.")
        return self


class CategoriaDeportivaResponse(CategoriaDeportivaBase):
    model_config = ConfigDict(from_attributes=True)

    id_categoria: int


class UsuarioCategoriaCreate(BaseModel):
    id_usuario: int
    id_categoria: int
    temporada: str = Field(max_length=10, description="Año de temporada. Ej: '2025'.")
    es_capitan: bool = False


class CapitanUpdate(BaseModel):
    """
    Payload del PATCH /categorias/{id_categoria}/jugadores/{id_usuario}.
    Permite alternar la capitanía de un jugador en una temporada específica.
    """
    temporada: str = Field(
        max_length=10,
        description="Año de la temporada a modificar. Ej: '2026'.",
    )
    es_capitan: bool = Field(
        description="True para nombrar capitán, False para quitar la capitanía.",
    )


class JugadorBusquedaResponse(BaseModel):
    """Resultado del buscador de jugadores para excepciones manuales (alta/baja de plantel)."""
    model_config = ConfigDict(from_attributes=True)

    id_usuario: int
    dni: str
    nombre: str
    apellido: str
    fecha_nacimiento: Optional[date] = None
    email: Optional[str] = None


class UsuarioCategoriaResponse(BaseModel):
    """
    Respuesta de un jugador inscripto en un plantel.

    - `es_capitan`: bool — indica si es el capitán de la categoría en esa temporada.
    - `usuario.fecha_nacimiento`: date — el frontend extrae el año con
      new Date(usuario.fecha_nacimiento).getFullYear() para mostrar la columna "Año".
    """
    model_config = ConfigDict(from_attributes=True)

    id_usuario: int
    id_categoria: int
    temporada: str
    es_capitan: bool
    categoria: Optional[CategoriaDeportivaResponse] = None
    usuario: Optional[JugadorBusquedaResponse] = None


class AutocompletarPlantelPayload(BaseModel):
    """Payload del botón 'Autocompletar' — solo admin_general."""
    temporada: str = Field(
        max_length=10,
        description="Temporada a inscribir. Ej: '2026'.",
    )


class AutocompletarPlantelResponse(BaseModel):
    id_categoria: int
    temporada: str
    candidatos_encontrados: int = Field(
        description="Jugadores cuya fecha_nacimiento entra en el corte de la categoría."
    )
    inscriptos_nuevos: int = Field(
        description=(
            "Filas efectivamente insertadas (ON CONFLICT DO NOTHING descarta "
            "los que ya estaban inscriptos en esa temporada)."
        )
    )


ESTADOS_CONVOCATORIA = ("citado", "confirmado", "rechazado", "ausente", "presente")


class ConvocatoriaCreate(BaseModel):
    """Cita a UN jugador puntual a un evento (alta manual desde el buscador)."""
    id_usuario: int
    notas: Optional[str] = None


class ConvocatoriaCitarCategoriaPayload(BaseModel):
    """
    Payload del botón 'Convocar a toda la categoría' — cita de una sola vez
    a todos los jugadores inscriptos (usuarios_categorias) en la categoría
    del evento para la temporada indicada. Los que ya estén convocados
    se ignoran (no duplica ni pisa su estado actual).
    """
    temporada: str = Field(
        max_length=10,
        description="Temporada de la que se toma el plantel. Ej: '2026'.",
    )


class ConvocatoriaUpdate(BaseModel):
    """
    PATCH del jugador (confirmar/rechazar) o del técnico (marcar
    presente/ausente en el cierre, editar notas).
    """
    estado: Optional[str] = None
    notas: Optional[str] = None

    @field_validator("estado")
    @classmethod
    def estado_valido(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ESTADOS_CONVOCATORIA:
            raise ValueError(f"Estado inválido. Opciones: {ESTADOS_CONVOCATORIA}")
        return v


class ConvocatoriaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id_evento: int
    id_usuario: int
    estado: str
    citado_por: Optional[int] = None
    citado_at: datetime
    respondido_at: Optional[datetime] = None
    notas: Optional[str] = None
    usuario: Optional[JugadorBusquedaResponse] = None


class ConvocatoriaCitarCategoriaResponse(BaseModel):
    id_evento: int
    citados_nuevos: int = Field(
        description="Convocatorias efectivamente creadas (se ignoran los que ya estaban citados)."
    )


class ConvocatoriaCierreResponse(BaseModel):
    """Resumen del cierre de convocatoria (POST /convocatorias/cerrar)."""
    id_evento: int
    presentes: int
    ausentes: int
    total: int


class EventoBase(BaseModel):
    titulo: str = Field(min_length=1, max_length=200)
    tipo: str
    descripcion: Optional[str] = None
    id_categoria: Optional[int] = None
    fecha_inicio: datetime
    fecha_fin: Optional[datetime] = None
    ubicacion: Optional[str] = Field(default=None, max_length=200)

    @field_validator("tipo")
    @classmethod
    def tipo_valido(cls, v: str) -> str:
        if v not in TIPOS_EVENTO:
            raise ValueError(f"Tipo inválido. Opciones: {TIPOS_EVENTO}")
        return v


class EventoCreate(EventoBase):
    pass


class EventoUpdate(BaseModel):
    titulo: Optional[str] = Field(default=None, min_length=1, max_length=200)
    descripcion: Optional[str] = None
    fecha_inicio: Optional[datetime] = None
    fecha_fin: Optional[datetime] = None
    ubicacion: Optional[str] = Field(default=None, max_length=200)
    estado: Optional[str] = None

    @field_validator("estado")
    @classmethod
    def estado_valido(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ESTADOS_EVENTO:
            raise ValueError(f"Estado inválido. Opciones: {ESTADOS_EVENTO}")
        return v


class EventoResponse(EventoBase):
    model_config = ConfigDict(from_attributes=True)

    id_evento: int
    estado: str
    creado_por: Optional[int] = None
    creado_at: datetime
    categoria: Optional[CategoriaDeportivaResponse] = None
    convocatorias: List["ConvocatoriaResponse"] = Field(default_factory=list)


class AsistenciaCreate(BaseModel):
    """Lo envía el operador de puerta al escanear (el backend resuelve el estado financiero)."""
    id_evento: int
    id_usuario: int
    metodo: str = Field(description="'QR' | 'DNI'")

    @field_validator("metodo")
    @classmethod
    def metodo_valido(cls, v: str) -> str:
        if v not in ("QR", "DNI"):
            raise ValueError("metodo debe ser 'QR' o 'DNI'.")
        return v


class AsistenciaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id_asistencia: int
    id_evento: int
    id_usuario: int
    fecha_hora_ingreso: datetime
    metodo: str
    registrado_por: int
    estado_financiero_snapshot: str


class ReporteEventoResponse(BaseModel):
    """Resumen de cierre del evento (resultado de la vista v_reporte_evento)."""
    id_evento: int
    titulo: str
    fecha_inicio: datetime
    total_ingresos: int
    ingresos_qr: int
    ingresos_manual: int
    socios_al_dia: int
    socios_morosos: int
    jugadores_federados: int


# ─────────────────────────────────────────────────────────────────────────────
# MÓDULO 5 · NOTIFICACIONES
# ─────────────────────────────────────────────────────────────────────────────

TIPOS_NOTIFICACION = (
    "orden_aprobada", "orden_rechazada", "cuota_vencida",
    "reserva_confirmada", "reserva_cancelada", "rol_asignado",
    "rol_removido", "convocatoria_partido", "sistema",
)


class NotificacionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id_notificacion: int
    tipo: str
    titulo: str
    cuerpo: Optional[str] = None
    leida: bool
    referencia_id: Optional[int] = None
    referencia_tabla: Optional[str] = None
    created_at: datetime


class MarcarLeidaPayload(BaseModel):
    ids: List[int] = Field(min_length=1, description="Lista de IDs de notificaciones a marcar como leídas.")


# ─────────────────────────────────────────────────────────────────────────────
# AUTENTICACIÓN
# ─────────────────────────────────────────────────────────────────────────────

class LoginPayload(BaseModel):
    dni: DNI
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    requiere_cambio_password: bool
    roles: List[str]


# ─────────────────────────────────────────────────────────────────────────────
# PAGINACIÓN GENÉRICA
# ─────────────────────────────────────────────────────────────────────────────

class PaginatedResponse(BaseModel):
    """Wrapper genérico de paginación. Úsalo con Generic[T] en los endpoints."""
    total: int
    page: int
    page_size: int
    items: list


# ─────────────────────────────────────────────────────────────────────────────
# QR AUTH
# ─────────────────────────────────────────────────────────────────────────────

class UsuarioAccesoSimple(BaseModel):
    """Versión ligera de Usuario para embeber en ComercioAsociadoResponse."""
    model_config = ConfigDict(from_attributes=True)

    id_usuario: int
    nombre: str
    apellido: str
    dni: str


class ComercioAsociadoBase(BaseModel):
    nombre_fantasia: str = Field(min_length=1, max_length=150)
    rubro: Optional[str] = Field(default=None, max_length=100)
    beneficio_ofrecido: str = Field(min_length=1, max_length=200)
    es_activo: bool = True


class ComercioAsociadoCreate(ComercioAsociadoBase):
    id_usuario_acceso: Optional[int] = Field(
        default=None,
        description=(
            "ID de la cuenta (típicamente rol 'invitado') que el comercio "
            "usará para acceder al escáner de validación de beneficios."
        ),
    )


class ComercioAsociadoUpdate(BaseModel):
    """Todos los campos son opcionales — PATCH parcial."""
    nombre_fantasia: Optional[str] = Field(default=None, min_length=1, max_length=150)
    rubro: Optional[str] = Field(default=None, max_length=100)
    beneficio_ofrecido: Optional[str] = Field(default=None, min_length=1, max_length=200)
    es_activo: Optional[bool] = None
    id_usuario_acceso: Optional[int] = None


class ComercioAsociadoResponse(ComercioAsociadoBase):
    model_config = ConfigDict(from_attributes=True)

    id_comercio: int
    id_usuario_acceso: Optional[int] = None
    usuario_acceso: Optional[UsuarioAccesoSimple] = None


# ─────────────────────────────────────────────────────────────────────────────
# QR AUTH
# ─────────────────────────────────────────────────────────────────────────────

class QRTokenResponse(BaseModel):
    qr_token: uuid.UUID


class QRValidationPayload(BaseModel):
    token: str


class DNIValidationPayload(BaseModel):
    dni: DNI

class ValidationResponse(BaseModel):
    nombre: str
    apellido: str
    dni: str
    estado_financiero: str  # 'Al día' | 'Moroso'
    es_socio_activo: bool