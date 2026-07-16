// frontend/src/pages/TecnicoEventos.jsx
/**
 * Panel para que el Personal Técnico gestione las convocatorias a eventos.
 *
 * Flujo:
 * 1. Se listan los próximos eventos (partidos, entrenamientos).
 * 2. Al hacer clic en "Armar Convocatoria", se abre un modal.
 * 3. El modal carga el plantel completo de la categoría del evento.
 * 4. Los jugadores ya convocados para ese evento aparecen pre-tildados.
 * 5. El técnico puede tildar/destildar jugadores y guardar.
 * 6. Al guardar, se envía la lista completa de IDs de jugadores al backend,
 *    que reemplaza la convocatoria anterior por la nueva.
 *
 * Backend consumido:
 *   GET /deportivo/eventos
 *   GET /deportivo/categorias/{id_categoria}/jugadores
 *   POST /deportivo/eventos/{id_evento}/convocar
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  Calendar,
  Users,
  X,
  Loader2,
  AlertCircle,
  RefreshCw,
  MapPin,
  Clock,
  ListPlus,
  Search,
  PlusCircle,
  Trophy,
  Dumbbell,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  CheckCircle,
  XCircle,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

// --- Helpers ---

const TIPO_CONFIG = {
  partido:        { label: 'Partido',        icon: Trophy,     classes: 'bg-emerald-100 text-emerald-800' },
  entrenamiento:  { label: 'Entrenamiento',  icon: Dumbbell,   classes: 'bg-blue-100 text-blue-800' },
  torneo:         { label: 'Torneo',         icon: Trophy,     classes: 'bg-purple-100 text-purple-800' },
  institucional:  { label: 'Institucional',  icon: Building2,  classes: 'bg-gray-100 text-gray-700' },
  otro:           { label: 'Evento',         icon: CalendarDays, classes: 'bg-gray-100 text-gray-700' },
}

const formatoFecha = (fecha) =>
  new Date(fecha).toLocaleDateString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'short',
  })

const formatoHora = (fecha) =>
  new Date(fecha).toLocaleTimeString('es-AR', {
    hour: '2-digit', minute: '2-digit',
  })

function TipoBadge({ tipo }) {
  const config = TIPO_CONFIG[tipo] ?? TIPO_CONFIG.otro
  const Icon = config.icon
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${config.classes}`}>
      <Icon size={12} /> {config.label}
    </span>
  )
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

// --- Modal de Convocatoria ---

function ConvocatoriaModal({ evento, onClose, onSaveSuccess }) {
  const { token } = useAuth()
  const [plantel, setPlantel] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  // Usamos un Set para gestionar los IDs seleccionados por eficiencia
  const [selectedIds, setSelectedIds] = useState(new Set())

  // Fetch del plantel de la categoría
  useEffect(() => {
    if (!evento?.id_categoria) {
      setError('El evento no tiene una categoría deportiva asociada.')
      setLoading(false)
      return
    }

    const fetchPlantel = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`${API}/deportivo/categorias/${evento.id_categoria}/jugadores`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) throw new Error('No se pudo cargar el plantel de la categoría.')
        const data = await res.json()
        setPlantel(data)

        // Pre-seleccionar jugadores ya convocados
        const convocadosIds = new Set(evento.convocatorias.map(c => c.id_usuario))
        setSelectedIds(convocadosIds)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchPlantel()
  }, [evento, token])

  const handleTogglePlayer = (id) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  const handleSelectAll = () => {
    const allIds = new Set(plantel.map(p => p.usuario.id_usuario))
    setSelectedIds(allIds)
  }

  const handleDeselectAll = () => {
    setSelectedIds(new Set())
  }

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)
    try {
      const res = await fetch(`${API}/deportivo/eventos/${evento.id_evento}/convocar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ids_usuarios: Array.from(selectedIds) }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.detail ?? 'Error al guardar la convocatoria.')
      }
      onSaveSuccess()
    } catch (err) {
      setError(err.message)
    } finally {
      setIsSaving(false)
    }
  }

  const filteredPlantel = useMemo(() => {
    if (!searchTerm) return plantel
    const term = searchTerm.toLowerCase()
    return plantel.filter(p =>
      p.usuario.nombre.toLowerCase().includes(term) ||
      p.usuario.apellido.toLowerCase().includes(term) ||
      p.usuario.dni.includes(term)
    )
  }, [plantel, searchTerm])

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center items-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90dvh]">
        <div className="p-6 border-b flex-shrink-0 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Armar Convocatoria</h2>
            <p className="text-sm text-gray-500 mt-1">{evento.titulo}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 size={24} className="animate-spin text-gray-400" />
            </div>
          ) : (
            <>
              <div className="sticky top-0 bg-white pt-1 pb-3">
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar jugador..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="form-input pl-9 w-full"
                  />
                </div>
                <div className="flex items-center gap-3 mt-3">
                  <button onClick={handleSelectAll} className="text-xs font-medium text-blue-600 hover:underline">
                    Seleccionar todos
                  </button>
                  <button onClick={handleDeselectAll} className="text-xs font-medium text-blue-600 hover:underline">
                    Deseleccionar todos
                  </button>
                  <span className="ml-auto text-xs text-gray-500 font-medium">
                    {selectedIds.size} / {plantel.length} seleccionados
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                {filteredPlantel.length > 0 ? (
                  filteredPlantel.map(({ usuario }) => (
                    <label
                      key={usuario.id_usuario}
                      className="flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors"
                      style={{
                        backgroundColor: selectedIds.has(usuario.id_usuario) ? '#eff6ff' : '#ffffff',
                        borderColor: selectedIds.has(usuario.id_usuario) ? '#93c5fd' : '#e5e7eb',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(usuario.id_usuario)}
                        onChange={() => handleTogglePlayer(usuario.id_usuario)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="font-medium text-gray-800">{usuario.apellido}, {usuario.nombre}</span>
                      <span className="ml-auto text-xs text-gray-400 font-mono">DNI {usuario.dni}</span>
                    </label>
                  ))
                ) : (
                  <p className="text-center text-sm text-gray-500 py-6">
                    No se encontraron jugadores con ese criterio.
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="p-4 bg-gray-50 rounded-b-2xl border-t flex justify-end gap-3 flex-shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-gray-600 bg-gray-200 hover:bg-gray-300 font-semibold transition-colors">
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || loading}
            className="px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700 font-semibold disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {isSaving && <Loader2 size={14} className="animate-spin" />}
            Guardar Convocatoria
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Modal: Nuevo Evento ---

function NuevoEventoModal({ onClose, onSaveSuccess }) {
  const { token } = useAuth()
  const [categorias, setCategorias] = useState([])
  const [loadingCategorias, setLoadingCategorias] = useState(true)

  const [formData, setFormData] = useState({
    titulo: '',
    tipo: 'partido',
    id_categoria: '', // Usar string vacío para "Ninguna"
    descripcion: '',
    fecha_inicio: '',
    fecha_fin: '',
    ubicacion: '',
  })

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [apiError, setApiError] = useState(null)

  // Fetch de categorías para el select
  useEffect(() => {
    const fetchCategorias = async () => {
      try {
        const res = await fetch(`${API}/deportivo/categorias`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) throw new Error('No se pudieron cargar las categorías.')
        setCategorias(await res.json())
      } catch (err) {
        // No es un error fatal, el modal puede funcionar sin categorías
        console.error(err.message)
      } finally {
        setLoadingCategorias(false)
      }
    }
    fetchCategorias()
  }, [token])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)
    setApiError(null)

    if (!formData.titulo || !formData.fecha_inicio) {
      setApiError('El título y la fecha de inicio son obligatorios.')
      setIsSubmitting(false)
      return
    }

    const payload = {
      ...formData,
      id_categoria: formData.id_categoria ? Number(formData.id_categoria) : null,
      fecha_fin: formData.fecha_fin || null,
      descripcion: formData.descripcion || null,
      ubicacion: formData.ubicacion || null,
    }

    try {
      const res = await fetch(`${API}/deportivo/eventos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.detail ?? 'Error al crear el evento.')
      }
      onSaveSuccess()
    } catch (err) {
      setApiError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const formLabelClass = "block text-xs font-semibold text-gray-600 mb-1.5"

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center items-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90dvh]">
        <div className="p-6 border-b flex-shrink-0 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Nuevo Evento</h2>
            <p className="text-sm text-gray-500 mt-1">Crear un partido, entrenamiento u otro.</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {apiError && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
              <span>{apiError}</span>
            </div>
          )}

          <div>
            <label className={formLabelClass}>Título del Evento</label>
            <input type="text" name="titulo" value={formData.titulo} onChange={handleChange} required className="form-input" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={formLabelClass}>Tipo de Evento</label>
              <select name="tipo" value={formData.tipo} onChange={handleChange} className="form-input">
                <option value="partido">Partido</option>
                <option value="entrenamiento">Entrenamiento</option>
                <option value="torneo">Torneo</option>
                <option value="institucional">Institucional</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div>
              <label className={formLabelClass}>Categoría (Opcional)</label>
              <select name="id_categoria" value={formData.id_categoria} onChange={handleChange} disabled={loadingCategorias} className="form-input disabled:bg-gray-100">
                <option value="">Ninguna</option>
                {categorias.map(cat => (
                  <option key={cat.id_categoria} value={cat.id_categoria}>{cat.nombre}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={formLabelClass}>Fecha y Hora de Inicio</label>
              <input type="datetime-local" name="fecha_inicio" value={formData.fecha_inicio} onChange={handleChange} required className="form-input" />
            </div>
            <div>
              <label className={formLabelClass}>Fecha y Hora de Fin (Opcional)</label>
              <input type="datetime-local" name="fecha_fin" value={formData.fecha_fin} onChange={handleChange} className="form-input" />
            </div>
          </div>

          <div>
            <label className={formLabelClass}>Ubicación (Opcional)</label>
            <input type="text" name="ubicacion" value={formData.ubicacion} onChange={handleChange} className="form-input" />
          </div>
        </div>

        <div className="p-4 bg-gray-50 rounded-b-2xl border-t flex justify-end gap-3 flex-shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-gray-600 bg-gray-200 hover:bg-gray-300 font-semibold transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={isSubmitting} className="px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700 font-semibold disabled:opacity-50 transition-colors flex items-center gap-2">
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            Crear Evento
          </button>
        </div>
      </form>
    </div>
  )
}

// --- Componente Principal ---

export default function TecnicoEventos() {
  const { token } = useAuth()
  const [eventos, setEventos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [modalNuevoEventoAbierto, setModalNuevoEventoAbierto] = useState(false)
  const [expandedEventId, setExpandedEventId] = useState(null)

  const fetchEventos = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      // Traemos solo los eventos futuros o en curso
      const params = new URLSearchParams({
        desde: new Date().toISOString(),
        estado: 'programado',
      })
      const res = await fetch(`${API}/deportivo/eventos?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('No se pudieron cargar los eventos.')
      setEventos(await res.json())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { fetchEventos() }, [fetchEventos])

  const handleSaveSuccess = () => {
    setSelectedEvent(null)
    fetchEventos() // Recargar para ver los cambios
  }

  const handleNuevoEventoSuccess = () => {
    setModalNuevoEventoAbierto(false)
    fetchEventos()
  }

  const handleToggleExpand = (id) => {
    setExpandedEventId(prevId => (prevId === id ? null : id))
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {selectedEvent && (
        <ConvocatoriaModal
          evento={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onSaveSuccess={handleSaveSuccess}
        />
      )}
      {modalNuevoEventoAbierto && (
        <NuevoEventoModal
          onClose={() => setModalNuevoEventoAbierto(false)}
          onSaveSuccess={handleNuevoEventoSuccess}
        />
      )}

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Calendar size={24} className="text-gray-500" />
            Gestión de Eventos
          </h1>
          <p className="text-sm text-gray-500 mt-1">Armá las convocatorias para los próximos partidos y entrenamientos.</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            onClick={() => setModalNuevoEventoAbierto(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 text-white font-semibold hover:bg-green-700 transition-colors shadow-sm text-sm"
          >
            <PlusCircle size={16} />
            Nuevo Evento
          </button>
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

      <div className="space-y-3">
        {loading && [...Array(3)].map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 h-24 animate-pulse" />
        ))}

        {!loading && eventos.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No hay eventos programados.
          </div>
        )}

        {!loading && eventos.map(evento => {
          const isExpanded = expandedEventId === evento.id_evento
          const convocatoriasOrdenadas = [...evento.convocatorias].sort((a, b) =>
            (a.usuario?.apellido ?? '').localeCompare(b.usuario?.apellido ?? '')
          )
          return (<div key={evento.id_evento} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <TipoBadge tipo={evento.tipo} />
                <h3 className="font-bold text-gray-900 text-lg mt-2">{evento.titulo}</h3>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 mt-2">
                  <span className="flex items-center gap-1.5">
                    <Clock size={13} />
                    {formatoFecha(evento.fecha_inicio)} - {formatoHora(evento.fecha_inicio)}
                  </span>
                  {evento.ubicacion && (
                    <span className="flex items-center gap-1.5">
                      <MapPin size={13} />
                      {evento.ubicacion}
                    </span>
                  )}
                </div>
              </div>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex-shrink-0 mt-1">
                {evento.categoria?.nombre ?? 'General'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 pt-4 border-t border-gray-100 flex-wrap">
              <button
                onClick={() => handleToggleExpand(evento.id_evento)}
                disabled={evento.convocatorias.length === 0}
                className="flex items-center gap-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Users size={15} className="text-gray-400" />
                <span className="font-medium text-gray-600">
                  {evento.convocatorias.length} convocado{evento.convocatorias.length !== 1 ? 's' : ''}
                </span>
                {evento.convocatorias.length > 0 && (isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
              </button>
              <button
                onClick={() => setSelectedEvent(evento)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors shadow-sm text-sm"
              >
                <ListPlus size={15} />
                Armar Convocatoria
              </button>
            </div>

            {isExpanded && (
              <div className="pt-4 border-t border-gray-100 space-y-2">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Lista de Convocados</h4>
                {convocatoriasOrdenadas.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                    {convocatoriasOrdenadas.map(conv => (
                      <div key={conv.id_usuario} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-gray-50/50">
                        <span className="font-medium text-sm text-gray-800">
                          {conv.usuario?.apellido}, {conv.usuario?.nombre}
                        </span>
                        <EstadoConvocatoriaBadge estado={conv.estado} />
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )}

          </div>)
        })}
      </div>
    </div>
  )
}