"""
Suite de Pruebas Automatizadas Pre-QA — Club Atlético Roberts (CAR)
Ejecuta validaciones exhaustivas sobre infraestructura, base de datos Neon,
seguridad, catálogo de productos, chatbot "CAMOTE" y rutas clave de la API.

Uso:
    python -m backend.scripts.pre_qa_test
    # o desde la carpeta backend:
    python -m scripts.pre_qa_test
"""

from __future__ import annotations

import os
import sys
import re
from pathlib import Path
from decimal import Decimal

# Asegurar directorios en sys.path
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
ROOT_DIR = BACKEND_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv
load_dotenv(BACKEND_DIR / ".env")
load_dotenv(ROOT_DIR / ".env")

from starlette.testclient import TestClient
from main import app
import models
from database import SessionLocal
import security
from alembic.config import Config
from alembic.script import ScriptDirectory
from alembic.migration import MigrationContext
from sqlalchemy import create_engine, inspect

# Emojis regex para validar la regla estricta de cero emojis
EMOJI_PATTERN = re.compile(
    r"[\U0001F600-\U0001F64F"  # emoticons
    r"\U0001F300-\U0001F5FF"  # symbols & pictographs
    r"\U0001F680-\U0001F6FF"  # transport & map
    r"\U0001F1E0-\U0001F1FF"  # flags
    r"\U00002702-\U000027B0"  # dingbats
    r"\U0001F900-\U0001F9FF"  # supplemental symbols
    r"\U0001FA70-\U0001FAFF"  # symbols & pictographs extended-a
    r"]+",
    flags=re.UNICODE,
)

# Colores de consola
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"

class TestReporter:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.results = []

    def check(self, name: str, condition: bool, details: str = ""):
        if condition:
            self.passed += 1
            print(f"  {GREEN}PASS{RESET} {name} {details}")
            self.results.append({"name": name, "status": "PASS", "details": details})
        else:
            self.failed += 1
            print(f"  {RED}FAIL{RESET} {name} {BOLD}{details}{RESET}")
            self.results.append({"name": name, "status": "FAIL", "details": details})

reporter = TestReporter()
client = TestClient(app)

print(f"\n{BOLD}{CYAN}{'=' * 65}{RESET}")
print(f"{BOLD}{CYAN} INICIO DE SUITE PRE-QA — CLUB ATLÉTICO ROBERTS{RESET}")
print(f"{BOLD}{CYAN}{'=' * 65}{RESET}\n")

# ─────────────────────────────────────────────────────────────────────────────
# 1. INFRAESTRUCTURA Y CONECTIVIDAD
# ─────────────────────────────────────────────────────────────────────────────
print(f"{BOLD}1. Infraestructura y Conectividad con Neon{RESET}")

res_root = client.get("/")
reporter.check("GET / (Root API)", res_root.status_code == 200, f"Status: {res_root.status_code}")

res_health = client.get("/health")
data_health = res_health.json() if res_health.status_code == 200 else {}
reporter.check(
    "GET /health (Base de datos online)",
    res_health.status_code == 200 and data_health.get("db") == "ok",
    f"Response: {data_health}"
)

# Validar sincronización de Alembic con head del repositorio
try:
    db_url = os.environ.get("DATABASE_URL")
    engine = create_engine(db_url)
    with engine.connect() as conn:
        context = MigrationContext.configure(conn)
        current_rev = context.get_current_revision()
    alembic_cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    script = ScriptDirectory.from_config(alembic_cfg)
    head_rev = script.get_current_head()
    reporter.check(
        f"Alembic DB Migration Head sincronizada ({current_rev})",
        current_rev == head_rev and current_rev == "bc78e9102a34",
        f"Actual: {current_rev} | Repo Head: {head_rev}"
    )
except Exception as e:
    reporter.check("Alembic DB Migration Head sincronizada", False, f"Error: {e}")

