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

import asyncio
import logging
from datetime import datetime, timezone, timedelta

from apscheduler.schedulers.background import BackgroundScheduler

from database import SessionLocal
import models
from mailer.services.email_service import (
    enviar_orden_expirada,
    enviar_recordatorio_comprobante,
    enviar_cuota_vencida,
)

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


# ─── Job: expirar órdenes vencidas ───────────────────────────────────────────

def expirar_ordenes_vencidas():
    """
    Cada hora: marca como 'expirada' toda Orden en 'pendiente_verificacion'
    cuyo expira_at ya pasó. Por cada orden:
      - Devuelve stock a los productos de categoría != 'cuota_social' ni 'alquiler'
      - Libera las ReservaInstalacion asociadas (bloqueada → liberada)
      - Manda mail al socio avisando que expiró
    Es idempotente.
    """
    db = SessionLocal()
    try:
        ahora = datetime.now(timezone.utc)
        ordenes = (
            db.query(models.Orden)
            .filter(
                models.Orden.estado == "pendiente_verificacion",
                models.Orden.expira_at < ahora,
            )
            .all()
        )

        if not ordenes:
            return

        for orden in ordenes:
            orden.estado = "expirada"

            # Devolver stock de indumentaria/otros (no cuota ni alquiler)
            for detalle in orden.detalles:
                if (
                    detalle.producto is not None
                    and detalle.producto.categoria not in ("cuota_social", "alquiler")
                    and detalle.producto.stock is not None
                ):
                    detalle.producto.stock += detalle.cantidad

            # Liberar reservas asociadas
            for reserva in orden.reservas:
                if reserva.estado == "bloqueada":
                    reserva.estado = "liberada"

            # Mail al socio (sincrónico dentro del thread del scheduler)
            socio = orden.usuario
            if socio and socio.email:
                try:
                    asyncio.run(enviar_orden_expirada(
                        email_destino=socio.email,
                        nombre_socio=socio.nombre,
                        numero_orden=orden.id_orden,
                        monto=str(orden.monto_total),
                    ))
                except Exception as mail_exc:
                    logger.error(f"[scheduler] Mail orden_expirada falló para orden #{orden.id_orden}: {mail_exc}")

            logger.info(f"[scheduler] Orden #{orden.id_orden} expirada (usuario {orden.id_usuario})")

        db.commit()

    except Exception as exc:
        db.rollback()
        logger.error(f"[scheduler] Error en expirar_ordenes_vencidas: {exc}", exc_info=True)
    finally:
        db.close()


# ─── Job: recordatorio de comprobante pendiente ───────────────────────────────

