# backend/utils/ordenes.py
"""
Núcleo reusable de aprobación de Órdenes.

Extraído de routers/admin_ordenes.py para que dos flujos completamente
distintos —un admin humano aprobando a mano vs. el webhook de Mercado Pago
aprobando automáticamente— apliquen exactamente los mismos efectos de
negocio (deuda, cobertura, stock, reservas), sin duplicar la lógica ni
arriesgarse a que las dos copias diverjan con el tiempo.

Ninguna función de acá hace commit: el llamador decide cuándo. Esto permite
que el webhook apruebe, en una sola transacción atómica, las dos Órdenes
hijas de un mismo Pago (cuota + tienda) sin dejar una aprobada y la otra no
si algo falla a mitad de camino.
"""
from __future__ import annotations

import calendar
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import BackgroundTasks, HTTPException, status
from sqlalchemy.orm import Session

import models
import schemas
from mailer.services import email_tasks
from utils.audit import registrar_audit


# ─── Motor de cálculo de períodos de cobertura ───────────────────────────────
# (idéntico al original de admin_ordenes.py, sin cambios de comportamiento)

def _sumar_meses(base: date, meses: int) -> date:
    """
    Suma `meses` enteros positivos a `base` usando únicamente la stdlib.
    Evita el error clásico de overflow de mes (31 de enero + 1 mes ≠ 31 feb).
    """
    total_meses = base.month - 1 + meses
    anio = base.year + total_meses // 12
    mes = total_meses % 12 + 1
    dia = min(base.day, calendar.monthrange(anio, mes)[1])
    return date(anio, mes, dia)


def _calcular_nuevo_mes_cubierto(
    usuario: models.Usuario,
    meses_a_pagar: int,
    dia_vencimiento_cuota: int,
) -> date:
    """
    Base = usuario.mes_cubierto_hasta SIEMPRE que no sea None, sin importar
    si está vencida — un pago nunca "saltea" a hoy, extiende la cobertura
    desde donde el socio se quedó (evita perdonar deuda histórica en silencio).
    """
    if usuario.mes_cubierto_hasta is not None:
        base = usuario.mes_cubierto_hasta
    elif usuario.fecha_ingreso is not None:
        base = usuario.fecha_ingreso
    else:
        base = date.today()

    dia_normalizado = min(dia_vencimiento_cuota, calendar.monthrange(base.year, base.month)[1])
    base_normalizada = base.replace(day=dia_normalizado)

    nueva_fecha = _sumar_meses(base_normalizada, meses_a_pagar)

    dia_final = min(dia_vencimiento_cuota, calendar.monthrange(nueva_fecha.year, nueva_fecha.month)[1])
    return nueva_fecha.replace(day=dia_final)


def obtener_dia_vencimiento(db: Session) -> int:
    """Lee dia_vencimiento_cuota de ConfiguracionGlobal (10 como fallback)."""
    config = db.query(models.ConfiguracionGlobal).first()
    if config is None:
        return 10
    return config.dia_vencimiento_cuota


def verificar_pendiente(orden: models.Orden) -> None:
    if orden.estado != "pendiente_verificacion":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"La orden #{orden.id_orden} está en estado '{orden.estado}' y no "
                "puede procesarse; solo se pueden resolver órdenes "
                "'pendiente_verificacion'."
            ),
        )


# ─── Mail único de "Compra confirmada" a nivel Pago ──────────────────────────
# Reemplaza a los viejos mails partidos por Orden (orden_aprobada_cuota /
# orden_aprobada_tienda), que hacían que un socio que pagaba cuota + tienda
# en un mismo carrito recibiera 2 mails separados, ninguno con el total real.
#
# Un Pago puede tener varias Órdenes (cuota + tienda) que se aprueban en
# momentos distintos —incluso en requests HTTP separados—, así que esta
# función se llama desde CADA punto donde una orden se resuelve (aprobada o
# rechazada) y decide, cada vez, si "ya está todo resuelto" para ese Pago.
# La bandera `mail_confirmacion_enviado` evita el reenvío por más que se
# llame varias veces (ej: dos requests casi simultáneos).

_ORDEN_SECCIONES = (
    ("cuota_social", "Cuota Social"),
    ("alquiler",     "Alquiler de Cancha"),
    ("indumentaria", "Tienda / Indumentaria"),
    ("otro",         "Otros"),
)

