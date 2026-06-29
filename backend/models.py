from sqlalchemy import Column, Integer, String, Boolean, Date, ForeignKey, Table
from sqlalchemy.orm import relationship
from database import Base

# Tabla puente para la relación Many-to-Many entre Usuarios y Roles
usuarios_roles = Table(
    'usuarios_roles',
    Base.metadata,
    Column('usuario_id', Integer, ForeignKey('usuarios.id_usuario'), primary_key=True),
    Column('rol_id', Integer, ForeignKey('roles.id_rol'), primary_key=True)
)

class Rol(Base):
    __tablename__ = 'roles'
    id_rol = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, unique=True, index=True)
    peso_jerarquico = Column(Integer)
    # Relación inversa
    usuarios = relationship("Usuario", secondary=usuarios_roles, back_populates="roles")

class Usuario(Base):
    __tablename__ = 'usuarios'
    id_usuario = Column(Integer, primary_key=True, index=True)
    dni = Column(String, unique=True, index=True)
    nombre = Column(String)
    apellido = Column(String)
    email = Column(String)
    password_hash = Column(String)
    fecha_ingreso = Column(Date)
    is_directivo = Column(Boolean, default=False)
    
    # Relación con Roles
    roles = relationship("Rol", secondary=usuarios_roles, back_populates="usuarios")