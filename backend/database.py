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
# IMPORTANTE (Neon free tier):
# DATABASE_URL debe ser la conexión POOLED (con "-pooler" en el host), no la
# directa. Neon usa PgBouncer en esa URL, lo que permite muchas más conexiones
# lógicas concurrentes sin agotar el límite real de Postgres. Se consigue
# copiando "Pooled connection" desde el dashboard de Neon → Connection Details.
# Ejemplo de .env:
#   DATABASE_URL=postgresql://user:pass@ep-xxx-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require
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

# ─────────────────────────────────────────────────────────────────────────────
# Pool de SQLAlchemy — pensado para Neon free tier + conexión pooled (PgBouncer).
#
# Con PgBouncer del lado de Neon manejando el grueso del pooling, del lado de
# SQLAlchemy no hace falta un pool grande: alcanza con uno chico que cubra
# picos de requests concurrentes del dashboard de admin (~5-6 en paralelo)
# más algún job del scheduler corriendo al mismo tiempo.
#
# - pool_pre_ping=True: hace un SELECT 1 antes de entregar una conexión del
#   pool. Esencial acá porque Neon con "scale to zero" apaga el compute tras
#   ~5 min de inactividad y cierra conexiones viejas; sin esto, SQLAlchemy te
#   devuelve conexiones muertas y explotan con errores raros a mitad de
#   request, no con un timeout claro.
# - pool_recycle=180: descarta y reabre conexiones con más de 3 min, así
#   nunca se intenta reusar una que Neon ya mató del otro lado.
# - pool_size/max_overflow: 10 + 5 = 15 conexiones lógicas máx. Client-side;
#   como pasan por el pooler de Neon, no pegan 1 a 1 contra Postgres.
# - pool_timeout=15: si en 15s no hay conexión libre, falla rápido con un
#   error claro en vez de colgar 30s (mejor UX: ves el fallo, no un spinner
#   infinito).
# ─────────────────────────────────────────────────────────────────────────────
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=5,
    pool_recycle=180,
    pool_timeout=15,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()