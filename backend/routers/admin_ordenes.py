# backend/routers/admin_ordenes.py
"""
Router de verificación de Órdenes — panel del administrador.

Endpoints:
  GET  /admin/ordenes/pendientes              → Bandeja de órdenes esperando verificación
                                                  (con filtro opcional por tipo: cuota | tienda).
  GET  /admin/ordenes/pendientes/count        → Cantidad total de órdenes pendientes.
  GET  /admin/ordenes/pendientes-tienda/count → Cantidad de órdenes pendientes que son
                                                  puras ventas de tienda/alquiler (sin cuota_social).
  POST /admin/ordenes/{id_orden}/aprobar      → Aprueba la orden y aplica sus efectos.
  POST /admin/ordenes/{id_orden}/rechazar     → Rechaza la orden con motivo obligatorio.

Todos los endpoints requieren rol 'admin_general' o 'personal_administrativo'.

Decisiones técnicas:
  - Al aprobar, se recorren los detalles de la orden y, únicamente para los
    ítems cuyo producto pertenece a la categoría 'cuota_social':
      · Se resta `cantidad` a `deuda_historica_meses` del socio (clamp en 0).
      · Se recalcula `mes_cubierto_hasta` usando _calcular_nuevo_mes_cubierto():
          - Base = usuario.mes_cubierto_hasta si NO es None, SIN IMPORTAR si
            esa fecha ya está vencida en el pasado. El pago siempre extiende
            la cobertura desde donde el socio se quedó, llenando
            cronológicamente los meses adeudados — nunca "saltea" a hoy.
            (Bug corregido: la versión anterior usaba
            MAX(mes_cubierto_hasta, hoy), lo que perdonaba en silencio toda
            la deuda histórica de un socio con la cobertura vencida.)
          - Si mes_cubierto_hasta es None (nunca tuvo una cuota aprobada), la
            base es usuario.fecha_ingreso; si también fuera None, date.today().
          - La base se normaliza al dia_vencimiento_cuota de ConfiguracionGlobal
            dentro del mismo mes.
          - Se suman N meses (suma correcta de meses, sin errores de 30/31 días,
            usando calendar.monthrange de la stdlib).
          - El día resultante se ajusta a dia_vencimiento_cuota (con clamp al
            último día del mes destino, relevante para meses cortos).
  - Para el resto de las categorías (alquiler, indumentaria, otro) con manejo
    de stock (`stock IS NOT NULL`), se valida disponibilidad y se descuenta
    `cantidad` del stock del producto. Si no alcanza, se aborta la aprobación
    completa con 400 (nada se persiste porque el commit es único, al final).
  - "Tipo" de orden (cuota vs. tienda) se determina por la presencia de al
    menos un DetalleOrden cuyo producto sea categoria='cuota_social'.
  - Solo se puede aprobar/rechazar una orden en 'pendiente_verificacion'; otro
    estado → 400, para evitar doble procesamiento.
  - Cada acción queda en audit_log con snapshot de antes/después, incluyendo
    el cambio de mes_cubierto_hasta.
"""

from __future__ import annotations

import calendar
from datetime import date, datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session, joinedload

import models
import schemas
from database import get_db
from dependencies import get_current_user, require_roles
from utils.audit import registrar_audit as _registrar_audit, extraer_ip as _extraer_ip

router = APIRouter(
    prefix="/admin/ordenes",
    tags=["Admin — Verificación de Órdenes"],
)

_ROLES_ADMIN = ("admin_general", "personal_administrativo")
_TIPOS_FILTRO_VALIDOS = ("cuota", "tienda")


# ─── Motor de cálculo de períodos de cobertura ───────────────────────────────

