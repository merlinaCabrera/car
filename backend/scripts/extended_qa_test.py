"""
Suite de Pruebas Automatizadas QA Extendido — Club Atlético Roberts (CAR)
Ejecuta una auditoría integral previa a la corrida manual de docs/qa-manual-2026-09-16.md:
  1. Bloqueos previos y catálogo (Alembic Head, Cancha 1, Cancha 2, Quinchos, Config Global).
  2. Matriz de Roles y Permisos (admin_general, personal_administrativo, socio, admin_temporal).
  3. Formateo de plantillas de cuotas, mora y normalización de teléfonos para WhatsApp.
  4. Escáner de accesos, validación de DNI (al día, menor, moroso) y caché offline.
  5. Agenda de reservas e instalaciones.
  6. Streaming Pay-Per-View, búsqueda de usuarios y fixture.
  7. Asistente Virtual 'Camotito' (Cero emojis, permisos por rol, menú, tour guiado).
"""

from __future__ import annotations

import os
import sys
import re
from pathlib import Path
from decimal import Decimal
from datetime import date, datetime, timezone, timedelta

# Configurar path del backend
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
from sqlalchemy import create_engine

# Emojis regex
EMOJI_PATTERN = re.compile(
    r"[\U0001F600-\U0001F64F"
    r"\U0001F300-\U0001F5FF"
    r"\U0001F680-\U0001F6FF"
    r"\U0001F1E0-\U0001F1FF"
    r"\U00002702-\U000027B0"
    r"\U0001F900-\U0001F9FF"
    r"\U0001FA70-\U0001FAFF"
    r"]+",
    flags=re.UNICODE,
)

# Colores de consola
GREEN = "\033[92m"
RED = "\033[91m"
CYAN = "\033[96m"
YELLOW = "\033[93m"
BOLD = "\033[1m"
RESET = "\033[0m"


class ExtendedQAReporter:
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


reporter = ExtendedQAReporter()
client = TestClient(app)

print(f"\n{BOLD}{CYAN}{'=' * 70}{RESET}")
print(f"{BOLD}{CYAN} SUITE QA EXTENDIDO AUTOMATIZADO — CLUB ATLÉTICO ROBERTS{RESET}")
print(f"{BOLD}{CYAN}{'=' * 70}{RESET}\n")

# ─────────────────────────────────────────────────────────────────────────────
# MÓDULO 1: ESTADO BASE, MIGRACIONES Y DESBLOQUEO DE CATÁLOGO
# ─────────────────────────────────────────────────────────────────────────────
print(f"{BOLD}1. Bloqueos Previos, Infraestructura y Catálogo de Instalaciones{RESET}")

# 1.1 Root y Health
r_root = client.get("/")
reporter.check("Root API responde 200", r_root.status_code == 200, f"HTTP {r_root.status_code}")

r_health = client.get("/health")
data_health = r_health.json() if r_health.status_code == 200 else {}
reporter.check("Healthcheck online con DB", r_health.status_code == 200 and data_health.get("db") == "ok")

