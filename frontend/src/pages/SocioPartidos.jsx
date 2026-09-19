// frontend/src/pages/SocioPartidos.jsx
/**
 * Página del socio — ruta `/socio/partidos`.
 *
 * Hub de "Partidos" (ex "Transmisión en Vivo" en el menú): lista los próximos
 * partidos del mes en curso cargados por técnico/admin en Eventos
 * (GET /transmisiones/proximos-partidos), y linkea a `/en-vivo/:id` para ver
 * la transmisión o comprar la entrada anticipada (preventa) — ese flujo de
 * compra/paywall ya vive entero en TransmisionEnVivo.jsx y no se duplica acá.
 */
import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import {
  Tv,
  Clock,
  MapPin,
  RefreshCw,
  AlertCircle,
  Play,
  Ticket,
  CalendarX,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const formatearFecha = (f) => {
  if (!f) return ''
  return new Date(f).toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function EstadoBadge({ estado }) {
  if (estado === 'en_vivo') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-red-600 text-white tracking-wider animate-pulse">
        <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
        EN VIVO
      </span>
    )
  }
  if (estado === 'pausada') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
        PAUSADA
      </span>
    )
  }
  if (estado === 'finalizada') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-gray-200 text-gray-600">
        FINALIZADA
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
      <Clock size={12} /> PROGRAMADA
    </span>
  )
}

function PartidoCard({ evento }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="min-w-0 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <EstadoBadge estado={evento.transmision_estado} />
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">
            {evento.condicion === 'local' ? 'Local' : evento.condicion === 'visitante' ? 'Visitante' : 'Neutral'}
          </span>
          {evento.categoria && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
              {evento.categoria.nombre}
            </span>
          )}
        </div>
        <h3 className="text-base sm:text-lg font-bold text-gray-900">
          CAR <span className="text-gray-400 font-normal">vs</span> {evento.rival || 'Rival a confirmar'}
        </h3>
        <div className="flex items-center gap-4 text-xs sm:text-sm text-gray-500 flex-wrap">
          <span className="flex items-center gap-1.5">
            <Clock size={14} className="text-gray-400" />
            {formatearFecha(evento.fecha_inicio)}
          </span>
          {evento.ubicacion && (
            <span className="flex items-center gap-1.5">
              <MapPin size={14} className="text-gray-400" />
              {evento.ubicacion}
            </span>
          )}
        </div>
      </div>

      {evento.tiene_transmision ? (
        <Link
          to={`/en-vivo/${evento.id_evento}`}
          className="flex-shrink-0 w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-colors"
        >
          {evento.transmision_estado === 'en_vivo' ? (
            <><Play size={16} /> Ver transmisión</>
          ) : (
            <><Ticket size={16} /> Preventa de entrada</>
          )}
        </Link>
      ) : (
        <span className="flex-shrink-0 text-xs text-gray-400 font-medium">Sin transmisión</span>
      )}
    </div>
  )
}

export default function SocioPartidos() {
  const { token } = useAuth()
  const [partidos, setPartidos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/transmisiones/proximos-partidos`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error('No se pudieron cargar los próximos partidos.')
      const data = await res.json()
      setPartidos(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { cargar() }, [cargar])

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5 sm:space-y-6">
      <div className="anim-entrada">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2 sm:gap-3">
          <Tv size={22} className="text-gray-500 flex-shrink-0" />
          Partidos
        </h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-1">
          Próximos partidos del mes con transmisión oficial. Comprá tu entrada anticipada
          o mirá el partido si ya está en vivo.
        </p>
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <RefreshCw size={28} className="animate-spin text-gray-400" />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
          <AlertCircle size={16} className="flex-shrink-0" />
          {error}
        </div>
      )}

      {!loading && !error && partidos.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center space-y-2">
          <CalendarX size={36} className="mx-auto text-gray-300" />
          <p className="text-sm font-semibold text-gray-600">No hay partidos programados este mes.</p>
          <p className="text-xs text-gray-400">Volvé a revisar más adelante.</p>
        </div>
      )}

      {!loading && !error && partidos.length > 0 && (
        <div className="space-y-3">
          {partidos.map((evento) => (
            <PartidoCard key={evento.id_evento} evento={evento} />
          ))}
        </div>
      )}
    </div>
  )
}