def _sumar_meses(base: date, meses: int) -> date:
    """
    Suma `meses` enteros positivos a `base` usando únicamente la stdlib
    (calendar + datetime.date). Evita los errores clásicos de overflow de mes
    (ej: 31 de enero + 1 mes ≠ 31 de febrero).

    Algoritmo:
      1. Convierte year/month a índice lineal de meses (0-based).
      2. Suma directamente.
      3. Divide con //12 para obtener el año y %12+1 para el mes.
      4. Clampea el día al máximo del mes destino con monthrange().
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
    Calcula la nueva fecha de cobertura del socio tras un pago de cuota.

    REGLA DE NEGOCIO ESTRICTA (corrige el bug de "amnistía de deuda"):
      · Base = usuario.mes_cubierto_hasta, SIEMPRE que no sea None — sin
        importar si esa fecha ya está vencida en el pasado. Un pago nunca
        "saltea" al día de hoy: extiende la cobertura desde donde el socio
        se quedó, llenando cronológicamente los meses adeudados. Usar
        MAX(mes_cubierto_hasta, hoy) —como se hacía antes— perdona en
        silencio toda la deuda acumulada, porque ancla el nuevo período en
        el presente en vez de continuar la secuencia real de meses impagos.
      · Si mes_cubierto_hasta es None (el socio nunca tuvo una cuota
        aprobada), la base es usuario.fecha_ingreso. Si también fuera None
        (no debería pasar — la columna es NOT NULL — pero se cubre
        defensivamente), se usa date.today() como última red de seguridad.
      · La base se normaliza al día `dia_vencimiento_cuota` dentro de su
        propio mes/año.
      · Se suman `meses_a_pagar` meses mediante _sumar_meses() (aritmética
        de calendario correcta, sin errores de overflow de 30/31 días).
      · El día final se fuerza a `dia_vencimiento_cuota`, con clamp al
        último día del mes destino (relevante para febrero).

    Ejemplo del bug corregido:
      Socio con mes_cubierto_hasta = 2025-01-10 (debe ~11 meses) paga 4.
        ANTES (con MAX): base = hoy → nueva_fecha ≈ hoy + 4 meses → el
          sistema lo marca "al día", perdonando de facto los ~7 meses de
          deuda que ese pago no alcanza a cubrir.
        AHORA: base = 2025-01-10 (estrictamente, aunque esté vencida) →
          nueva_fecha = 2025-05-10. La fecha refleja con precisión cuánta
          deuda sigue existiendo después de este pago parcial.
    """
    if usuario.mes_cubierto_hasta is not None:
        base = usuario.mes_cubierto_hasta
    elif usuario.fecha_ingreso is not None:
        base = usuario.fecha_ingreso
    else:
        base = date.today()

    # Normalizar la base al día de vencimiento dentro de su propio mes/año
    # (clamp al último día del mes por si tiene menos días que dia_vencimiento)
    dia_normalizado = min(dia_vencimiento_cuota, calendar.monthrange(base.year, base.month)[1])
    base_normalizada = base.replace(day=dia_normalizado)

    # Sumar los meses pagados con aritmética de calendario correcta
    nueva_fecha = _sumar_meses(base_normalizada, meses_a_pagar)

    # Forzar el día final a dia_vencimiento_cuota (con clamp para meses cortos)
    dia_final = min(dia_vencimiento_cuota, calendar.monthrange(nueva_fecha.year, nueva_fecha.month)[1])
    return nueva_fecha.replace(day=dia_final)


def _obtener_dia_vencimiento(db: Session) -> int:
    """
    Lee dia_vencimiento_cuota de la fila singleton de ConfiguracionGlobal.
    Si la tabla está vacía (entorno de tests sin seed), devuelve 10 como fallback.
    """
    config = db.query(models.ConfiguracionGlobal).first()
    if config is None:
        return 10  # valor por defecto razonable; el seed debería haber creado la fila
    return config.dia_vencimiento_cuota


# ─── Helpers generales ────────────────────────────────────────────────────────

def _extraer_ip(request: Request) -> Optional[str]:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return getattr(request.client, "host", None)


def _registrar_audit(
    *,
    db: Session,
    actor_id: int,
    accion: str,
    tabla_afectada: str,
    registro_id: Optional[int],
    detalle: dict,
    ip: Optional[str] = None,
) -> None:
    db.add(
        models.AuditLog(
            usuario_actor=actor_id,
            accion=accion,
            tabla_afectada=tabla_afectada,
            registro_id=registro_id,
            detalle=detalle,
            ip_origen=ip,
        )
    )


def _obtener_orden_o_404(db: Session, id_orden: int) -> models.Orden:
    orden = (
        db.query(models.Orden)
        .options(
            joinedload(models.Orden.detalles).joinedload(models.DetalleOrden.producto),
            joinedload(models.Orden.detalles).joinedload(models.DetalleOrden.reserva),
            joinedload(models.Orden.usuario),
            joinedload(models.Orden.pago),
        )
        .filter(models.Orden.id_orden == id_orden)
        .first()
    )
    if orden is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No existe la orden #{id_orden}.",
        )
    return orden