# 1.2 Alembic Head sincronizada
db = SessionLocal()
try:
    engine = db.get_bind()
    conn = engine.connect()
    ctx = MigrationContext.configure(conn)
    current_rev = ctx.get_current_revision()
    conn.close()

    alembic_cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    alembic_cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    script_dir = ScriptDirectory.from_config(alembic_cfg)
    head_rev = script_dir.get_current_head()

    reporter.check(
        f"Alembic Head sincronizada con Neon ({head_rev})",
        current_rev == head_rev,
        f"Actual: {current_rev} | Repo: {head_rev}"
    )

    # 1.3 Configuración Global
    cfg = db.query(models.ConfiguracionGlobal).first()
    reporter.check("ConfiguracionGlobal existe en BD", cfg is not None)
    reporter.check("Alias bancario configurado", cfg.alias_transferencia == "clubatleticoroberts.mp", f"Alias: {cfg.alias_transferencia}")
    reporter.check("Día de vencimiento es el 10", cfg.dia_vencimiento_cuota == 10, f"Día: {cfg.dia_vencimiento_cuota}")
    reporter.check("Descuento para menores es 40%", Decimal(str(cfg.descuento_menor_pct)) == Decimal("40.00"), f"Pct: {cfg.descuento_menor_pct}%")
    reporter.check("WhatsApp oficial del club configurado", bool(cfg.whatsapp_club), f"Tel: {cfg.whatsapp_club}")

    # 1.4 Catálogo de Cuota Social Base
    p_cuota = db.query(models.ProductoServicio).filter(
        models.ProductoServicio.categoria == "cuota_social",
        models.ProductoServicio.es_activo.is_(True)
    ).first()
    reporter.check("Cuota Social Base activa y en $5.000", p_cuota is not None and p_cuota.precio_actual == Decimal("5000.00"), f"${p_cuota.precio_actual if p_cuota else 0}")

    # 1.5 Catálogo de Instalaciones (Bloqueo #3: Cancha 1, Cancha 2, Quinchos)
    alquileres = db.query(models.ProductoServicio).filter(
        models.ProductoServicio.categoria == "alquiler",
        models.ProductoServicio.es_activo.is_(True)
    ).all()
    nombres_alquiler = [a.nombre for a in alquileres]
    reporter.check("Instalación 'Cancha 1' activa", "Cancha 1" in nombres_alquiler)
    reporter.check("Instalación 'Cancha 2' activa (Desbloqueo §5)", "Cancha 2" in nombres_alquiler)
    reporter.check("Instalación 'Quincho - Turno Dia' activa", any("Quincho" in n and ("Día" in n or "Dia" in n) for n in nombres_alquiler))
    reporter.check("Instalación 'Quincho - Turno Noche' activa", any("Quincho" in n and "Noche" in n for n in nombres_alquiler))
    reporter.check("Total de alquileres activos >= 4", len(alquileres) >= 4, f"Encontrados: {len(alquileres)}")

finally:
    db.close()


# ─────────────────────────────────────────────────────────────────────────────
# MÓDULO 2: MATRIZ COMPLETA DE ROLES Y PERMISOS (RBAC)
# ─────────────────────────────────────────────────────────────────────────────
print(f"\n{BOLD}2. Matriz Completa de Roles y Blindaje de Permisos (RBAC){RESET}")

def login_obtener_token(dni: str, password: str) -> tuple[int, str, dict]:
    res = client.post("/auth/login", json={"dni": dni, "password": password})
    if res.status_code == 200:
        data = res.json()
        return 200, data.get("access_token", ""), data.get("user", {})
    return res.status_code, "", {}

# 2.1 Admin General (Merlina - 42542525)
s_admin, token_admin, user_admin = login_obtener_token("42542525", "wewewewe")
reporter.check("Login exitoso Admin General (42542525)", s_admin == 200 and bool(token_admin))

h_admin = {"Authorization": f"Bearer {token_admin}"}
r_dash = client.get("/admin/dashboard/resumen", headers=h_admin)
reporter.check("Admin General accede a /admin/dashboard/resumen", r_dash.status_code == 200, f"HTTP {r_dash.status_code}")

r_stats = client.get("/admin/dashboard/estadisticas", headers=h_admin)
reporter.check("Admin General accede a /admin/dashboard/estadisticas", r_stats.status_code == 200, f"HTTP {r_stats.status_code}")

r_pagos_stats = client.get("/admin/pagos/estadisticas", headers=h_admin)
reporter.check("Admin General accede a /admin/pagos/estadisticas", r_pagos_stats.status_code == 200, f"HTTP {r_pagos_stats.status_code}")

r_users_admin = client.get("/admin/usuarios/", headers=h_admin)
reporter.check("Admin General accede a /admin/usuarios (Socios)", r_users_admin.status_code == 200, f"HTTP {r_users_admin.status_code}")

# 2.2 Personal Administrativo (Claudio - 14000113)
s_padmin, token_padmin, user_padmin = login_obtener_token("14000113", "wewewewe")
reporter.check("Login exitoso Personal Administrativo (14000113)", s_padmin == 200 and bool(token_padmin))

h_padmin = {"Authorization": f"Bearer {token_padmin}"}
r_padmin_socios = client.get("/admin/usuarios/", headers=h_padmin)
reporter.check("Personal Administrativo PUEDE acceder a /admin/usuarios", r_padmin_socios.status_code == 200, f"HTTP {r_padmin_socios.status_code}")

r_padmin_reservas = client.get("/admin/reservas", headers=h_padmin)
reporter.check("Personal Administrativo PUEDE acceder a /admin/reservas", r_padmin_reservas.status_code == 200, f"HTTP {r_padmin_reservas.status_code}")

