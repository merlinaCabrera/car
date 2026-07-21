"""
models.py — SQLAlchemy 2.0 Declarative Models
Club Atlético — Sistema de Gestión

Cubre el 100% del schema.sql:
  Módulo 0 · Configuración Global
  Módulo 1 · Identidad & Accesos
  Módulo 2 · Auditoría
  Módulo 3 · E-Commerce & Finanzas
  Módulo 4 · Deportivo & Eventos
  Módulo 5 · Notificaciones

Notas de arquitectura:
  - Se usa la API declarativa de SQLAlchemy 2.0 (Mapped / mapped_column).
  - Los triggers, vistas y funciones PL/pgSQL NO se declaran aquí;
    se inyectan vía op.execute() en las migraciones de Alembic.
  - La FK circular ordenes ↔ reservas_instalaciones se resuelve
    con use_alter=True en el lado débil (reservas_instalaciones.id_orden).
  - Los campos gestionados por triggers (nombre_completo_search, qr_token,
    qr_generado_at, actualizado_at) se declaran con server_default / onupdate
    para que SQLAlchemy los lea correctamente tras un INSERT/UPDATE pero no
    intente escribirlos por su cuenta.

── Cambios (refactor motor de cuotas) ─────────────────────────────────────────
  ConfiguracionGlobal:
    + dia_vencimiento_cuota (Integer, default=10, CHECK BETWEEN 1 AND 28)
      Referencia universal del día del mes en que vence el período del socio.
      Se usa en toda la lógica de negocio que calcula si un socio está "al día"
      en una fecha dada (backend) o para mostrar la fecha de vencimiento en el
      frontend, sin hardcodear el día en el código.

  Usuario.mes_cubierto_hasta:
    Sin cambio de tipo — ya era Date desde el modelo inicial.
    El campo representa la fecha exacta hasta la cual el socio tiene acceso
    habilitado. La evaluación "¿está al día?" es: CURRENT_DATE <= mes_cubierto_hasta.

  ── Migración Alembic requerida ────────────────────────────────────────────────
    op.add_column("configuracion_global", sa.Column(
        "dia_vencimiento_cuota", sa.Integer(), nullable=False, server_default="10"
    ))
    op.create_check_constraint(
        "chk_dia_vencimiento_cuota",
        "configuracion_global",
        "dia_vencimiento_cuota BETWEEN 1 AND 28",
    )
    # Límite superior = 28 para evitar problemas con febrero en años no bisiestos.

── Cambios (módulo canchas + reintegro QR) ────────────────────────────────────
  Usuario:
    + saldo_a_favor (Numeric(10,2), default=0)
      Crédito interno del socio (reintegros QR, suspensiones por lluvia, etc).
      Se descuenta en el checkout antes de pedir comprobante (lógica de router,
      no de este archivo).

  ReservaInstalacion:
    + id_usuario (FK Usuario, nullable) — socio que generó la pre-reserva.
    + notas (Text, nullable) — nombre del grupo/evento, aclaración libre del admin.
    + num_socios_esperados (Integer, nullable)
    + monto_reintegro_unitario (Numeric(10,2), nullable) — reintegro fijo por
      socio que escanea QR en el turno. Se fija a mano por el admin (no se
      recalcula solo en cada escaneo).

  + Nueva tabla ReintegroQR: un registro por cada socio que escanea su QR en
    la puerta de la cancha durante una reserva confirmada.

  ── Migración Alembic requerida ────────────────────────────────────────────────
    Ver comandos y bloque upgrade()/downgrade() completos entregados en el chat.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import INET, JSONB, TSVECTOR, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


# ─────────────────────────────────────────────────────────────────────────────
# BASE
# ─────────────────────────────────────────────────────────────────────────────

class Base(DeclarativeBase):
    """Base declarativa compartida por todos los modelos."""
    pass


# ─────────────────────────────────────────────────────────────────────────────
# MÓDULO 0 · CONFIGURACIÓN GLOBAL
# ─────────────────────────────────────────────────────────────────────────────

class ConfiguracionGlobal(Base):
    """
    Cerebro financiero del sistema. Solo puede existir una fila (singleton).
    Acceso exclusivo del Administrador General.
    El singleton se garantiza con un índice parcial único en la migración:
        CREATE UNIQUE INDEX idx_configuracion_global_singleton
        ON configuracion_global ((TRUE));
    """
    __tablename__ = "configuracion_global"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # Cuota social
    valor_cuota_base: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False,
        comment="Precio vigente de la cuota. Modifica este campo y toda la deuda se recalcula.",
    )

    # Vencimiento de períodos de cuota
    dia_vencimiento_cuota: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("10"),
        comment=(
            "Día del mes en que vence el período de cobertura del socio (1–28). "
            "Por ejemplo: 10 → el acceso del socio expira el día 10 de cada mes. "
            "Limitado a 28 para evitar fechas inexistentes en febrero."
        ),
    )

    # Beneficios de antigüedad
    meses_antiguedad_beneficio: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("6"),
        comment="Meses requeridos para acceder al descuento por antigüedad.",
    )
    descuento_beneficio: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, server_default=text("15"),
        comment="Porcentaje (0–100) de descuento en alquileres por antigüedad.",
    )

    # Auditoría de cambios
    actualizado_por: Mapped[Optional[int]] = mapped_column(
        ForeignKey("usuarios.id_usuario", ondelete="SET NULL", use_alter=True,
                   name="fk_config_actualizado_por"),
        nullable=True,
    )
    actualizado_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )

    # Relación
    admin_actualizador: Mapped[Optional["Usuario"]] = relationship(
        "Usuario",
        foreign_keys=[actualizado_por],
    )

    # Constraints
    __table_args__ = (
        CheckConstraint(
            "dia_vencimiento_cuota BETWEEN 1 AND 28",
            name="chk_dia_vencimiento_cuota",
            comment=(
                "Cota superior 28 = día más bajo que existe en todos los meses "
                "(febrero no bisiesto). Evita fechas inválidas al calcular vencimientos."
            ),
        ),
    )

    def __repr__(self) -> str:
        return f"<ConfiguracionGlobal cuota={self.valor_cuota_base} vence_dia={self.dia_vencimiento_cuota}>"


# ─────────────────────────────────────────────────────────────────────────────
# MÓDULO 1 · IDENTIDAD & ACCESOS
# ─────────────────────────────────────────────────────────────────────────────

class Rol(Base):
    """Catálogo maestro de roles del sistema. Tabla estática; no la modifica el ORM."""
    __tablename__ = "roles"

    id_rol: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombre: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    descripcion: Mapped[Optional[str]] = mapped_column(Text)
    peso_jerarquico: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0"),
        comment="Mayor número = mayor jerarquía. Admin General=100, Socio=10, Invitado=1.",
    )
    es_activo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true"),
    )

    # Relaciones
    usuarios_asignados: Mapped[List["UsuarioRol"]] = relationship(
        "UsuarioRol", back_populates="rol",
    )

    def __repr__(self) -> str:
        return f"<Rol {self.nombre} (peso={self.peso_jerarquico})>"


class Usuario(Base):
    """
    Núcleo del sistema. Un registro por persona física.
    La clave de negocio inmutable es el DNI.

    Campos gestionados por triggers de PostgreSQL (no los escribas desde Python):
      - nombre_completo_search  →  trigger trg_usuarios_search
      - actualizado_at          →  trigger trg_usuarios_search
      - qr_token                →  trigger trg_rotar_qr
      - qr_generado_at          →  trigger trg_rotar_qr
    """
    __tablename__ = "usuarios"

    id_usuario: Mapped[int] = mapped_column(Integer, primary_key=True)
    dni: Mapped[str] = mapped_column(
        String(10), nullable=False, unique=True,
        comment="Clave de negocio inmutable.",
    )

    # Datos personales
    nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    apellido: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(150), unique=True)
    telefono: Mapped[Optional[str]] = mapped_column(String(30))
    direccion: Mapped[Optional[str]] = mapped_column(String(200))
    foto_perfil_url: Mapped[Optional[str]] = mapped_column(Text)

    # Seguridad
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    requiere_cambio_password: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true"),
        comment="TRUE en primer ingreso. El frontend bloquea hasta que el socio cambie la clave.",
    )
    token_recuperacion: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True,
        comment="Token opaco temporal para reset de password. NULL si no hay pedido activo.",
    )
    token_recuperacion_expira: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
        comment="El token deja de ser válido después de esta fecha (1 hora de vida).",
    )
    ultimo_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    # QR dinámico — gestionado por trigger trg_rotar_qr
    qr_token: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
        unique=True,
        server_default=text("gen_random_uuid()"),
        comment="Token opaco. El QR NUNCA contiene datos planos. Se rota al cambiar estado financiero.",
    )
    qr_generado_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )

    # Estado financiero (cacheado; la deuda real = deuda_historica_meses × cuota_vigente)
    mes_cubierto_hasta: Mapped[Optional[date]] = mapped_column(
        Date,
        comment=(
            "Fecha exacta hasta la cual el socio tiene el acceso habilitado. "
            "NULL = nunca pagó (socio nuevo o sin cuotas aprobadas). "
            "Evaluación de estado: CURRENT_DATE <= mes_cubierto_hasta → 'al_dia'. "
            "El backend calcula esta fecha al aprobar una orden de cuota_social: "
            "  nueva_fecha = MAX(mes_cubierto_hasta_actual, hoy) "
            "              + meses_pagados meses "
            "              con día = dia_vencimiento_cuota de ConfiguracionGlobal. "
            "Si el socio pagó por adelantado, queda inmune a aumentos de precio "
            "hasta esta fecha (el precio ya fue congelado en precio_unitario_historico)."
        ),
    )
    deuda_historica_meses: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0"),
        comment="Meses adeudados en cantidad, NUNCA en pesos.",
    )

    # Billetera interna (reintegros QR, suspensiones por lluvia, etc.)
    saldo_a_favor: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, server_default=text("0"),
        comment=(
            "Crédito interno del socio. Se acredita automáticamente por "
            "ReintegroQR.forma='saldo_a_favor' o por suspensión de una reserva "
            "confirmada (lluvia, etc). Se descuenta en el checkout antes de "
            "pedir comprobante — esa resta la hace el router de carrito, no "
            "un trigger de este modelo."
        ),
    )

    # Ciclo de vida
    fecha_nacimiento: Mapped[Optional[date]] = mapped_column(Date)
    fecha_ingreso: Mapped[date] = mapped_column(
        Date, nullable=False, server_default=func.current_date(),
    )
    fecha_baja: Mapped[Optional[date]] = mapped_column(
        Date,
        comment="NULL = activo. Registrar fecha al dar de baja, nunca borrar el registro.",
    )

    # Flags
    is_directivo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false"),
    )
    es_becado: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false"),
        comment=(
            "TRUE = el socio está becado. El motor financiero ignora mes_cubierto_hasta "
            "y devuelve deuda = 0 mientras la beca esté activa. "
            "La deuda real queda congelada en mes_cubierto_hasta: cuando la beca "
            "expire, el sistema retoma el estado financiero desde donde estaba."
        ),
    )
    becado_hasta: Mapped[Optional[date]] = mapped_column(
        Date,
        nullable=True,
        comment=(
            "NULL = beca indefinida (no expira). "
            "Si tiene fecha: la beca es válida hasta ese día inclusive. "
            "Condición activa: es_becado IS TRUE AND (becado_hasta IS NULL OR becado_hasta >= HOY)."
        ),
    )

    # Full-text search — gestionado por trigger trg_usuarios_search
    nombre_completo_search: Mapped[Optional[str]] = mapped_column(
        TSVECTOR,
        comment="Gestionado por trigger. No escribir desde el ORM.",
    )

    # Socios adherentes (familia)
    id_titular: Mapped[Optional[int]] = mapped_column(
        ForeignKey("usuarios.id_usuario", ondelete="SET NULL"),
    )

    # Push notifications
    push_token: Mapped[Optional[str]] = mapped_column(String(255))

    # Metadatos — actualizado_at gestionado por trigger
    creado_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )
    actualizado_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )

    # ── Relaciones ──────────────────────────────────────────────────────────

    # Self-referential: titular ↔ adherentes
    titular: Mapped[Optional["Usuario"]] = relationship(
        "Usuario", remote_side="Usuario.id_usuario",
        foreign_keys=[id_titular], back_populates="adherentes",
    )
    adherentes: Mapped[List["Usuario"]] = relationship(
        "Usuario", foreign_keys=[id_titular], back_populates="titular",
    )

    # Roles (MULTIROL)
    roles_asignados: Mapped[List["UsuarioRol"]] = relationship(
        "UsuarioRol",
        foreign_keys="UsuarioRol.id_usuario",
        back_populates="usuario",
        cascade="all, delete-orphan",
    )

    # Órdenes generadas por este usuario
    ordenes: Mapped[List["Orden"]] = relationship(
        "Orden",
        foreign_keys="Orden.id_usuario",
        back_populates="usuario",
    )

    # Pagos realizados por este usuario (agrupan una o más órdenes)
    pagos: Mapped[List["Pago"]] = relationship(
        "Pago",
        foreign_keys="Pago.id_usuario",
        back_populates="usuario",
    )

    # Categorías deportivas
    categorias: Mapped[List["UsuarioCategoria"]] = relationship(
        "UsuarioCategoria", back_populates="usuario", cascade="all, delete-orphan",
    )

    # Asistencias (como asistente)
    asistencias: Mapped[List["Asistencia"]] = relationship(
        "Asistencia",
        foreign_keys="Asistencia.id_usuario",
        back_populates="usuario",
    )

    # Asistencias registradas por este usuario (como operador de puerta)
    asistencias_registradas: Mapped[List["Asistencia"]] = relationship(
        "Asistencia",
        foreign_keys="Asistencia.registrado_por",
        back_populates="operador",
    )

    # Notificaciones
    notificaciones: Mapped[List["Notificacion"]] = relationship(
        "Notificacion", back_populates="usuario", cascade="all, delete-orphan",
    )

    # Eventos creados
    eventos_creados: Mapped[List["Evento"]] = relationship(
        "Evento", foreign_keys="Evento.creado_por", back_populates="creador",
    )

    # Convocatorias recibidas (como jugador citado)
    convocatorias: Mapped[List["Convocatoria"]] = relationship(
        "Convocatoria",
        foreign_keys="Convocatoria.id_usuario",
        back_populates="usuario",
        cascade="all, delete-orphan",
    )

    # Convocatorias armadas por este usuario (como técnico/admin)
    convocatorias_citadas: Mapped[List["Convocatoria"]] = relationship(
        "Convocatoria",
        foreign_keys="Convocatoria.citado_por",
        back_populates="citador",
    )

    # ── Índices y constraints ──────────────────────────────────────────────
    __table_args__ = (
        Index("idx_usuarios_dni",        "dni"),
        Index("idx_usuarios_apellido",   "apellido"),
        Index(
            "idx_usuarios_fecha_baja",
            "fecha_baja",
            postgresql_where=text("fecha_baja IS NULL"),
        ),
        Index("idx_usuarios_qr_token",   "qr_token"),
        Index("idx_usuarios_search",     "nombre_completo_search", postgresql_using="gin"),
        CheckConstraint("deuda_historica_meses >= 0", name="chk_deuda_no_negativa"),
    )

    def __repr__(self) -> str:
        return f"<Usuario {self.apellido}, {self.nombre} (DNI={self.dni})>"


class UsuarioRol(Base):
    """
    Tabla puente MULTIROL. Soporta roles temporales con fecha de expiración.
    Un job programado revisa valido_hasta y limpia los roles vencidos.
    """
    __tablename__ = "usuarios_roles"

    id_usuario: Mapped[int] = mapped_column(
        ForeignKey("usuarios.id_usuario", ondelete="CASCADE"),
        primary_key=True,
    )
    id_rol: Mapped[int] = mapped_column(
        ForeignKey("roles.id_rol", ondelete="RESTRICT"),
        primary_key=True,
    )

    # Roles temporales (ej: admin_temporal durante un partido)
    valido_hasta: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        comment="NULL = permanente. Completar con cierre de evento para roles temporales.",
    )
    asignado_por: Mapped[Optional[int]] = mapped_column(
        ForeignKey("usuarios.id_usuario"),
    )
    asignado_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )

    # Relaciones
    usuario: Mapped["Usuario"] = relationship(
        "Usuario",
        foreign_keys=[id_usuario],
        back_populates="roles_asignados",
    )
    rol: Mapped["Rol"] = relationship("Rol", back_populates="usuarios_asignados")
    asignador: Mapped[Optional["Usuario"]] = relationship(
        "Usuario", foreign_keys=[asignado_por],
    )

    __table_args__ = (
        Index("idx_usuarios_roles_usuario", "id_usuario"),
        Index(
            "idx_usuarios_roles_expiry",
            "valido_hasta",
            postgresql_where=text("valido_hasta IS NOT NULL"),
        ),
    )

    def __repr__(self) -> str:
        return f"<UsuarioRol usuario={self.id_usuario} rol={self.id_rol} hasta={self.valido_hasta}>"


# ─────────────────────────────────────────────────────────────────────────────
# MÓDULO 2 · AUDITORÍA
# ─────────────────────────────────────────────────────────────────────────────

class AuditLog(Base):
    """
    Registro inmutable de toda acción sensible.
    Regla de negocio: NUNCA UPDATE ni DELETE en esta tabla.
    Respetarla desde el ORM: no expongas métodos que modifiquen registros.
    """
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    usuario_actor: Mapped[Optional[int]] = mapped_column(
        ForeignKey("usuarios.id_usuario", ondelete="SET NULL"),
    )
    accion: Mapped[str] = mapped_column(
        String(100), nullable=False,
        comment="Ej: APROBAR_ORDEN, CAMBIO_ROL, BAJA_USUARIO, LOGIN_FALLIDO",
    )
    tabla_afectada: Mapped[str] = mapped_column(String(60), nullable=False)
    registro_id: Mapped[Optional[int]] = mapped_column(Integer)
    detalle: Mapped[Optional[dict]] = mapped_column(
        JSONB,
        comment='Estructura: {"antes": {...}, "despues": {...}}',
    )
    ip_origen: Mapped[Optional[str]] = mapped_column(INET)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )

    # Relaciones
    actor: Mapped[Optional["Usuario"]] = relationship("Usuario", foreign_keys=[usuario_actor])

    __table_args__ = (
        Index("idx_audit_log_actor",       "usuario_actor"),
        Index("idx_audit_log_accion",      "accion"),
        Index("idx_audit_log_tabla",       "tabla_afectada", "registro_id"),
        Index("idx_audit_log_created_at",  "created_at", postgresql_ops={"created_at": "DESC"}),
    )

    def __repr__(self) -> str:
        return f"<AuditLog {self.accion} tabla={self.tabla_afectada} id={self.registro_id}>"


# ─────────────────────────────────────────────────────────────────────────────
# MÓDULO 3 · E-COMMERCE & FINANZAS
# ─────────────────────────────────────────────────────────────────────────────

class ProductoServicio(Base):
    """
    Catálogo unificado: cuotas, alquileres e indumentaria.
    stock = NULL para servicios sin límite físico (cuota social).
    """
    __tablename__ = "productos_servicios"

    id_producto: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombre: Mapped[str] = mapped_column(String(150), nullable=False)
    categoria: Mapped[str] = mapped_column(
        String(50), nullable=False,
        comment="cuota_social | alquiler | indumentaria | otro",
    )
    descripcion: Mapped[Optional[str]] = mapped_column(Text)
    precio_actual: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    stock: Mapped[Optional[int]] = mapped_column(
        Integer,
        comment="NULL = sin stock físico (servicios). Integer para indumentaria.",
    )
    es_activo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true"),
    )
    imagen_url: Mapped[Optional[str]] = mapped_column(Text)
    creado_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )
    actualizado_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )

    # Relaciones
    detalles_orden: Mapped[List["DetalleOrden"]] = relationship(
        "DetalleOrden", back_populates="producto",
    )
    reservas: Mapped[List["ReservaInstalacion"]] = relationship(
        "ReservaInstalacion", back_populates="producto",
    )

    __table_args__ = (
        CheckConstraint(
            "categoria IN ('cuota_social', 'alquiler', 'indumentaria', 'otro')",
            name="chk_producto_categoria",
        ),
        Index(
            "idx_productos_categoria",
            "categoria",
            postgresql_where=text("es_activo = TRUE"),
        ),
    )

    def __repr__(self) -> str:
        return f"<ProductoServicio {self.nombre} [{self.categoria}] ${self.precio_actual}>"


class ReservaInstalacion(Base):
    """
    Agenda de instalaciones. Previene conflictos de doble reserva.
    Ciclo de vida: bloqueada → confirmada (al aprobar orden) | liberada (al rechazar/expirar).
    La FK a ordenes usa use_alter=True para romper la dependencia circular.
    """
    __tablename__ = "reservas_instalaciones"

    id_reserva: Mapped[int] = mapped_column(Integer, primary_key=True)
    id_producto: Mapped[int] = mapped_column(
        ForeignKey("productos_servicios.id_producto"), nullable=False,
    )
    instalacion: Mapped[str] = mapped_column(
        String(100), nullable=False,
        comment="Nombre físico: 'quincho', 'cancha_1', 'cancha_2', etc.",
    )
    fecha_inicio: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    fecha_fin: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    estado: Mapped[str] = mapped_column(
        String(30), nullable=False, server_default=text("'bloqueada'"),
    )

    # FK circular — se agrega con ALTER TABLE en la migración (use_alter=True)
    id_orden: Mapped[Optional[int]] = mapped_column(
        ForeignKey(
            "ordenes.id_orden",
            ondelete="SET NULL",
            use_alter=True,
            name="fk_reservas_orden",
        ),
    )

    # Módulo canchas + reintegro QR
    id_usuario: Mapped[Optional[int]] = mapped_column(
        ForeignKey("usuarios.id_usuario", ondelete="SET NULL"),
        nullable=True,
        comment="Socio que generó la pre-reserva (dueño del turno en el carrito). NULL en franjas viejas o si el usuario se dio de baja.",
    )
    notas: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True,
        comment="Nombre del grupo/evento, aclaración libre del admin.",
    )
    num_socios_esperados: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True,
        comment="Cuántos socios se esperan en el turno. Base para calcular monto_reintegro_unitario.",
    )
    monto_reintegro_unitario: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(10, 2), nullable=True,
        comment=(
            "Reintegro fijo por socio que escanea QR en este turno. Lo fija el "
            "admin (default sugerido = precio_reserva × 0.20 / num_socios_esperados) "
            "y queda congelado: el escaneo simplemente lo copia, no lo recalcula."
        ),
    )

    creado_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )

    # Relaciones
    producto: Mapped["ProductoServicio"] = relationship(
        "ProductoServicio", back_populates="reservas",
    )
    orden: Mapped[Optional["Orden"]] = relationship(
        "Orden",
        foreign_keys=[id_orden],
        back_populates="reservas",
    )
    detalles: Mapped[List["DetalleOrden"]] = relationship(
        "DetalleOrden", back_populates="reserva",
    )
    usuario_responsable: Mapped[Optional["Usuario"]] = relationship(
        "Usuario", foreign_keys=[id_usuario],
    )
    reintegros: Mapped[List["ReintegroQR"]] = relationship(
        "ReintegroQR", back_populates="reserva", cascade="all, delete-orphan",
    )

    __table_args__ = (
        CheckConstraint("fecha_fin > fecha_inicio", name="chk_reserva_fechas"),
        CheckConstraint(
            "estado IN ('bloqueada', 'confirmada', 'liberada', 'expirada')",
            name="chk_reserva_estado",
        ),
        Index(
            "idx_reservas_instalacion_tiempo",
            "instalacion", "fecha_inicio", "fecha_fin",
            postgresql_where=text("estado IN ('bloqueada', 'confirmada')"),
        ),
    )

    def __repr__(self) -> str:
        return f"<ReservaInstalacion {self.instalacion} {self.fecha_inicio:%Y-%m-%d %H:%M} [{self.estado}]>"


class ReintegroQR(Base):
    """
    Registro de cada socio que escaneó su QR en la puerta de la cancha
    durante una reserva confirmada. Dispara el reintegro del 20%.
    Un socio no puede escanear dos veces en la misma reserva (unique).
    """
    __tablename__ = "reintegros_qr"

    id_reintegro: Mapped[int] = mapped_column(Integer, primary_key=True)
    id_reserva: Mapped[int] = mapped_column(
        ForeignKey("reservas_instalaciones.id_reserva", ondelete="CASCADE"), nullable=False,
    )
    id_usuario: Mapped[int] = mapped_column(
        ForeignKey("usuarios.id_usuario", ondelete="RESTRICT"), nullable=False,
    )
    monto: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    forma: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=text("'pendiente'"),
        comment="'pendiente' | 'saldo_a_favor' | 'efectivo' | 'transferencia'",
    )
    escaneado_por: Mapped[int] = mapped_column(
        ForeignKey("usuarios.id_usuario"), nullable=False,
        comment="Operador (portero_cancha) que hizo el escaneo.",
    )
    escaneado_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )

    # Relaciones
    reserva: Mapped["ReservaInstalacion"] = relationship(
        "ReservaInstalacion", back_populates="reintegros",
    )
    usuario: Mapped["Usuario"] = relationship(
        "Usuario", foreign_keys=[id_usuario],
    )
    operador: Mapped["Usuario"] = relationship(
        "Usuario", foreign_keys=[escaneado_por],
    )

    __table_args__ = (
        UniqueConstraint("id_reserva", "id_usuario", name="uq_reintegro_reserva_usuario"),
        CheckConstraint(
            "forma IN ('pendiente', 'saldo_a_favor', 'efectivo', 'transferencia')",
            name="chk_reintegro_forma",
        ),
        Index("idx_reintegros_reserva", "id_reserva"),
    )

    def __repr__(self) -> str:
        return f"<ReintegroQR reserva={self.id_reserva} user={self.id_usuario} [{self.forma}]>"


class Pago(Base):
    """
    Cabecera de cobro — patrón "Split-Order bajo un único Pago".

    Un Pago agrupa una o más Órdenes bajo un único comprobante/transferencia:
    el socio puede pagar varios conceptos distintos (ej: cuota social +
    alquiler de cancha) en una sola operación, subiendo UN comprobante que
    un admin verifica UNA vez para todas las órdenes asociadas, en vez de
    tener que aprobar cada orden por separado.

    El monto_total de un Pago debe ser igual a la suma de monto_total de
    todas sus Órdenes asociadas — esa invariante se garantiza a nivel
    aplicación (en el router que arma el "carrito"), no con un CHECK de DB,
    porque calcular una suma de filas relacionadas en un CHECK constraint
    no es soportado por PostgreSQL de forma nativa.
    """
    __tablename__ = "pagos"

    id_pago: Mapped[int] = mapped_column(Integer, primary_key=True)
    id_usuario: Mapped[int] = mapped_column(
        ForeignKey("usuarios.id_usuario", ondelete="RESTRICT"), nullable=False,
    )
    monto_total: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    comprobante_url: Mapped[Optional[str]] = mapped_column(Text)
    estado: Mapped[str] = mapped_column(
        String(40), nullable=False, server_default=text("'pendiente'"),
        comment="pendiente | verificado | rechazado",
    )
    fecha_creacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )

    # Relaciones
    usuario: Mapped["Usuario"] = relationship(
        "Usuario",
        foreign_keys=[id_usuario],
        back_populates="pagos",
    )
    ordenes: Mapped[List["Orden"]] = relationship(
        "Orden",
        back_populates="pago",
    )

    __table_args__ = (
        CheckConstraint(
            "estado IN ('pendiente', 'verificado', 'rechazado')",
            name="chk_pago_estado",
        ),
        Index("idx_pagos_usuario", "id_usuario"),
        Index(
            "idx_pagos_estado",
            "estado",
            postgresql_where=text("estado = 'pendiente'"),
        ),
    )

    def __repr__(self) -> str:
        return f"<Pago #{self.id_pago} usuario={self.id_usuario} estado={self.estado}>"


class Orden(Base):
    """
    Cabecera del movimiento contable. Una orden puede contener múltiples ítems.
    La aprobación es atómica: cuotas + reservas + stock se actualizan juntos
    en la función fn_aprobar_orden() del lado de PostgreSQL.

    A partir del patrón Split-Order, cada Orden pertenece obligatoriamente a
    un Pago (id_pago NOT NULL): el comprobante y la verificación viven en el
    Pago, no en la Orden individual. Una orden ya no se aprueba "sola" — se
    aprueba el Pago que la contiene (y con él, todas sus órdenes hermanas).
    """
    __tablename__ = "ordenes"

    id_orden: Mapped[int] = mapped_column(Integer, primary_key=True)
    id_usuario: Mapped[int] = mapped_column(
        ForeignKey("usuarios.id_usuario", ondelete="RESTRICT"), nullable=False,
    )
    id_pago: Mapped[int] = mapped_column(
        ForeignKey("pagos.id_pago", ondelete="RESTRICT"), nullable=False,
        comment="Todo comprobante y verificación vive en el Pago, no acá.",
    )
    fecha_creacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )
    estado: Mapped[str] = mapped_column(
        String(40), nullable=False, server_default=text("'pendiente_verificacion'"),
    )
    monto_total: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    motivo_rechazo: Mapped[Optional[str]] = mapped_column(
        Text,
        comment="Obligatorio cuando estado = 'rechazada'.",
    )
    aprobada_por: Mapped[Optional[int]] = mapped_column(
        ForeignKey("usuarios.id_usuario"),
    )
    aprobada_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    expira_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("NOW() + INTERVAL '48 hours'"),
        comment="Job programado marca como expirada y libera recursos al superar esta fecha.",
    )
    notas_admin: Mapped[Optional[str]] = mapped_column(Text)

    # Relaciones
    usuario: Mapped["Usuario"] = relationship(
        "Usuario",
        foreign_keys=[id_usuario],
        back_populates="ordenes",
    )
    pago: Mapped["Pago"] = relationship(
        "Pago",
        foreign_keys=[id_pago],
        back_populates="ordenes",
    )
    aprobador: Mapped[Optional["Usuario"]] = relationship(
        "Usuario", foreign_keys=[aprobada_por],
    )
    detalles: Mapped[List["DetalleOrden"]] = relationship(
        "DetalleOrden",
        back_populates="orden",
        cascade="all, delete-orphan",
    )
    reservas: Mapped[List["ReservaInstalacion"]] = relationship(
        "ReservaInstalacion",
        foreign_keys="ReservaInstalacion.id_orden",
        back_populates="orden",
    )

    __table_args__ = (
        CheckConstraint(
            "estado IN ('pendiente_verificacion','aprobada','rechazada','cancelada_socio','expirada')",
            name="chk_orden_estado",
        ),
        Index("idx_ordenes_usuario", "id_usuario"),
        Index("idx_ordenes_pago",    "id_pago"),
        Index(
            "idx_ordenes_estado",
            "estado",
            postgresql_where=text("estado = 'pendiente_verificacion'"),
        ),
        Index(
            "idx_ordenes_expira_at",
            "expira_at",
            postgresql_where=text("estado = 'pendiente_verificacion'"),
        ),
    )

    def __repr__(self) -> str:
        return f"<Orden #{self.id_orden} usuario={self.id_usuario} pago={self.id_pago} estado={self.estado}>"


class DetalleOrden(Base):
    """
    Ítems de una orden. El precio histórico se congela al momento de la compra.
    CRÍTICO: al aprobar, usar precio_unitario_historico, NUNCA precio_actual del producto.
    """
    __tablename__ = "detalles_orden"

    id_detalle: Mapped[int] = mapped_column(Integer, primary_key=True)
    id_orden: Mapped[int] = mapped_column(
        ForeignKey("ordenes.id_orden", ondelete="CASCADE"), nullable=False,
    )
    id_producto: Mapped[int] = mapped_column(
        ForeignKey("productos_servicios.id_producto"), nullable=False,
    )
    cantidad: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("1"),
    )
    precio_unitario_historico: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False,
        comment="Precio congelado al momento de la compra.",
    )
    mes_referencia: Mapped[Optional[date]] = mapped_column(
        Date,
        comment="Para cuotas: primer día del mes pagado (ej: 2025-06-01 = Junio 2025).",
    )
    id_reserva: Mapped[Optional[int]] = mapped_column(
        ForeignKey("reservas_instalaciones.id_reserva"),
    )

    # Relaciones
    orden: Mapped["Orden"] = relationship("Orden", back_populates="detalles")
    producto: Mapped["ProductoServicio"] = relationship(
        "ProductoServicio", back_populates="detalles_orden",
    )
    reserva: Mapped[Optional["ReservaInstalacion"]] = relationship(
        "ReservaInstalacion", back_populates="detalles",
    )

    __table_args__ = (
        CheckConstraint("cantidad > 0", name="chk_detalle_cantidad_positiva"),
        Index("idx_detalles_orden_orden",    "id_orden"),
        Index("idx_detalles_orden_producto", "id_producto"),
    )

    def __repr__(self) -> str:
        return f"<DetalleOrden orden={self.id_orden} producto={self.id_producto} x{self.cantidad}>"


# ─────────────────────────────────────────────────────────────────────────────
# MÓDULO 4 · DEPORTIVO & EVENTOS
# ─────────────────────────────────────────────────────────────────────────────

class CategoriaDeportiva(Base):
    """Divisiones del club: Sub-12, Sub-15, Primera División, etc."""
    __tablename__ = "categorias_deportivas"

    id_categoria: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombre: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    descripcion: Mapped[Optional[str]] = mapped_column(Text)
    es_activa: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true"),
    )

    # Cortes de edad para el autocompletado de plantel por fecha_nacimiento.
    # NULL en cualquiera de los dos => la categoría no admite autocompletar
    # (por ejemplo Primera División, sin límite etario).
    fecha_corte_min: Mapped[Optional[date]] = mapped_column(
        Date,
        comment=(
            "Fecha de nacimiento mínima (inclusive) admitida en la categoría. "
            "Se usa junto a fecha_corte_max para el autocompletado masivo del plantel."
        ),
    )
    fecha_corte_max: Mapped[Optional[date]] = mapped_column(
        Date,
        comment=(
            "Fecha de nacimiento máxima (inclusive) admitida en la categoría. "
            "NULL en cualquiera de los dos cortes desactiva el botón Autocompletar "
            "para esta categoría en el frontend."
        ),
    )

    # Relaciones
    usuarios: Mapped[List["UsuarioCategoria"]] = relationship(
        "UsuarioCategoria", back_populates="categoria",
    )
    eventos: Mapped[List["Evento"]] = relationship(
        "Evento", back_populates="categoria",
    )

    __table_args__ = (
        CheckConstraint(
            "fecha_corte_min IS NULL OR fecha_corte_max IS NULL OR fecha_corte_min <= fecha_corte_max",
            name="chk_categoria_cortes_orden",
        ),
    )

    def __repr__(self) -> str:
        return f"<CategoriaDeportiva {self.nombre}>"


class UsuarioCategoria(Base):
    """
    Tabla puente: jugador ↔ categoría deportiva.
    PK compuesta: (id_usuario, id_categoria, temporada) — el mismo jugador puede
    pertenecer a la misma categoría en diferentes temporadas.
    """
    __tablename__ = "usuarios_categorias"

    id_usuario: Mapped[int] = mapped_column(
        ForeignKey("usuarios.id_usuario", ondelete="CASCADE"), primary_key=True,
    )
    id_categoria: Mapped[int] = mapped_column(
        ForeignKey("categorias_deportivas.id_categoria", ondelete="CASCADE"),
        primary_key=True,
    )
    temporada: Mapped[str] = mapped_column(
        String(10), primary_key=True,
        server_default=text("TO_CHAR(CURRENT_DATE, 'YYYY')"),
        comment="Año de la temporada. Ej: '2025'.",
    )
    es_capitan: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false"),
    )

    # Relaciones
    usuario: Mapped["Usuario"] = relationship("Usuario", back_populates="categorias")
    categoria: Mapped["CategoriaDeportiva"] = relationship(
        "CategoriaDeportiva", back_populates="usuarios",
    )

    # La PK compuesta (id_usuario, id_categoria, temporada) ya garantiza
    # unicidad a nivel de índice, pero se declara también la constraint
    # explícita para que coincida 1:1 con la ya aplicada en Postgres
    # (uq_usuario_categoria_temporada) — es la que usa el
    # INSERT ... ON CONFLICT (id_usuario, id_categoria, temporada) DO NOTHING
    # del autocompletado masivo.
    __table_args__ = (
        UniqueConstraint(
            "id_usuario", "id_categoria", "temporada",
            name="uq_usuario_categoria_temporada",
        ),
    )

    def __repr__(self) -> str:
        return f"<UsuarioCategoria user={self.id_usuario} cat={self.id_categoria} temporada={self.temporada}>"


class Evento(Base):
    """
    Partidos, torneos, entrenamientos u otros eventos institucionales.
    El control de puerta se vincula a un evento activo; las asistencias quedan
    registradas con marca de tiempo exacta y método de escaneo.
    """
    __tablename__ = "eventos"

    id_evento: Mapped[int] = mapped_column(Integer, primary_key=True)
    titulo: Mapped[str] = mapped_column(String(200), nullable=False)
    tipo: Mapped[str] = mapped_column(
        String(50), nullable=False,
        comment="partido | torneo | entrenamiento | institucional | otro",
    )
    descripcion: Mapped[Optional[str]] = mapped_column(Text)
    id_categoria: Mapped[Optional[int]] = mapped_column(
        ForeignKey("categorias_deportivas.id_categoria"),
    )
    fecha_inicio: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    fecha_fin: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    ubicacion: Mapped[Optional[str]] = mapped_column(String(200))
    estado: Mapped[str] = mapped_column(
        String(30), nullable=False, server_default=text("'programado'"),
    )
    creado_por: Mapped[Optional[int]] = mapped_column(
        ForeignKey("usuarios.id_usuario"),
    )
    creado_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )

    # Relaciones
    categoria: Mapped[Optional["CategoriaDeportiva"]] = relationship(
        "CategoriaDeportiva", back_populates="eventos",
    )
    creador: Mapped[Optional["Usuario"]] = relationship(
        "Usuario", foreign_keys=[creado_por], back_populates="eventos_creados",
    )
    asistencias: Mapped[List["Asistencia"]] = relationship(
        "Asistencia", back_populates="evento",
    )
    convocatorias: Mapped[List["Convocatoria"]] = relationship(
        "Convocatoria", back_populates="evento", cascade="all, delete-orphan",
    )

    __table_args__ = (
        CheckConstraint(
            "tipo IN ('partido', 'torneo', 'entrenamiento', 'institucional', 'otro')",
            name="chk_evento_tipo",
        ),
        CheckConstraint(
            "estado IN ('programado', 'en_curso', 'finalizado', 'cancelado')",
            name="chk_evento_estado",
        ),
        Index("idx_eventos_fecha",  "fecha_inicio", postgresql_ops={"fecha_inicio": "DESC"}),
        Index(
            "idx_eventos_estado",
            "estado",
            postgresql_where=text("estado IN ('programado', 'en_curso')"),
        ),
    )

    def __repr__(self) -> str:
        return f"<Evento '{self.titulo}' [{self.estado}] {self.fecha_inicio:%Y-%m-%d}>"


class Convocatoria(Base):
    """
    Citación de un jugador a un evento (partido/entrenamiento/torneo),
    armada por el técnico ANTES del evento. Es un concepto separado de
    Asistencia: convocatoria = planificación, asistencia = registro de
    ingreso físico en puerta al momento del evento.

    Un jugador puede estar convocado y no asistir, o asistir sin estar
    convocado (el escáner de puerta no bloquea el ingreso por esto).
    """
    __tablename__ = "convocatorias"

    id_evento: Mapped[int] = mapped_column(
        ForeignKey("eventos.id_evento", ondelete="CASCADE"), primary_key=True
    )
    id_usuario: Mapped[int] = mapped_column(
        ForeignKey("usuarios.id_usuario", ondelete="CASCADE"), primary_key=True
    )
    estado: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=text("'citado'"),
        comment="'citado' | 'confirmado' | 'rechazado' | 'ausente' | 'presente'.",
    )
    citado_por: Mapped[Optional[int]] = mapped_column(
        ForeignKey("usuarios.id_usuario", ondelete="SET NULL"),
        comment="Técnico/admin que arma la convocatoria.",
    )
    citado_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )
    respondido_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        comment="Cuándo el jugador confirmó/rechazó. NULL mientras sigue en 'citado'.",
    )
    notas: Mapped[Optional[str]] = mapped_column(Text)

    # Relaciones
    evento: Mapped["Evento"] = relationship("Evento", back_populates="convocatorias")
    usuario: Mapped["Usuario"] = relationship(
        "Usuario",
        foreign_keys=[id_usuario],
        back_populates="convocatorias",
    )
    citador: Mapped[Optional["Usuario"]] = relationship(
        "Usuario",
        foreign_keys=[citado_por],
        back_populates="convocatorias_citadas",
    )

    __table_args__ = (
        CheckConstraint(
            "estado IN ('citado', 'confirmado', 'rechazado', 'ausente', 'presente')",
            name="chk_convocatoria_estado",
        ),
        Index("idx_convocatorias_evento",  "id_evento"),
        Index("idx_convocatorias_usuario", "id_usuario"),
        Index("idx_convocatorias_estado",  "estado"),
    )

    def __repr__(self) -> str:
        return f"<Convocatoria evento={self.id_evento} user={self.id_usuario} [{self.estado}]>"


class Asistencia(Base):
    """
    Registro inmutable de cada ingreso en puerta, vinculado a un evento.
    El campo estado_financiero_snapshot guarda el estado AL MOMENTO del escaneo,
    independientemente de cambios posteriores.

    Dos FKs a usuarios: id_usuario (quien ingresa) y registrado_por (operador de puerta).
    """
    __tablename__ = "asistencias"

    id_asistencia: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    id_evento: Mapped[int] = mapped_column(
        ForeignKey("eventos.id_evento", ondelete="RESTRICT"), nullable=False,
    )
    id_usuario: Mapped[int] = mapped_column(
        ForeignKey("usuarios.id_usuario", ondelete="RESTRICT"), nullable=False,
    )
    fecha_hora_ingreso: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )
    metodo: Mapped[str] = mapped_column(
        String(10), nullable=False,
        comment="'QR' = escaneo de código. 'DNI' = búsqueda manual por DNI.",
    )
    registrado_por: Mapped[int] = mapped_column(
        ForeignKey("usuarios.id_usuario"), nullable=False,
        comment="DNI del operador que hizo el escaneo.",
    )
    estado_financiero_snapshot: Mapped[str] = mapped_column(
        String(20), nullable=False,
        comment="Snapshot al momento del ingreso: 'al_dia' | 'moroso'.",
    )

    # Relaciones
    evento: Mapped["Evento"] = relationship("Evento", back_populates="asistencias")
    usuario: Mapped["Usuario"] = relationship(
        "Usuario",
        foreign_keys=[id_usuario],
        back_populates="asistencias",
    )
    operador: Mapped["Usuario"] = relationship(
        "Usuario",
        foreign_keys=[registrado_por],
        back_populates="asistencias_registradas",
    )

    __table_args__ = (
        CheckConstraint("metodo IN ('QR', 'DNI')", name="chk_asistencia_metodo"),
        CheckConstraint(
            "estado_financiero_snapshot IN ('al_dia', 'moroso')",
            name="chk_asistencia_snapshot",
        ),
        Index("idx_asistencias_evento",  "id_evento"),
        Index("idx_asistencias_usuario", "id_usuario"),
        Index("idx_asistencias_fecha",   "fecha_hora_ingreso",
              postgresql_ops={"fecha_hora_ingreso": "DESC"}),
    )

    def __repr__(self) -> str:
        return f"<Asistencia evento={self.id_evento} user={self.id_usuario} via={self.metodo}>"


# ─────────────────────────────────────────────────────────────────────────────
# MÓDULO 5 · NOTIFICACIONES
# ─────────────────────────────────────────────────────────────────────────────

TIPOS_NOTIFICACION = (
    "orden_aprobada",
    "orden_rechazada",
    "cuota_vencida",
    "reserva_confirmada",
    "reserva_cancelada",
    "rol_asignado",
    "rol_removido",
    "convocatoria_partido",
    "sistema",
)


class Notificacion(Base):
    """Centro de mensajes internos. El campo referencia_id + referencia_tabla
    permiten al frontend navegar directamente al objeto relacionado."""
    __tablename__ = "notificaciones"

    id_notificacion: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    id_usuario: Mapped[int] = mapped_column(
        ForeignKey("usuarios.id_usuario", ondelete="CASCADE"), nullable=False,
    )
    tipo: Mapped[str] = mapped_column(String(60), nullable=False)
    titulo: Mapped[str] = mapped_column(String(150), nullable=False)
    cuerpo: Mapped[Optional[str]] = mapped_column(Text)
    leida: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false"),
    )
    referencia_id: Mapped[Optional[int]] = mapped_column(Integer)
    referencia_tabla: Mapped[Optional[str]] = mapped_column(
        String(60),
        comment="Nombre de la tabla relacionada: 'ordenes', 'eventos', etc.",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )

    # Relaciones
    usuario: Mapped["Usuario"] = relationship(
        "Usuario", back_populates="notificaciones",
    )

    __table_args__ = (
        CheckConstraint(
            f"tipo IN {TIPOS_NOTIFICACION}",
            name="chk_notificacion_tipo",
        ),
        Index(
            "idx_notificaciones_usuario_no_leidas",
            "id_usuario", "created_at",
            postgresql_where=text("leida = FALSE"),
            postgresql_ops={"created_at": "DESC"},
        ),
    )

    def __repr__(self) -> str:
        return f"<Notificacion [{self.tipo}] user={self.id_usuario} leida={self.leida}>"
    

class ComercioAsociado(Base):
        __tablename__ = 'comercios_asociados'

        id_comercio: Mapped[int] = mapped_column(primary_key=True, index=True)
        nombre_fantasia: Mapped[str] = mapped_column(String(150), nullable=False)
        rubro: Mapped[str | None] = mapped_column(String(100))
        beneficio_ofrecido: Mapped[str] = mapped_column(String(200), nullable=False)
        es_activo: Mapped[bool] = mapped_column(default=True)

        id_usuario_acceso: Mapped[int | None] = mapped_column(ForeignKey('usuarios.id_usuario'))
        usuario_acceso: Mapped["Usuario"] = relationship()