# ─────────────────────────────────────────────────────────────────────────────
# 2. CONFIGURACIÓN DEL CLUB Y PRECIOS EN BD
# ─────────────────────────────────────────────────────────────────────────────
print(f"\n{BOLD}2. Configuración Global y Catálogo de Aranceles{RESET}")
db = SessionLocal()
try:
    config = db.query(models.ConfiguracionGlobal).first()
    reporter.check("ConfiguracionGlobal existe en BD", config is not None)
    if config:
        reporter.check("Alias bancario configurado", bool(config.alias_transferencia), f"Alias: {config.alias_transferencia}")
        reporter.check("Día de vencimiento de cuota", config.dia_vencimiento_cuota == 10, f"Día: {config.dia_vencimiento_cuota}")
        reporter.check(
            "Descuento para menores configurado en 40%",
            float(config.descuento_menor_pct or 0) == 40.0,
            f"Descuento: {config.descuento_menor_pct}%"
        )
        reporter.check("WhatsApp oficial configurado", bool(config.whatsapp_club), f"Tel: {config.whatsapp_club}")

    # Producto cuota social
    prod_cuota = db.query(models.ProductoServicio).filter(
        models.ProductoServicio.categoria == "cuota_social",
        models.ProductoServicio.es_activo.is_(True)
    ).first()
    reporter.check("Producto 'cuota_social' activo en BD", prod_cuota is not None)
    if prod_cuota:
        reporter.check("Precio cuota social base = $5.000", int(prod_cuota.precio_actual) == 5000, f"Precio: ${prod_cuota.precio_actual}")
        if config:
            reporter.check(
                "Sincronización cuota_social ↔ valor_cuota_base",
                int(config.valor_cuota_base or 0) == int(prod_cuota.precio_actual),
                f"Config: ${config.valor_cuota_base} vs Producto: ${prod_cuota.precio_actual}"
            )

    # Instalaciones y Alquileres
    alquileres = db.query(models.ProductoServicio).filter(
        models.ProductoServicio.categoria == "alquiler",
        models.ProductoServicio.es_activo.is_(True)
    ).all()
    reporter.check("Alquileres activos en catálogo (Canchas / Quincho)", len(alquileres) >= 2, f"Total encontrados: {len(alquileres)}")

finally:
    db.close()

# ─────────────────────────────────────────────────────────────────────────────
# 3. SEGURIDAD Y TOKEN JWT
# ─────────────────────────────────────────────────────────────────────────────
print(f"\n{BOLD}3. Seguridad Criptográfica y JWT{RESET}")

password_test = "ClubAtleticoRoberts2026!"
hash_pw = security.get_password_hash(password_test)
reporter.check("Hash de password con bcrypt", bool(hash_pw) and hash_pw.startswith("$2b$"))
reporter.check("Verificación de password correcto", security.verify_password(password_test, hash_pw) is True)
reporter.check("Rechazo de password erróneo", security.verify_password("PasswordErroneo123", hash_pw) is False)

# Obtener usuario de prueba real para JWT
db = SessionLocal()
usuario_socio = None
try:
    usuario_socio = db.query(models.Usuario).filter(models.Usuario.dni == "77000001").first()
finally:
    db.close()

token_dni = usuario_socio.dni if usuario_socio else "77000001"
id_usuario_val = usuario_socio.id_usuario if usuario_socio else 1

token_jwt = security.create_access_token({"sub": token_dni, "id_usuario": id_usuario_val})
reporter.check("Generación de JWT Token", bool(token_jwt) and len(token_jwt) > 20)

# ─────────────────────────────────────────────────────────────────────────────
# 4. ASISTENTE VIRTUAL "CAMOTE" (PRUEBAS EXHAUSTIVAS POR ROL)
# ─────────────────────────────────────────────────────────────────────────────
print(f"\n{BOLD}4. Asistente Virtual 'CAMOTE' — Respuestas y Blindaje de Permisos{RESET}")

