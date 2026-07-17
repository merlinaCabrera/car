# main.py
import os
from dotenv import load_dotenv

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
from routers import admin_comercios
from routers import admin_pagos
from routers import socio_cuotas
from routers import admin_ordenes
from routers import socio_carrito
from routers import admin_productos
from routers import socio_reservas
from routers import notificaciones
from routers import deportivo

import scheduler


UPLOAD_DIR = "uploads/comprobantes"
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = FastAPI(
    title="Club Atlético API",
    description="Backend para la gestión de socios y accesos",
    version="1.0.0",
)

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://club-atletico-api.onrender.com", 
    "https://car-frontend-dusky.vercel.app",
    "https://car-frontend-git-main-merlina-s-projects.vercel.app"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

app.include_router(usuarios.router)
app.include_router(auth.router)
app.include_router(admin_usuarios.router)
app.include_router(qr_auth.router)
app.include_router(admin_comercios.router)
app.include_router(admin_pagos.router)
app.include_router(socio_cuotas.router)
app.include_router(admin_ordenes.router)
app.include_router(socio_carrito.router)
app.include_router(admin_productos.router)
app.include_router(socio_reservas.router)
app.include_router(notificaciones.router)
app.include_router(deportivo.router)


@app.get("/")
def read_root():
    return {
        "mensaje": "¡Bienvenida a la API del Club Atlético! El servidor está corriendo perfectamente.",
        "bd_host": _db_host,
    }