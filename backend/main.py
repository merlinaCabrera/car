import os

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


# ─── Gestión de archivos subidos (comprobantes de pago) ───────────────────────
# Se crea el directorio al arrancar la app para que el primer upload no falle
# por ausencia de la carpeta. Debe coincidir con UPLOAD_DIR en socio_cuotas.py.
UPLOAD_DIR = "uploads/comprobantes"
os.makedirs(UPLOAD_DIR, exist_ok=True)


app = FastAPI(
    title="Club Atlético API",
    description="Backend para la gestión de socios y accesos",
    version="1.0.0"
)

# Configuración de CORS (Permite que tu Frontend en React/Vite se comunique con esta API)
origins = [
    "http://localhost:5173",  # Puerto por defecto de Vite
    "http://localhost:3000",  # Otro puerto común de React
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Sirve los comprobantes subidos por los socios en /uploads/comprobantes/<archivo>
# ej: http://localhost:8000/uploads/comprobantes/8f14e45f-....jpg
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Enchufamos las rutas de usuarios a la aplicación principal
app.include_router(usuarios.router)
app.include_router(auth.router)
app.include_router(admin_usuarios.router) 
app.include_router(qr_auth.router)
app.include_router(admin_comercios.router)
app.include_router(admin_pagos.router)
app.include_router(socio_cuotas.router)
app.include_router(admin_ordenes.router)
app.include_router(socio_carrito.router)
app.include_router(router=admin_productos.router)
app.include_router(socio_reservas.router)
app.include_router(notificaciones.router)


# Ruta raíz de prueba
@app.get("/")
def read_root():
    return {"mensaje": "¡Bienvenida a la API del Club Atlético! El servidor está corriendo perfectamente."}