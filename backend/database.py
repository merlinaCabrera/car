# database.py
import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# ─────────────────────────────────────────────────────────────────────────────
# Lee la URL desde os.environ en el MOMENTO en que se llama a get_engine(),
# no cuando se importa el módulo.
#
# Esto es seguro porque load_dotenv() en main.py corre antes de que cualquier
# REQUEST sea procesado — solo necesitamos que la URL esté disponible cuando
# la primera sesión de BD se abra, no cuando el módulo se importa.
#
# DATABASE_URL debe estar en tu .env (desarrollo) o en las variables de entorno
# de Render (producción). Ejemplo de .env:
#   DATABASE_URL=postgresql://neondb_owner:xxx@ep-calm-bread.neon.tech/neondb?sslmode=require
# ─────────────────────────────────────────────────────────────────────────────

def _get_database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError(
            "La variable de entorno DATABASE_URL no está definida. "
            "Verificá tu archivo .env (desarrollo) o las variables de entorno "
            "de Render (producción)."
        )
    # Neon y algunos proveedores usan el prefijo 'postgres://' (sin ql al final).
    # SQLAlchemy 1.4+ requiere 'postgresql://'. Este fix lo corrige automáticamente.
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    return url


SQLALCHEMY_DATABASE_URL = _get_database_url()

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    # pool_pre_ping=True verifica que la conexión siga activa antes de usarla.
    # Esencial para Neon, que cierra conexiones inactivas agresivamente.
    pool_pre_ping=True,
    # pool_size y max_overflow para el plan gratuito de Neon (límite de conexiones).
    pool_size=5,
    max_overflow=2,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()