r_padmin_productos = client.get("/admin/productos", headers=h_padmin)
reporter.check("Personal Administrativo PUEDE acceder a /admin/productos", r_padmin_productos.status_code == 200, f"HTTP {r_padmin_productos.status_code}")

# BLOQUEO ESTRICTO: Personal Administrativo NO puede ver dashboard ejecutivo ni estadísticas
r_padmin_dash = client.get("/admin/dashboard/resumen", headers=h_padmin)
reporter.check("Personal Administrativo RECHAZADO de /admin/dashboard/resumen", r_padmin_dash.status_code == 403, f"HTTP {r_padmin_dash.status_code}")

r_padmin_stats = client.get("/admin/dashboard/estadisticas", headers=h_padmin)
reporter.check("Personal Administrativo RECHAZADO de /admin/dashboard/estadisticas", r_padmin_stats.status_code == 403, f"HTTP {r_padmin_stats.status_code}")

# 2.3 Socio Común (Mauro - 77000001)
s_socio, token_socio, user_socio = login_obtener_token("77000001", "wewewewe3")
reporter.check("Login exitoso Socio Puro (77000001)", s_socio == 200 and bool(token_socio))

h_socio = {"Authorization": f"Bearer {token_socio}"}
r_socio_cuotas = client.get("/socio/cuotas/estado", headers=h_socio)
reporter.check("Socio PUEDE acceder a su portal /socio/cuotas/estado", r_socio_cuotas.status_code == 200, f"HTTP {r_socio_cuotas.status_code}")

# BLOQUEO TOTAL de rutas admin para socios comunes
r_s_dash = client.get("/admin/dashboard/resumen", headers=h_socio)
reporter.check("Socio RECHAZADO (403) de /admin/dashboard/resumen", r_s_dash.status_code == 403, f"HTTP {r_s_dash.status_code}")

r_s_users = client.get("/admin/usuarios/", headers=h_socio)
reporter.check("Socio RECHAZADO (403) de /admin/usuarios", r_s_users.status_code == 403, f"HTTP {r_s_users.status_code}")

r_s_reservas = client.get("/admin/reservas", headers=h_socio)
reporter.check("Socio RECHAZADO (403) de /admin/reservas", r_s_reservas.status_code == 403, f"HTTP {r_s_reservas.status_code}")

r_s_cache = client.get("/admin/escaner/cache", headers=h_socio)
reporter.check("Socio RECHAZADO (403) de /admin/escaner/cache", r_s_cache.status_code == 403, f"HTTP {r_s_cache.status_code}")

# 2.4 Portero / Admin Temporal Puro (Portero - 77000009)
s_atemp, token_atemp, user_atemp = login_obtener_token("77000009", "wewewewe1")
reporter.check("Login exitoso Admin Temporal Puro (77000009)", s_atemp == 200 and bool(token_atemp))

h_atemp = {"Authorization": f"Bearer {token_atemp}"}
r_atemp_cache = client.get("/admin/escaner/cache", headers=h_atemp)
reporter.check("Admin Temporal PUEDE acceder a /admin/escaner/cache", r_atemp_cache.status_code == 200, f"HTTP {r_atemp_cache.status_code}")

r_atemp_users = client.get("/admin/usuarios/", headers=h_atemp)
reporter.check("Admin Temporal RECHAZADO (403) de /admin/usuarios", r_atemp_users.status_code == 403, f"HTTP {r_atemp_users.status_code}")

r_atemp_dash = client.get("/admin/dashboard/resumen", headers=h_atemp)
reporter.check("Admin Temporal RECHAZADO (403) de /admin/dashboard/resumen", r_atemp_dash.status_code == 403, f"HTTP {r_atemp_dash.status_code}")


# ─────────────────────────────────────────────────────────────────────────────
# MÓDULO 3: §B — RECORDATORIOS DE CUOTAS, MORA Y WHATSAPP
# ─────────────────────────────────────────────────────────────────────────────
print(f"\n{BOLD}3. §B — Recordatorios de Cuota, Motor de Mora y WhatsApp{RESET}")