def _verificar_pendiente(orden: models.Orden) -> None:
    if orden.estado != "pendiente_verificacion":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"La orden #{orden.id_orden} está en estado '{orden.estado}' y no "
                "puede procesarse; solo se pueden resolver órdenes "
                "'pendiente_verificacion'."
            ),
        )


def _subquery_tiene_cuota_social(db: Session):
    """
    Subquery EXISTS: True si la orden tiene al menos un DetalleOrden cuyo
    producto es de categoría 'cuota_social'.
    """
    return (
        db.query(models.DetalleOrden.id_detalle)
        .join(
            models.ProductoServicio,
            models.DetalleOrden.id_producto == models.ProductoServicio.id_producto,
        )
        .filter(
            models.DetalleOrden.id_orden == models.Orden.id_orden,
            models.ProductoServicio.categoria == "cuota_social",
        )
        .exists()
    )


def _aplicar_filtro_tipo(query, db: Session, tipo: Optional[str]):
    """Aplica el filtro `tipo` ('cuota' | 'tienda') a un query de Orden."""
    if tipo is None:
        return query

    if tipo not in _TIPOS_FILTRO_VALIDOS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Parámetro 'tipo' inválido. Opciones válidas: {_TIPOS_FILTRO_VALIDOS}.",
        )

    tiene_cuota = _subquery_tiene_cuota_social(db)
    if tipo == "cuota":
        return query.filter(tiene_cuota)
    return query.filter(~tiene_cuota)


# ─── ENDPOINT: Bandeja de órdenes pendientes ──────────────────────────────────

@router.get(
    "/pendientes",
    response_model=List[schemas.OrdenAdminResponse],
    summary="Listar órdenes pendientes de verificación (con filtro opcional por tipo)",
)
def listar_ordenes_pendientes(
    tipo: Optional[str] = Query(
        None,
        description="Filtro opcional: 'cuota' (contienen cuota_social) o "
                    "'tienda' (indumentaria/alquileres, sin cuota_social). "
                    "Si se omite, devuelve todas.",
    ),
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN)),
) -> List[schemas.OrdenAdminResponse]:
    query = (
        db.query(models.Orden)
        .options(
            joinedload(models.Orden.detalles).joinedload(models.DetalleOrden.producto),
            joinedload(models.Orden.usuario),
            joinedload(models.Orden.pago),
        )
        .filter(models.Orden.estado == "pendiente_verificacion")
    )

    query = _aplicar_filtro_tipo(query, db, tipo)
    ordenes = query.order_by(models.Orden.fecha_creacion.asc()).all()
    return ordenes


@router.get("/pendientes/count", response_model=int, summary="Cantidad de órdenes pendientes")
def contar_ordenes_pendientes(
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN)),
) -> int:
    return db.query(models.Orden).filter(models.Orden.estado == "pendiente_verificacion").count()


@router.get(
    "/pendientes-tienda/count",
    response_model=int,
    summary="Cantidad de órdenes pendientes que son puras ventas de tienda (sin cuota_social)",
)
def contar_ordenes_pendientes_tienda(
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN)),
) -> int:
    query = db.query(models.Orden).filter(models.Orden.estado == "pendiente_verificacion")
    query = _aplicar_filtro_tipo(query, db, "tienda")
    return query.count()


# ─── ENDPOINT: Aprobar orden ───────────────────────────────────────────────────

