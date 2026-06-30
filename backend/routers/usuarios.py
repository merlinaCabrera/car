from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

import models
import schemas
from database import SessionLocal
from security import get_password_hash

# Inicializamos el router
router = APIRouter(
    prefix="/usuarios",
    tags=["Usuarios"]
)

# Dependencia para obtener la base de datos en cada petición
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/", response_model=schemas.UsuarioResponse, status_code=status.HTTP_201_CREATED)
def crear_usuario(usuario: schemas.UsuarioCreate, db: Session = Depends(get_db)):
    # 1. Verificamos si el DNI ya existe
    db_usuario = db.query(models.Usuario).filter(models.Usuario.dni == usuario.dni).first()
    if db_usuario:
        raise HTTPException(status_code=400, detail="El DNI ya está registrado en el sistema")

    # 2. Hasheamos la contraseña
    hashed_password = get_password_hash(usuario.password)

    # 3. Convertimos el schema a un diccionario, excluyendo los campos de password plana
    user_data = usuario.model_dump(exclude={"password", "confirm_password"}, exclude_unset=True)

    # 4. Creamos el modelo de SQLAlchemy inyectando el hash
    nuevo_usuario = models.Usuario(**user_data, password_hash=hashed_password)

    # 5. Guardamos en la base de datos
    db.add(nuevo_usuario)
    db.commit()
    db.refresh(nuevo_usuario)

    return nuevo_usuario

@router.get("/", response_model=list[schemas.UsuarioResponse])
def listar_usuarios(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    # Lista los usuarios activos (podemos agregar un filtro por fecha_baja luego)
    usuarios = db.query(models.Usuario).offset(skip).limit(limit).all()
    return usuarios