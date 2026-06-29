from sqlalchemy import Column, Integer, String, Boolean, Date, ForeignKey, Table, Numeric, DateTime, JSON, Text
from sqlalchemy.orm import relationship
from database import Base
import datetime

# Tablas puente (Junction Tables) para relaciones Many-to-Many
usuarios_roles = Table(
    'usuarios_roles', Base.metadata,
    Column('id_usuario', Integer, ForeignKey('usuarios.id_usuario'), primary_key=True),
    Column('id_rol', Integer, ForeignKey('roles.id_rol'), primary_key=True),
    Column('valido_hasta', DateTime, nullable=True),
    Column('asignado_por', Integer, ForeignKey('usuarios.id_usuario')),
    Column('asignado_at', DateTime, default=datetime.datetime.utcnow)
)

usuarios_categorias = Table(
    'usuarios_categorias', Base.metadata,
    Column('id_usuario', Integer, ForeignKey('usuarios.id_usuario'), primary_key=True),
    Column('id_categoria', Integer, ForeignKey('categorias_deportivas.id_categoria'), primary_key=True),
    Column('temporada', String(10), primary_key=True),
    Column('es_capitan', Boolean, default=False)
)

class Rol(Base):
    __tablename__ = 'roles'
    id_rol = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(50), unique=True, index=True)
    descripcion = Column(Text)
    peso_jerarquico = Column(Integer, default=0)
    es_activo = Column(Boolean, default=True)
    usuarios = relationship("Usuario", secondary=usuarios_roles, back_populates="roles")

class Usuario(Base):
    __tablename__ = 'usuarios'
    id_usuario = Column(Integer, primary_key=True, index=True)
    dni = Column(String(10), unique=True, index=True)
    nombre = Column(String(100), nullable=False)
    apellido = Column(String(100), nullable=False)
    email = Column(String(150), unique=True)
    password_hash = Column(String(255), nullable=False)
    fecha_ingreso = Column(Date, default=datetime.date.today)
    qr_token = Column(String(36), unique=True) # UUID
    deuda_historica_meses = Column(Integer, default=0)
    roles = relationship("Rol", secondary=usuarios_roles, back_populates="usuarios")

class Orden(Base):
    __tablename__ = 'ordenes'
    id_orden = Column(Integer, primary_key=True, index=True)
    id_usuario = Column(Integer, ForeignKey('usuarios.id_usuario'))
    estado = Column(String(40), default='pendiente_verificacion')
    monto_total = Column(Numeric(10, 2))
    fecha_creacion = Column(DateTime, default=datetime.datetime.utcnow)
    detalles = relationship("DetalleOrden", back_populates="orden")

class ProductoServicio(Base):
    __tablename__ = 'productos_servicios'
    id_producto = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(150), nullable=False)
    categoria = Column(String(50))
    precio_actual = Column(Numeric(10, 2))
    stock = Column(Integer)

class DetalleOrden(Base):
    __tablename__ = 'detalles_orden'
    id_detalle = Column(Integer, primary_key=True, index=True)
    id_orden = Column(Integer, ForeignKey('ordenes.id_orden'))
    id_producto = Column(Integer, ForeignKey('productos_servicios.id_producto'))
    cantidad = Column(Integer)
    precio_unitario_historico = Column(Numeric(10, 2))
    orden = relationship("Orden", back_populates="detalles")

class Evento(Base):
    __tablename__ = 'eventos'
    id_evento = Column(Integer, primary_key=True, index=True)
    titulo = Column(String(200), nullable=False)
    fecha_inicio = Column(DateTime, nullable=False)
    estado = Column(String(30), default='programado')

class Asistencia(Base):
    __tablename__ = 'asistencias'
    id_asistencia = Column(Integer, primary_key=True, index=True)
    id_evento = Column(Integer, ForeignKey('eventos.id_evento'))
    id_usuario = Column(Integer, ForeignKey('usuarios.id_usuario'))
    metodo = Column(String(10)) # 'QR' o 'DNI'