from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import usuarios, auth, admin_usuarios
from routers import qr_auth
from routers import admin_comercios
from routers import admin_pagos


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

# Enchufamos las rutas de usuarios a la aplicación principal
app.include_router(usuarios.router)
app.include_router(auth.router)
app.include_router(admin_usuarios.router) 
app.include_router(qr_auth.router)
app.include_router(admin_comercios.router)
app.include_router(admin_pagos.router)

# Ruta raíz de prueba
@app.get("/")
def read_root():
    return {"mensaje": "¡Bienvenida a la API del Club Atlético! El servidor está corriendo perfectamente."}