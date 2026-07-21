"""
config.py — Configuración de la aplicación (extracto: sección de Email)

Requiere: pip install pydantic-settings

Agregá estas variables a tu .env (NUNCA las subas a git):

    MAIL_USERNAME=clubatleticoroberts1@gmail.com
    MAIL_PASSWORD=xxxx xxxx xxxx xxxx   # Contraseña de APLICACIÓN, no la normal
    MAIL_FROM=clubatleticoroberts1@gmail.com
    MAIL_FROM_NAME="Club Atlético Roberts"
    MAIL_PORT=587
    MAIL_SERVER=smtp.gmail.com
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class EmailSettings(BaseSettings):
    MAIL_USERNAME: str
    MAIL_PASSWORD: str
    MAIL_FROM: str
    MAIL_FROM_NAME: str = "Club Atlético Roberts"
    MAIL_PORT: int = 587
    MAIL_SERVER: str = "smtp.gmail.com"
    MAIL_STARTTLS: bool = True
    MAIL_SSL_TLS: bool = False
    USE_CREDENTIALS: bool = True
    VALIDATE_CERTS: bool = True

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


email_settings = EmailSettings()