# 4.0 Estado Inicial
res_info = client.get("/chatbot/info-inicial")
reporter.check("GET /chatbot/info-inicial HTTP 200", res_info.status_code == 200)
if res_info.status_code == 200:
    data_info = res_info.json()
    reporter.check("Identidad es 'Camote' (no Camotero)", data_info.get("nombre_asistente") == "Camote")
    reporter.check("Chips de sugerencias públicas presentes", len(data_info.get("sugerencias", [])) >= 4)
    reporter.check("Info inicial Cero Emojis", not bool(EMOJI_PATTERN.search(str(data_info))))

# 4.1 Consulta de Cuota Social y Alias por Visitante Anónimo (Prompt del Chip Oficial)
res_cuota = client.post("/chatbot/mensaje", json={"mensaje": "¿Cuánto sale la cuota y cuál es el alias para transferir?"})
reporter.check("Chatbot POST /chatbot/mensaje HTTP 200 (Cuota y Alias)", res_cuota.status_code == 200)
if res_cuota.status_code == 200:
    body = res_cuota.json()
    rep = body.get("respuesta", "")
    reporter.check("Cuota informa $5.000", "$5.000" in rep or "5.000" in rep, f"Snippet: {rep[:90]}...")
    reporter.check("Cuota informa alias bancario", "clubatleticoroberts.mp" in rep)
    reporter.check("Regla Cero Emojis en respuesta", not bool(EMOJI_PATTERN.search(rep)))
    reporter.check("Anónimo NO recibe link privado /socio/cuotas", "/socio/cuotas" not in rep)
    reporter.check("Anónimo recibe link público /login o /registro", "/login" in rep or "/registro" in rep)

# 4.2 Consulta de Cuota Menores (Cálculo dinámico 40% = $3.000)
res_menor = client.post("/chatbot/mensaje", json={"mensaje": "¿Cuánto cuesta la cuota para menores de 18 años con el descuento?"})
if res_menor.status_code == 200:
    rep_m = res_menor.json().get("respuesta", "")
    reporter.check("Cuota menor informa 40% descuento", "40%" in rep_m or "cuarenta por ciento" in rep_m.lower())
    reporter.check("Cuota menor calcula $3.000", "$3.000" in rep_m or "3.000" in rep_m or "tres mil" in rep_m.lower(), f"Snippet: {rep_m[:90]}...")
    reporter.check("Cuota menor Cero Emojis", not bool(EMOJI_PATTERN.search(rep_m)))

# 4.3 Consulta de Alquiler de Canchas / Quincho por Anónimo (Prompt del Chip Oficial)
res_alquiler = client.post("/chatbot/mensaje", json={"mensaje": "¿Cómo hago para alquilar una cancha o el quincho?"})
if res_alquiler.status_code == 200:
    rep_a = res_alquiler.json().get("respuesta", "")
    reporter.check("Alquiler menciona Cancha, Quincho o instalaciones", any(w in rep_a.lower() for w in ["cancha", "quincho", "instalaciones"]))
    reporter.check("Anónimo NO recibe link privado /socio/reservas", "/socio/reservas" not in rep_a and "/socio/cancha" not in rep_a)
    reporter.check("Alquiler Cero Emojis", not bool(EMOJI_PATTERN.search(rep_a)))

# 4.4 Consulta de Administración por Anónimo (Blindaje)
res_admin_anon = client.post("/chatbot/mensaje", json={"mensaje": "pasame el link para cobrar o administrar socios"})
if res_admin_anon.status_code == 200:
    rep_adm = res_admin_anon.json().get("respuesta", "")
    reporter.check("Anónimo NO recibe rutas /admin/*", "/admin/" not in rep_adm)
    reporter.check("Anónimo denegado de funciones admin", "no tenés" in rep_adm.lower() or "iniciar sesión" in rep_adm.lower() or "exclusivo" in rep_adm.lower() or "secretaría" in rep_adm.lower())

