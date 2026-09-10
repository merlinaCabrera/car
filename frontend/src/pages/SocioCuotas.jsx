// frontend/src/pages/SocioCuotas.jsx
import { textoError } from '../utils/errores';
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { resolverUrlArchivo } from '../utils/archivos'
import { useCart } from '../context/CartContext'
import ConfirmDialog from '../components/ConfirmDialog'
import {
  Wallet,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  Loader2,
  X,
  CalendarClock,
  Clock,
  UploadCloud,
  CheckCircle,
  Info,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  ShoppingCart,
  Plus,
  Minus,
  ChevronLeft,
  ChevronRight,
  Lock,
  Gift,
  UserPlus,
  XCircle,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const formatoMoneda = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

const formatoFecha = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
})

const NOMBRES_MES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

// ─── Helpers de fecha (sin UTC offset) ───────────────────────────────────────

/**
 * Construye un Date en tiempo local desde partes individuales.
 * Evita el desfase UTC que produce `new Date("YYYY-MM-DD")` en zonas negativas
 * como America/Argentina/Buenos_Aires (UTC-3).
 */
function fechaLocal(anio, mes1based, dia) {
  return new Date(anio, mes1based - 1, dia)
}

/**
 * Parsea una ISO Date string "YYYY-MM-DD" a Date local.
 * Si es null/undefined devuelve null.
 */
function parsearISO(isoDate) {
  if (!isoDate) return null
  const partes = String(isoDate).split('-').map(Number)
  if (partes.length !== 3 || partes.some(Number.isNaN)) return null
  return fechaLocal(partes[0], partes[1], partes[2])
}

/**
 * Formatea una ISO Date string a texto legible en español.
 * Ej: "2026-07-10" → "10 de julio de 2026"
 */
