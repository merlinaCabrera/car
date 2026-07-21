"""
ejemplo_ruta_ordenes.py — CÓMO integrar el envío de mail en tu ruta existente

Esto es un EJEMPLO adaptado a tu schemas.py (OrdenAprobar, OrdenAprobarResponse).
Copiá el patrón (no necesariamente el archivo entero) a tu router real de órdenes.

Puntos clave:
  1. BackgroundTasks se inyecta como parámetro de la ruta, igual que la sesión de DB.
  2. Se agrega la tarea DESPUÉS de confirmar el commit en la base de datos.
     (Nunca antes: si el commit falla, no querés haber mandado el mail igual).
  3. Se le pasan solo los datos ya extraídos (strings/números), NO el objeto
     ORM ni la sesión — la tarea corre después de que la sesión ya se cerró.
"""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

# Ajustá estos imports a la ubicación real en tu proyecto
from .services.email_tasks import task_orden_aprobada, task_orden_rechazada
# from ..database import get_db
# from ..models import Orden, Usuario
# from ..schemas import OrdenAprobar, OrdenAprobarResponse, OrdenRechazar, OrdenRechazarResponse

router = APIRouter(prefix="/ordenes", tags=["ordenes"])


@router.patch("/{id_orden}/aprobar")
def aprobar_orden(
    id_orden: int,
    payload: "OrdenAprobar",
    background_tasks: BackgroundTasks,
    db: Session = Depends(...),  # reemplazar por get_db real
):
    orden = db.query(Orden).filter(Orden.id_orden == id_orden).first()
    if not orden:
        raise HTTPException(status_code=404, detail="Orden no encontrada")

    # ... tu lógica actual de negocio para aprobar la orden ...
    orden.estado = "aprobada"
    db.commit()
    db.refresh(orden)

    socio = orden.usuario  # asumiendo relationship Orden.usuario -> Usuario

    # Solo se agenda el mail si el socio tiene email cargado.
    if socio.email:
        background_tasks.add_task(
            task_orden_aprobada,
            email_destino=socio.email,
            nombre_socio=f"{socio.nombre} {socio.apellido}",
            numero_orden=orden.id_orden,
            monto=str(orden.total),  # ajustar al campo real de tu modelo Orden
        )

    # La respuesta HTTP se devuelve YA, sin esperar al mail.
    return {"mensaje": "Orden aprobada correctamente", "id_orden": orden.id_orden}


@router.patch("/{id_orden}/rechazar")
def rechazar_orden(
    id_orden: int,
    payload: "OrdenRechazar",
    background_tasks: BackgroundTasks,
    db: Session = Depends(...),
):
    orden = db.query(Orden).filter(Orden.id_orden == id_orden).first()
    if not orden:
        raise HTTPException(status_code=404, detail="Orden no encontrada")

    orden.estado = "rechazada"
    db.commit()
    db.refresh(orden)

    socio = orden.usuario
    if socio.email:
        background_tasks.add_task(
            task_orden_rechazada,
            email_destino=socio.email,
            nombre_socio=f"{socio.nombre} {socio.apellido}",
            numero_orden=orden.id_orden,
            motivo=payload.motivo,  # ajustar al campo real de OrdenRechazar
        )

    return {"mensaje": "Orden rechazada", "id_orden": orden.id_orden}
