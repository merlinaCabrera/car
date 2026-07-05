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

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
          <CalendarClock size={24} className="text-gray-500" />
          Reservas
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Elegí un horario disponible para el <strong>{instalacion}</strong> y agregalo a tu carrito.
        </p>
      </div>

      <ReservaCalendar instalacion={instalacion} />
    </div>
  )
}