# 3.1 Listado de morosos
r_morosos = client.get("/admin/pagos/morosos", headers=h_admin)
reporter.check("GET /admin/pagos/morosos responde 200", r_morosos.status_code == 200, f"HTTP {r_morosos.status_code}")
lista_morosos = r_morosos.json() if r_morosos.status_code == 200 else []
reporter.check("Listado de morosos retorna datos estructurados", isinstance(lista_morosos, list))

# 3.2 Validar campos obligatorios en morosos
if lista_morosos:
    primer_m = lista_morosos[0]
    campos_ok = all(k in primer_m for k in ["id_usuario", "dni", "nombre", "meses_adeudados", "deuda_estimada"])
    reporter.check("Campos de moroso (meses_adeudados, deuda_estimada, etc.) presentes", campos_ok)

# 3.3 Función normalizadora de teléfono argentino (utils/recordatorios.py)
from utils.recordatorios import normalizar_telefono_ar
tel1 = normalizar_telefono_ar("02355 15 123456")
tel2 = normalizar_telefono_ar("+54 9 2355 123456")
tel3 = normalizar_telefono_ar("(2355) 15-456789")
reporter.check("Normalización teléfono '02355 15 123456' -> 5492355123456", tel1 == "5492355123456", f"Resultado: {tel1}")
reporter.check("Normalización teléfono '+54 9 2355 123456' -> 5492355123456", tel2 == "5492355123456", f"Resultado: {tel2}")
reporter.check("Normalización teléfono '(2355) 15-456789' -> 5492355456789", tel3 == "5492355456789", f"Resultado: {tel3}")

# 3.4 Motor de Mora y Cobertura (utils/cuotas_periodos.py)
from utils.cuotas_periodos import calcular_estado_financiero
# Simular socio al día
est_aldia = calcular_estado_financiero(date(2026, 12, 10), date(2024, 1, 1), 10, date(2026, 9, 17))
reporter.check("Cálculo estado socio al día: moroso=False", not est_aldia.moroso and est_aldia.cantidad_meses == 0)

# Simular socio moroso 1 mes
est_m1 = calcular_estado_financiero(date(2026, 8, 10), date(2024, 1, 1), 10, date(2026, 9, 17))
reporter.check("Cálculo estado socio vencido 1 mes: moroso=True, 1 mes", est_m1.moroso and est_m1.cantidad_meses == 1, f"Meses: {est_m1.cantidad_meses}")

# Simular socio moroso 5 meses
est_m5 = calcular_estado_financiero(date(2026, 4, 10), date(2024, 1, 1), 10, date(2026, 9, 17))
reporter.check("Cálculo estado socio moroso 5 meses: moroso=True, 5 meses", est_m5.moroso and est_m5.cantidad_meses == 5, f"Meses: {est_m5.cantidad_meses}")


# ─────────────────────────────────────────────────────────────────────────────
# MÓDULO 4: §C & §E — ESCÁNER DE ACCESO, PADRÓN OFFLINE Y VALIDACIÓN
# ─────────────────────────────────────────────────────────────────────────────
print(f"\n{BOLD}4. §C & §E — Escáner de Acceso y Padrón Offline{RESET}")

# 4.1 Caché offline
r_cache = client.get("/admin/escaner/cache", headers=h_admin)
reporter.check("GET /admin/escaner/cache responde 200", r_cache.status_code == 200, f"HTTP {r_cache.status_code}")
data_cache = r_cache.json() if r_cache.status_code == 200 else {}
socios_cache = data_cache.get("socios", [])
reporter.check("Padrón en caché offline contiene registros de socios", len(socios_cache) > 0, f"Total socios: {len(socios_cache)}")

if socios_cache:
    socio_sample = socios_cache[0]
    reporter.check(
        "Caché offline incluye campos críticos (id_usuario, dni, nombre, estado_financiero)",
        all(k in socio_sample for k in ["id_usuario", "dni", "nombre_completo", "estado_financiero"])
    )

# 4.2 Validación de DNI: Socio al día (Mauro - 77000001)
r_val_aldia = client.post("/qr/validar-dni", json={"dni": "77000001"}, headers=h_admin)
data_val_aldia = r_val_aldia.json() if r_val_aldia.status_code == 200 else {}
reporter.check(
    "Validación DNI socio al día (77000001): puede pasar y estado verde",
    r_val_aldia.status_code == 200 and data_val_aldia.get("es_valido") is True,
    f"Resultado: {data_val_aldia.get('mensaje_display') or 'Permitido'}"
)

