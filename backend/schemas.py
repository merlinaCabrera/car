from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import date

# Esquema para crear un usuario (Request)
class UsuarioCreate(BaseModel):
    dni: str
    nombre: str
    apellido: str
    email: EmailStr
    password: str # El password viene en texto plano del front, luego se hashea
    fecha_ingreso: Optional[date] = None

# Esquema para leer un usuario (Response)
class Usuario(BaseModel):
    id_usuario: int
    dni: str
    nombre: str
    apellido: str
    email: EmailStr
    is_directivo: bool

    class Config:
        from_attributes = True # Clave para que Pydantic lea los modelos de SQLAlchemy