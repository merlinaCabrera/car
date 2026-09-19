import os
import sys
from dotenv import load_dotenv

load_dotenv('backend/.env')
sys.path.insert(0, 'backend')

from fastapi.testclient import TestClient
from main import app
from database import SessionLocal
import models
from security import create_access_token

client = TestClient(app)

def run_tests():
    db = SessionLocal()
    
    # 1. Obtener admin general (42542525)
    admin_user = db.query(models.Usuario).filter(models.Usuario.dni == "42542525").first()
    assert admin_user is not None, "Admin 42542525 no encontrado"
    token_admin = create_access_token({"sub": admin_user.dni, "rol": "admin_general"})
    headers_admin = {"Authorization": f"Bearer {token_admin}"}

    # 2. Obtener socio puro (77000001)
    socio_user = db.query(models.Usuario).filter(models.Usuario.dni == "77000001").first()
    assert socio_user is not None, "Socio 77000001 no encontrado"
    token_socio = create_access_token({"sub": socio_user.dni, "rol": "socio"})
    headers_socio = {"Authorization": f"Bearer {token_socio}"}

    print("=== TEST 1: Info Inicial para Admin ===")
    r_info_admin = client.get("/chatbot/info-inicial", headers=headers_admin)
    assert r_info_admin.status_code == 200
    data_info_admin = r_info_admin.json()
    print("Saludo admin:", data_info_admin["saludo_inicial"])
    print("Sugerencias admin:", data_info_admin["sugerencias"])
    assert data_info_admin["sugerencias"] == [], "Las sugerencias de admin DEBEN estar vacías"
    assert "gestión" in data_info_admin["saludo_inicial"].lower() or "base de datos" in data_info_admin["saludo_inicial"].lower()
    print("PASS TEST 1\n")

    print("=== TEST 2: Info Inicial para Socio ===")
    r_info_socio = client.get("/chatbot/info-inicial", headers=headers_socio)
    assert r_info_socio.status_code == 200
    data_info_socio = r_info_socio.json()
    print("Sugerencias socio count:", len(data_info_socio["sugerencias"]))
    assert len(data_info_socio["sugerencias"]) > 0, "El socio sí debe recibir sugerencias"
    print("PASS TEST 2\n")

    print("=== TEST 3: Admin pregunta morosos ===")
    r_morosos = client.post("/chatbot/mensaje", json={"mensaje": "hola! cuantos socios morosos hay hoy?"}, headers=headers_admin)
    assert r_morosos.status_code == 200
    data_morosos = r_morosos.json()
    print("Respuesta:", data_morosos["respuesta"])
    print("Sugerencias:", data_morosos["sugerencias"])
    assert "109" in data_morosos["respuesta"], "Debe decir 109 socios morosos"
    assert data_morosos["sugerencias"] is None, "Sugerencias debe ser None para admin"
    print("PASS TEST 3\n")

    print("=== TEST 4: Admin pregunta 'y cuantos al dia' ===")
    r_aldia = client.post("/chatbot/mensaje", json={"mensaje": "y cuantos al dia'"}, headers=headers_admin)
    assert r_aldia.status_code == 200
    data_aldia = r_aldia.json()
    print("Respuesta:", data_aldia["respuesta"])
    print("Sugerencias:", data_aldia["sugerencias"])
    assert "44" in data_aldia["respuesta"], "Debe responder 44 socios al día"
    assert data_aldia["sugerencias"] is None, "Sugerencias debe ser None para admin"
    print("PASS TEST 4\n")

    print("=== TEST 5: Admin busca socio por DNI ===")
    r_dni = client.post("/chatbot/mensaje", json={"mensaje": "info del socio 77000001"}, headers=headers_admin)
    assert r_dni.status_code == 200
    data_dni = r_dni.json()
    print("Respuesta:", data_dni["respuesta"])
    assert "Mauro" in data_dni["respuesta"], "Debe encontrar a Mauro Cabrera"
    assert data_dni["sugerencias"] is None
    print("PASS TEST 5\n")

    print("=== TEST 6: Admin pide menu ===")
    r_menu = client.post("/chatbot/mensaje", json={"mensaje": "menu"}, headers=headers_admin)
    assert r_menu.status_code == 200
    data_menu = r_menu.json()
    print("Respuesta menú admin:", data_menu["respuesta"])
    assert data_menu["sugerencias"] is None, "Menú de admin NO debe tener chips automáticos"
    print("PASS TEST 6\n")

    print("=== TEST 7: Consulta libre SQL con Gemini ===")
    r_sql = client.post(
        "/chatbot/mensaje",
        json={"mensaje": "¿Cuál es la cuota social base y qué alias tiene el club?"},
        headers=headers_admin,
    )
    assert r_sql.status_code == 200
    data_sql = r_sql.json()
    print("Respuesta Gemini/SQL:", data_sql["respuesta"])
    print("Origen:", data_sql.get("origen"))
    assert data_sql["sugerencias"] is None
    print("PASS TEST 7\n")

    print("ALL TESTS PASSED SUCCESSFULLY! 100%")

if __name__ == "__main__":
    run_tests()
