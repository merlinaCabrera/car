"""
Fixtures de PRODUCTOS para la suite de QA (scripts/qa_seguridad.py).

Corre DESPUÉS de scripts/bootstrap_db.py, que ya deja roles, configuración
global, el producto de cuota social y el usuario "sistema".

    DATABASE_URL=postgresql://admin_car:password123@localhost:5432/car_test \
        python -m scripts.bootstrap_db
    DATABASE_URL=... python -m scripts.seed_qa

NO usar contra producción: agrega productos de prueba al catálogo.
"""
from __future__ import annotations

import os
import sys
from decimal import Decimal

DB_URL = os.environ.get("DATABASE_URL")
if not DB_URL:
    sys.exit("DATABASE_URL no definida.")

HOST = DB_URL.split("@")[-1].split("/")[0]
if ("neon.tech" in HOST or "render.com" in HOST) and "--permitir-remoto" not in sys.argv:
    sys.exit(f"ABORTADO: DATABASE_URL apunta a {HOST}. Son productos de prueba.")

os.environ.setdefault("SECRET_KEY", "seed-qa-" + os.urandom(16).hex())

from database import SessionLocal  # noqa: E402
import models  # noqa: E402

# Nombres y stocks que espera qa_seguridad.py — no cambiar sin tocar la suite.
PRODUCTOS = [
    ("Remera Test",   "indumentaria", Decimal("3000.00"), 10),
    ("Buzo Test",     "indumentaria", Decimal("6000.00"), 3),
    ("Cancha 1 Test", "alquiler",     Decimal("8000.00"), None),
]


def main() -> None:
    db = SessionLocal()
    try:
        for nombre, categoria, precio, stock in PRODUCTOS:
            p = db.query(models.ProductoServicio).filter_by(nombre=nombre).first()
            if p:
                p.stock = stock  # resetear al valor esperado por la suite
            else:
                db.add(models.ProductoServicio(
                    nombre=nombre, categoria=categoria,
                    precio_actual=precio, stock=stock, es_activo=True))
        db.commit()
        print("productos de QA:", [
            (p.nombre, p.categoria, str(p.precio_actual), p.stock)
            for p in db.query(models.ProductoServicio).all()])
    finally:
        db.close()


if __name__ == "__main__":
    main()