_METODO_PAGO_LABELS = {
    "efectivo":       "Efectivo",
    "transferencia":  "Transferencia bancaria",
    "mercado_pago":   "Mercado Pago",
    "saldo_a_favor":  "Saldo a favor",
}


def _armar_secciones_compra(pago: models.Pago) -> tuple[list[dict], "Decimal"]:
    """
    Recorre TODAS las Órdenes aprobadas de un Pago y arma el detalle completo
    agrupado por categoría, en el orden fijo de _ORDEN_SECCIONES.

    Devuelve (secciones, subtotal_items) donde subtotal_items es la suma de
    todos los ítems ANTES de descontar saldo a favor (el Pago.monto_total ya
    viene con el descuento aplicado — la diferencia entre ambos es lo que se
    muestra como "Saldo a favor aplicado").
    """
    from decimal import Decimal

    buckets: dict[str, list[dict]] = {clave: [] for clave, _ in _ORDEN_SECCIONES}
    subtotal_items = Decimal("0")

    for orden in pago.ordenes:
        if orden.estado != "aprobada":
            continue
        for detalle in orden.detalles:
            if detalle.producto is None:
                continue
            categoria = detalle.producto.categoria
            if categoria not in buckets:
                categoria = "otro"

            subtotal_item = detalle.precio_unitario_historico * detalle.cantidad
            subtotal_items += subtotal_item

            item = {
                "nombre": detalle.producto.nombre,
                "cantidad": detalle.cantidad,
                "precio_unitario": f"{detalle.precio_unitario_historico:.2f}",
                "subtotal": f"{subtotal_item:.2f}",
                "detalle_extra": None,
            }
            if categoria == "alquiler" and detalle.reserva is not None:
                item["detalle_extra"] = (
                    f"{detalle.reserva.instalacion} — "
                    f"{detalle.reserva.fecha_inicio.strftime('%d/%m/%Y %H:%M')} hs"
                )
            elif categoria == "cuota_social" and detalle.mes_referencia is not None:
                item["detalle_extra"] = detalle.mes_referencia.strftime("%B %Y")

            buckets[categoria].append(item)

    secciones = []
    for clave, titulo in _ORDEN_SECCIONES:
        lineas = buckets[clave]
        if not lineas:
            continue
        subtotal_seccion = sum(
            (Decimal(i["subtotal"]) for i in lineas), Decimal("0")
        )
        secciones.append({
            "clave": clave,
            "titulo": titulo,
            "lineas": lineas,
            "subtotal_seccion": f"{subtotal_seccion:.2f}",
        })

    return secciones, subtotal_items


def finalizar_pago_si_corresponde(
    *,
    db: Session,
    pago: Optional[models.Pago],
    background_tasks: BackgroundTasks,
) -> None:
    """
    Se llama después de aprobar O rechazar cualquier Orden. Si el Pago ya no
    tiene ninguna Orden hija en 'pendiente_verificacion' (es decir, se
    terminó de resolver del todo) y todavía no se mandó el mail resumen,
    arma el detalle completo y lo dispara en background.

    Si el Pago terminó totalmente rechazado (sin ninguna orden aprobada), NO
    se manda este mail — el rechazo ya se avisa por separado en
    rechazar_orden() vía task_orden_rechazada.
    """
    if pago is None or pago.mail_confirmacion_enviado:
        return

    quedan_pendientes = (
        db.query(models.Orden.id_orden)
        .filter(
            models.Orden.id_pago == pago.id_pago,
            models.Orden.estado == "pendiente_verificacion",
        )
        .first()
        is not None
    )
    if quedan_pendientes:
        return  # todavía falta resolver alguna orden hermana

    pago.mail_confirmacion_enviado = True  # idempotencia, pase lo que pase abajo

    if pago.estado != "verificado":
        return  # rechazado del todo: ya se avisó por orden, no hay nada que confirmar

    socio = pago.usuario
    if not socio:
        return

    secciones, subtotal_items = _armar_secciones_compra(pago)
    if not secciones:
        return  # nada aprobado realmente (no debería pasar si estado=='verificado')

    from decimal import Decimal
    saldo_aplicado = subtotal_items - pago.monto_total
    if saldo_aplicado < Decimal("0"):
        saldo_aplicado = Decimal("0")  # defensivo — nunca debería ser negativo

    # ── Notificación in-app (una sola vez por Pago, no por Orden) ────────────
    db.add(
        models.Notificacion(
            id_usuario=socio.id_usuario,
            tipo="pago_verificado",
            titulo="¡Pago verificado!",
            cuerpo=(
                f"Tu pago por un total de ${pago.monto_total:.2f} fue verificado y "
                "aprobado. ¡Gracias por estar al día!"
            ),
            referencia_id=pago.id_pago,
            referencia_tabla="pagos",
        )
    )

    if not socio.email:
        return  # sin email no hay mails que mandar, pero la notif in-app ya quedó

    tipos_presentes = {s["clave"] for s in secciones}
    if tipos_presentes == {"cuota_social"}:
        tipo_label = "cuota social"
    elif "cuota_social" in tipos_presentes:
        tipo_label = "mixta (cuota + tienda/alquiler)"
    else:
        tipo_label = "tienda/alquiler"

    background_tasks.add_task(
        email_tasks.task_aviso_club_pago_recibido,
        nombre_socio=f"{socio.nombre} {socio.apellido}",
        dni_socio=socio.dni,
        numero_orden=pago.id_pago,
        monto=f"{pago.monto_total:.2f}",
        tipo=tipo_label,
    )

    background_tasks.add_task(
        email_tasks.task_compra_confirmada,
        email_destino=socio.email,
        nombre_socio=socio.nombre,
        numero_pago=pago.id_pago,
        metodo_pago_label=_METODO_PAGO_LABELS.get(pago.metodo_pago, pago.metodo_pago),
        secciones=secciones,
        subtotal=f"{subtotal_items:.2f}",
        saldo_aplicado=f"{saldo_aplicado:.2f}" if saldo_aplicado > 0 else None,
        total_pagado=f"{pago.monto_total:.2f}",
    )