@router.post(
    "/{id_orden}/aprobar",
    response_model=schemas.OrdenAprobarResponse,
    summary="Aprobar una orden pendiente de verificación",
)
def aprobar_orden(
    id_orden: int,
    payload: schemas.OrdenAprobar,
    request: Request,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN)),
) -> schemas.OrdenAprobarResponse:
    orden = _obtener_orden_o_404(db, id_orden)
    _verificar_pendiente(orden)

    socio = orden.usuario

    # Snapshots para el audit_log (capturados ANTES de cualquier modificación)
    deuda_antes = socio.deuda_historica_meses
    mes_cubierto_hasta_antes: Optional[date] = socio.mes_cubierto_hasta

    # Contadores y resultados a llenar durante el procesamiento de detalles
    meses_cuota_descontados = 0
    mes_cubierto_hasta_nuevo: Optional[date] = None
    meses_corregidos_aplicados: Optional[int] = None

    # ── Paso 1: corrección opcional de meses antes de procesar ───────────────
    # Si el admin indica `meses_corregidos`, actualizamos el DetalleOrden de
    # cuota_social y recalculamos el monto_total de la orden con el precio
    # unitario ya congelado en el detalle (precio_unitario_historico).
    # Esto cubre el caso: el socio solicitó N meses pero el comprobante muestra
    # un importe que corresponde a M meses distintos.
    if payload.meses_corregidos is not None:
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
        meses_corregidos_aplicados = payload.meses_corregidos
        detalle_cuota.cantidad = meses_corregidos_aplicados
        orden.monto_total = detalle_cuota.precio_unitario_historico * meses_corregidos_aplicados

    # ── Paso 2: leer dia_vencimiento_cuota ANTES del bucle (una sola consulta) ─
    # Solo se necesita si hay ítems de cuota; lo cargamos igual para no hacer
    # la lectura dentro del bucle en caso de órdenes mixtas con múltiples ítems.
    dia_vencimiento = _obtener_dia_vencimiento(db)

    # ── Paso 3: procesar cada detalle de la orden ─────────────────────────────
    # Recorremos los detalles (ya potencialmente actualizados en el paso 1).
    # Nada de esto se persiste todavía — el commit es único al final, por lo que
    # un error en cualquier ítem (stock insuficiente, etc.) aborta todo.
    for detalle in orden.detalles:
        if detalle.producto is None:
            continue

        if detalle.producto.categoria == "cuota_social":
            # ── Cuota social: descontar deuda y calcular nueva cobertura ──────
            meses_cuota_descontados += detalle.cantidad

        elif detalle.producto.stock is not None:
            # ── Tienda con stock físico: validar y descontar ──────────────────
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
            # ── Alquiler: confirmar la reserva bloqueada ───────────────────────
            # La franja deja de ser un bloqueo "de carrito" y pasa a ser una
            # ocupación real y definitiva de la instalación.
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

    # ── Paso 4: aplicar cambios al estado financiero del socio ─────────────────
    # Se aplica en un bloque separado del bucle para que la lógica de deuda
    # y cobertura quede concentrada y sea fácil de leer, testear y auditar.
    if meses_cuota_descontados > 0:
        # 4a. Reducir deuda (clamp en 0 — coherente con chk_deuda_no_negativa)
        socio.deuda_historica_meses = max(
            0, socio.deuda_historica_meses - meses_cuota_descontados
        )

        # 4b. Calcular y actualizar mes_cubierto_hasta con el motor de períodos
        mes_cubierto_hasta_nuevo = _calcular_nuevo_mes_cubierto(
            usuario=socio,
            meses_a_pagar=meses_cuota_descontados,
            dia_vencimiento_cuota=dia_vencimiento,
        )
        socio.mes_cubierto_hasta = mes_cubierto_hasta_nuevo

    # ── Paso 5: cerrar la orden ────────────────────────────────────────────────
    orden.estado = "aprobada"
    orden.aprobada_por = admin.id_usuario
    orden.aprobada_at = datetime.now(timezone.utc)
    if payload.notas_admin:
        orden.notas_admin = payload.notas_admin

    # ── Paso 6: resolver el Pago padre ────────────────────────────────────────
    # Si el Pago todavía estaba 'pendiente', queda 'verificado'.
    # La aprobación sigue siendo granular a nivel Orden; esto solo refleja que
    # ya hubo una verificación positiva sobre el comprobante del Pago.
    pago = orden.pago
    pago_marcado_verificado = False
    if pago is not None and pago.estado == "pendiente":
        pago.estado = "verificado"
        pago_marcado_verificado = True

    # ── Paso 7: audit_log con snapshot completo ───────────────────────────────
    _registrar_audit(
        db=db,
        actor_id=admin.id_usuario,
        accion="APROBAR_ORDEN",
        tabla_afectada="ordenes",
        registro_id=orden.id_orden,
        detalle={
            "id_usuario": socio.id_usuario,
            # Deuda
            "deuda_historica_meses_antes": deuda_antes,
            "deuda_historica_meses_despues": socio.deuda_historica_meses,
            "meses_cuota_descontados": meses_cuota_descontados,
            "meses_corregidos_aplicados": meses_corregidos_aplicados,
            # Cobertura (motor de períodos)
            "mes_cubierto_hasta_antes": (
                mes_cubierto_hasta_antes.isoformat()
                if mes_cubierto_hasta_antes else None
            ),
            "mes_cubierto_hasta_despues": (
                mes_cubierto_hasta_nuevo.isoformat()
                if mes_cubierto_hasta_nuevo else None
            ),
            "dia_vencimiento_cuota_usado": (
                dia_vencimiento if meses_cuota_descontados > 0 else None
            ),
            # Orden y pago
            "monto_total": str(orden.monto_total),
            "notas_admin": payload.notas_admin,
            "id_pago": orden.id_pago,
            "pago_marcado_verificado": pago_marcado_verificado,
        },
        ip=_extraer_ip(request),
    )

    # ── Paso 8: Notificar al socio ───────────────────────────────────────────
    db.add(
        models.Notificacion(
            id_usuario=socio.id_usuario,
            tipo="orden_aprobada",
            titulo="¡Pago verificado!",
            cuerpo=(
                f"Tu pago por un total de ${orden.monto_total} ha sido verificado y "
                "aprobado. ¡Gracias por estar al día!"
            ),
            referencia_id=orden.id_orden,
            referencia_tabla="ordenes",
        )
    )
    

    db.commit()
    db.refresh(orden)

    return schemas.OrdenAprobarResponse(
        id_orden=orden.id_orden,
        estado=orden.estado,
        aprobada_por=orden.aprobada_por,
        aprobada_at=orden.aprobada_at,
        deuda_historica_meses_restante=(
            socio.deuda_historica_meses if meses_cuota_descontados > 0 else None
        ),
    )


