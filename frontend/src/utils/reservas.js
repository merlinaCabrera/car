// frontend/src/utils/reservas.js
/**
 * Definición de turnos y helpers de agenda de instalaciones — ÚNICO lugar
 * donde se define a qué hora empieza y termina cada turno.
 *
 * Por qué existe
 * ──────────────
 * Los turnos estaban definidos dos veces: las franjas Día/Noche del quincho en
 * `pages/Reservas.jsx` y los bloques horarios de cancha en `pages/SocioCancha.jsx`,
 * cada uno con su propia copia de `rangoTurno()` y `turnoOcupado()`. Mientras
 * el admin miraba una lista de filas daba igual. Con la agenda del admin
 * mostrando la MISMA grilla que ve el socio (rediseño de la ronda 5), no:
 * si las dos pantallas no parten el día en los mismos turnos, el panel muestra
 * libre un turno que el socio no puede pedir, o al revés — y nadie se entera
 * hasta que dos personas reclaman el mismo quincho.
 *
 * Es el mismo criterio que ya se aplicó en `utils/cuotas.js` con el motor de
 * cuotas, por la misma razón y después del mismo tipo de bug (BUG-04, BUG-12).
 *
 * Los íconos NO viven acá a propósito: son decisión de cada pantalla, y
 * mantener este módulo sin JSX permite testearlo con node a secas.
 */

// ─── Quincho: dos franjas fijas por día ───────────────────────────────────
// `nombreProducto` tiene que matchear EXACTO el `nombre` del ProductoServicio
// (categoria='alquiler') dado de alta en el backend.
export const TURNOS_QUINCHO = {
  dia:   { label: 'Día',   horaInicio: 9,  horaFin: 19, nombreProducto: 'Quincho — Turno Día' },
  noche: { label: 'Noche', horaInicio: 19, horaFin: 24, nombreProducto: 'Quincho — Turno Noche' },
}

// ─── Canchas: bloques horarios ────────────────────────────────────────────
export const CANCHAS = [
  { key: 'cancha_1', label: 'Cancha 1', nombreProducto: 'Cancha 1' },
  { key: 'cancha_2', label: 'Cancha 2', nombreProducto: 'Cancha 2' },
]

// TODO: esto va a pasar a configurarse desde el admin (tabla
// ConfiguracionInstalacion) en una próxima iteración. Por ahora queda fijo acá.
export const HORA_INICIO_CANCHA = 9    // primer turno arranca 9:00
export const HORA_FIN_CANCHA = 23      // último turno termina, como mucho, 23:00
export const DURACION_TURNO_CANCHA_HORAS = 1.5
export const PORCENTAJE_REINTEGRO = 0.20 // 20%, matchea el default del backend

// Cuántos días adelante puede reservar el socio. El admin NO tiene este tope:
// necesita ver y tocar meses pasados y futuros (rediseño de la ronda 5).
export const DIAS_VISIBLES_SOCIO = 14

// ─── Nombres ──────────────────────────────────────────────────────────────

export const NOMBRES_MES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

/** Lunes primero — ojo, no es el orden de `Date.getDay()` (que arranca en domingo). */
export const NOMBRES_DIA_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

// ─── Helpers de fecha (sin desfase UTC) ───────────────────────────────────
//
// Todo lo de acá trabaja en hora LOCAL. `new Date("2026-09-23")` crea
// medianoche UTC, que en Argentina (UTC-3) cae el día anterior; por eso nunca
// se construyen fechas desde string y las claves se arman con
// getFullYear/Month/Date, nunca con getUTC*.

export function fechaLocal(anio, mes1based, dia) {
  return new Date(anio, mes1based - 1, dia)
}

export function isoDeFechaLocal(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function diasEnMes(anio, mes1based) {
  return new Date(anio, mes1based, 0).getDate()
}

/** Índice 0..6 con lunes primero, para indexar NOMBRES_DIA_SEMANA. */
export function indiceDiaSemana(fecha) {
  return (fecha.getDay() + 6) % 7
}

// ─── Rangos horarios de un turno ──────────────────────────────────────────

/**
 * Rango [inicio, fin) de una franja del quincho, en hora local.
 * `horaFin` puede ser 24 → medianoche del día siguiente.
 */
export function rangoTurnoQuincho(anio, mes1based, dia, turnoKey) {
  const { horaInicio, horaFin } = TURNOS_QUINCHO[turnoKey]
  const inicio = new Date(anio, mes1based - 1, dia, horaInicio, 0, 0)
  const fin = new Date(anio, mes1based - 1, dia, 0, 0, 0)
  fin.setHours(horaFin, 0, 0, 0)
  return { inicio, fin }
}

/** Las horas de inicio (decimales: 9, 10.5, 12…) de los turnos de cancha. */
export function turnosDeCancha() {
  const turnos = []
  for (
    let h = HORA_INICIO_CANCHA;
    h + DURACION_TURNO_CANCHA_HORAS <= HORA_FIN_CANCHA + 0.001;
    h += DURACION_TURNO_CANCHA_HORAS
  ) {
    turnos.push(h)
  }
  return turnos
}

/** 9.5 → "09:30" */
export function horaLabel(horaDecimal) {
  const h = Math.floor(horaDecimal)
  const m = Math.round((horaDecimal - h) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Rango [inicio, fin) de un turno de cancha sobre el día `fechaBase`. */
export function rangoTurnoCancha(fechaBase, horaInicioDecimal) {
  const inicio = new Date(fechaBase)
  const hIni = Math.floor(horaInicioDecimal)
  const mIni = Math.round((horaInicioDecimal - hIni) * 60)
  inicio.setHours(hIni, mIni, 0, 0)

  const fin = new Date(inicio)
  fin.setMinutes(fin.getMinutes() + DURACION_TURNO_CANCHA_HORAS * 60)

  return { inicio, fin }
}

// ─── Ocupación ────────────────────────────────────────────────────────────

/**
 * La PRIMERA reserva que se superpone con [inicio, fin), o null.
 *
 * El socio solo necesita saber si el turno está ocupado; el admin necesita el
 * objeto entero, porque la agenda muestra de quién es el turno. Por eso el
 * helper devuelve la reserva y `turnoOcupado()` queda como el booleano de
 * siempre encima.
 */
export function reservaQueOcupa(reservas, inicio, fin) {
  return (reservas ?? []).find(r => {
    const rInicio = new Date(r.fecha_inicio)
    const rFin = new Date(r.fecha_fin)
    return rInicio < fin && rFin > inicio
  }) ?? null
}

export function turnoOcupado(reservas, inicio, fin) {
  return reservaQueOcupa(reservas, inicio, fin) !== null
}

/**
 * True si la franja es un bloqueo de agenda del club y no la reserva de un
 * socio. El backend ya lo manda calculado en `es_bloqueo_manual`
 * (ReservaAdminListResponse); el fallback cubre respuestas viejas cacheadas y
 * repite la MISMA regla que `_es_bloqueo_manual()` en admin_reservas.py.
 */
export function esBloqueoManual(reserva) {
  if (!reserva) return false
  if (typeof reserva.es_bloqueo_manual === 'boolean') return reserva.es_bloqueo_manual
  return reserva.id_usuario == null && reserva.id_orden == null && reserva.estado === 'confirmada'
}
