# main.py
import logging
import os
from dotenv import load_dotenv

# ─────────────────────────────────────────────────────────────────────────────
# LOGGING — tiene que configurarse explícitamente, y temprano.
#
# Sin esto el proyecto NO tenía ninguna configuración de logging: uvicorn
# configura solo sus propios loggers ('uvicorn', 'uvicorn.error',
# 'uvicorn.access') y deja el root logger sin handler, o sea en WARNING.
# Consecuencia concreta: todos los `logger.info(...)` de los módulos del
# proyecto (utils/ordenes.py, mailer/services/email_tasks.py) se descartaban
# en silencio.
#
# Eso invalidó el diagnóstico de la ronda 1 del QA: se habían agregado logs
# INFO en cada salida temprana de finalizar_pago_si_corresponde() para poder
# ver por qué no salía el mail de confirmación, y en los logs de Render no
# aparecía "ningún rastro" — no porque el código no pasara por ahí, sino
# porque esas líneas nunca se emitían. Los `warning`/`exception` sí se veían,
# pero solo por el handler de último recurso de Python.
# ─────────────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
)

# ─────────────────────────────────────────────────────────────────────────────
# CRÍTICO: load_dotenv() debe correr ANTES de cualquier import que use
# variables de entorno. En Python, los imports ejecutan el módulo completo
# la primera vez que se importa — si database.py se importa antes de
# load_dotenv(), el engine se crea con la URL hardcodeada (o vacía).
#
# La solución correcta es no tener NINGÚN import de módulos del proyecto
# antes de esta línea.
# ─────────────────────────────────────────────────────────────────────────────
load_dotenv()

# Verificación de arranque: confirma que la URL es la correcta
_db_url = os.getenv("DATABASE_URL", "")
if not _db_url:
    raise RuntimeError("DATABASE_URL no definida. Revisá el archivo .env o las variables de Render.")

# Solo logueamos el host, nunca la URL completa (contiene la contraseña)
_db_host = _db_url.split("@")[-1].split("/")[0] if "@" in _db_url else "desconocido"
print(f"✓ Conectando a BD en: {_db_host}")

# ─── Imports del proyecto (van DESPUÉS de load_dotenv) ───────────────────────
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from routers import usuarios, auth, admin_usuarios
from routers import qr_auth
from routers import faq
from routers import admin_comercios
from routers import admin_pagos
from routers import socio_cuotas
from routers import admin_ordenes
from routers import socio_carrito
from routers import admin_productos
from routers import socio_reservas
from routers import admin_reservas
from routers import socio_billetera
from routers import notificaciones
from routers import deportivo
from routers import webhooks_mercadopago
from routers import admin_dashboard
from routers import admin_auditoria
from routers import admin_sponsors
from routers import sponsors as sponsors_publico
from routers import beneficios

import scheduler


os.makedirs("uploads/comprobantes", exist_ok=True)
os.makedirs("uploads/fotos_perfil", exist_ok=True)

app = FastAPI(
    title="Club Atlético API",
    description="Backend para la gestión de socios y accesos",
    version="1.0.0",
)

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://club-atletico-api.onrender.com", 
    "https://clubatleticoroberts.com",
    "https://www.clubatleticoroberts.com",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Solo se sirven estáticamente las FOTOS DE PERFIL (baja sensibilidad; hay URLs
# locales legacy en DB). Los COMPROBANTES nunca se exponen sin auth: en prod van
# a S3 (bucket privado + presigned URL) y las rutas locales legacy solo se ven
# detrás de la verificación del admin, no de un mount estático. Antes se montaba
# todo "uploads/" en "/uploads" → cualquier comprobante escrito localmente
# quedaba world-readable.
app.mount("/uploads/fotos_perfil", StaticFiles(directory="uploads/fotos_perfil"), name="fotos_perfil")

app.include_router(usuarios.router)
app.include_router(auth.router)
app.include_router(admin_usuarios.router)
app.include_router(qr_auth.router)
app.include_router(faq.router)
app.include_router(admin_comercios.router)
app.include_router(admin_pagos.router)
app.include_router(socio_cuotas.router)
app.include_router(admin_ordenes.router)
app.include_router(socio_carrito.router)
app.include_router(admin_productos.router)
app.include_router(socio_reservas.router)
app.include_router(admin_reservas.router)
app.include_router(socio_billetera.router)
app.include_router(notificaciones.router)
app.include_router(deportivo.router)
app.include_router(webhooks_mercadopago.router)
app.include_router(admin_dashboard.router)
app.include_router(admin_auditoria.router)
app.include_router(admin_sponsors.router)
app.include_router(sponsors_publico.router)
app.include_router(beneficios.router)


@app.get("/")
def read_root():
    # No exponemos el host de la base (antes iba `bd_host` acá) — es información
    # de infraestructura que no aporta nada a un cliente y sí a un atacante.
    return {"mensaje": "API del Club Atlético Roberts. OK."}


@app.get("/health")
def health_check():
    """
    Endpoint de salud para monitoreo (UptimeRobot, etc).
    Verifica que el servidor y la base de datos respondan correctamente.
    """
    from sqlalchemy import text
    from database import SessionLocal
    db = SessionLocal()
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok", "db": "ok"}
    except Exception as e:
        return {"status": "error", "db": str(e)}
    finally:
        db.close()