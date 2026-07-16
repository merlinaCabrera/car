// frontend/src/pages/Asistencias.jsx
/**
 * Página de Asistencias Deportivas — ruta `/asistencias`.
 *
 * Flujo del técnico:
 *   1. Elige un evento (lista de eventos programados/en_curso).
 *   2. Ve la planilla: convocados vs. quién ya pasó por la puerta (asistencias).
 *   3. Puede registrar ingresos manualmente desde acá (metodo='DNI').
 *   4. Cuando termina, presiona "Cerrar y marcar presentes/ausentes":
 *      el backend cruza automáticamente y actualiza el estado de cada
 *      convocatoria a 'presente' o 'ausente'.
 *
 * Backend consumido:
 *   GET  /deportivo/eventos                             → lista de eventos
 *   GET  /deportivo/eventos/{id}/asistencias            → quién entró
 *   POST /deportivo/eventos/{id}/asistencias            → ingreso manual (DNI)
 *   POST /deportivo/eventos/{id}/convocatorias/cerrar   → cruza y cierra
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  ClipboardCheck,
  Users,
  CheckCircle2,
  XCircle,
  HelpCircle,
  AlertCircle,
  RefreshCw,
  Loader2,
  UserCheck,
  ChevronDown,
  Lock,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatoFechaCorta = (iso) =>
  new Date(iso).toLocaleString('es-AR', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })

const ESTADO_CONFIG = {
  presente:   { label: 'Presente',   icon: CheckCircle2, classes: 'bg-green-100 text-green-800'   },
  ausente:    { label: 'Ausente',    icon: XCircle,      classes: 'bg-red-100 text-red-800'       },
  confirmado: { label: 'Confirmado', icon: CheckCircle2, classes: 'bg-blue-100 text-blue-800'     },
  citado:     { label: 'Citado',     icon: HelpCircle,   classes: 'bg-yellow-100 text-yellow-800' },
  rechazado:  { label: 'Rechazado',  icon: XCircle,      classes: 'bg-gray-100 text-gray-600'    },
}

function EstadoBadge({ estado }) {
  const cfg = ESTADO_CONFIG[estado] ?? ESTADO_CONFIG.citado
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${cfg.classes}`}>
      <Icon size={12} />
      {cfg.label}
    </span>
  )
}

// ─── Modal: Registrar ingreso manual ─────────────────────────────────────────

function IngresoManualModal({ evento, onClose, onSuccess, token }) {
  const [dni, setDni] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [exito, setExito] = useState(null)

  // Primero necesitamos resolver el id_usuario desde el DNI.
  // Reutilizamos el endpoint de búsqueda de jugadores de la categoría del evento.
  const handleRegistrar = async () => {
    const dniLimpio = dni.trim()
    if (!/^\d{7,10}$/.test(dniLimpio)) {
      setError('Ingresá un DNI válido (7 a 10 dígitos).')
      return
    }
    setIsSubmitting(true)
    setError(null)
    setExito(null)

    try {
      // 1 — Buscar usuario por DNI
      const resBusqueda = await fetch(
        `${API}/deportivo/categorias/${evento.id_categoria}/jugadores?dni=${dniLimpio}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!resBusqueda.ok) throw new Error('No se pudo buscar al jugador.')
      const jugadores = await resBusqueda.json()

      const jugador = jugadores.find(j => j.usuario?.dni === dniLimpio)
      if (!jugador) {
        throw new Error(`DNI ${dniLimpio} no encontrado en el plantel de esta categoría.`)
      }

      // 2 — Registrar asistencia
      const resAsist = await fetch(`${API}/deportivo/eventos/${evento.id_evento}/asistencias`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id_evento:  evento.id_evento,
          id_usuario: jugador.usuario.id_usuario,
          metodo:     'DNI',
        }),
      })
      if (!resAsist.ok) {
        const err = await resAsist.json().catch(() => ({}))
        throw new Error(err.detail ?? `Error ${resAsist.status}`)
      }

      setExito(`✓ ${jugador.usuario.apellido}, ${jugador.usuario.nombre} registrado correctamente.`)
      setDni('')
      onSuccess()
    } catch (err) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center items-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Registrar ingreso</h2>
            <p className="text-xs text-gray-500 mt-0.5">{evento.titulo}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <XCircle size={18} />
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        {exito && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">
            <CheckCircle2 size={14} className="flex-shrink-0 mt-0.5" />
            <span>{exito}</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">DNI del jugador</label>
          <input
            type="number"
            value={dni}
            onChange={e => setDni(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleRegistrar()}
            placeholder="Ej: 40123456"
            className="form-input w-full"
            autoFocus
          />
          <p className="text-xs text-gray-400 mt-1">Presioná Enter para registrar rápidamente.</p>
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg text-gray-600 bg-gray-100 hover:bg-gray-200 font-semibold transition-colors text-sm">
            Cerrar
          </button>
          <button
            onClick={handleRegistrar}
            disabled={isSubmitting || !dni.trim()}
            className="flex-1 px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700 font-semibold disabled:opacity-50 transition-colors flex items-center justify-center gap-2 text-sm"
          >
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            Registrar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Panel de planilla de un evento seleccionado ─────────────────────────────

function PlanillaEvento({ evento, token, onVolver }) {
  const [asistencias, setAsistencias]         = useState([])
  const [loadingAsist, setLoadingAsist]       = useState(true)
  const [errorAsist, setErrorAsist]           = useState(null)
  const [cerrando, setCerrando]               = useState(false)
  const [errorCierre, setErrorCierre]         = useState(null)
  const [resultadoCierre, setResultadoCierre] = useState(null)
  const [modalIngresoAbierto, setModalIngresoAbierto] = useState(false)

  const fetchAsistencias = useCallback(async () => {
    setLoadingAsist(true)
    setErrorAsist(null)
    try {
      const res = await fetch(`${API}/deportivo/eventos/${evento.id_evento}/asistencias`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`Error ${res.status}: no se pudo cargar la planilla.`)
      setAsistencias(await res.json())
    } catch (err) {
      setErrorAsist(err.message)
    } finally {
      setLoadingAsist(false)
    }
  }, [evento.id_evento, token])

  useEffect(() => { fetchAsistencias() }, [fetchAsistencias])

  const handleCerrar = async () => {
    if (!window.confirm(
      '¿Cerrar la convocatoria?\n\nEsto va a marcar automáticamente a cada convocado como "Presente" o "Ausente" según quién haya entrado. Podés volver a correrlo si alguien llegó tarde.'
    )) return

    setCerrando(true)
    setErrorCierre(null)
    try {
      const res = await fetch(
        `${API}/deportivo/eventos/${evento.id_evento}/convocatorias/cerrar`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? `Error ${res.status}`)
      }
      setResultadoCierre(await res.json())
      // Refrescar asistencias por si el técnico quiere ver el estado actualizado
      fetchAsistencias()
    } catch (err) {
      setErrorCierre(err.message)
    } finally {
      setCerrando(false)
    }
  }

  // Cruzar convocados con asistencias reales
  const convocados = useMemo(() => {
    const idsConAsistencia = new Set(asistencias.map(a => a.id_usuario))
    return [...(evento.convocatorias ?? [])].sort((a, b) =>
      (a.usuario?.apellido ?? '').localeCompare(b.usuario?.apellido ?? '')
    ).map(conv => ({
      ...conv,
      entraReal: idsConAsistencia.has(conv.id_usuario),
    }))
  }, [evento.convocatorias, asistencias])

  const totalConvocados  = convocados.length
  const totalConAsistencia = convocados.filter(c => c.entraReal).length

  const eventoCerrado = evento.estado === 'finalizado'

  return (
    <div className="space-y-4">
      {/* Header del evento seleccionado */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <button
              onClick={onVolver}
              className="text-xs text-blue-600 hover:underline mb-2 flex items-center gap-1"
            >
              ← Volver a la lista
            </button>
            <h2 className="text-lg font-bold text-gray-900">{evento.titulo}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{formatoFechaCorta(evento.fecha_inicio)}</p>
            {evento.ubicacion && (
              <p className="text-xs text-gray-400 mt-0.5">{evento.ubicacion}</p>
            )}
          </div>

          {/* Contador resumen */}
          <div className="flex items-center gap-4 text-center flex-shrink-0">
            <div>
              <p className="text-2xl font-bold text-green-600">{totalConAsistencia}</p>
              <p className="text-xs text-gray-500">Presentes</p>
            </div>
            <div className="text-gray-200 text-2xl">/</div>
            <div>
              <p className="text-2xl font-bold text-gray-700">{totalConvocados}</p>
              <p className="text-xs text-gray-500">Convocados</p>
            </div>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-gray-100">
          {!eventoCerrado && (
            <button
              onClick={() => setModalIngresoAbierto(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors text-sm"
            >
              <UserCheck size={15} />
              Registrar ingreso manual
            </button>
          )}
          <button
            onClick={fetchAsistencias}
            disabled={loadingAsist}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 transition-colors"
            title="Actualizar"
          >
            <RefreshCw size={15} className={loadingAsist ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={handleCerrar}
            disabled={cerrando || eventoCerrado}
            className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 text-white font-semibold hover:bg-slate-900 disabled:opacity-50 transition-colors text-sm"
            title={eventoCerrado ? 'El evento ya fue cerrado' : 'Cruzar asistencias y marcar presentes/ausentes'}
          >
            {cerrando
              ? <Loader2 size={15} className="animate-spin" />
              : <Lock size={15} />
            }
            {eventoCerrado ? 'Evento finalizado' : 'Cerrar y marcar presentes/ausentes'}
          </button>
        </div>

        {/* Resultado del cierre */}
        {resultadoCierre && (
          <div className="mt-3 flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-200 text-green-800 text-sm">
            <CheckCircle2 size={16} className="flex-shrink-0" />
            <span>
              Convocatoria cerrada: <strong>{resultadoCierre.presentes} presentes</strong> y{' '}
              <strong>{resultadoCierre.ausentes} ausentes</strong> sobre {resultadoCierre.total} convocados.
            </span>
          </div>
        )}
        {errorCierre && (
          <div className="mt-3 flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            <AlertCircle size={16} className="flex-shrink-0" />
            <span>{errorCierre}</span>
          </div>
        )}
      </div>

      {errorAsist && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle size={18} className="flex-shrink-0" />
          <span className="flex-1">{errorAsist}</span>
          <button onClick={fetchAsistencias} className="underline underline-offset-2 font-medium">Reintentar</button>
        </div>
      )}

      {/* Planilla de convocados */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              {['Jugador', 'DNI', 'Estado convocatoria', 'Pasó por puerta', 'Hora de ingreso'].map(h => (
                <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loadingAsist && [...Array(4)].map((_, i) => (
              <tr key={i} className="animate-pulse">
                <td colSpan={5} className="px-5 py-4">
                  <div className="h-4 bg-gray-200 rounded-md w-3/4" />
                </td>
              </tr>
            ))}

            {!loadingAsist && convocados.map(conv => {
              const asistenciaReal = asistencias.find(a => a.id_usuario === conv.id_usuario)
              return (
                <tr key={conv.id_usuario} className={`transition-colors ${conv.entraReal ? 'bg-green-50/40' : ''}`}>
                  <td className="px-5 py-3.5">
                    <span className="font-medium text-gray-900 text-sm">
                      {conv.usuario?.apellido}, {conv.usuario?.nombre}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-sm font-mono text-gray-500">
                    {conv.usuario?.dni ?? '—'}
                  </td>
                  <td className="px-5 py-3.5">
                    <EstadoBadge estado={conv.estado} />
                  </td>
                  <td className="px-5 py-3.5">
                    {conv.entraReal
                      ? <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700"><CheckCircle2 size={14} /> Sí</span>
                      : <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400"><XCircle size={14} /> No</span>
                    }
                  </td>
                  <td className="px-5 py-3.5 text-xs text-gray-400 whitespace-nowrap">
                    {asistenciaReal
                      ? new Date(asistenciaReal.fecha_hora_ingreso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
                      : '—'
                    }
                  </td>
                </tr>
              )
            })}

            {!loadingAsist && convocados.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-10 text-gray-400 text-sm">
                  Este evento no tiene convocados todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* También mostramos asistencias de NO convocados (si algún socio entró por la puerta sin estar en la lista) */}
      {(() => {
        const idsConvocados = new Set(convocados.map(c => c.id_usuario))
        const extras = asistencias.filter(a => !idsConvocados.has(a.id_usuario))
        if (extras.length === 0) return null
        return (
          <div className="bg-white rounded-2xl border border-amber-200 shadow-sm p-5">
            <h3 className="text-sm font-bold text-amber-800 mb-3 flex items-center gap-2">
              <AlertCircle size={15} />
              {extras.length} ingreso{extras.length !== 1 ? 's' : ''} de socios no convocados
            </h3>
            <div className="space-y-2">
              {extras.map(a => (
                <div key={a.id_asistencia} className="flex items-center justify-between text-sm text-gray-700 px-3 py-2 bg-amber-50 rounded-lg">
                  <span className="font-mono text-xs text-gray-500">ID {a.id_usuario}</span>
                  <span className="text-xs text-gray-400">
                    {new Date(a.fecha_hora_ingreso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                    {' · '}{a.metodo}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {modalIngresoAbierto && (
        <IngresoManualModal
          evento={evento}
          token={token}
          onClose={() => setModalIngresoAbierto(false)}
          onSuccess={() => {
            setModalIngresoAbierto(false)
            fetchAsistencias()
          }}
        />
      )}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function Asistencias() {
  const { token } = useAuth()
  const [eventos, setEventos]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [eventoSeleccionado, setEventoSeleccionado] = useState(null)

  const fetchEventos = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      // Traemos eventos programados Y en_curso — los finalizados también
      // podrían interesar para ver la planilla histórica
      const res = await fetch(`${API}/deportivo/eventos`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('No se pudieron cargar los eventos.')
      const data = await res.json()
      // Ordenar: primero los más próximos
      data.sort((a, b) => new Date(a.fecha_inicio) - new Date(b.fecha_inicio))
      setEventos(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { fetchEventos() }, [fetchEventos])

  // Si hay un evento seleccionado, mostramos la planilla
  if (eventoSeleccionado) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <ClipboardCheck size={24} className="text-gray-500" />
            Asistencias
          </h1>
        </div>
        <PlanillaEvento
          evento={eventoSeleccionado}
          token={token}
          onVolver={() => setEventoSeleccionado(null)}
        />
      </div>
    )
  }

  // Vista: lista de eventos para elegir
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <ClipboardCheck size={24} className="text-gray-500" />
            Asistencias
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Seleccioná un evento para ver la planilla y registrar presencias.
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
          <button onClick={fetchEventos} className="underline underline-offset-2 font-medium">Reintentar</button>
        </div>
      )}

      <div className="space-y-3">
        {loading && [...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 h-20 animate-pulse" />
        ))}

        {!loading && eventos.length === 0 && (
          <div className="text-center py-14 text-gray-400">
            No hay eventos disponibles.
          </div>
        )}

        {!loading && eventos.map(evento => {
          const convocados  = evento.convocatorias?.length ?? 0
          const finalizado  = evento.estado === 'finalizado'
          return (
            <button
              key={evento.id_evento}
              onClick={() => setEventoSeleccionado(evento)}
              className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-left hover:border-blue-200 hover:bg-blue-50/30 transition-colors flex items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-gray-900 text-sm">{evento.titulo}</span>
                  {finalizado && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Finalizado</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{formatoFechaCorta(evento.fecha_inicio)}</p>
                {evento.categoria?.nombre && (
                  <p className="text-xs text-gray-400 mt-0.5">{evento.categoria.nombre}</p>
                )}
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="text-center">
                  <p className="text-lg font-bold text-gray-700">{convocados}</p>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">convocados</p>
                </div>
                <ChevronDown size={16} className="text-gray-300 -rotate-90" />
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}