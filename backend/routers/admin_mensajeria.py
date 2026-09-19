# backend/routers/admin_mensajeria.py
"""
Router de mensajería — plantillas de los mails transaccionales.

Endpoints:
  GET   /admin/mensajeria/plantillas           → listado de eventos editables
  GET   /admin/mensajeria/plantillas/{clave}   → detalle + vista previa
  PATCH /admin/mensajeria/plantillas/{clave}   → guardar asunto y/o cuerpo

El catálogo de eventos vive en mailer/registry.py y la resolución contra los
overrides guardados en mailer/plantillas.py — acá solo está la capa HTTP.

Lectura para `admin_general` y `personal_administrativo` (el mismo criterio
que el resto de la config del club); escritura solo para `admin_general`,
igual que la plantilla del recordatorio: esto cambia lo que le llega a
trescientas personas.

Borrar un override (volver al texto de fábrica) se hace mandando cadena
vacía, no con un DELETE: es la misma semántica que ya usa
/admin/productos/configuracion/recordatorio.
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from dependencies import require_roles
from mailer.plantillas import cuerpo_default, obtener_override
from mailer.registry import REGISTRY
from utils.recordatorios import renderizar_plantilla

router = APIRouter(
    prefix="/admin/mensajeria",
    tags=["Admin — Mensajería"],
)

_ROLES_LECTURA = ("admin_general", "personal_administrativo")
_ROLES_ESCRITURA = ("admin_general",)

#: Valores de ejemplo para la vista previa. Cubre todas las variables del
#: registro: la que no esté acá se muestra sin reemplazar, que es justo lo que
#: el admin necesita ver si escribió mal el nombre de una.
_EJEMPLO = {
    "nombre_socio": "Juan Pérez",
    "nombre": "Juan Pérez",
    "dni_socio": "30123456",
    "email_socio": "juan@example.com",
    "email": "juan@example.com",
    "mensaje": "Hola, quería consultar por el alquiler de la cancha.",
    "numero_orden": "1042",
    "numero_pago": "1042",
    "monto": "15.000",
    "motivo": "El comprobante no coincide con el monto.",
    "fecha_vencimiento": "10/09/2026",
    "titulo_evento": "Roberts vs. Lincoln",
    "fecha_evento": "21/09/2026 16:00",
    "link_reset": "https://www.clubatleticoroberts.com/recuperar-password?token=abc",
    "minutos_validez": "60",
    "meses_pagados": "3",
    "cubierto_hasta": "31/12/2026",
    "tipo": "cuota social",
    "horas_restantes": "12",
    "frontend_url": "https://www.clubatleticoroberts.com",
    "admin_url": "https://www.clubatleticoroberts.com/admin/verificaciones",
    "ruta_estado": "/mis-compras",
    "nombre_pantalla": "Mis Compras",
    "instalacion": "Cancha 1",
    "fecha_reserva": "21/09/2026 18:00",
    "monto_acreditado": "8.000",
    "metodo_pago": "transferencia",
    "password_temporal": "car23456",
    "metodo_pago_label": "Transferencia",
    "subtotal": "15.000",
    "saldo_aplicado": "2.000",
    "total_pagado": "13.000",
    "emoji": "➕",
    "color_titulo": "#1b5e20",
    "titulo": "Jugador agregado a un plantel",
    "nombre_tecnico": "Carlos Gómez",
    "accion": "agregado",
    "accion_texto": "Agregó al jugador",
    "preposicion": "en",
    "nombre_jugador": "Martín López",
    "nombre_categoria": "Primera",
    "temporada": "2026",
}


def _extraer_ip(request: Request) -> Optional[str]:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return getattr(request.client, "host", None)


def _evento_o_404(clave: str):
    evento = REGISTRY.get(clave)
    if evento is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No existe un mail con la clave '{clave}'.",
        )
    return evento


def _armar_detalle(clave: str, override: Optional[models.PlantillaMail]) -> schemas.PlantillaMailDetalle:
    evento = REGISTRY[clave]

    asunto_es_default = not (override and override.asunto)
    asunto = evento.asunto_default if asunto_es_default else override.asunto

    cuerpo: Optional[str] = None
    cuerpo_es_default = True
    if evento.editable_cuerpo:
        cuerpo_es_default = not (override and override.cuerpo)
        cuerpo = cuerpo_default(clave) if cuerpo_es_default else override.cuerpo

    return schemas.PlantillaMailDetalle(
        clave=clave,
        etiqueta=evento.etiqueta,
        destino=evento.destino,
        editable_cuerpo=evento.editable_cuerpo,
        personalizado=bool(override and (override.asunto or override.cuerpo)),
        asunto=asunto,
        asunto_es_default=asunto_es_default,
        cuerpo=cuerpo,
        cuerpo_es_default=cuerpo_es_default,
        variables_disponibles=list(evento.variables),
        vista_previa_asunto=renderizar_plantilla(asunto, _EJEMPLO),
    )


@router.get(
    "/plantillas",
    response_model=List[schemas.PlantillaMailResumen],
    summary="Listar los mails transaccionales editables",
)
def listar_plantillas(
    db: Session = Depends(get_db),
    _admin: models.Usuario = Depends(require_roles(*_ROLES_LECTURA)),
) -> List[schemas.PlantillaMailResumen]:
    personalizadas = {
        p.clave for p in db.query(models.PlantillaMail).all() if p.asunto or p.cuerpo
    }
    return [
        schemas.PlantillaMailResumen(
            clave=clave,
            etiqueta=evento.etiqueta,
            destino=evento.destino,
            editable_cuerpo=evento.editable_cuerpo,
            personalizado=clave in personalizadas,
        )
        for clave, evento in REGISTRY.items()
    ]


@router.get(
    "/plantillas/{clave}",
    response_model=schemas.PlantillaMailDetalle,
    summary="Ver el asunto y el cuerpo de un mail, con vista previa",
)
def obtener_plantilla_mail(
    clave: str,
    db: Session = Depends(get_db),
    _admin: models.Usuario = Depends(require_roles(*_ROLES_LECTURA)),
) -> schemas.PlantillaMailDetalle:
    _evento_o_404(clave)
    return _armar_detalle(clave, obtener_override(db, clave))


@router.patch(
    "/plantillas/{clave}",
    response_model=schemas.PlantillaMailDetalle,
    summary="Editar el asunto y/o el cuerpo de un mail",
)
def actualizar_plantilla_mail(
    clave: str,
    payload: schemas.PlantillaMailUpdatePayload,
    request: Request,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(require_roles(*_ROLES_ESCRITURA)),
) -> schemas.PlantillaMailDetalle:
    evento = _evento_o_404(clave)

    if payload.cuerpo is not None and not evento.editable_cuerpo:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "El cuerpo de este mail no se puede editar: tiene listas o "
                "condiciones que se arman en el servidor. Podés cambiarle el asunto."
            ),
        )

    asunto_nuevo = payload.asunto.strip() or None if payload.asunto is not None else None
    cuerpo_nuevo = payload.cuerpo.strip() or None if payload.cuerpo is not None else None

    if asunto_nuevo and "\n" in asunto_nuevo:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El asunto tiene que ser una sola línea.",
        )

    override = obtener_override(db, clave)
    antes = {
        "asunto": override.asunto if override else None,
        "cuerpo": override.cuerpo if override else None,
    }

    if override is None:
        override = models.PlantillaMail(clave=clave)
        db.add(override)

    if payload.asunto is not None:
        override.asunto = asunto_nuevo
    if payload.cuerpo is not None:
        override.cuerpo = cuerpo_nuevo
    override.actualizado_por = admin.id_usuario
    override.actualizado_at = func.now()

    db.add(
        models.AuditLog(
            usuario_actor=admin.id_usuario,
            accion="EDITAR_PLANTILLA_MAIL",
            tabla_afectada="plantillas_mail",
            registro_id=None,
            detalle={
                "clave": clave,
                "antes": antes,
                "despues": {"asunto": override.asunto, "cuerpo": override.cuerpo},
            },
            ip_origen=_extraer_ip(request),
        )
    )

    db.commit()
    db.refresh(override)
    return _armar_detalle(clave, override)
