"""
Arma una base de CERO: schema desde models.py + stamp de Alembic + seed mínimo.

POR QUÉ EXISTE (no usar `alembic upgrade head` en una base vacía):
    La cadena de migraciones NO es replayable desde `base`. La revisión
    90885e41b585_sincronizar_base_neon es una migración de SINCRONIZACIÓN
    autogenerada comparando models.py contra el estado que Neon tenía en ese
    momento — asume un schema de partida que las migraciones anteriores no
    producen. Sobre una base vacía falla con:
        DuplicateTable: relation "comercios_asociados" already exists
    Las migraciones siguen siendo válidas HACIA ADELANTE desde la base de
    producción (que ya está por delante de esa revisión); lo que no funciona es
    reconstruir la historia desde cero.

    Este script evita el problema: crea el schema directo desde models.py (la
    fuente de verdad) y hace `stamp` de Alembic en head, para que las
    migraciones futuras se apliquen normalmente.

USO
    # base nueva y vacía
    DATABASE_URL=postgresql://admin_car:password123@localhost:5432/car_dev \
        python -m scripts.bootstrap_db

    # volver a arrancar de cero (BORRA TODO el schema public)
    DATABASE_URL=... python -m scripts.bootstrap_db --reset

SEGURIDAD
    Se niega a correr contra un host de Neon salvo que pases --permitir-remoto.
    No usar contra producción.
"""
from __future__ import annotations

import os
import sys
from decimal import Decimal

from sqlalchemy import create_engine, inspect, text

# ── Guardas ──────────────────────────────────────────────────────────────────
DB_URL = os.environ.get("DATABASE_URL")
if not DB_URL:
    sys.exit("DATABASE_URL no definida.")

HOST = DB_URL.split("@")[-1].split("/")[0]
if ("neon.tech" in HOST or "render.com" in HOST) and "--permitir-remoto" not in sys.argv:
    sys.exit(
        f"ABORTADO: DATABASE_URL apunta a un host remoto ({HOST}).\n"
        "Este script arma una base desde cero — no es para producción.\n"
        "Si de verdad querés hacerlo, agregá --permitir-remoto."
    )

os.environ.setdefault("SECRET_KEY", "bootstrap-" + os.urandom(16).hex())

import models  # noqa: E402  (después de setear el env)
from database import SessionLocal  # noqa: E402
from security import get_password_hash  # noqa: E402

ALEMBIC_HEAD = "f2a3b4c5d6e7"  # actualizar al agregar migraciones

ROLES = [
    ("admin_general", 100, True),
    ("personal_administrativo", 80, True),
    ("personal_tecnico", 60, True),
    ("admin_temporal", 40, True),
    ("jugador", 20, True),
    ("socio", 10, True),
    ("invitado", 1, True),
    ("portero_cancha", 30, False),  # desactivado — migración f1a2b3c4d5e6
]


def main() -> None:
    eng = create_engine(DB_URL)
    print(f"→ base: {HOST}")

    if "--reset" in sys.argv:
        print("→ --reset: DROP SCHEMA public CASCADE")
        with eng.begin() as c:
            c.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))
    elif inspect(eng).get_table_names():
        print("→ la base ya tiene tablas; create_all solo agrega las que falten")

    models.Base.metadata.create_all(eng)
    print(f"→ schema creado desde models.py ({len(inspect(eng).get_table_names())} tablas)")

    with eng.begin() as c:
        c.execute(text("CREATE TABLE IF NOT EXISTS alembic_version "
                       "(version_num varchar(32) NOT NULL PRIMARY KEY)"))
        c.execute(text("DELETE FROM alembic_version"))
        c.execute(text("INSERT INTO alembic_version (version_num) VALUES (:v)"),
                  {"v": ALEMBIC_HEAD})
    print(f"→ alembic stamped en {ALEMBIC_HEAD}")

    db = SessionLocal()
    try:
        for nombre, peso, activo in ROLES:
            if not db.query(models.Rol).filter_by(nombre=nombre).first():
                db.add(models.Rol(nombre=nombre, peso_jerarquico=peso, es_activo=activo))
        db.flush()

        if not db.query(models.ConfiguracionGlobal).first():
            db.add(models.ConfiguracionGlobal(
                valor_cuota_base=Decimal("5000.00"),
                dia_vencimiento_cuota=10,
                meses_antiguedad_beneficio=6,
                descuento_beneficio=Decimal("15"),
                descuento_menor_pct=Decimal("40"),
            ))

        if not db.query(models.ProductoServicio).filter_by(categoria="cuota_social").first():
            db.add(models.ProductoServicio(
                nombre="Cuota Social Base", categoria="cuota_social",
                precio_actual=Decimal("5000.00"), stock=None, es_activo=True))

        # Usuario técnico "sistema" — aprobador de los pagos automáticos de MP.
        # Se crea primero para que quede con id_usuario=1 (SISTEMA_USER_ID).
        if not db.query(models.Usuario).filter_by(dni="99999999").first():
            db.add(models.Usuario(
                dni="99999999", nombre="Sistema", apellido="MercadoPago",
                password_hash=get_password_hash("sin-login-" + os.urandom(12).hex()),
                requiere_cambio_password=False))

        db.commit()

        sistema = db.query(models.Usuario).filter_by(dni="99999999").first()
        print(f"→ seed: {db.query(models.Rol).count()} roles, "
              f"config global, producto cuota_social, "
              f"usuario sistema id={sistema.id_usuario}")
        if sistema.id_usuario != 1:
            print(f"  ⚠ SISTEMA_USER_ID debería ser {sistema.id_usuario}, no 1")
    finally:
        db.close()

    print("\nListo. Falta crear el primer admin_general a mano "
          "(insertar en usuarios + usuarios_roles: el endpoint de roles "
          "protege admin_general a propósito).")


if __name__ == "__main__":
    main()
