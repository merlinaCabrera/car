# backend/utils/cuotas_periodos.py
"""
Motor de cálculo de períodos de cobertura de cuota social — ÚNICO módulo
que debe tocar mes_cubierto_hasta o calcular meses adeudados.

Antes de este módulo existían DOS fuentes de verdad divergentes:
  1. El campo `deuda_historica_meses` en la tabla usuarios: un contador
     manual que solo bajaba al pagar, pero nunca subía solo con el paso
     del tiempo. Quedaba "congelado" y desincronizado de la realidad.
  2. `calcularEstadoFinanciero()` en el frontend (AdminSocios.jsx): una
     función que ya calculaba todo esto al vuelo desde mes_cubierto_hasta,
     con un comentario explícito reconociendo que el campo de la API
     "queda obsoleto con el tiempo".

Este módulo elimina la redundancia: `deuda_historica_meses` se eliminó de
la base (ver migración d0e1f2a3b4c5). Ahora los meses adeudados —tanto la
cantidad como CUÁLES puntualmente— se derivan siempre de mes_cubierto_hasta
(o fecha_ingreso si nunca tuvo cobertura), igual para un socio recién dado
de alta que para uno con años de antigüedad. calcular_estado_financiero()
replica EXACTAMENTE la lógica que ya estaba validada en el frontend, para
que backend y frontend nunca más puedan desincronizarse.
"""
from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date
from typing import List, Optional

from utils.fechas import hoy_club


def sumar_meses(base: date, meses: int) -> date:
    """
    Suma (o resta, si `meses` es negativo) meses enteros a `base` usando
    solo la stdlib. Evita el overflow clásico de fin de mes (ej: 31 de
    enero + 1 mes ≠ 31 de febrero) haciendo clamp al último día del mes
    destino.
    """
    total_meses = base.month - 1 + meses
    anio = base.year + total_meses // 12
    mes = total_meses % 12 + 1
    dia = min(base.day, calendar.monthrange(anio, mes)[1])
    return date(anio, mes, dia)


def normalizar_a_dia_vencimiento(fecha: date, dia_vencimiento: int) -> date:
    """Ajusta `fecha` al día de vencimiento configurado, con clamp de fin de mes."""
    dia = min(dia_vencimiento, calendar.monthrange(fecha.year, fecha.month)[1])
    return fecha.replace(day=dia)


def calcular_nuevo_mes_cubierto(
    mes_cubierto_hasta: Optional[date],
    fecha_ingreso: Optional[date],
    meses_a_pagar: int,
    dia_vencimiento_cuota: int,
) -> date:
    """
    Calcula la nueva fecha de cobertura tras un pago de `meses_a_pagar` meses.

    REGLA DE NEGOCIO ESTRICTA (evita el bug de "amnistía de deuda"):
      · Base = mes_cubierto_hasta, SIEMPRE que no sea None — sin importar
        si está vencida en el pasado. Un pago nunca "saltea" al día de hoy:
        extiende la cobertura desde donde el socio se quedó, llenando
        cronológicamente los meses adeudados.
      · Si mes_cubierto_hasta es None, la base es fecha_ingreso. Si también
        fuera None, se usa hoy_club() como última red de seguridad.
    """
    if mes_cubierto_hasta is not None:
        base = mes_cubierto_hasta
    elif fecha_ingreso is not None:
        base = fecha_ingreso
    else:
        base = hoy_club()

    base_normalizada = normalizar_a_dia_vencimiento(base, dia_vencimiento_cuota)
    nueva_fecha = sumar_meses(base_normalizada, meses_a_pagar)
    return normalizar_a_dia_vencimiento(nueva_fecha, dia_vencimiento_cuota)


def cobertura_inicial_para_ingreso(fecha_ingreso: date, dia_vencimiento: int) -> date:
    """
    Valor de `mes_cubierto_hasta` con el que tiene que nacer un socio nuevo.

    Devuelve el vencimiento del mes ANTERIOR al de ingreso: así el mes de
    ingreso queda como el primer período adeudado y se cobra de verdad cuando
    el socio pague.

    Antes se seteaba el último día del mes de ingreso, o sea que ese mes
    quedaba marcado como cubierto sin que nadie lo hubiera pagado: el club
    perdía la primera cuota de cada socio nuevo, y encima
    `calcular_nuevo_mes_cubierto` arrancaba desde ahí, así que el primer pago
    se imputaba al mes siguiente y el de ingreso no se cobraba nunca
    (decisión D1 de la QA del 08-09 — "no darlo por saldado gratis").

    Que el socio igual se vea AL DÍA durante su mes de ingreso lo resuelve
    `calcular_estado_financiero()` con el período de gracia, no esta fecha.
    """
    return normalizar_a_dia_vencimiento(
        sumar_meses(fecha_ingreso, -1), dia_vencimiento
    )


def en_mes_de_ingreso(fecha_ingreso: Optional[date], hoy: Optional[date] = None) -> bool:
    """
    True si `hoy` cae dentro del mismo mes calendario en que el socio ingresó.

    Es la ventana de gracia de la decisión D1: durante su mes de ingreso el
    socio se muestra al día aunque la cuota de ese mes ya se le esté debiendo.
    """
    if fecha_ingreso is None:
        return False
    hoy = hoy or hoy_club()
    return (hoy.year, hoy.month) == (fecha_ingreso.year, fecha_ingreso.month)


@dataclass
class EstadoFinanciero:
    moroso: bool
    meses_adeudados: List[date]  # fecha de vencimiento de cada período adeudado, orden cronológico
    en_mes_ingreso: bool = False  # True → gracia por mes de ingreso (ver D1)

    @property
    def cantidad_meses(self) -> int:
        return len(self.meses_adeudados)


