# backend/config.py
"""
Configuración centralizada de variables de entorno.

Usa pydantic-settings: valida tipos y falla rápido al arrancar la app si
falta alguna variable obligatoria, en vez de romper en medio de un request
con un os.getenv(...) que devolvió None.

Uso en cualquier archivo:
    from config import settings
    settings.mp_access_token
"""
from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",  # no romper si el .env tiene otras vars que no modelamos acá
    )

    # ── Mercado Pago ─────────────────────────────────────────────────────────
    mp_access_token: str
    mp_webhook_secret: str = ""  # se completa cuando armemos el webhook (paso 6)

    # ── Usuario "sistema" para aprobaciones automáticas ─────────────────────
    sistema_user_id: int

    # ── URLs ─────────────────────────────────────────────────────────────────
    frontend_url: str = "http://localhost:5173"
    backend_url: str = "http://localhost:8000"


settings = Settings()