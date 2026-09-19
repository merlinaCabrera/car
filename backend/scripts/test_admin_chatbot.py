import os
import sys
from dotenv import load_dotenv

load_dotenv('backend/.env')
sys.path.insert(0, 'backend')

from database import SessionLocal
import models
from utils.recordatorios import socios_morosos
from utils.fechas import hoy_club

def test_admin_metrics():
    db = SessionLocal()
    hoy = hoy_club()
    config = db.query(models.ConfiguracionGlobal).first()
    dia_venc = config.dia_vencimiento_cuota if config else 10

    total_activos = db.query(models.Usuario).filter(models.Usuario.fecha_baja.is_(None)).count()
    total_bajas = db.query(models.Usuario).filter(models.Usuario.fecha_baja.isnot(None)).count()
    morosos = socios_morosos(db, dia_venc, hoy)
    cantidad_morosos = len(morosos)
    socios_al_dia = total_activos - cantidad_morosos

    hace_18 = hoy.replace(year=hoy.year - 18)
    socios_menores = db.query(models.Usuario).filter(
        models.Usuario.fecha_baja.is_(None),
        models.Usuario.fecha_nacimiento.isnot(None),
        models.Usuario.fecha_nacimiento > hace_18,
    ).count()
    socios_mayores = total_activos - socios_menores

    print(f"Total Activos: {total_activos}")
    print(f"Total Bajas: {total_bajas}")
    print(f"Morosos: {cantidad_morosos}")
    print(f"Al Día: {socios_al_dia}")
    print(f"Menores: {socios_menores}")
    print(f"Mayores: {socios_mayores}")
    assert socios_al_dia + cantidad_morosos == total_activos

if __name__ == '__main__':
    test_admin_metrics()
    print("ALL OK")
