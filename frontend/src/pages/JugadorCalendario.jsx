// frontend/src/pages/JugadorCalendario.jsx
/**
 * Calendario Deportivo — ruta `/calendario-deportivo`.
 * El jugador ve sus próximos eventos y el estado de su convocatoria para cada uno.
 * Si está 'citado', puede confirmar o rechazar su asistencia.
 *
 * Backend consumido:
 *   GET /deportivo/mis-eventos
 *   PATCH /deportivo/mis-eventos/{id_evento}/confirmar
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  CalendarDays,
  CheckCircle,
  Clock,
  MapPin,
  Trophy,
  Dumbbell,
  Building2,
  AlertCircle,
  RefreshCw,
  HelpCircle,
  XCircle,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const TIPO_CONFIG = {
  partido:        { label: 'Partido',        icon: Trophy,     classes: 'bg-emerald-100 text-emerald-800' },
  entrenamiento:  { label: 'Entrenamiento',  icon: Dumbbell,   classes: 'bg-blue-100 text-blue-800' },
  torneo:         { label: 'Torneo',         icon: Trophy,     classes: 'bg-purple-100 text-purple-800' },
  institucional:  { label: 'Institucional',  icon: Building2,  classes: 'bg-gray-100 text-gray-700' },
  otro:           { label: 'Evento',         icon: CalendarDays, classes: 'bg-gray-100 text-gray-700' },
}

const ESTADO_CONVOCATORIA_CONFIG = {
  citado: {
    label: 'Citado', icon: HelpCircle, classes: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  },
  confirmado: {
    label: 'Confirmado', icon: CheckCircle, classes: 'bg-green-100 text-green-800 border-green-200',
  },
  rechazado: {
    label: 'Rechazado', icon: XCircle, classes: 'bg-red-100 text-red-800 border-red-200',
  },
}

const formatoFechaLarga = (fecha) =>
  fecha.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })

const formatoHora = (fecha) =>
  fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

function TipoBadge({ tipo }) {
  const config = TIPO_CONFIG[tipo] ?? TIPO_CONFIG.otro
  const Icon = config.icon
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${config.classes}`}>
      <Icon size={12} /> {config.label}
    </span>
  )
}

function EstadoConvocatoriaBadge({ estado }) {
  const config = ESTADO_CONVOCATORIA_CONFIG[estado]
  if (!config) return null
  const Icon = config.icon
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${config.classes}`}>
      <Icon size={14} />
      <span>{config.label}</span>
    </span>
  )
}

export default function JugadorCalendario() {
  const { user, token } = useAuth()

  const [eventos, setEventos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [updatingId, setUpdatingId] = useState(null)

  const fetchEventos = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/deportivo/mis-eventos`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`Error ${res.status}: No se pudieron cargar tus eventos.`)
      setEventos(await res.json())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { fetchEventos() }, [fetchEventos])

  const handleConfirmacion = async (idEvento, nuevoEstado) => {
    if (!token) return
    setUpdatingId(idEvento)
    try {
      const res = await fetch(`${API}/deportivo/mis-eventos/${idEvento}/confirmar`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ estado: nuevoEstado }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => null)
        throw new Error(errData?.detail || `Error al actualizar la convocatoria.`)
      }
      await fetchEventos() // Recargar la lista para ver el cambio
    } catch (err) {
      setError(err.message)
    } finally {
      setUpdatingId(null)
    }
  }

  const [proximoEvento, ...restoEventos] = eventos

  // Agrupar el resto por fecha (día calendario)
  const eventosAgrupados = useMemo(() => {
    const grupos = new Map()
    for (const evento of restoEventos) {
      const fecha = new Date(evento.fecha_inicio)
      const clave = fecha.toDateString()
      if (!grupos.has(clave)) grupos.set(clave, [])
      grupos.get(clave).push(evento)
    }
    return Array.from(grupos.entries())
  }, [restoEventos])

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <CalendarDays size={24} className="text-gray-500" />
            Calendario Deportivo
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Tus próximos partidos, entrenamientos y el estado de tu convocatoria.
          </p>
        </div>
        <button
          onClick={fetchEventos}
          disabled={loading}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 transition-colors flex-shrink-0"
          title="Actualizar"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle size={18} className="flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={fetchEventos} className="underline underline-offset-2 font-medium hover:text-red-900">
            Reintentar
          </button>
        </div>
      )}

      {/* Próximo evento destacado */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-gray-800">Próximo Evento</h2>

        {loading && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 h-28 animate-pulse" />
        )}

        {!loading && !error && proximoEvento && (
          (() => {
            const miConvocatoria = user ? proximoEvento.convocatorias.find(c => c.id_usuario === user.id_usuario) : null
            const isUpdating = updatingId === proximoEvento.id_evento

            return (
              <div className="bg-white rounded-2xl border-2 border-blue-100 shadow-sm p-6 space-y-4">
                <div className="flex items-start justify-between gap-3">
              <div>
                <TipoBadge tipo={proximoEvento.tipo} />
                <h3 className="text-xl font-bold text-gray-900 mt-2">{proximoEvento.titulo}</h3>
              </div>
              {proximoEvento.categoria && (
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex-shrink-0 mt-1">
                  {proximoEvento.categoria.nombre}
                </span>
              )}
            </div>

                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-gray-600">
              <span className="flex items-center gap-1.5 font-medium">
                <CalendarDays size={15} className="text-gray-400" />
                {formatoFechaLarga(new Date(proximoEvento.fecha_inicio))} · {formatoHora(new Date(proximoEvento.fecha_inicio))}
              </span>
              {proximoEvento.ubicacion && (
                <span className="flex items-center gap-1.5">
                  <MapPin size={15} className="text-gray-400" />
                  {proximoEvento.ubicacion}
                </span>
              )}
            </div>

            {proximoEvento.descripcion && (
              <p className="text-sm text-gray-500 pt-1">{proximoEvento.descripcion}</p>
            )}

                {miConvocatoria && (
                  <div className="pt-4 border-t border-gray-100 space-y-3">
                    <h4 className="text-sm font-semibold text-gray-500">Tu convocatoria:</h4>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <EstadoConvocatoriaBadge estado={miConvocatoria.estado} />
                      {miConvocatoria.estado === 'citado' && (
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => handleConfirmacion(proximoEvento.id_evento, 'confirmado')}
                            disabled={isUpdating}
                            className="px-4 py-2 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:bg-green-400 disabled:cursor-wait flex items-center gap-2"
                          >
                            {isUpdating && <Clock size={16} className="animate-spin" />}
                            Confirmar Asistencia
                          </button>
                          <button
                            onClick={() => handleConfirmacion(proximoEvento.id_evento, 'rechazado')}
                            disabled={isUpdating}
                            className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:bg-red-400 disabled:cursor-wait"
                          >
                            Rechazar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })()
        )}

        {!loading && !error && !proximoEvento && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center text-gray-500">
            No tenés eventos programados por ahora.
          </div>
        )}
      </section>

      {/* Resto del calendario, agrupado por día */}
      {!loading && !error && eventosAgrupados.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-bold text-gray-800">Más Adelante</h2>

          {eventosAgrupados.map(([clave, eventosDelDia]) => (
            <div key={clave} className="space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                {formatoFechaLarga(new Date(eventosDelDia[0].fecha_inicio))}
              </p>
              {eventosDelDia.map(evento => {
                const miConvocatoria = user ? evento.convocatorias.find(c => c.id_usuario === user.id_usuario) : null
                const isUpdating = updatingId === evento.id_evento

                return (
                  <div key={evento.id_evento} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <TipoBadge tipo={evento.tipo} />
                          <p className="font-semibold text-gray-900">{evento.titulo}</p>
                        </div>
                        {evento.ubicacion && (
                          <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                            <MapPin size={11} /> {evento.ubicacion}
                          </p>
                        )}
                      </div>
                      <span className="text-sm font-semibold text-gray-700 flex-shrink-0">
                        {formatoHora(new Date(evento.fecha_inicio))}
                      </span>
                    </div>

                    {miConvocatoria && (
                      <div className="pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
                        <EstadoConvocatoriaBadge estado={miConvocatoria.estado} />
                        {miConvocatoria.estado === 'citado' && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleConfirmacion(evento.id_evento, 'confirmado')}
                              disabled={isUpdating}
                              className="px-3 py-1.5 text-xs font-semibold text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-green-400 disabled:cursor-wait flex items-center justify-center w-20"
                            >
                              {isUpdating ? <Clock size={14} className="animate-spin" /> : 'Confirmar'}
                            </button>
                            <button
                              onClick={() => handleConfirmacion(evento.id_evento, 'rechazado')}
                              disabled={isUpdating}
                              className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 rounded-md hover:bg-red-700 disabled:bg-red-400 disabled:cursor-wait w-20"
                            >
                              Rechazar
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </section>
      )}
    </div>
  )
}