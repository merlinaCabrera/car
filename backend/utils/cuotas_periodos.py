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
        fuera None, se usa date.today() como última red de seguridad.
    """
    if mes_cubierto_hasta is not None:
        base = mes_cubierto_hasta
    elif fecha_ingreso is not None:
        base = fecha_ingreso
    else:
        base = date.today()

    base_normalizada = normalizar_a_dia_vencimiento(base, dia_vencimiento_cuota)
    nueva_fecha = sumar_meses(base_normalizada, meses_a_pagar)
    return normalizar_a_dia_vencimiento(nueva_fecha, dia_vencimiento_cuota)


@dataclass
class EstadoFinanciero:
    moroso: bool
    meses_adeudados: List[date]  # fecha de vencimiento de cada período adeudado, orden cronológico

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
      · hoy > fecha_base → moroso. Meses adeudados = diferencia de meses de
        calendario entre hoy y fecha_base, +1 si ya pasó el día de
        vencimiento del mes en curso (así un socio no es moroso hasta el
        día siguiente al vencimiento, no el mismo día).
    """
    hoy = hoy or date.today()

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

    periodos = [sumar_meses(fecha_base, i) for i in range(1, n_meses + 1)]
    return EstadoFinanciero(moroso=True, meses_adeudados=periodos)


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
    """
    hoy = hoy or date.today()
    if n_meses <= 0:
        return hoy

    dia_hoy_clamp = min(dia_vencimiento, calendar.monthrange(hoy.year, hoy.month)[1])
    ajuste = 1 if hoy.day > dia_hoy_clamp else 0
    base = sumar_meses(hoy, -(n_meses - ajuste))
    return normalizar_a_dia_vencimiento(base, dia_vencimiento)