def procesar_aprobacion_orden(
    *,
    db: Session,
    orden: models.Orden,
    actor_id: int,
    background_tasks: BackgroundTasks,
    notas_admin: Optional[str] = None,
    meses_corregidos: Optional[int] = None,
    ip: Optional[str] = None,
) -> schemas.OrdenAprobarResponse:
    """
    Aplica TODOS los efectos de negocio de aprobar una orden:
    deuda/cobertura de cuota social, stock de tienda, confirmación de
    reservas de alquiler, cierre de la orden y del Pago padre, audit_log,
    notificación in-app y mails en background.

    `actor_id` es quien aprueba: un admin humano (admin.id_usuario) o el
    usuario técnico "Sistema — Mercado Pago" (settings.sistema_user_id)
    cuando aprueba el webhook, sin intervención humana.

    NO hace commit ni refresh — responsabilidad del llamador. Asume que
    `orden` ya pasó por verificar_pendiente() — no lo repite acá, para que
    el llamador controle el orden de sus propias validaciones previas.
    """
    socio = orden.usuario

    deuda_antes = socio.deuda_historica_meses
    mes_cubierto_hasta_antes: Optional[date] = socio.mes_cubierto_hasta

    meses_cuota_descontados = 0
    mes_cubierto_hasta_nuevo: Optional[date] = None
    meses_corregidos_aplicados: Optional[int] = None

    # ── Paso 1: corrección opcional de meses ────────────────────────────────
    if meses_corregidos is not None:
        detalle_cuota = next(
            (
                d for d in orden.detalles
                if d.producto is not None and d.producto.categoria == "cuota_social"
            ),
            None,
        )
        if detalle_cuota is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Se especificó 'meses_corregidos' pero la orden no contiene "
                    "ningún ítem de categoría 'cuota_social' que corregir."
                ),
            )
        meses_corregidos_aplicados = meses_corregidos
        detalle_cuota.cantidad = meses_corregidos_aplicados
        orden.monto_total = detalle_cuota.precio_unitario_historico * meses_corregidos_aplicados

    # ── Paso 2: dia_vencimiento_cuota ────────────────────────────────────────
    dia_vencimiento = obtener_dia_vencimiento(db)

    # ── Paso 3: procesar cada detalle ────────────────────────────────────────
    for detalle in orden.detalles:
        if detalle.producto is None:
            continue

        if detalle.producto.categoria == "cuota_social":
            meses_cuota_descontados += detalle.cantidad

        elif detalle.producto.stock is not None:
            if detalle.producto.stock < detalle.cantidad:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Stock insuficiente para '{detalle.producto.nombre}': "
                        f"disponible {detalle.producto.stock}, solicitado {detalle.cantidad}. "
                        f"No se puede aprobar la orden #{orden.id_orden}."
                    ),
                )
            detalle.producto.stock -= detalle.cantidad

        if detalle.producto.categoria == "alquiler" and detalle.reserva is not None:
            if detalle.reserva.estado != "bloqueada":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"La reserva #{detalle.reserva.id_reserva} de "
                        f"'{detalle.producto.nombre}' está en estado "
                        f"'{detalle.reserva.estado}' y no se puede confirmar "
                        f"(¿venció el bloqueo antes de que se aprobara el pago?). "
                        f"No se puede aprobar la orden #{orden.id_orden}."
                    ),
                )
            detalle.reserva.estado = "confirmada"

    # ── Paso 4: deuda y cobertura ─────────────────────────────────────────────
    if meses_cuota_descontados > 0:
        socio.deuda_historica_meses = max(
            0, socio.deuda_historica_meses - meses_cuota_descontados
        )
        mes_cubierto_hasta_nuevo = _calcular_nuevo_mes_cubierto(
            usuario=socio,
            meses_a_pagar=meses_cuota_descontados,
            dia_vencimiento_cuota=dia_vencimiento,
        )
        socio.mes_cubierto_hasta = mes_cubierto_hasta_nuevo

    # ── Paso 5: cerrar la orden ────────────────────────────────────────────────
    orden.estado = "aprobada"
    orden.aprobada_por = actor_id
    orden.aprobada_at = datetime.now(timezone.utc)
    if notas_admin:
        orden.notas_admin = notas_admin

    # ── Paso 6: resolver el Pago padre ────────────────────────────────────────
    pago = orden.pago
    pago_marcado_verificado = False
    if pago is not None and pago.estado == "pendiente":
        pago.estado = "verificado"
        pago_marcado_verificado = True

    # ── Paso 7: audit_log ──────────────────────────────────────────────────────
    registrar_audit(
        db=db,
        actor_id=actor_id,
        accion="APROBAR_ORDEN",
        tabla_afectada="ordenes",
        registro_id=orden.id_orden,
        detalle={
            "id_usuario": socio.id_usuario,
            "deuda_historica_meses_antes": deuda_antes,
            "deuda_historica_meses_despues": socio.deuda_historica_meses,
            "meses_cuota_descontados": meses_cuota_descontados,
            "meses_corregidos_aplicados": meses_corregidos_aplicados,
            "mes_cubierto_hasta_antes": (
                mes_cubierto_hasta_antes.isoformat() if mes_cubierto_hasta_antes else None
            ),
            "mes_cubierto_hasta_despues": (
                mes_cubierto_hasta_nuevo.isoformat() if mes_cubierto_hasta_nuevo else None
            ),
            "dia_vencimiento_cuota_usado": (
                dia_vencimiento if meses_cuota_descontados > 0 else None
            ),
            "monto_total": str(orden.monto_total),
            "notas_admin": notas_admin,
            "id_pago": orden.id_pago,
            "pago_marcado_verificado": pago_marcado_verificado,
        },
        ip=ip,
    )

    # ── Paso 8: notificación in-app ───────────────────────────────────────────
    # Ya no se crea acá (era por Orden, mismo bug que tenían los mails: si el Pago
    # tenía cuota+tienda, el socio veía 2 avisos separados con montos parciales).
    # Ahora se crea UNA sola vez por Pago, dentro de finalizar_pago_si_corresponde.

    # ── Paso 9: mail resumen (a nivel Pago, no por Orden) ─────────────────────
    # Ya no se dispara nada acá: el llamador (admin_ordenes.py, webhooks_mercadopago.py,
    # socio_carrito.py) debe invocar finalizar_pago_si_corresponde(db=db, pago=orden.pago,
    # background_tasks=background_tasks) después de procesar todas las órdenes del Pago
    # en esa misma request. Esa función arma UN solo mail con el detalle completo del
    # Pago (todas sus órdenes/categorías), en vez de un mail partido por cada Orden.

    return schemas.OrdenAprobarResponse(
        id_orden=orden.id_orden,
        estado=orden.estado,
        aprobada_por=orden.aprobada_por,
        aprobada_at=orden.aprobada_at,
        deuda_historica_meses_restante=(
            socio.deuda_historica_meses if meses_cuota_descontados > 0 else None
        ),
    )