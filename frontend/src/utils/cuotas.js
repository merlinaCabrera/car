// frontend/src/utils/cuotas.js
/**
 * Motor de cuotas del frontend — puerto 1:1 de backend/utils/cuotas_periodos.py.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ---------------------------
 * La misma lógica estaba copiada en tres pantallas (SocioInicio, SocioCuotas y
 * AdminSocios) y las copias se desincronizaron: la de SocioCuotas recibió la
 * gracia por mes de ingreso (D1) y el corte por fecha de vencimiento (BUG-04),
 * la de SocioInicio no. Resultado en la QA del 11-09: /socio/cuotas decía
 * "Mes de ingreso" y el inicio, mirando exactamente los mismos datos, le
 * gritaba MOROSO al mismo socio (síntomas 7.1 y 7.4).
 *
 * Regla: esta lógica NO se vuelve a copiar. Si hay que cambiarla, se cambia
 * acá y en backend/utils/cuotas_periodos.py — y solo ahí.
 */

// ─── Helpers de fecha ────────────────────────────────────────────────────────

/**
 * Construye un Date en hora local desde partes individuales.
 * Evita el desfase UTC que produce `new Date("YYYY-MM-DD")` en zonas negativas
 * como America/Argentina/Buenos_Aires (UTC-3), donde una fecha "2026-09-01"
 * se interpreta como las 21:00 del 31/08.
 */
export function fechaLocal(anio, mes1based, dia) {
  return new Date(anio, mes1based - 1, dia)
}

/** Parsea una ISO Date string "YYYY-MM-DD" a Date local. null/undefined → null. */
export function parsearISO(isoDate) {
  if (!isoDate) return null
  const partes = String(isoDate).split('-').map(Number)
  if (partes.length !== 3 || partes.some(Number.isNaN)) return null
  return fechaLocal(partes[0], partes[1], partes[2])
}

/** Hoy a medianoche local — el "cero" contra el que se comparan los vencimientos. */
export function hoyLocal() {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  return hoy
}

/** Suma (o resta) meses enteros a una fecha, con clamp al último día del mes. */
export function sumarMeses(fecha, meses) {
  const totalMeses = fecha.getMonth() + meses
  const anio = fecha.getFullYear() + Math.floor(totalMeses / 12)
  const mes = ((totalMeses % 12) + 12) % 12
  const ultimoDia = new Date(anio, mes + 1, 0).getDate()
  return new Date(anio, mes, Math.min(fecha.getDate(), ultimoDia))
}

/** Ajusta una fecha al día de vencimiento configurado, con clamp de fin de mes. */
export function normalizarADiaVencimiento(fecha, diaVencimiento) {
  const ultimoDia = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0).getDate()
  return fechaLocal(
    fecha.getFullYear(), fecha.getMonth() + 1, Math.min(diaVencimiento, ultimoDia)
  )
}

/** ¿`fecha` cae dentro del mismo mes calendario que `referencia`? */
function mismoMes(fecha, referencia) {
  return (
    fecha.getFullYear() === referencia.getFullYear() &&
    fecha.getMonth() === referencia.getMonth()
  )
}

// ─── Motor de estado financiero ──────────────────────────────────────────────

/**
 * ¿El socio está en su mes de ingreso Y esa primera cuota sigue impaga?
 *
 * La gracia de D1 existe para no recibirlo con un cartel de "moroso" el mismo
 * día que se asoció; apenas paga esa cuota se apaga sola, porque si no la
 * pantalla le sigue ofreciendo "Pagar mi primera cuota" a alguien que ya pagó
 * (síntomas 7.4 y 7.6 de la QA del 11-09).
 *
 * "Pagado" = la cobertura llega al vencimiento del mes de ingreso o más allá.
 * `mes_cubierto_hasta` es el vencimiento del ÚLTIMO mes cubierto, así que la
 * comparación es >=, no >.
 */
