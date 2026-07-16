// frontend/src/pages/JugadorCalendario.jsx
/**
 * Calendario Deportivo — ruta `/calendario-deportivo`.
 *
 * Vistas: Lista (default) ↔ Calendario mensual — toggle en el header.
 *
 * En la vista de calendario los eventos se colorean según el estado
 * de convocatoria del jugador logueado:
 *   citado     → amarillo
 *   confirmado → verde
 *   rechazado  → rojo
 *   sin estado → gris (evento de su categoría sin convocatoria individual)
 *
 * Backend consumido:
 *   GET   /deportivo/mis-eventos
 *   PATCH /deportivo/mis-eventos/{id_evento}/confirmar
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import CalendarioMensual from '../components/CalendarioMensual'
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
  List,
  LayoutGrid,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

// ─── Config ───────────────────────────────────────────────────────────────────

const TIPO_CONFIG = {
  partido:       { label: 'Partido',       icon: Trophy,      classes: 'bg-emerald-100 text-emerald-800' },
  entrenamiento: { label: 'Entrenamiento', icon: Dumbbell,    classes: 'bg-blue-100 text-blue-800'      },
  torneo:        { label: 'Torneo',        icon: Trophy,      classes: 'bg-purple-100 text-purple-800'  },
  institucional: { label: 'Institucional', icon: Building2,   classes: 'bg-gray-100 text-gray-700'      },
  otro:          { label: 'Evento',        icon: CalendarDays, classes: 'bg-gray-100 text-gray-700'     },
}

// Color del chip en el calendario según estado de convocatoria del jugador
const CHIP_ESTADO = {
  citado:     'bg-yellow-400 text-yellow-900',
  confirmado: 'bg-green-500 text-white',
  rechazado:  'bg-red-400 text-white',
  sin_estado: 'bg-gray-300 text-gray-700',
}

const ESTADO_CONFIG = {
  citado:     { label: 'Citado',     icon: HelpCircle,  classes: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  confirmado: { label: 'Confirmado', icon: CheckCircle, classes: 'bg-green-100 text-green-800 border-green-200'   },
  rechazado:  { label: 'Rechazado',  icon: XCircle,     classes: 'bg-red-100 text-red-800 border-red-200'         },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatoFechaLarga = (fecha) =>
  fecha.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })

const formatoHora = (fecha) =>
  fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

// ─── Sub-componentes ──────────────────────────────────────────────────────────

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
  const config = ESTADO_CONFIG[estado]
  if (!config) return null
  const Icon = config.icon
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${config.classes}`}>
      <Icon size={14} />
      <span>{config.label}</span>
    </span>
  )
}

function VistaToggle({ vista, onChange }) {
  return (
    <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-1">
      <button
        onClick={() => onChange('lista')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
          vista === 'lista' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        <List size={15} />
        Lista
      </button>
      <button
        onClick={() => onChange('calendario')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
          vista === 'calendario' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        <LayoutGrid size={15} />
        Calendario
      </button>
    </div>
  )
}

// Tarjeta de evento reutilizada en la vista lista
function TarjetaEvento({ evento, miConvocatoria, isUpdating, onConfirmar, destacada = false }) {
  const fecha = new Date(evento.fecha_inicio)
  return (
    <div className={`bg-white rounded-2xl shadow-sm p-5 sm:p-6 space-y-4 ${
      destacada ? 'border-2 border-blue-100' : 'border border-gray-100'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <TipoBadge tipo={evento.tipo} />
          <h3 className={`font-bold text-gray-900 mt-2 ${destacada ? 'text-xl' : 'text-base'}`}>
            {evento.titulo}
          </h3>
        </div>
        {evento.categoria && (
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex-shrink-0 mt-1">
            {evento.categoria.nombre}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-gray-600">
        <span className="flex items-center gap-1.5 font-medium">
          <CalendarDays size={15} className="text-gray-400" />
          {formatoFechaLarga(fecha)} · {formatoHora(fecha)}
        </span>
        {evento.ubicacion && (
          <span className="flex items-center gap-1.5">
            <MapPin size={15} className="text-gray-400" />
            {evento.ubicacion}
          </span>
        )}
      </div>

      {evento.descripcion && (
        <p className="text-sm text-gray-500">{evento.descripcion}</p>
      )}

      {miConvocatoria && (
        <div className="pt-4 border-t border-gray-100 space-y-3">
          <h4 className="text-sm font-semibold text-gray-500">Tu convocatoria:</h4>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <EstadoConvocatoriaBadge estado={miConvocatoria.estado} />
            {miConvocatoria.estado === 'citado' && (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => onConfirmar(evento.id_evento, 'confirmado')}
                  disabled={isUpdating}
                  className="px-4 py-2 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:bg-green-400 disabled:cursor-wait flex items-center gap-2"
                >
                  {isUpdating && <Clock size={16} className="animate-spin" />}
                  Confirmar Asistencia
                </button>
                <button
                  onClick={() => onConfirmar(evento.id_evento, 'rechazado')}
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
}

// ─── Componente Principal ──────────────────────────────────────────────────────

export default function JugadorCalendario() {
  const { user, token } = useAuth()

  const [eventos, setEventos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [updatingId, setUpdatingId] = useState(null)
  const [vista, setVista] = useState('lista')
  const [mesCalendario, setMesCalendario] = useState(new Date())
  // En modo calendario, al hacer clic en un evento abre su detalle
  const [eventoDetalle, setEventoDetalle] = useState(null)

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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ estado: nuevoEstado }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => null)
        throw new Error(errData?.detail || 'Error al actualizar la convocatoria.')
      }
      await fetchEventos()
      // Actualizar también el detalle abierto si corresponde
      if (eventoDetalle?.id_evento === idEvento) setEventoDetalle(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setUpdatingId(null)
    }
  }

  // ── Vista lista: separar próximo evento del resto ────────────────────────
  const [proximoEvento, ...restoEventos] = eventos

  const eventosAgrupados = useMemo(() => {
    const grupos = new Map()
    for (const ev of restoEventos) {
      const fecha = new Date(ev.fecha_inicio)
      const clave = fecha.toDateString()
      if (!grupos.has(clave)) grupos.set(clave, [])
      grupos.get(clave).push(ev)
    }
    return Array.from(grupos.entries())
  }, [restoEventos])

  // ── Chip del calendario: color según estado del jugador logueado ─────────
  const renderEventoCalendario = useCallback((evento) => {
    const miConvocatoria = user
      ? evento.convocatorias?.find(c => c.id_usuario === user.id_usuario)
      : null
    const estadoKey = miConvocatoria?.estado ?? 'sin_estado'
    const chipClass = CHIP_ESTADO[estadoKey] ?? CHIP_ESTADO.sin_estado

    return (
      <button
        onClick={() => setEventoDetalle(evento)}
        title={evento.titulo}
        className={`w-full text-left px-1.5 py-0.5 rounded text-[10px] font-semibold truncate transition-opacity hover:opacity-80 ${chipClass}`}
      >
        {formatoHora(new Date(evento.fecha_inicio))} {evento.titulo}
      </button>
    )
  }, [user])

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <CalendarDays size={24} className="text-gray-500" />
            Calendario Deportivo
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Tus próximos partidos, entrenamientos y el estado de tu convocatoria.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <VistaToggle vista={vista} onChange={v => { setVista(v); setEventoDetalle(null) }} />
          <button
            onClick={fetchEventos}
            disabled={loading}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 transition-colors"
            title="Actualizar"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
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

      {/* ── Vista Calendario ─────────────────────────────────────────────── */}
      {vista === 'calendario' && (
        <div className="space-y-4">
          {loading ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm h-96 animate-pulse" />
          ) : (
            <>
              <CalendarioMensual
                eventos={eventos}
                mes={mesCalendario}
                onMesChange={setMesCalendario}
                renderEvento={renderEventoCalendario}
              />

              {/* Leyenda */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Tu estado:</span>
                {Object.entries(CHIP_ESTADO).map(([key, cls]) => (
                  <span key={key} className="flex items-center gap-1.5 text-xs text-gray-600">
                    <span className={`w-2.5 h-2.5 rounded-sm ${cls.split(' ')[0]}`} />
                    {key === 'sin_estado' ? 'Sin convocatoria' : ESTADO_CONFIG[key]?.label ?? key}
                  </span>
                ))}
              </div>

              {/* Detalle del evento seleccionado en el calendario */}
              {eventoDetalle && (() => {
                const miConvocatoria = user
                  ? eventoDetalle.convocatorias?.find(c => c.id_usuario === user.id_usuario)
                  : null
                return (
                  <div className="relative">
                    <button
                      onClick={() => setEventoDetalle(null)}
                      className="absolute top-3 right-3 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors z-10"
                      aria-label="Cerrar detalle"
                    >
                      <XCircle size={18} />
                    </button>
                    <TarjetaEvento
                      evento={eventoDetalle}
                      miConvocatoria={miConvocatoria}
                      isUpdating={updatingId === eventoDetalle.id_evento}
                      onConfirmar={handleConfirmacion}
                      destacada
                    />
                  </div>
                )
              })()}
            </>
          )}
        </div>
      )}

      {/* ── Vista Lista ──────────────────────────────────────────────────── */}
      {vista === 'lista' && (
        <>
          {/* Próximo evento destacado */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-800">Próximo Evento</h2>

            {loading && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 h-28 animate-pulse" />
            )}

            {!loading && !error && proximoEvento && (() => {
              const miConvocatoria = user
                ? proximoEvento.convocatorias.find(c => c.id_usuario === user.id_usuario)
                : null
              return (
                <TarjetaEvento
                  evento={proximoEvento}
                  miConvocatoria={miConvocatoria}
                  isUpdating={updatingId === proximoEvento.id_evento}
                  onConfirmar={handleConfirmacion}
                  destacada
                />
              )
            })()}

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
                    const miConvocatoria = user
                      ? evento.convocatorias.find(c => c.id_usuario === user.id_usuario)
                      : null
                    return (
                      <TarjetaEvento
                        key={evento.id_evento}
                        evento={evento}
                        miConvocatoria={miConvocatoria}
                        isUpdating={updatingId === evento.id_evento}
                        onConfirmar={handleConfirmacion}
                      />
                    )
                  })}
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  )
}