def calcular_estado_financiero(
    mes_cubierto_hasta: Optional[date],
    fecha_ingreso: Optional[date],
    dia_vencimiento: int = 10,
    hoy: Optional[date] = None,
) -> EstadoFinanciero:
    """
    Fuente única de verdad del estado financiero de un socio. Replica
    EXACTAMENTE calcularEstadoFinanciero() de AdminSocios.jsx — si algún
    día se cambia esta lógica, hay que cambiarla en los dos lugares.

    Reglas:
      · fecha_base = mes_cubierto_hasta si no es None (sin importar si está
        vencida).
      · Si es None, fecha_base = fecha_ingreso normalizada al día de
        vencimiento (clamp de fin de mes).
      · hoy <= fecha_base → al día, sin meses adeudados.
      · hoy > fecha_base → se listan los períodos que van desde fecha_base
        hasta hoy, y se cuentan como adeudados SOLO los que ya vencieron,
        o sea aquellos cuya fecha de vencimiento es estrictamente anterior a
        hoy. Un período vence "al final" de su día: el día 10 todavía se
        puede pagar sin estar en mora, y recién el 11 pasa a adeudado.

    Corte de fecha — por qué el filtro final (BUG-04, ronda 2 de la QA):
      El período del mes en curso se generaba y se contaba desde el día 1,
      aunque venciera más adelante en el mes. Con día de vencimiento 10 y
      hoy = 9 de septiembre, un socio cubierto hasta el 10 de febrero
      figuraba con 7 meses adeudados (marzo…septiembre) mientras el
      calendario de /socio/cuotas marcaba 6 en rojo y septiembre en ámbar
      como "Vence el 10" — el header y el calendario decían cosas distintas
      sobre la misma deuda, y el header cobraba de más un mes.
      Ahora los dos usan el mismo corte: mientras el mes en curso no venza,
      no suma ni al conteo ni al monto en pesos.
    """
    hoy = hoy or hoy_club()

    # ── Gracia por MES DE INGRESO (decisión D1) ────────────────────────────
    # Un socio que se dio de alta este mes se muestra al día, aunque la cuota
    # de su mes de ingreso ya figure como adeudada. No es una condonación: la
    # deuda sigue existiendo en la fecha de cobertura y se le cobra en cuanto
    # pase el mes (o cuando venga a pagar). Solo evita recibir a un socio
    # nuevo con un cartel de "moroso" el mismo día que se asoció.
    if en_mes_de_ingreso(fecha_ingreso, hoy):
        return EstadoFinanciero(
            moroso=False, meses_adeudados=[], en_mes_ingreso=True
        )

    fecha_base = mes_cubierto_hasta
    if fecha_base is None:
        if fecha_ingreso is None:
            return EstadoFinanciero(moroso=False, meses_adeudados=[])
        fecha_base = normalizar_a_dia_vencimiento(fecha_ingreso, dia_vencimiento)

    if hoy <= fecha_base:
        return EstadoFinanciero(moroso=False, meses_adeudados=[])

    n_meses = (hoy.year - fecha_base.year) * 12 + (hoy.month - fecha_base.month)
    if hoy.day > fecha_base.day:
        n_meses += 1

    # Solo los períodos YA vencidos cuentan como deuda. El del mes en curso
    # queda afuera hasta el día siguiente a su vencimiento.
    periodos = [
        vencimiento
        for i in range(1, n_meses + 1)
        if (vencimiento := sumar_meses(fecha_base, i)) < hoy
    ]
    return EstadoFinanciero(moroso=bool(periodos), meses_adeudados=periodos)


def fecha_cubierta_para_meses_adeudados(
    n_meses: int,
    dia_vencimiento: int,
    hoy: Optional[date] = None,
) -> date:
    """
    Inversa de calcular_estado_financiero(): para que, evaluado HOY, un
    socio aparezca debiendo exactamente `n_meses`, devuelve el valor que
    hay que asignarle a mes_cubierto_hasta.

    Uso: edición manual de deuda desde /admin/socios (alta de socios
    traspapelados de la carga por planilla, corrección de casos puntuales).
    n_meses <= 0 → hoy mismo (al día, sin deuda).

    Tiene que seguir siendo la inversa EXACTA de calcular_estado_financiero():
    cuando esa función dejó de contar el período del mes en curso hasta que
    vence (BUG-04), este cálculo quedó corrido en uno y había que ajustarlo
    igual. El test de ida y vuelta está en scripts/qa_seguridad.py.
    """
    hoy = hoy or hoy_club()
    if n_meses <= 0:
        return hoy

    # Último vencimiento que YA pasó (estrictamente anterior a hoy): el del mes
    # en curso si su día ya quedó atrás, y si no el del mes anterior.
    dia_hoy_clamp = min(dia_vencimiento, calendar.monthrange(hoy.year, hoy.month)[1])
    if hoy.day > dia_hoy_clamp:
        ultimo_vencido = hoy.replace(day=dia_hoy_clamp)
    else:
        ultimo_vencido = normalizar_a_dia_vencimiento(
            sumar_meses(hoy, -1), dia_vencimiento
        )

    # Los períodos adeudados son fecha_base+1 … fecha_base+n_meses, y el
    # último de ellos tiene que caer justo en `ultimo_vencido`.
    return normalizar_a_dia_vencimiento(
        sumar_meses(ultimo_vencido, -n_meses), dia_vencimiento
    )