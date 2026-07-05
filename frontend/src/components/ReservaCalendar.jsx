// frontend/src/components/ReservaCalendar.jsx
/**
 * Calendario del Módulo de Reservas (quincho / canchas).
 *
 * Uso:
 *   <ReservaCalendar instalacion="quincho" onSeleccionar={({ inicio, fin }) => ...} />
 *
 * Fetch real:
 *   GET /socio/reservas/{instalacion} → franjas 'bloqueada'/'confirmada' que
 *   ya ocupan la agenda. Se pintan como eventos y `handleSelectSlot` rechaza
 *   cualquier rango que se superponga con ellas (con feedback inmediato al
 *   socio, sin esperar al 409/400 del futuro POST /pre-reserva).
 *
 * La validación real y atómica de superposición SIEMPRE la hace el backend
 * al crear la pre-reserva — esto es solo UX para no dejar que el socio arme
 * un pedido que sabemos de antemano que va a fallar.
 */

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { Calendar, dateFnsLocalizer } from 'react-big-calendar'
import format from 'date-fns/format'
import parse from 'date-fns/parse'
import startOfWeek from 'date-fns/startOfWeek'
import getDay from 'date-fns/getDay'
import es from 'date-fns/locale/es'
import { AlertCircle, Loader2 } from 'lucide-react'
import 'react-big-calendar/lib/css/react-big-calendar.css'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const locales = { es }

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { locale: es }),
  getDay,
  locales,
})

// True si [aInicio, aFin) se superpone con [bInicio, bFin)
function rangosSeSuperponen(aInicio, aFin, bInicio, bFin) {
  return aInicio < bFin && bInicio < aFin
}

export default function ReservaCalendar({ instalacion, onSeleccionar }) {
  const { token } = useAuth()

  const [eventos, setEventos] = useState([])       // franjas ocupadas, ya mapeadas para el calendario
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [rangoSeleccionado, setRangoSeleccionado] = useState(null)
  const [avisoSuperposicion, setAvisoSuperposicion] = useState(false)

  const fetchDisponibilidad = useCallback(async () => {
    if (!token || !instalacion) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/socio/reservas/${encodeURIComponent(instalacion)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`Error ${res.status}: No se pudo cargar la disponibilidad.`)
      const data = await res.json()

      setEventos(
        data.map(r => ({
          id: r.id_reserva,
          title: r.estado === 'confirmada' ? 'Reservado' : 'Pendiente de pago',
          start: new Date(r.fecha_inicio),
          end: new Date(r.fecha_fin),
          estado: r.estado,
        }))
      )
    } catch (err) {
      setError(err.message)
      setEventos([])
    } finally {
      setLoading(false)
    }
  }, [token, instalacion])

  useEffect(() => {
    fetchDisponibilidad()
    setRangoSeleccionado(null)
  }, [fetchDisponibilidad])

  // Se dispara al arrastrar/clickear un rango en el calendario.
  const handleSelectSlot = useCallback((slotInfo) => {
    const inicio = slotInfo.start
    const fin = slotInfo.end

    const chocaConOcupado = eventos.some(ev => rangosSeSuperponen(inicio, fin, ev.start, ev.end))
    if (chocaConOcupado) {
      setAvisoSuperposicion(true)
      setRangoSeleccionado(null)
      return
    }

    setAvisoSuperposicion(false)
    setRangoSeleccionado({ inicio, fin })
    onSeleccionar?.({ inicio, fin })
  }, [eventos, onSeleccionar])

  // Colorea bloqueada (ámbar, pago pendiente) vs confirmada (rojo, ocupado en firme)
  const eventPropGetter = useCallback((event) => ({
    style: {
      backgroundColor: event.estado === 'confirmada' ? '#dc2626' : '#f59e0b',
      borderColor: event.estado === 'confirmada' ? '#b91c1c' : '#d97706',
      opacity: 0.9,
    },
  }), [])

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
          Disponibilidad — {instalacion}
        </h2>
        {loading && <Loader2 size={16} className="animate-spin text-gray-400" />}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 mb-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle size={15} className="flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={fetchDisponibilidad} className="underline underline-offset-2 font-medium hover:text-red-900">
            Reintentar
          </button>
        </div>
      )}

      {avisoSuperposicion && (
        <div className="flex items-center gap-2 p-3 mb-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <AlertCircle size={15} className="flex-shrink-0" />
          Ese horario se superpone con una reserva existente. Elegí otro rango.
        </div>
      )}

      <Calendar
        localizer={localizer}
        culture="es"
        events={eventos}
        startAccessor="start"
        endAccessor="end"
        selectable
        onSelectSlot={handleSelectSlot}
        eventPropGetter={eventPropGetter}
        defaultView="week"s
        views={['week', 'day']}
        step={30}
        timeslots={2}
        style={{ height: 550 }}
      />

      {rangoSeleccionado && (
        <p className="text-xs text-gray-500 mt-3">
          Seleccionado: {rangoSeleccionado.inicio.toLocaleString('es-AR')} →{' '}
          {rangoSeleccionado.fin.toLocaleString('es-AR')}
        </p>
      )}
    </div>
  )
}