# ─── ENDPOINT: Rechazar orden ──────────────────────────────────────────────────

@router.post(
    "/{id_orden}/rechazar",
    response_model=schemas.OrdenRechazarResponse,
    summary="Rechazar una orden pendiente de verificación",
)
def rechazar_orden(
    id_orden: int,
    payload: schemas.OrdenRechazar,
    request: Request,
    db: Session = Depends(get_db),
    admin: models.Usuario = Depends(require_roles(*_ROLES_ADMIN)),
) -> schemas.OrdenRechazarResponse:
    orden = _obtener_orden_o_404(db, id_orden)
    _verificar_pendiente(orden)

    orden.estado = "rechazada"
    orden.motivo_rechazo = payload.motivo_rechazo

    # ── Liberar reservas de alquiler asociadas ────────────────────────────────
    # Si la orden tenía turnos bloqueados, hay que devolverlos a la agenda:
    # el pago no se concretó, así que el horario tiene que volver a ofertarse.
    for detalle in orden.detalles:
        if (
            detalle.producto is not None
            and detalle.producto.categoria == "alquiler"
            and detalle.reserva is not None
            and detalle.reserva.estado == "bloqueada"
        ):
            detalle.reserva.estado = "liberada"

    # ── Resolver el Pago padre si quedó "huérfano" ────────────────────────────
    # Un Pago puede tener más de una Orden hija (split-order: cuota + tienda).
    # Si esta era la única orden útil (ninguna otra sigue pendiente ni fue
    # aprobada), el rechazo es total: dejamos el Pago en 'rechazado'.
    quedan_ordenes_utiles = (
        db.query(models.Orden.id_orden)
        .filter(
            models.Orden.id_pago == orden.id_pago,
            models.Orden.id_orden != orden.id_orden,
            models.Orden.estado.in_(("pendiente_verificacion", "aprobada")),
        )
        .first()
        is not None
    )

    pago = orden.pago
    pago_marcado_rechazado = False
    if pago is not None and pago.estado == "pendiente" and not quedan_ordenes_utiles:
        pago.estado = "rechazado"
        pago_marcado_rechazado = True

    _registrar_audit(
        db=db,
        actor_id=admin.id_usuario,
        accion="RECHAZAR_ORDEN",
        tabla_afectada="ordenes",
        registro_id=orden.id_orden,
        detalle={
            "id_usuario": orden.id_usuario,
            "motivo_rechazo": payload.motivo_rechazo,
            "monto_total": str(orden.monto_total),
            "id_pago": orden.id_pago,
            "pago_marcado_rechazado": pago_marcado_rechazado,
        },
        ip=_extraer_ip(request),
    )

    # ── Notificar al socio ───────────────────────────────────────────────────
    db.add(
        models.Notificacion(
            id_usuario=orden.id_usuario,
            tipo="orden_rechazada",
            titulo="Problema con tu pago",
            cuerpo=f"Hubo un problema con tu transferencia por ${orden.monto_total}. "
                   f"Motivo: {payload.motivo_rechazo}.",
            referencia_id=orden.id_orden,
            referencia_tabla="ordenes",
        )
    )

    db.commit()
    db.refresh(orden)

    return schemas.OrdenRechazarResponse(
        id_orden=orden.id_orden,
        estado=orden.estado,
        motivo_rechazo=orden.motivo_rechazo,
    )