function formatearFechaCobertura(isoDate) {
  const d = parsearISO(isoDate)
  if (!d) return null
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * Fuente única de verdad para el estado financiero del socio (moroso / al día
 * / meses adeudados). Reemplaza a los viejos `esMoroso` y
 * `calcularMesesAdeudadosReal`, que marcaban como moroso a cualquier socio
 * sin `mes_cubierto_hasta` (ej. recién ingresado) desde el día 1 del mes,
 * sin respetar el día de vencimiento configurado — un socio nuevo o que debe
 * el mes en curso NO es moroso hasta que pase el día de vencimiento.
 *
 * Reglas de negocio:
 *   · fechaBase = mes_cubierto_hasta si no es nulo (SIN importar si está en
 *     el pasado o en el futuro).
 *   · Si mes_cubierto_hasta es nulo, fechaBase = fecha_ingreso normalizada al
 *     día de vencimiento (con clamp al último día del mes, ej. para meses
 *     cortos como febrero).
 *   · hoy <= fechaBase  → { moroso: false, mesesAdeudados: 0 }
 *   · hoy >  fechaBase  → se cuentan SOLO los períodos ya vencidos, o sea
 *     aquellos cuyo vencimiento es estrictamente anterior a hoy. El mes en
 *     curso no suma hasta el día siguiente a su vencimiento.
 *
 * Este número es el que se muestra en el header ("N meses adeudados · $X") y
 * tiene que coincidir con lo que pinta el calendario de abajo y con
 * utils/cuotas_periodos.py en el backend. Antes no coincidía: el header sumaba
 * el mes en curso desde el día 1 y el calendario ya lo mostraba como "a
 * vencer", así que la misma pantalla decía 7 meses arriba y 6 en rojo abajo
 * (BUG-04, ronda 2 de la QA).
 */
function calcularEstadoFinanciero(mesCubiertoHastaISO, fechaIngresoISO, diaVencimiento = 10) {
  let fechaBase = parsearISO(mesCubiertoHastaISO)

  if (!fechaBase) {
    const ingreso = parsearISO(fechaIngresoISO)
    if (ingreso) {
      const ultimoDiaMes = new Date(ingreso.getFullYear(), ingreso.getMonth() + 1, 0).getDate()
      const diaClamp = Math.min(diaVencimiento, ultimoDiaMes)
      fechaBase = fechaLocal(ingreso.getFullYear(), ingreso.getMonth() + 1, diaClamp)
    }
  }

  // Defensivo: sin mes_cubierto_hasta ni fecha_ingreso no hay nada que evaluar.
  if (!fechaBase) return { moroso: false, mesesAdeudados: 0 }

  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

  // Gracia por MES DE INGRESO (decisión D1): un socio que se asoció este mes
  // se muestra al día. La deuda de ese mes existe (está en mes_cubierto_hasta)
  // y aparece sola cuando el mes termina — no se condona. Mismo criterio que
  // en_mes_de_ingreso() en utils/cuotas_periodos.py.
  const ingresoParaGracia = parsearISO(fechaIngresoISO)
  if (
    ingresoParaGracia &&
    ingresoParaGracia.getFullYear() === hoy.getFullYear() &&
    ingresoParaGracia.getMonth() === hoy.getMonth()
  ) return { moroso: false, mesesAdeudados: 0, enMesIngreso: true }

  if (hoy <= fechaBase) return { moroso: false, mesesAdeudados: 0 }

  let periodosHastaHoy =
    (hoy.getFullYear() - fechaBase.getFullYear()) * 12 +
    (hoy.getMonth() - fechaBase.getMonth())

  if (hoy.getDate() > fechaBase.getDate()) {
    periodosHastaHoy += 1
  }

  // Solo los ya vencidos cuentan como deuda.
  let mesesAdeudados = 0
  for (let i = 1; i <= periodosHastaHoy; i++) {
    if (sumarMesesCuota(fechaBase, i) < hoy) mesesAdeudados += 1
  }

  return { moroso: mesesAdeudados > 0, mesesAdeudados }
}

/** Suma meses enteros a una fecha, con clamp de fin de mes. */
function sumarMesesCuota(fecha, meses) {
  const totalMeses = fecha.getMonth() + meses
  const anio = fecha.getFullYear() + Math.floor(totalMeses / 12)
  const mes = ((totalMeses % 12) + 12) % 12
  const ultimoDia = new Date(anio, mes + 1, 0).getDate()
  return new Date(anio, mes, Math.min(fecha.getDate(), ultimoDia))
}

// ─── Motor de estado de mes para el Calendario ───────────────────────────────

/**
 * Evalúa el estado de un mes dado (anio, mes1based) contra las 3 variables
 * clave del motor de cuotas.
 *
 * La "fecha representativa" del mes es el dia_vencimiento_cuota dentro de ese
 * mes. Eso es exactamente lo que el backend usa para calcular mes_cubierto_hasta,
 * así que la comparación es perfectamente simétrica.
 *
 * @returns {'inactivo'|'mes_ingreso'|'pagado'|'adeudado'|'a_vencer'|'futuro'|'becado'}
 *
 * Reglas (en orden de prioridad):
 *   1. inactivo  — fechaRep < fechaIngreso           (no era socio aún)
 *   2. pagado    — fechaRep < mesCubiertoHasta        (cuota saldada)
 *   3. adeudado  — fechaRep <  hoy  (mes ya venció sin pagar)
 *   4. a_vencer  — es el mes EN CURSO y todavía no llegó el día de vencimiento
 *   5. futuro    — fechaRep > hoy   (mes por venir, sin cobertura)
 *
 * Sobre 'a_vencer': antes el mes en curso sin cobertura caía en 'futuro' hasta
 * que pasaba el día 10, y en la pantalla se leía literalmente "Futuro" al lado
 * de meses en rojo — parecía que el sistema no contaba un mes que el socio
 * claramente debe (BUG-04 de la QA del 08-09). La plata NO cambia: ese mes
 * sigue sin sumar a la deuda hasta que vence, igual que en el backend. Lo que
 * cambia es que ahora se muestra como "Vence el 10" en vez de "Futuro".
 */
function estadoDeMes(anio, mes1based, diaVencimiento, fechaIngreso, mesCubiertoHasta, becadoHasta = null) {
  // Clamp del día al último día del mes para robustez
  const ultimoDia = new Date(anio, mes1based, 0).getDate()
  const dia = Math.min(diaVencimiento, ultimoDia)
  const fechaRep = fechaLocal(anio, mes1based, dia)

  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

  // Regla 1: inactivo
  if (fechaIngreso && fechaRep < fechaIngreso) return 'inactivo'

  // Regla 1b: mes de ingreso EN CURSO (decisión D1). Va antes que 'adeudado'
  // porque su vencimiento puede haber pasado ya (alguien que se asocia el 20 y
  // la cuota vence el 10): durante su mes de alta el socio se ve al día, y la
  // deuda de ese mes aparece recién cuando el mes termina.
  if (
    fechaIngreso &&
    fechaIngreso.getFullYear() === anio &&
    fechaIngreso.getMonth() + 1 === mes1based &&
    hoy.getFullYear() === anio &&
    hoy.getMonth() + 1 === mes1based &&
    !(mesCubiertoHasta && fechaRep < mesCubiertoHasta)
  ) return 'mes_ingreso'

  // Regla 2: pagado
  if (mesCubiertoHasta && fechaRep < mesCubiertoHasta) return 'pagado'

  // Regla 3: becado
  // Si hay beca activa, los meses desde mes_cubierto_hasta hasta becado_hasta
  // (o hasta el futuro si beca indefinida) se marcan como 'becado'.
  if (becadoHasta !== null) {
    // becadoHasta = Date o 'indefinida'
    const esBecado = becadoHasta === 'indefinida' ? fechaRep >= hoy : fechaRep <= becadoHasta
    if (esBecado && fechaRep >= hoy) return 'becado'
    // Meses pasados sin pago pero cubiertos por beca activa: también becado
    if (esBecado && fechaRep <= hoy) return 'becado'
  }

  // Regla 4: adeudado (venció sin pagar y sin beca).
  // Estricto (<, no <=): el día del vencimiento el socio todavía está en
  // plazo, así que ese día el mes sigue siendo 'a_vencer' y recién al
  // siguiente pasa a 'adeudado'. Es el mismo corte que usa el contador del
  // header y el backend — con <= el calendario marcaba rojo un día antes que
  // el resto del sistema.
  if (fechaRep < hoy) return 'adeudado'

  // Regla 5: el mes en curso, que vence en unos días — no es "futuro"
  if (anio === hoy.getFullYear() && mes1based === hoy.getMonth() + 1) return 'a_vencer'

  // Regla 6: futuro
  return 'futuro'
}

// ─── Componente: celda de mes en el calendario ───────────────────────────────

const ESTADO_CONFIG = {
  inactivo: {
    card: 'bg-gray-50 border-gray-200 opacity-60',
    label: 'text-gray-400',
    dot: 'bg-gray-300',
    texto: 'Inactivo',
    textoClase: 'text-gray-400',
  },
  pagado: {
    card: 'bg-green-50 border-green-200',
    label: 'text-green-900',
    dot: 'bg-green-500',
    texto: 'Pagado',
    textoClase: 'text-green-700',
  },
  adeudado: {
    card: 'bg-red-50 border-red-200',
    label: 'text-red-900',
    dot: 'bg-red-500',
    texto: 'Adeudado',
    textoClase: 'text-red-600',
  },
  a_vencer: {
    card: 'bg-amber-50 border-amber-200',
    label: 'text-amber-900',
    dot: 'bg-amber-400',
    texto: 'Vence este mes',
    textoClase: 'text-amber-700',
  },
  futuro: {
    card: 'bg-white border-gray-200',
    label: 'text-gray-500',
    dot: 'bg-blue-200',
    texto: 'Futuro',
    textoClase: 'text-blue-400',
  },
  becado: {
    card: 'bg-teal-50 border-teal-300',
    label: 'text-teal-900',
    dot: 'bg-teal-400',
    texto: 'Becado',
    textoClase: 'text-teal-700',
  },
  // Mes en que el socio se dio de alta (decisión D1). Se muestra aparte a
  // propósito: NO es 'pagado' —esa cuota se debe y se cobra— pero tampoco
  // 'adeudado', porque durante ese mes el socio figura al día. Antes caía en
  // 'pagado' y el mes de ingreso quedaba saldado gratis.
  mes_ingreso: {
    card: 'bg-indigo-50 border-indigo-200',
    label: 'text-indigo-900',
    dot: 'bg-indigo-400',
    texto: 'Mes de ingreso',
    textoClase: 'text-indigo-700',
  },
}

// ─── Config visual del historial de pagos de cuota ───────────────────────────
// El historial incluye los intentos que NO prosperaron (rechazado, expirado,
// cancelado). Se muestran para que el socio pueda volver a ver qué pasó con un
// pago después de que la notificación se pierde — antes desaparecían del todo
// (BUG-06 de la QA del 08-09).

const HISTORIAL_ESTADO_CONFIG = {
  aprobada: {
    label: 'Pagado',
    icon: Receipt,
    iconWrap: 'bg-green-50 text-green-600',
    badge: 'bg-green-100 text-green-700',
  },
  rechazada: {
    label: 'Rechazado',
    icon: XCircle,
    iconWrap: 'bg-red-50 text-red-500',
    badge: 'bg-red-100 text-red-700',
  },
  expirada: {
    label: 'Expirado',
    icon: Clock,
    iconWrap: 'bg-gray-100 text-gray-400',
    badge: 'bg-gray-100 text-gray-600',
  },
  cancelada_socio: {
    label: 'Cancelado',
    icon: XCircle,
    iconWrap: 'bg-gray-100 text-gray-400',
    badge: 'bg-gray-100 text-gray-600',
  },
}

function CeldaMes({ nombreMes, estado, esHoy, diaVencimiento }) {
  const cfg = ESTADO_CONFIG[estado] ?? ESTADO_CONFIG.futuro
  const texto = estado === 'a_vencer' && diaVencimiento
    ? `Vence el ${diaVencimiento}`
    : cfg.texto

  return (
    <div
      className={`
        relative rounded-xl border p-3 flex flex-col items-center gap-1.5
        transition-all duration-150 select-none
        ${cfg.card}
        ${esHoy ? 'ring-2 ring-blue-400 ring-offset-1' : ''}
      `}
    >
      {/* Indicador de mes actual */}
      {esHoy && (
        <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500 text-white whitespace-nowrap leading-none">
          Hoy
        </span>
      )}

      {/* Ícono de estado */}
      <div className="mt-1">
        {estado === 'inactivo' && <Lock size={14} className="text-gray-400" />}
        {estado === 'pagado'   && <CheckCircle2 size={14} className="text-green-600" />}
        {estado === 'adeudado' && <AlertTriangle size={14} className="text-red-500" />}
        {estado === 'a_vencer' && <CalendarClock size={14} className="text-amber-600" />}
        {estado === 'futuro'   && <div className="w-3 h-3 rounded-full border-2 border-blue-300" />}
        {estado === 'becado'   && <Gift size={14} className="text-teal-600" />}
        {estado === 'mes_ingreso' && <UserPlus size={14} className="text-indigo-600" />}
      </div>

      {/* Nombre del mes */}
      <p className={`text-xs font-bold leading-tight text-center ${cfg.label}`}>
        {nombreMes}
      </p>

      {/* Badge de estado */}
      <span className={`text-[10px] font-semibold leading-none ${cfg.textoClase}`}>
        {texto}
      </span>
    </div>
  )
}

// ─── Componente: Calendario Anual ─────────────────────────────────────────────

/**
 * Muestra una grilla de 12 meses para el año navegado.
 *
 * Props:
 *   estado   Objeto completo de EstadoCuotaSocioResponse (incluye fecha_ingreso,
 *            mes_cubierto_hasta y dia_vencimiento_cuota).
 */
function CalendarioAnual({ estado }) {
  const anioHoy = new Date().getFullYear()
  const mesHoy  = new Date().getMonth() + 1  // 1-based

  const [anioVisto, setAnioVisto] = useState(anioHoy)

  const fechaIngreso      = useMemo(() => parsearISO(estado.fecha_ingreso),       [estado.fecha_ingreso])
  const mesCubiertoHasta  = useMemo(() => parsearISO(estado.mes_cubierto_hasta),  [estado.mes_cubierto_hasta])
  const diaVenc           = estado.dia_vencimiento_cuota ?? 10

  // Límites de navegación: no permitir ir más atrás del año de ingreso.
  const anioMin = fechaIngreso ? fechaIngreso.getFullYear() : anioHoy - 5

  // El año máximo es el más lejano entre el año siguiente y el año de cobertura.
  // Esto permite al socio navegar para ver sus cuotas pagadas por adelantado.
  const anioMax = useMemo(() => {
    const anioSiguiente = anioHoy + 1
    if (mesCubiertoHasta) {
      return Math.max(anioSiguiente, mesCubiertoHasta.getFullYear())
    }
    return anioSiguiente
  }, [anioHoy, mesCubiertoHasta])

  // Calcular el límite de beca para pasarlo al motor de meses
  const becadoHastaDate = useMemo(() => {
    if (!estado.es_becado) return null
    if (!estado.becado_hasta) return 'indefinida'
    return parsearISO(estado.becado_hasta)
  }, [estado.es_becado, estado.becado_hasta])

  const meses = useMemo(() => {
    return NOMBRES_MES.map((nombre, idx) => {
      const mes1based = idx + 1
      const estado_mes = estadoDeMes(
        anioVisto, mes1based, diaVenc, fechaIngreso, mesCubiertoHasta, becadoHastaDate
      )
      const esHoy = anioVisto === anioHoy && mes1based === mesHoy
      return { nombre, estado: estado_mes, esHoy }
    })
  }, [anioVisto, diaVenc, fechaIngreso, mesCubiertoHasta, becadoHastaDate, anioHoy, mesHoy])

  // Resumen del año visible
  const resumen = useMemo(() => {
    const conteo = { pagado: 0, adeudado: 0, a_vencer: 0, futuro: 0, inactivo: 0, becado: 0, mes_ingreso: 0 }
    meses.forEach(m => { conteo[m.estado]++ })
    return conteo
  }, [meses])

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header del calendario */}
      <div className="px-4 sm:px-5 pt-4 sm:pt-5 pb-4 border-b border-gray-100">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <CalendarClock size={17} className="text-gray-400 flex-shrink-0" />
              Calendario de Cuotas
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Día de vencimiento: <strong className="text-gray-600">{diaVenc}</strong> de cada mes
            </p>
          </div>

          {/* Navegación de año */}
          <div className="flex items-center justify-between sm:justify-end gap-1 flex-shrink-0">
            <button
              onClick={() => setAnioVisto(a => Math.max(anioMin, a - 1))}
              disabled={anioVisto <= anioMin}
              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition-colors flex-shrink-0"
              aria-label="Año anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-lg font-bold text-gray-900 w-14 text-center tabular-nums">
              {anioVisto}
            </span>
            <button
              onClick={() => setAnioVisto(a => Math.min(anioMax, a + 1))}
              disabled={anioVisto >= anioMax}
              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition-colors flex-shrink-0"
              aria-label="Año siguiente"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Resumen de estados del año */}
        <div className="flex flex-wrap gap-2 sm:gap-3 mt-3">
          {resumen.pagado > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700">
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
              {resumen.pagado} pagado{resumen.pagado !== 1 ? 's' : ''}
            </span>
          )}
          {resumen.adeudado > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600">
              <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
              {resumen.adeudado} adeudado{resumen.adeudado !== 1 ? 's' : ''}
            </span>
          )}
          {resumen.becado > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700">
              <span className="w-2 h-2 rounded-full bg-teal-400 inline-block" />
              {resumen.becado} becado{resumen.becado !== 1 ? 's' : ''}
            </span>
          )}
          {resumen.a_vencer > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700">
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
              vence este mes
            </span>
          )}
          {resumen.mes_ingreso > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700">
              <span className="w-2 h-2 rounded-full bg-indigo-400 inline-block" />
              mes de ingreso
            </span>
          )}
          {resumen.futuro > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-500">
              <span className="w-2 h-2 rounded-full bg-blue-300 inline-block" />
              {resumen.futuro} por vencer
            </span>
          )}
          {resumen.inactivo > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400">
              <Lock size={10} />
              {resumen.inactivo} sin actividad
            </span>
          )}
        </div>
      </div>

      {/* Grilla de 12 meses */}
      <div className="p-3 sm:p-4 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
        {meses.map(({ nombre, estado: estadoMes, esHoy }) => (
          <CeldaMes
            key={nombre}
            nombreMes={nombre}
            estado={estadoMes}
            esHoy={esHoy}
            diaVencimiento={diaVenc}
          />
        ))}
      </div>

      {/* Leyenda */}
      <div className="px-4 sm:px-5 pb-4 flex flex-wrap gap-x-4 gap-y-1.5">
        {[
          { estado: 'pagado',   label: 'Pagado' },
          { estado: 'adeudado', label: 'Adeudado' },
          { estado: 'a_vencer', label: 'Vence este mes' },
          { estado: 'mes_ingreso', label: 'Mes de ingreso' },
          { estado: 'futuro',   label: 'Futuro' },
          { estado: 'becado',   label: 'Becado' },
          { estado: 'inactivo', label: 'No era socio' },
        ].map(({ estado: e, label }) => {
          const cfg = ESTADO_CONFIG[e]
          return (
            <span key={e} className="inline-flex items-center gap-1.5 text-xs text-gray-500">
              <span className={`w-2 h-2 rounded-full inline-block ${cfg.dot}`} />
              {label}
            </span>
          )
        })}
      </div>
    </div>
  )
}