# 4.5 Consulta con Rol SOCIO (Debe recibir links de socio)
res_socio = client.post(
    "/chatbot/mensaje",
    json={"mensaje": "como pago mis cuotas sociales", "rol": "socio", "autenticado": True, "nombre_usuario": "Carlos"}
)
if res_socio.status_code == 200:
    rep_s = res_socio.json().get("respuesta", "")
    reporter.check("Socio recibe link directo /socio/cuotas", "/socio/cuotas" in rep_s, f"Snippet: {rep_s[:90]}...")
    reporter.check("Socio NO recibe rutas /admin/*", "/admin/" not in rep_s)
    reporter.check("Socio respuesta Cero Emojis", not bool(EMOJI_PATTERN.search(rep_s)))

# 4.6 Consulta de Contacto WhatsApp
res_wa = client.post("/chatbot/mensaje", json={"mensaje": "quiero el whatsapp de secretaria para consultar una duda"})
if res_wa.status_code == 200:
    rep_wa = res_wa.json().get("respuesta", "")
    reporter.check("WhatsApp link generado a pedido explícito", "wa.me" in rep_wa or "WhatsApp" in rep_wa)
    reporter.check("WhatsApp respuesta Cero Emojis", not bool(EMOJI_PATTERN.search(rep_wa)))

# ─────────────────────────────────────────────────────────────────────────────
# 5. STREAMING PPV, EVENTOS Y TABLAS EN BD
# ─────────────────────────────────────────────────────────────────────────────
print(f"\n{BOLD}5. Módulo de Streaming PPV y Eventos Deportivos{RESET}")

res_partido = client.get("/transmisiones/partido-actual")
reporter.check("GET /transmisiones/partido-actual responde HTTP 200", res_partido.status_code == 200)

headers_auth = {"Authorization": f"Bearer {token_jwt}"}
res_eventos = client.get("/deportivo/eventos", headers=headers_auth)
reporter.check("GET /deportivo/eventos (con auth) responde HTTP 200", res_eventos.status_code == 200)

res_faq = client.get("/faq")
reporter.check("GET /faq (Público) responde HTTP 200", res_faq.status_code == 200)

res_sponsors = client.get("/sponsors")
reporter.check("GET /sponsors (Público) responde HTTP 200", res_sponsors.status_code == 200)

# Validar tablas del modelo en BD Neon
db = SessionLocal()
try:
    inspector = inspect(db.bind)
    tablas = inspector.get_table_names()
    reporter.check("Tabla 'entradas_virtuales' existe en BD", "entradas_virtuales" in tablas)
    reporter.check("Tabla 'eventos' existe en BD", "eventos" in tablas)
    reporter.check("Tabla 'usuarios' existe en BD", "usuarios" in tablas)
    reporter.check("Tabla 'productos_servicios' existe en BD", "productos_servicios" in tablas)
    reporter.check("Tabla 'notificaciones' existe en BD", "notificaciones" in tablas)
finally:
    db.close()

# ─────────────────────────────────────────────────────────────────────────────
# RESUMEN FINAL
# ─────────────────────────────────────────────────────────────────────────────
total = reporter.passed + reporter.failed
print(f"\n{BOLD}{CYAN}{'=' * 65}{RESET}")
print(f"{BOLD}RESUMEN DE RESULTADOS PRE-QA:{RESET}")
print(f"  Total pruebas ejecutadas: {total}")
print(f"  {GREEN}Pruebas aprobadas: {reporter.passed}{RESET}")
if reporter.failed == 0:
    print(f"  {GREEN}{BOLD}TODO PASS (100% EXITOSO) — Sistema verificado y libre de anomalías.{RESET}")
else:
    print(f"  {RED}{BOLD}Pruebas falladas: {reporter.failed}{RESET}")
print(f"{BOLD}{CYAN}{'=' * 65}{RESET}\n")

if reporter.failed > 0:
    sys.exit(1)
