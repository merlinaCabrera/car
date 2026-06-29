from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# La URL de conexión a tu contenedor Docker de PostgreSQL
# admin_car:usuario, password123:contraseña, club_roberts_db:nombre_base
SQLALCHEMY_DATABASE_URL = "postgresql://admin_car:password123@localhost:5432/club_roberts_db"

# Motor de conexión
engine = create_engine(SQLALCHEMY_DATABASE_URL)

# Sesión para interactuar con la DB
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Clase base para tus modelos
Base = declarative_base()

# Función para obtener la sesión en cada request (útil para FastAPI)
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()