// ─── Modal: subir / cambiar comprobante ───────────────────────────────────────

function OrdenGeneradaModal({ orden, onClose, token }) {
  const [file, setFile] = useState(null)
  const [isUploading, setIsUploading] = useState(false)
  const [apiError, setApiError] = useState(null)
  const [success, setSuccess] = useState(false)

  const handleFileChange = (e) => {
    const f = e.target.files[0]
    if (f) { setFile(f); setApiError(null) }
  }

  const handleUpload = async () => {
    if (!file) { setApiError('Por favor, seleccioná un archivo.'); return }
    setIsUploading(true)
    setApiError(null)
    setSuccess(false)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch(`${API}/socio/cuotas/pagos/${orden.id_pago}/comprobante`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(textoError(err?.detail, 'Error al subir el comprobante.'))
      }
      setSuccess(true)
      setTimeout(() => onClose(), 2000)
    } catch (err) {
      setApiError(err.message)
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center items-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[92dvh]">
        <div className="p-5 sm:p-6 border-b flex-shrink-0 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Transferencia Bancaria</h2>
            <p className="text-sm text-gray-500 mt-1">Pago #{orden.id_pago} (Orden #{orden.id_orden})</p>
          </div>
          <button onClick={onClose} disabled={isUploading} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {apiError && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
              <span>{apiError}</span>
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm font-medium">
              <CheckCircle size={15} />
              <span>¡Comprobante subido con éxito!</span>
            </div>
          )}

          <div className="text-center p-4 rounded-xl bg-blue-50 border border-blue-200">
            <p className="text-sm font-semibold text-blue-900">Total a Pagar</p>
            <p className="text-3xl font-bold text-blue-900 mt-1">{formatoMoneda.format(orden.monto_total)}</p>
          </div>

          <p className="text-sm text-gray-600 text-center">
            Transferí al alias <strong>CLUB.ROBERTS</strong> y subí el comprobante para que podamos verificar tu pago.
          </p>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Adjuntar comprobante
            </label>
            <div className="mt-1.5">
              <label className={`relative flex justify-center w-full px-6 py-8 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${file ? 'border-green-300 bg-green-50' : 'border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50'}`}>
                <div className="text-center">
                  <UploadCloud className={`mx-auto h-10 w-10 ${file ? 'text-green-500' : 'text-gray-400'}`} />
                  <span className={`mt-2 block text-sm font-semibold ${file ? 'text-green-800' : 'text-gray-600'}`}>
                    {file ? file.name : 'Seleccionar archivo'}
                  </span>
                  <span className="mt-1 block text-xs text-gray-500">PNG, JPG, PDF (Máx. 10MB)</span>
                </div>
                <input type="file" className="sr-only" accept="image/*,.pdf" onChange={handleFileChange} disabled={isUploading || success} />
              </label>
            </div>
          </div>
        </div>

        <div className="p-4 bg-gray-50 rounded-b-2xl border-t flex justify-end gap-3 flex-shrink-0">
          <button type="button" onClick={onClose} disabled={isUploading} className="px-4 py-2 rounded-lg text-gray-600 bg-gray-200 hover:bg-gray-300 font-semibold transition-colors">
            Cerrar
          </button>
          <button type="button" onClick={handleUpload} disabled={!file || isUploading || success} className="px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700 font-semibold disabled:opacity-50 transition-colors flex items-center gap-2">
            {isUploading && <Loader2 size={14} className="animate-spin" />}
            {isUploading ? 'Subiendo…' : 'Subir Comprobante'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal: elegir meses y agregar al carrito ─────────────────────────────────

function SeleccionMesesModal({ precioCuota, idProducto, onClose }) {
  const { addToCart } = useCart()
  const [meses, setMeses] = useState(1)
  const [agregado, setAgregado] = useState(false)

  const decrementar = () => setMeses(m => Math.max(1, m - 1))
  const incrementar = () => setMeses(m => Math.min(24, m + 1))

  const handleInputChange = (e) => {
    const val = parseInt(e.target.value, 10)
    if (!isNaN(val)) setMeses(Math.min(24, Math.max(1, val)))
  }

  const handleAgregarAlCarrito = () => {
    addToCart({
      id: idProducto,
      name: `Cuota social × ${meses} mes${meses !== 1 ? 'es' : ''}`,
      price: precioCuota,
      qty: meses,
      categoria: 'cuota_social',
    })
    setAgregado(true)
    setTimeout(() => onClose(), 1500)
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center items-center p-4"
      onClick={e => { if (e.target === e.currentTarget && !agregado) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm flex flex-col">
        <div className="p-5 sm:p-6 border-b flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800">Pagar Cuotas</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-5">
          {agregado ? (
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <div className="p-3 rounded-full bg-green-100 text-green-600">
                <CheckCircle size={28} />
              </div>
              <p className="font-semibold text-gray-800">¡Agregado al carrito!</p>
              <p className="text-sm text-gray-500">Podés seguir comprando o ir al carrito para finalizar.</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-500 text-center">
                Elegí cuántos meses querés abonar y finalizá la compra desde el carrito.
              </p>

              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={decrementar}
                  disabled={meses <= 1}
                  className="w-10 h-10 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-700 disabled:opacity-40 transition-colors flex-shrink-0"
                >
                  <Minus size={16} />
                </button>

                <div className="text-center w-28">
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={meses}
                    onChange={handleInputChange}
                    className="w-full text-center text-3xl font-bold text-gray-900 bg-transparent border-0 outline-none focus:ring-0 p-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <p className="text-xs text-gray-400 -mt-1">{meses === 1 ? 'mes' : 'meses'}</p>
                </div>

                <button
                  onClick={incrementar}
                  disabled={meses >= 24}
                  className="w-10 h-10 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-700 disabled:opacity-40 transition-colors flex-shrink-0"
                >
                  <Plus size={16} />
                </button>
              </div>

              <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-blue-50 border border-blue-200">
                <div>
                  <p className="text-xs text-blue-700 font-medium">
                    {formatoMoneda.format(precioCuota)} × {meses} mes{meses !== 1 ? 'es' : ''}
                  </p>
                  <p className="text-sm font-semibold text-blue-900">Total</p>
                </div>
                <span className="text-xl font-bold text-blue-900">
                  {formatoMoneda.format(precioCuota * meses)}
                </span>
              </div>
            </>
          )}
        </div>

        {!agregado && (
          <div className="p-4 bg-gray-50 rounded-b-2xl border-t flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-gray-600 bg-gray-200 hover:bg-gray-300 font-semibold transition-colors text-sm"
            >
              Cancelar
            </button>
            <button
              onClick={handleAgregarAlCarrito}
              className="px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700 font-semibold transition-colors text-sm flex items-center gap-2"
            >
              <ShoppingCart size={15} />
              Agregar al carrito
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Tarjeta de Estado de Cuenta ──────────────────────────────────────────────

function EstadoCard({ estado, loading, error, ordenPendiente, onAbrirCarrito }) {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 animate-pulse space-y-3">
        <div className="h-5 w-32 bg-gray-200 rounded-full" />
        <div className="h-7 w-56 bg-gray-200 rounded-md" />
        <div className="h-4 w-44 bg-gray-200 rounded-md" />
        <div className="h-3 w-52 bg-gray-100 rounded-md" />
      </div>
    )
  }

  if (error || !estado) return null

  // Bypass: si es becado, el estado siempre es "al día" independientemente de mes_cubierto_hasta
  if (estado.es_becado) {
    return (
      <div className="rounded-2xl shadow-sm border p-4 sm:p-6 bg-teal-50 border-teal-200 flex items-center gap-3 sm:gap-4">
        <div className="p-2.5 sm:p-3 rounded-xl flex-shrink-0 bg-teal-100 text-teal-700">
          <ShieldCheck size={22} />
        </div>
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Estado de Cuenta</p>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-teal-100 text-teal-800 border border-teal-200">
            <CheckCircle2 size={11} /> Acceso activo — Becado
          </span>
          <p className="text-sm font-medium text-teal-800 leading-snug">
            Tu membresía está cubierta por una beca. No generás deuda de cuotas.
          </p>
        </div>
      </div>
    )
  }

  const { moroso, mesesAdeudados: mesesAdeudadosReal } = calcularEstadoFinanciero(
    estado.mes_cubierto_hasta,
    estado.fecha_ingreso,
    estado.dia_vencimiento_cuota ?? 10
  )
  // Mes de ingreso (decisión D1): el socio se ve al día, pero la cuota de este
  // mes se le sigue debiendo. Se dice explícitamente para no dejarle la
  // impresión de que arrancó con un mes regalado. El backend manda el flag;
  // el cálculo local es el respaldo si la respuesta viene de una versión vieja.
  const enMesIngreso = estado.en_mes_ingreso === true
  const tieneDeuda          = mesesAdeudadosReal > 0
  const esGrave             = mesesAdeudadosReal >= 2
  const montoEstimado       = mesesAdeudadosReal * (estado.precio_cuota_actual ?? 0)
  const fechaLegible        = formatearFechaCobertura(estado.mes_cubierto_hasta)
  const diaVenc             = estado.dia_vencimiento_cuota ?? null

  // Si el socio ya generó la orden y está esperando que el admin verifique, NO
  // se le muestra un rojo de "Moroso" a secas: técnicamente sigue debiendo
  // (mes_cubierto_hasta no se mueve hasta la aprobación), pero él ya hizo su
  // parte. Sin esto la pantalla le decía "Moroso · 3 meses adeudados" después
  // de haber pagado y subido el comprobante — el reclamo clásico.
  const enVerificacion = moroso && !!ordenPendiente

  const paleta = enVerificacion
    ? { card: 'bg-blue-50 border-blue-200', icon: 'bg-blue-100 text-blue-700', label: 'text-blue-700', sub: 'text-blue-800', aux: 'text-blue-500', badge: 'bg-blue-100 text-blue-700 border border-blue-200', btn: '' }
    : moroso
    ? esGrave
      ? { card: 'bg-red-50 border-red-200',    icon: 'bg-red-100 text-red-700',    label: 'text-red-700',    sub: 'text-red-700',    aux: 'text-red-500',    badge: 'bg-red-100 text-red-700 border border-red-200',    btn: 'bg-red-600 hover:bg-red-700' }
      : { card: 'bg-amber-50 border-amber-200', icon: 'bg-amber-100 text-amber-700', label: 'text-amber-700', sub: 'text-amber-700', aux: 'text-amber-500', badge: 'bg-amber-100 text-amber-800 border border-amber-200', btn: 'bg-amber-600 hover:bg-amber-700' }
    : { card: 'bg-white border-gray-100',       icon: 'bg-green-100 text-green-700', label: 'text-gray-500',  sub: 'text-gray-600',  aux: 'text-gray-400',  badge: 'bg-green-100 text-green-700 border border-green-200',  btn: '' }

  return (
    <div className={`rounded-2xl shadow-sm border p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-5 ${paleta.card}`}>
      <div className="flex items-start gap-3 sm:gap-4">
        <div className={`p-2.5 sm:p-3 rounded-xl flex-shrink-0 mt-0.5 ${paleta.icon}`}>
          {enVerificacion ? <Clock size={22} /> : moroso ? <ShieldAlert size={22} /> : <ShieldCheck size={22} />}
        </div>

        <div className="space-y-1.5">
          <p className={`text-xs font-semibold uppercase tracking-wide ${paleta.label}`}>
            Estado de Cuenta
          </p>

          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${paleta.badge}`}>
            {enVerificacion
              ? <><Clock size={11} /> Pago en verificación</>
              : moroso
                ? <><AlertTriangle size={11} /> Moroso</>
                : enMesIngreso
                  ? <><UserPlus size={11} /> Mes de ingreso</>
                  : <><CheckCircle2 size={11} /> Acceso activo</>}
          </span>

          <p className={`text-sm font-medium leading-snug ${paleta.sub}`}>
            {enVerificacion
              ? <>Ya registramos tu pago. Un administrador lo está verificando; en cuanto lo apruebe se actualiza tu estado.</>
              : moroso
              ? tieneDeuda
                ? <>{mesesAdeudadosReal} mes{mesesAdeudadosReal !== 1 ? 'es' : ''} adeudado{mesesAdeudadosReal !== 1 ? 's' : ''}&nbsp;·&nbsp;{formatoMoneda.format(montoEstimado)}</>
                : 'Tu cobertura ha vencido.'
              : enMesIngreso
                ? <>¡Bienvenido! Este es tu mes de ingreso, así que tu acceso ya está habilitado. La cuota de este mes queda pendiente de pago y podés abonarla cuando quieras.</>
                : fechaLegible
                ? <>Tu acceso está activo hasta el <strong>{fechaLegible}</strong>.</>
                : 'Tu acceso está vigente.'}
          </p>

          {diaVenc != null && (
            <p className={`text-xs flex items-center gap-1 ${paleta.aux}`}>
              <CalendarClock size={12} className="flex-shrink-0" />
              Tu cuota vence el día <strong>{diaVenc}</strong> de cada mes.
            </p>
          )}
        </div>
      </div>

      {/* La paleta "al día" no define color de botón (ahí normalmente no hay nada
          que pagar), así que en mes de ingreso se cae a un azul neutro: sin eso
          el botón quedaba con texto blanco sobre fondo blanco. */}
      {((moroso && tieneDeuda) || enMesIngreso) && !ordenPendiente && (
        <button
          onClick={onAbrirCarrito}
          className={`w-full sm:w-auto flex justify-center items-center gap-2 px-5 py-3 rounded-xl font-bold text-white transition-colors flex-shrink-0 ${paleta.btn || 'bg-blue-600 hover:bg-blue-700'}`}
        >
          <ShoppingCart size={16} />
          {enMesIngreso && !tieneDeuda ? 'Pagar mi primera cuota' : 'Pagar cuotas'}
        </button>
      )}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function SocioCuotas() {
  const { token } = useAuth()

  const [estado, setEstado] = useState(null)
  const [historial, setHistorial] = useState([])
  const [ordenPendiente, setOrdenPendiente] = useState(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [isCanceling, setIsCanceling] = useState(false)
  const [confirmarCancelar, setConfirmarCancelar] = useState(false)
  const [errorCancelar, setErrorCancelar] = useState(null)
  const [mostrarUpload, setMostrarUpload] = useState(false)
  const [mostrarSeleccionMeses, setMostrarSeleccionMeses] = useState(false)

  const fetchData = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const [estRes, histRes, pendRes] = await Promise.all([
        fetch(`${API}/socio/cuotas/estado`,         { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/socio/cuotas/historial`,       { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/socio/cuotas/orden-pendiente`, { headers: { Authorization: `Bearer ${token}` } }),
      ])
      if (!estRes.ok || !histRes.ok || !pendRes.ok) {
        throw new Error('No se pudo cargar la información de cuotas.')
      }
      setEstado(await estRes.json())
      setHistorial(await histRes.json())
      setOrdenPendiente(await pendRes.json())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { fetchData() }, [fetchData])

  // La confirmación se pide con <ConfirmDialog>, no con el window.confirm()
  // nativo del navegador — que rompía la estética de la app y quedaba
  // inconsistente con el resto de las acciones destructivas (BUG-13 de la QA
  // del 08-09). El error también se muestra in-app en vez de con alert().
  const handleCancelarOrden = async () => {
    setIsCanceling(true)
    setErrorCancelar(null)
    try {
      const res = await fetch(`${API}/socio/cuotas/ordenes/${ordenPendiente.id_orden}/cancelar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(textoError(body?.detail, 'No se pudo cancelar la orden.'))
      }
      setConfirmarCancelar(false)
      await fetchData()
    } catch (err) {
      setErrorCancelar(err?.message || 'No se pudo cancelar la orden.')
    } finally {
      setIsCanceling(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto text-center">
        <Loader2 className="animate-spin inline-block text-gray-400 mt-10" size={32} />
      </div>
    )
  }

  // El comprobante vive en el Pago padre (pago.comprobante_url), no en la Orden.
  const comprobanteUrl = ordenPendiente?.pago?.comprobante_url ?? null

  // El método de pago cambia TODO el copy de este banner. Antes era siempre el
  // de transferencia: alguien que elegía efectivo veía "Total a transferir" y
  // "Falta subir el comprobante de transferencia", con un botón para subir algo
  // que nunca iba a tener (BUG-08 de la QA del 08-09).
  const metodoPago = ordenPendiente?.pago?.metodo_pago ?? 'transferencia'
  const esEfectivo = metodoPago === 'efectivo'

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6 sm:space-y-8">

      {/* Modal: subir/cambiar comprobante de orden pendiente */}
      {mostrarUpload && ordenPendiente && (
        <OrdenGeneradaModal
          orden={ordenPendiente}
          token={token}
          onClose={() => { setMostrarUpload(false); fetchData() }}
        />
      )}

      {/* Modal: selector de meses → carrito */}
      {mostrarSeleccionMeses && (
        <SeleccionMesesModal
          precioCuota={estado?.precio_cuota_actual ?? 0}
          idProducto={estado?.id_producto}
          onClose={() => setMostrarSeleccionMeses(false)}
        />
      )}

      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2 sm:gap-3">
          <Wallet size={22} className="text-gray-500 flex-shrink-0" />
          Gestión de Cuotas
        </h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-1">Mantené tu cuenta al día para acceder al club.</p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* Banner de Orden Pendiente */}
      {ordenPendiente && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 sm:p-6 shadow-sm space-y-4">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="p-3 rounded-xl bg-blue-100 text-blue-700 hidden sm:block flex-shrink-0">
              <Info size={24} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base sm:text-lg font-bold text-blue-900">Tenés un pago en proceso</h3>
              <p className="text-sm text-blue-800 mt-0.5">
                Orden #{ordenPendiente.id_orden} — {esEfectivo ? 'Total a pagar' : 'Total a transferir'}:{' '}
                <span className="font-bold">{formatoMoneda.format(ordenPendiente.monto_total)}</span>
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                {esEfectivo ? (
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-800">
                    <Info size={14} />
                    Acercate a la sede del club a pagar. Un administrativo registra el cobro
                    y tu cuenta se actualiza sola — no tenés que subir nada.
                  </span>
                ) : comprobanteUrl ? (
                  <>
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                      <CheckCircle size={14} />
                      Comprobante en revisión
                    </span>
                    <a
                      href={resolverUrlArchivo(comprobanteUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 underline underline-offset-2 transition-colors"
                    >
                      <ExternalLink size={12} />
                      Ver comprobante
                    </a>
                  </>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700">
                    <AlertTriangle size={14} />
                    Falta subir el comprobante de transferencia
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:justify-end">
            {!esEfectivo && (
              <button
                onClick={() => setMostrarUpload(true)}
                className="w-full sm:w-auto px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors text-sm"
              >
                {comprobanteUrl ? 'Cambiar Comprobante' : 'Subir Comprobante'}
              </button>
            )}
            <button
              onClick={() => { setErrorCancelar(null); setConfirmarCancelar(true) }}
              disabled={isCanceling}
              className="w-full sm:w-auto px-4 py-2.5 bg-white border border-red-200 text-red-600 hover:bg-red-50 rounded-xl font-bold transition-colors text-sm disabled:opacity-50"
            >
              {isCanceling ? 'Cancelando...' : 'Cancelar Trámite'}
            </button>
          </div>

          {errorCancelar && (
            <p className="mt-3 text-sm text-red-600 flex items-center gap-1.5">
              <AlertTriangle size={14} className="flex-shrink-0" />
              {errorCancelar}
            </p>
          )}
        </div>
      )}

      {confirmarCancelar && (
        <ConfirmDialog
          titulo="¿Cancelar el trámite de pago?"
          mensaje={
            esEfectivo
              ? 'Se va a anular esta orden. Si ya pagaste en el club, no la canceles: avisale a un administrativo para que la registre.'
              : 'Se va a anular esta orden y el comprobante que hayas subido. Si ya transferiste, no la canceles: esperá la verificación o avisale al club.'
          }
          confirmLabel="Sí, cancelar"
          cancelLabel="No, volver"
          variante="peligro"
          cargando={isCanceling}
          onConfirm={handleCancelarOrden}
          onCancel={() => setConfirmarCancelar(false)}
        />
      )}

      {/* Estado de Cuenta */}
      <EstadoCard
        estado={estado}
        loading={false}
        error={error}
        ordenPendiente={ordenPendiente}
        onAbrirCarrito={() => setMostrarSeleccionMeses(true)}
      />

      {/* ── Calendario Anual Interactivo ────────────────────────────────────── */}
      {/* Se muestra solo cuando ya tenemos el estado del socio cargado        */}
      {estado?.fecha_ingreso && (
        <CalendarioAnual estado={estado} />
      )}

      {/* Botón "Pagar Cuotas" → SeleccionMesesModal (oculto si becado o hay orden pendiente) */}
      {estado?.es_becado ? (
        <div className="flex items-start gap-4 p-5 rounded-2xl bg-teal-50 border-2 border-teal-200">
          <div className="p-3 rounded-xl bg-teal-100 text-teal-700 flex-shrink-0">
            <Gift size={22} />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-teal-900 text-base">Acceso Bonificado</p>
            <p className="text-sm text-teal-700 mt-0.5 leading-snug">
              Tu membresía está cubierta por una beca.{' '}
              {estado.becado_hasta
                ? <>La beca está activa hasta el <strong>{new Date(estado.becado_hasta + 'T00:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>.</>
                : 'Tu beca es indefinida.'}
            </p>
            <p className="text-xs text-teal-600 mt-1.5">
              No necesitás abonar cuotas por el momento. Ante cualquier consulta, contactá a la administración del club.
            </p>
          </div>
        </div>
      ) : !ordenPendiente && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-2">
          <div>
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
              Pagar Cuotas
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Elegí cuántos meses abonar y agregalo al carrito junto con otros productos si querés.
            </p>
          </div>
          <button
            onClick={() => setMostrarSeleccionMeses(true)}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-colors flex-shrink-0"
          >
            <ShoppingCart size={16} />
            Pagar Cuotas
          </button>
        </div>
      )}

      {/* Historial de Pagos */}
      <div>
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">
          Historial de Pagos
        </h2>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-50">
          {historial.map(pago => {
            // comprobante_url viene directo en HistorialPagoCuotaResponse
            // (el backend lo mapea desde pago.comprobante_url al construir la lista)
            const urlComprobante = pago.pago?.comprobante_url ?? pago.comprobante_url ?? null
            // El historial ya no trae solo aprobados: también los rechazados,
            // expirados y cancelados, que antes no se veían en ninguna pantalla
            // (BUG-06). Un pago que no prosperó no puede verse igual que uno
            // que sí — de ahí el badge y el ícono distinto.
            const cfg = HISTORIAL_ESTADO_CONFIG[pago.estado] ?? HISTORIAL_ESTADO_CONFIG.aprobada
            const IconoEstado = cfg.icon
            return (
              <div key={pago.id_orden} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`p-2 rounded-lg flex-shrink-0 ${cfg.iconWrap}`}>
                    <IconoEstado size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-gray-900 truncate">
                        {formatoFecha.format(new Date(pago.fecha_pago))}
                      </p>
                      <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${cfg.badge}`}>
                        {cfg.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      {pago.cantidad_meses} mes{pago.cantidad_meses !== 1 ? 'es' : ''} — {formatoMoneda.format(pago.monto_pagado)}
                    </p>
                    {pago.motivo_rechazo && (
                      <p className="text-xs text-red-600 mt-1">
                        Motivo: {pago.motivo_rechazo}
                      </p>
                    )}
                  </div>
                </div>
                {urlComprobante && (
                  <a
                    href={resolverUrlArchivo(urlComprobante)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-600 hover:bg-blue-50 transition-colors self-start sm:self-auto"
                  >
                    <ExternalLink size={14} />
                    Ver comprobante
                  </a>
                )}
              </div>
            )
          })}
          {historial.length === 0 && (
            <div className="text-center py-12 text-gray-500 text-sm">
              Todavía no registrás pagos completados.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}