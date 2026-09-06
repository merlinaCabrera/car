from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

from dotenv import load_dotenv
load_dotenv()

import sys
import os
# Aseguramos que Python lea la carpeta backend correctamente
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# La URL de la base se toma de la env var DATABASE_URL (mismo valor que usa la
# app). alembic.ini NO debe contener credenciales — su sqlalchemy.url queda vacío
# y se completa acá en runtime.
_db_url = os.environ.get("DATABASE_URL")
if _db_url:
    config.set_main_option("sqlalchemy.url", _db_url)

import models
from database import Base

# Si Claude definió su propio Base, lo usamos. Si no, usamos el de database.
target_metadata = getattr(models, 'Base', Base).metadata

def include_object(object, name, type_, reflected, compare_to):
    if type_ == "table" and reflected and compare_to is None:
        return False
    return True

def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection, 
            target_metadata=target_metadata,
            include_object=include_object # <--- ESTO FALTABA ACÁ
        )
        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()