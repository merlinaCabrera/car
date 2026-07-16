// frontend/src/components/CalendarioMensual.jsx
/**
 * Grilla de calendario mensual reutilizable.
 *
 * Props:
 *   eventos        — array de objetos con al menos { fecha_inicio, ... }
 *   mes            — Date que representa el mes/año a mostrar
 *   onMesChange    — (nuevaFecha: Date) => void  — callback para navegar
 *   renderEvento   — (evento, diaFecha) => ReactNode — cómo pintar cada chip
 *   renderDia?     — (fecha, eventosDelDia) => ReactNode — override completo de celda
 *
 * El componente solo maneja la grilla y navegación; el caller decide
 * cómo se ve cada evento (color, texto, badge) via renderEvento.
 */

import { useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

/**
 * Devuelve la clave "YYYY-MM-DD" de una fecha local (evita desajuste UTC).
 * new Date("2026-07-20") crea medianoche UTC → en AR queda en el día anterior.
 * Usar getFullYear/Month/Date garantiza la fecha local.
 */
export function claveLocal(fecha) {
  const d = fecha instanceof Date ? fecha : new Date(fecha)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function CalendarioMensual({ eventos = [], mes, onMesChange, renderEvento }) {
  const hoyKey = claveLocal(new Date())

  // ── Construir mapa día → eventos ───────────────────────────────────────────
  const mapaEventos = useMemo(() => {
    const mapa = new Map()
    for (const ev of eventos) {
      if (!ev.fecha_inicio) continue
      const key = claveLocal(new Date(ev.fecha_inicio))
      if (!mapa.has(key)) mapa.set(key, [])
      mapa.get(key).push(ev)
    }
    return mapa
  }, [eventos])

  // ── Celdas del mes ─────────────────────────────────────────────────────────
  const celdas = useMemo(() => {
    const anio = mes.getFullYear()
    const mesIdx = mes.getMonth()

    const primerDia = new Date(anio, mesIdx, 1)
    const ultimoDia = new Date(anio, mesIdx + 1, 0)

    const resultado = []

    // Días del mes anterior para completar la primera semana
    for (let i = 0; i < primerDia.getDay(); i++) {
      const d = new Date(anio, mesIdx, 1 - (primerDia.getDay() - i))
      resultado.push({ fecha: d, esDelMes: false })
    }

    // Días del mes actual
    for (let d = 1; d <= ultimoDia.getDate(); d++) {
      resultado.push({ fecha: new Date(anio, mesIdx, d), esDelMes: true })
    }

    // Días del mes siguiente para completar la última semana
    const restante = 7 - (resultado.length % 7)
    if (restante < 7) {
      for (let i = 1; i <= restante; i++) {
        resultado.push({ fecha: new Date(anio, mesIdx + 1, i), esDelMes: false })
      }
    }

    return resultado
  }, [mes])

  const irAlMesAnterior = () => {
    onMesChange(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))
  }

  const irAlMesSiguiente = () => {
    onMesChange(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))
  }

  const irAlMesActual = () => {
    onMesChange(new Date())
  }

  const esElMesActual =
    mes.getFullYear() === new Date().getFullYear() &&
    mes.getMonth() === new Date().getMonth()

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Navegación */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <button
          onClick={irAlMesAnterior}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          aria-label="Mes anterior"
        >
          <ChevronLeft size={18} />
        </button>

        <div className="flex items-center gap-3">
          <h2 className="text-base font-bold text-gray-900 capitalize">
            {MESES[mes.getMonth()]} {mes.getFullYear()}
          </h2>
          {!esElMesActual && (
            <button
              onClick={irAlMesActual}
              className="text-xs font-medium text-blue-600 hover:underline underline-offset-2"
            >
              Hoy
            </button>
          )}
        </div>

        <button
          onClick={irAlMesSiguiente}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          aria-label="Mes siguiente"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Encabezado de días */}
      <div className="grid grid-cols-7 border-b border-gray-100">
        {DIAS_SEMANA.map(dia => (
          <div
            key={dia}
            className="py-2 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wide"
          >
            {dia}
          </div>
        ))}
      </div>

      {/* Grilla de días */}
      <div className="grid grid-cols-7 divide-x divide-y divide-gray-50">
        {celdas.map(({ fecha, esDelMes }, idx) => {
          const key = claveLocal(fecha)
          const eventosDelDia = mapaEventos.get(key) ?? []
          const esHoy = key === hoyKey

          return (
            <div
              key={idx}
              className={`min-h-[80px] p-1.5 flex flex-col gap-1 ${
                !esDelMes ? 'bg-gray-50/60' : ''
              }`}
            >
              {/* Número de día */}
              <span
                className={`self-end text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full ${
                  esHoy
                    ? 'bg-blue-600 text-white'
                    : esDelMes
                    ? 'text-gray-700'
                    : 'text-gray-300'
                }`}
              >
                {fecha.getDate()}
              </span>

              {/* Chips de eventos */}
              <div className="flex flex-col gap-0.5 flex-1">
                {eventosDelDia.map((ev, i) => (
                  <div key={ev.id_evento ?? i}>
                    {renderEvento(ev, fecha)}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}