# 4.3 Validación de DNI: Socio menor (Merlina - 77000002, nac 2015)
r_val_menor = client.post("/qr/validar-dni", json={"dni": "77000002"}, headers=h_admin)
data_val_menor = r_val_menor.json() if r_val_menor.status_code == 200 else {}
reporter.check(
    "Validación DNI socio menor (77000002): es_valido=True",
    r_val_menor.status_code == 200 and data_val_menor.get("es_valido") is True,
    f"Display: {data_val_menor.get('mensaje_display')}"
)

# 4.4 Validación de DNI: Socio moroso (Facundo - 36778899)
r_val_moroso = client.post("/qr/validar-dni", json={"dni": "36778899"}, headers=h_admin)
data_val_moroso = r_val_moroso.json() if r_val_moroso.status_code == 200 else {}
reporter.check(
    "Validación DNI socio moroso (36778899): es_valido=False",
    r_val_moroso.status_code == 200 and data_val_moroso.get("es_valido") is False,
    f"Display: {data_val_moroso.get('mensaje_display')}"
)


# ─────────────────────────────────────────────────────────────────────────────
# MÓDULO 5: §D — AGENDA DE RESERVAS E INSTALACIONES
# ─────────────────────────────────────────────────────────────────────────────
print(f"\n{BOLD}5. §D — Agenda de Reservas e Instalaciones{RESET}")

r_agenda = client.get("/admin/reservas", headers=h_admin)
reporter.check("GET /admin/reservas responde 200", r_agenda.status_code == 200, f"HTTP {r_agenda.status_code}")

hoy_str = date.today().isoformat()
r_turnos = client.get(f"/socio/reservas/?instalacion=cancha_1&fecha={hoy_str}", headers=h_socio)
reporter.check("Consulta de reservas Cancha 1 responde sin error 500", r_turnos.status_code == 200)

r_turnos_c2 = client.get(f"/socio/reservas/?instalacion=cancha_2&fecha={hoy_str}", headers=h_socio)
reporter.check("Consulta de reservas Cancha 2 responde sin error 500", r_turnos_c2.status_code == 200)


# ─────────────────────────────────────────────────────────────────────────────
# MÓDULO 6: §I — TRANSMISIONES EN VIVO (STREAMING PPV)
# ─────────────────────────────────────────────────────────────────────────────
print(f"\n{BOLD}6. §I — Streaming Pay-Per-View, Fixture y Accesos{RESET}")

r_stream_actual = client.get("/transmisiones/partido-actual")
reporter.check("GET /transmisiones/partido-actual responde 200", r_stream_actual.status_code == 200, f"HTTP {r_stream_actual.status_code}")

r_buscar_socio = client.get("/transmisiones/buscar-usuarios?q=Mauro", headers=h_admin)
reporter.check("Búsqueda de usuarios para emisión de entrada responde 200", r_buscar_socio.status_code == 200, f"HTTP {r_buscar_socio.status_code}")
users_encontrados = r_buscar_socio.json() if r_buscar_socio.status_code == 200 else []
reporter.check("Búsqueda encuentra a Mauro Cabrera con estado de cuota", len(users_encontrados) > 0 and any("Mauro" in u.get("nombre", "") for u in users_encontrados))

if users_encontrados:
    mauro_item = next(u for u in users_encontrados if "Mauro" in u.get("nombre", ""))
    reporter.check("Mauro Cabrera catalogado como 'Al Día' en streaming", mauro_item.get("socio_al_dia") is True)


# ─────────────────────────────────────────────────────────────────────────────
# MÓDULO 7: §J & §K — ASISTENTE VIRTUAL "CAMOTITO" Y TOUR GUIADO
# ─────────────────────────────────────────────────────────────────────────────
print(f"\n{BOLD}7. §J & §K — Asistente Virtual 'Camotito' y Tour Guiado{RESET}")

# 7.1 Info inicial Anónimo
r_info_anon = client.get("/chatbot/info-inicial")
data_info_anon = r_info_anon.json() if r_info_anon.status_code == 200 else {}
reporter.check("GET /chatbot/info-inicial responde 200", r_info_anon.status_code == 200)
reporter.check("Nombre de asistente es 'Camotito'", data_info_anon.get("nombre_asistente") == "Camotito")
sugs_anon = [s.get("prompt", "") for s in data_info_anon.get("sugerencias", [])]
reporter.check("Visitante anónimo NO recibe opción de cuotas privadas", not any("/socio/cuotas" in s for s in sugs_anon))