def recordatorio_comprobante_pendiente():
    """
    Cada hora: detecta órdenes en 'pendiente_verificacion' sin comprobante
    que expiran en menos de 24hs y manda un recordatorio al socio.
    Solo manda una vez: se aprovecha la ventana horaria para no spamear
    (la tarea corre cada hora, así que el recordatorio llega a lo sumo 1 vez
    en la ventana de 24-23hs antes del vencimiento).
    """
    db = SessionLocal()
    try:
        ahora = datetime.now(timezone.utc)
        ventana_inicio = ahora + timedelta(hours=23)
        ventana_fin    = ahora + timedelta(hours=24)

        ordenes = (
            db.query(models.Orden)
            .join(models.Pago, models.Orden.id_pago == models.Pago.id_pago)
            .filter(
                models.Orden.estado == "pendiente_verificacion",
                models.Pago.comprobante_url.is_(None),
                models.Orden.expira_at >= ventana_inicio,
                models.Orden.expira_at < ventana_fin,
            )
            .all()
        )

        if not ordenes:
            return

        for orden in ordenes:
            socio = orden.usuario
            if not socio or not socio.email:
                continue

            horas_restantes = max(1, int((orden.expira_at - ahora).total_seconds() // 3600))
            try:
                asyncio.run(enviar_recordatorio_comprobante(
                    email_destino=socio.email,
                    nombre_socio=socio.nombre,
                    numero_orden=orden.id_orden,
                    monto=str(orden.monto_total),
                    horas_restantes=horas_restantes,
                ))
                logger.info(f"[scheduler] Recordatorio enviado a {socio.email} (orden #{orden.id_orden}, {horas_restantes}hs restantes)")
            except Exception as mail_exc:
                logger.error(f"[scheduler] Mail recordatorio falló para orden #{orden.id_orden}: {mail_exc}")

    except Exception as exc:
        logger.error(f"[scheduler] Error en recordatorio_comprobante_pendiente: {exc}", exc_info=True)
    finally:
        db.close()


# ─── Job: notificar cuotas vencidas ──────────────────────────────────────────

def notificar_cuotas_vencidas():
    """
    Corre 1 vez por día a las 9hs UTC.
    Busca socios activos cuyo mes_cubierto_hasta < hoy, no tienen beca activa,
    y no tienen ya una orden pendiente de cuota (para no spamear si ya pagaron
    y están esperando verificación). Manda el mail de cuota vencida.
    """
    db = SessionLocal()
    try:
        from datetime import date
        hoy = date.today()
        ahora = datetime.now(timezone.utc)

        # IDs de productos cuota_social para el filtro de órdenes pendientes
        ids_cuota = [
            p.id_producto
            for p in db.query(models.ProductoServicio)
            .filter(models.ProductoServicio.categoria == "cuota_social")
            .all()
        ]

        # Socios con cuota vencida y sin beca activa
        socios_vencidos = (
            db.query(models.Usuario)
            .filter(
                models.Usuario.fecha_baja.is_(None),
                models.Usuario.mes_cubierto_hasta < hoy,
                models.Usuario.email.isnot(None),
                # excluir becados activos
                (
                    models.Usuario.es_becado.is_(False)
                    | (models.Usuario.becado_hasta < hoy)
                ),
            )
            .all()
        )

        if not socios_vencidos:
            return

        # IDs de socios que ya tienen orden pendiente de cuota (no spamear)
        con_orden_pendiente = set(
            fila[0]
            for fila in db.query(models.Orden.id_usuario)
            .join(models.DetalleOrden, models.DetalleOrden.id_orden == models.Orden.id_orden)
            .filter(
                models.Orden.estado == "pendiente_verificacion",
                models.DetalleOrden.id_producto.in_(ids_cuota),
            )
            .all()
        )

        for socio in socios_vencidos:
            if socio.id_usuario in con_orden_pendiente:
                continue
            fecha_str = socio.mes_cubierto_hasta.strftime("%d/%m/%Y") if socio.mes_cubierto_hasta else "—"
            try:
                asyncio.run(enviar_cuota_vencida(
                    email_destino=socio.email,
                    nombre_socio=socio.nombre,
                    fecha_vencimiento=fecha_str,
                ))
                logger.info(f"[scheduler] Mail cuota_vencida enviado a {socio.email} (vencida {fecha_str})")
            except Exception as mail_exc:
                logger.error(f"[scheduler] Mail cuota_vencida falló para {socio.email}: {mail_exc}")

    except Exception as exc:
        logger.error(f"[scheduler] Error en notificar_cuotas_vencidas: {exc}", exc_info=True)
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
    misfire_grace_time=60,
)

scheduler.add_job(
    expirar_ordenes_vencidas,
    trigger="interval",
    hours=1,
    id="expirar_ordenes_vencidas",
    replace_existing=True,
    misfire_grace_time=300,
)

scheduler.add_job(
    recordatorio_comprobante_pendiente,
    trigger="interval",
    hours=1,
    id="recordatorio_comprobante_pendiente",
    replace_existing=True,
    misfire_grace_time=300,
)

scheduler.add_job(
    notificar_cuotas_vencidas,
    trigger="cron",
    hour=9,
    minute=0,
    id="notificar_cuotas_vencidas",
    replace_existing=True,
    misfire_grace_time=3600,
)

scheduler.start()
logger.info("[scheduler] APScheduler iniciado — revisión cada 5 minutos.")