export function mesDeIngresoPendiente(mesCubiertoHasta, fechaIngreso, diaVencimiento = 10, hoy = null) {
  if (!fechaIngreso) return false
  const ahora = hoy ?? hoyLocal()
  if (!mismoMes(fechaIngreso, ahora)) return false
  if (!mesCubiertoHasta) return true
  return mesCubiertoHasta < normalizarADiaVencimiento(fechaIngreso, diaVencimiento)
}

/**
 * Fuente única de verdad del estado financiero de un socio.
 * Tiene que dar EXACTAMENTE lo mismo que calcular_estado_financiero() del
 * backend (utils/cuotas_periodos.py).
 *
 * Reglas:
 *   · Mes de ingreso impago → al día, con la bandera `enMesIngreso`. La deuda
 *     NO se condona: sigue viva en mes_cubierto_hasta y aparece sola cuando el
 *     mes termina.
 *   · fechaBase = mes_cubierto_hasta si no es nulo (sin importar si quedó en
 *     el pasado). Si es nulo, fecha_ingreso normalizada al día de vencimiento.
 *   · hoy <= fechaBase → al día.
 *   · hoy > fechaBase → se cuentan SOLO los períodos YA vencidos (vencimiento
 *     estrictamente anterior a hoy). El mes en curso no suma hasta el día
 *     siguiente a su vencimiento: si vence el 10, el 10 todavía está en plazo
 *     y recién el 11 pasa a adeudado (BUG-04).
 *
 * @returns {{moroso: boolean, mesesAdeudados: number, enMesIngreso: boolean}}
 */
export function calcularEstadoFinanciero(mesCubiertoHastaISO, fechaIngresoISO, diaVencimiento = 10) {
  const hoy = hoyLocal()
  const ingreso = parsearISO(fechaIngresoISO)
  const mesCubiertoHasta = parsearISO(mesCubiertoHastaISO)

  if (mesDeIngresoPendiente(mesCubiertoHasta, ingreso, diaVencimiento, hoy)) {
    return { moroso: false, mesesAdeudados: 0, enMesIngreso: true }
  }

  let fechaBase = mesCubiertoHasta
  if (!fechaBase && ingreso) fechaBase = normalizarADiaVencimiento(ingreso, diaVencimiento)

  // Defensivo: sin mes_cubierto_hasta ni fecha_ingreso no hay nada que evaluar.
  if (!fechaBase) return { moroso: false, mesesAdeudados: 0, enMesIngreso: false }

  if (hoy <= fechaBase) return { moroso: false, mesesAdeudados: 0, enMesIngreso: false }

  let periodosHastaHoy =
    (hoy.getFullYear() - fechaBase.getFullYear()) * 12 +
    (hoy.getMonth() - fechaBase.getMonth())
  if (hoy.getDate() > fechaBase.getDate()) periodosHastaHoy += 1

  let mesesAdeudados = 0
  for (let i = 1; i <= periodosHastaHoy; i++) {
    if (sumarMeses(fechaBase, i) < hoy) mesesAdeudados += 1
  }

  return { moroso: mesesAdeudados > 0, mesesAdeudados, enMesIngreso: false }
}

/**
 * Las fechas de vencimiento de cada período adeudado (para mostrar CUÁLES
 * meses debe, no solo cuántos). Mismo criterio que calcularEstadoFinanciero.
 */
export function listarMesesAdeudados(mesCubiertoHastaISO, fechaIngresoISO, diaVencimiento = 10) {
  const { moroso, mesesAdeudados } = calcularEstadoFinanciero(
    mesCubiertoHastaISO, fechaIngresoISO, diaVencimiento
  )
  if (!moroso) return []

  let fechaBase = parsearISO(mesCubiertoHastaISO)
  if (!fechaBase) {
    const ingreso = parsearISO(fechaIngresoISO)
    if (!ingreso) return []
    fechaBase = normalizarADiaVencimiento(ingreso, diaVencimiento)
  }

  const periodos = []
  for (let i = 1; i <= mesesAdeudados; i++) periodos.push(sumarMeses(fechaBase, i))
  return periodos
}

// ─── Motor de estado de un mes puntual (calendario de /socio/cuotas) ─────────

