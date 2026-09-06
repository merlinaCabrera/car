"""Seed mínimo de una base de QA: roles, config global, productos y usuario sistema.

NO usar contra producción. Ver scripts/qa_seguridad.py para el flujo completo.
    QA_DB=postgresql://admin_car:password123@localhost:5432/car_test python -m scripts.seed_qa
"""
import os, sys
from decimal import Decimal

os.environ.setdefault("SECRET_KEY", "0123456789abcdef0123456789abcdef")
os.environ["DATABASE_URL"] = os.environ.get("QA_DB", "postgresql://admin_car:password123@localhost:5432/car_test")

from database import SessionLocal
import models
from security import get_password_hash

ROLES = [
    ("admin_general", 100, True),
    ("personal_administrativo", 80, True),
    ("personal_tecnico", 60, True),
    ("admin_temporal", 40, True),
    ("jugador", 20, True),
    ("socio", 10, True),
    ("invitado", 1, True),
    ("portero_cancha", 30, False),  # desactivado (migración f1a2b3c4d5e6)
]

db = SessionLocal()
try:
    # ── Roles ──
    for nombre, peso, activo in ROLES:
        if not db.query(models.Rol).filter_by(nombre=nombre).first():
            db.add(models.Rol(nombre=nombre, peso_jerarquico=peso, es_activo=activo))
    db.flush()

    # ── Config global ──
    if not db.query(models.ConfiguracionGlobal).first():
        db.add(models.ConfiguracionGlobal(
            valor_cuota_base=Decimal("5000.00"),
            dia_vencimiento_cuota=10,
            meses_antiguedad_beneficio=6,
            descuento_beneficio=Decimal("15"),
            descuento_menor_pct=Decimal("40"),
        ))

    # ── Productos ──
    prods = [
        ("Cuota Social Base", "cuota_social", Decimal("5000.00"), None),
        ("Remera Test", "indumentaria", Decimal("3000.00"), 10),
        ("Buzo Test", "indumentaria", Decimal("6000.00"), 3),
        ("Cancha 1 Test", "alquiler", Decimal("8000.00"), None),
    ]
    for nombre, cat, precio, stock in prods:
        if not db.query(models.ProductoServicio).filter_by(nombre=nombre).first():
            db.add(models.ProductoServicio(nombre=nombre, categoria=cat,
                                           precio_actual=precio, stock=stock, es_activo=True))

    # ── Usuario sistema (id_usuario=1, para aprobaciones automáticas de MP) ──
    if not db.query(models.Usuario).filter_by(dni="99999999").first():
        db.add(models.Usuario(
            dni="99999999", nombre="Sistema", apellido="MercadoPago",
            password_hash=get_password_hash("no-login-" + os.urandom(8).hex()),
            requiere_cambio_password=False,
        ))

    db.commit()

    print("roles:", db.query(models.Rol).count())
    print("config:", db.query(models.ConfiguracionGlobal).count())
    print("productos:", [(p.id_producto, p.nombre, p.categoria, str(p.precio_actual), p.stock)
                         for p in db.query(models.ProductoServicio).all()])
    sis = db.query(models.Usuario).filter_by(dni="99999999").first()
    print("usuario sistema id_usuario =", sis.id_usuario)
finally:
    db.close()
