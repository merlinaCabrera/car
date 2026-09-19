# backend/mailer/plantillas.py
"""
Resolución de overrides de PlantillaMail contra mailer/registry.py.

Separado de email_service.py porque este módulo toca la base de datos
(SQLAlchemy) y aquel es deliberadamente una capa "tonta" de solo
HTTP+Jinja2 — mezclar las dos cosas ahí complicaría testear el envío sin DB.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Optional

from sqlalchemy.orm import Session

import models
from mailer.registry import REGISTRY, EventoMail
from utils.recordatorios import renderizar_plantilla

TEMPLATE_FOLDER = Path(__file__).resolve().parent / "templates" / "email"

_JINJA_VAR = re.compile(r"\{\{\s*(\w+)\s*\}\}")
_BLOQUE_CONTENIDO = re.compile(r"\{%\s*block\s+content\s*%\}(.*)\{%\s*endblock\s*%\}", re.DOTALL)


def _contexto_str(contexto: dict) -> dict[str, str]:
    """Todo a string para la regex de sustitución — algunos valores llegan
    como int/Decimal (numero_orden, monto ya formateado, etc.)."""
    return {k: ("" if v is None else str(v)) for k, v in contexto.items()}


def cuerpo_default(clave: str) -> Optional[str]:
    """
    Extrae el `{% block content %}` del .html de fábrica y convierte sus
    `{{ variable }}` a `{variable}` — el mismo formato de placeholder que ya
    usa el recordatorio de cuota. Es el texto de partida que ve el admin al
    abrir el editor de un evento por primera vez.

    Solo tiene sentido para templates con `editable_cuerpo=True` (pura
    interpolación, sin `{% if %}`/`{% for %}`) — para los demás devuelve None.
    """
    evento = REGISTRY[clave]
    if not evento.editable_cuerpo:
        return None
    html = (TEMPLATE_FOLDER / evento.template_default).read_text(encoding="utf-8")
    match = _BLOQUE_CONTENIDO.search(html)
    contenido = match.group(1) if match else html
    return _JINJA_VAR.sub(lambda m: "{" + m.group(1) + "}", contenido).strip()


def obtener_override(db: Session, clave: str) -> Optional[models.PlantillaMail]:
    return db.query(models.PlantillaMail).filter(models.PlantillaMail.clave == clave).first()


def resolver_evento(db: Session, clave: str, contexto: dict) -> tuple[str, str, dict]:
    """
    Devuelve (asunto, template_name, body) listos para pasarle a
    email_service._enviar(). Si no hay override guardado, es exactamente el
    comportamiento de siempre (mismo asunto hardcodeado, mismo template.html).
    """
    evento = REGISTRY[clave]
    ctx = _contexto_str(contexto)
    override = obtener_override(db, clave)

    asunto_plantilla = override.asunto if (override and override.asunto) else evento.asunto_default
    asunto = renderizar_plantilla(asunto_plantilla, ctx)

    if evento.editable_cuerpo and override and override.cuerpo:
        contenido_html = renderizar_plantilla(override.cuerpo, ctx)
        return asunto, "_editable.html", {"contenido_html": contenido_html}

    return asunto, evento.template_default, contexto
