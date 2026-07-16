# backend/scheduler.py
"""
Scheduler de tareas periódicas — APScheduler (BackgroundScheduler).

Registrarlo en main.py:
    from scheduler import scheduler
    (el import solo ya arranca el scheduler)

Tareas:
  - cerrar_eventos_vencidos(): cada 5 minutos, cierra automáticamente los
    eventos cuya fecha_fin ya pasó hace más de 30 minutos. Cruza asistencias
    reales contra convocatorias y marca 'presente'/'ausente'.
    Si el evento no tiene fecha_fin, usa fecha_inicio + 3 horas como fallback.
"""

import logging
from datetime import datetime, timezone, timedelta

from apscheduler.schedulers.background import BackgroundScheduler

from database import SessionLocal
import models

logger = logging.getLogger(__name__)

# ─── Tarea principal ──────────────────────────────────────────────────────────

def cerrar_eventos_vencidos():
    """
    Busca eventos 'programado' o 'en_curso' cuyo tiempo de cierre estimado
    ya pasó y los marca como 'finalizado', cruzando asistencias contra
    convocatorias para actualizar el presentismo automáticamente.

    Tiempo de cierre = fecha_fin + 30 min (o fecha_inicio + 3 horas si no
    tiene fecha_fin — cubre entrenamientos sin hora de fin definida).

    Es idempotente: si se corre varias veces sobre el mismo evento,
    el resultado es el mismo.
    """
    db = SessionLocal()
    try:
        ahora = datetime.now(timezone.utc)

        # Traemos todos los eventos activos (no hace falta filtrar por fecha
        # acá — lo hacemos en Python para poder usar la lógica de fallback
        # con fecha_inicio + 3h cuando fecha_fin es NULL)
        eventos_activos = (
            db.query(models.Evento)
            .filter(models.Evento.estado.in_(["programado", "en_curso"]))
            .all()
        )

        eventos_a_cerrar = []
        for evento in eventos_activos:
            if evento.fecha_fin is not None:
                cierre_estimado = evento.fecha_fin + timedelta(minutes=30)
            else:
                # Fallback: eventos sin hora de fin (ej. entrenamientos)
                cierre_estimado = evento.fecha_inicio + timedelta(hours=3, minutes=30)

            if ahora >= cierre_estimado:
                eventos_a_cerrar.append(evento)

        if not eventos_a_cerrar:
            return  # Nada que hacer, salimos sin tocar la DB

        for evento in eventos_a_cerrar:
            convocatorias = (
                db.query(models.Convocatoria)
                .filter(models.Convocatoria.id_evento == evento.id_evento)
                .all()
            )

            if convocatorias:
                ids_presentes = {
                    fila.id_usuario
                    for fila in db.query(models.Asistencia.id_usuario).filter(
                        models.Asistencia.id_evento == evento.id_evento,
                        models.Asistencia.id_usuario.in_(
                            [c.id_usuario for c in convocatorias]
                        ),
                    ).all()
                }
                for conv in convocatorias:
                    conv.estado = (
                        "presente" if conv.id_usuario in ids_presentes else "ausente"
                    )

            evento.estado = "finalizado"
            logger.info(
                f"[scheduler] Evento #{evento.id_evento} '{evento.titulo}' "
                f"cerrado automáticamente. "
                f"Convocados: {len(convocatorias)}."
            )

        db.commit()

    except Exception as exc:
        db.rollback()
        logger.error(f"[scheduler] Error en cerrar_eventos_vencidos: {exc}", exc_info=True)
    finally:
        db.close()


# ─── Configuración del scheduler ─────────────────────────────────────────────

scheduler = BackgroundScheduler(timezone="UTC")

scheduler.add_job(
    cerrar_eventos_vencidos,
    trigger="interval",
    minutes=5,
    id="cerrar_eventos_vencidos",
    replace_existing=True,
    misfire_grace_time=60,  # si el server estuvo caído, espera hasta 60s antes de saltear
)

scheduler.start()
logger.info("[scheduler] APScheduler iniciado — revisión cada 5 minutos.")