/**
 * Estado de un mes del calendario. La "fecha representativa" del mes es el
 * día de vencimiento dentro de ese mes — exactamente el valor que el backend
 * guarda en mes_cubierto_hasta, así que la comparación es simétrica.
 *
 * @returns {'inactivo'|'mes_ingreso'|'pagado'|'adeudado'|'a_vencer'|'futuro'|'becado'}
 *
 * Orden de prioridad:
 *   1. inactivo    — el mes es ANTERIOR al mes de alta (no era socio todavía)
 *   2. mes_ingreso — es el mes de alta, es el mes en curso y sigue impago
 *   3. pagado      — la cobertura llega a ese mes
 *   4. becado      — beca activa cubriendo el período
 *   5. adeudado    — venció sin pagar
 *   6. a_vencer    — es el mes en curso y todavía no llegó el día de vencimiento
 *   7. futuro      — mes por venir sin cobertura
 *
 * Dos cortes que la QA del 11-09 encontró mal (síntomas 7.3, 7.6 y 7.8):
 *
 *   · 'inactivo' se decidía comparando la fecha representativa contra la fecha
 *     de alta: un socio que se asoció el 11 con vencimiento el 10 tenía su
 *     propio mes de ingreso marcado como "Inactivo / No era socio", porque el
 *     10 cae antes del 11. Ahora la comparación es por MES, no por día.
 *
 *   · 'pagado' usaba `fechaRep < mesCubiertoHasta` (estricto). Como
 *     mes_cubierto_hasta ES el vencimiento del último mes cubierto, el mes
 *     recién pagado nunca entraba: pagar la cuota de septiembre dejaba
 *     septiembre sin pintar de verde. Ahora es <=.
 */
export function estadoDeMes(anio, mes1based, diaVencimiento, fechaIngreso, mesCubiertoHasta, becadoHasta = null) {
  const ultimoDia = new Date(anio, mes1based, 0).getDate()
  const dia = Math.min(diaVencimiento, ultimoDia)
  const fechaRep = fechaLocal(anio, mes1based, dia)
  const hoy = hoyLocal()

  const esMesEnCurso = anio === hoy.getFullYear() && mes1based === hoy.getMonth() + 1
  const estaCubierto = !!mesCubiertoHasta && fechaRep <= mesCubiertoHasta

  // Regla 1: meses anteriores al de alta — comparación por mes, no por día.
  if (fechaIngreso) {
    const anteriorAlAlta =
      anio < fechaIngreso.getFullYear() ||
      (anio === fechaIngreso.getFullYear() && mes1based < fechaIngreso.getMonth() + 1)
    if (anteriorAlAlta) return 'inactivo'
  }

  // Regla 2: mes de ingreso EN CURSO y todavía impago (decisión D1). Va antes
  // que 'adeudado' porque su vencimiento puede haber pasado ya (alguien que se
  // asocia el 20 y la cuota vence el 10): durante su mes de alta el socio se ve
  // al día, y la deuda de ese mes aparece recién cuando el mes termina.
  if (
    fechaIngreso &&
    anio === fechaIngreso.getFullYear() &&
    mes1based === fechaIngreso.getMonth() + 1 &&
    esMesEnCurso &&
    !estaCubierto
  ) return 'mes_ingreso'

  // Regla 3: pagado
  if (estaCubierto) return 'pagado'

  // Regla 4: becado — los meses cubiertos por una beca activa.
  if (becadoHasta !== null) {
    const esBecado = becadoHasta === 'indefinida' ? fechaRep >= hoy : fechaRep <= becadoHasta
    if (esBecado) return 'becado'
  }

  // Regla 5: adeudado. Estricto (<, no <=): el día del vencimiento el socio
  // todavía está en plazo, así que ese día sigue siendo 'a_vencer'. Mismo
  // corte que usa el contador del header y el backend (BUG-04).
  if (fechaRep < hoy) return 'adeudado'

  // Regla 6: el mes en curso, que vence en unos días — no es "futuro".
  if (esMesEnCurso) return 'a_vencer'

  return 'futuro'
}