# 7.2 Info inicial Socio
r_info_socio = client.get("/chatbot/info-inicial?rol=socio&autenticado=true&nombre=Mauro", headers=h_socio)
data_info_socio = r_info_socio.json() if r_info_socio.status_code == 200 else {}
sugs_socio_ids = [s.get("id", "") for s in data_info_socio.get("sugerencias", [])]
reporter.check("Socio recibe sugerencia de 'Tour guiado por la app'", "tour" in sugs_socio_ids)

# 7.3 Disparo del Tour desde Chatbot
r_msg_tour = client.post(
    "/chatbot/mensaje",
    json={
        "mensaje": "Quiero hacer el tour guiado de la app",
        "rol": "socio",
        "autenticado": True,
        "nombre_usuario": "Mauro"
    },
    headers=h_socio
)
data_msg_tour = r_msg_tour.json() if r_msg_tour.status_code == 200 else {}
reporter.check("Mensaje pidiendo tour entrega link a /socio?tour=1", "/socio?tour=1" in data_msg_tour.get("respuesta", ""))
reporter.check("Respuesta de tour libre de emojis", not bool(EMOJI_PATTERN.search(data_msg_tour.get("respuesta", ""))))

# 7.4 Saludo cordial sin viñetas ni emojis
r_saludo = client.post(
    "/chatbot/mensaje",
    json={
        "mensaje": "como estas?",
        "rol": "socio",
        "autenticado": True,
        "nombre_usuario": "Carlos"
    },
    headers=h_socio
)
data_saludo = r_saludo.json() if r_saludo.status_code == 200 else {}
resp_saludo = data_saludo.get("respuesta", "")
reporter.check("Saludo identifica como Camotito", "Camotito" in resp_saludo)
reporter.check("Saludo no contiene viñetas markdown crudas (- Próximo...)", "- Próximo" not in resp_saludo)
reporter.check("Saludo libre de emojis", not bool(EMOJI_PATTERN.search(resp_saludo)))

# 7.5 Consulta de cuotas informa $5.000 y alias
r_cuota_bot = client.post(
    "/chatbot/mensaje",
    json={
        "mensaje": "¿Cuánto está la cuota y a qué alias transfiero?",
        "rol": "anonimo",
        "autenticado": False
    }
)
data_cuota_bot = r_cuota_bot.json() if r_cuota_bot.status_code == 200 else {}
resp_cuota = data_cuota_bot.get("respuesta", "")
reporter.check("Chatbot informa cuota de $5.000", "$5.000" in resp_cuota or "5.000" in resp_cuota)
reporter.check("Chatbot informa alias oficial clubatleticoroberts.mp", "clubatleticoroberts.mp" in resp_cuota)
reporter.check("Respuesta de cuota libre de emojis", not bool(EMOJI_PATTERN.search(resp_cuota)))


# ─────────────────────────────────────────────────────────────────────────────
# RESUMEN GENERAL
# ─────────────────────────────────────────────────────────────────────────────
print(f"\n{BOLD}{CYAN}{'=' * 70}{RESET}")
print(f"{BOLD}RESUMEN DE LA SUITE EXTENDIDA PRE-QA:{RESET}")
print(f"  Total de pruebas ejecutadas: {BOLD}{reporter.passed + reporter.failed}{RESET}")
print(f"  Pruebas aprobadas: {GREEN}{BOLD}{reporter.passed}{RESET}")
print(f"  Pruebas fallidas:  {RED}{BOLD}{reporter.failed}{RESET}")

if reporter.failed == 0:
    print(f"\n  {GREEN}{BOLD}✓ 100% EXITOSO — EL SISTEMA ESTÁ COMPLETAMENTE ESTABLE Y LISTO PARA QA MANUAL.{RESET}")
else:
    print(f"\n  {RED}{BOLD}✗ SE ENCONTRARON {reporter.failed} ANOMALÍAS QUE REQUIEREN ATENCIÓN.{RESET}")
print(f"{BOLD}{CYAN}{'=' * 70}{RESET}\n")

if reporter.failed > 0:
    sys.exit(1)
