// frontend/src/pages/Reservas.jsx
/**
 * Página del Módulo de Reservas — ruta `/reservas`.
 *
 * Por ahora solo monta el calendario de disponibilidad de una instalación
 * fija ('quincho'). El selector de instalación y el botón de confirmar
 * pre-reserva (POST /socio/reservas/pre-reserva) quedan para la próxima
 * iteración — acá solo se deja el rango elegido en estado, listo para que
 * ese POST lo use en handleConfirmar.
 */

import { useState } from 'react'
import ReservaCalendar from '../components/ReservaCalendar'
import { CalendarClock } from 'lucide-react'

export default function Reservas() {
  const [instalacion] = useState('quincho') // TODO: selector cuando haya más de una instalación
  const [rangoElegido, setRangoElegido] = useState(null)

  const handleSeleccionar = ({ inicio, fin }) => {
    setRangoElegido({ inicio, fin })
  }

  const handleConfirmar = () => {
    // TODO: POST /socio/reservas/pre-reserva
    // payload: { id_producto, instalacion, fecha_inicio: rangoElegido.inicio.toISOString(), fecha_fin: rangoElegido.fin.toISOString() }
    console.log('Pendiente: confirmar pre-reserva', { instalacion, ...rangoElegido })
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
          <CalendarClock size={24} className="text-gray-500" />
          Reservas
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Elegí un horario disponible para el {instalacion}.
        </p>
      </div>

      <ReservaCalendar instalacion={instalacion} onSeleccionar={handleSeleccionar} />

      {rangoElegido && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-center justify-between gap-4">
          <div className="text-sm text-gray-700">
            <p className="font-semibold text-gray-900">Horario elegido</p>
            <p>
              {rangoElegido.inicio.toLocaleString('es-AR')} → {rangoElegido.fin.toLocaleString('es-AR')}
            </p>
          </div>
          <button
            onClick={handleConfirmar}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-colors flex-shrink-0"
          >
            Confirmar (próximamente)
          </button>
        </div>
      )}
    </div>
  )
}