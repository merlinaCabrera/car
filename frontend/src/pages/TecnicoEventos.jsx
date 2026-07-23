

// frontend/src/pages/TecnicoEventos.jsx
/**
 * Panel para que el Personal Técnico y el Admin General gestionen eventos.
 *
 * Vistas: Lista (default) ↔ Calendario mensual — toggle en el header.
 * Desde el calendario se puede hacer clic en un evento para abrir
 * directamente el modal de Armar Convocatoria.
 *
 * Backend consumido:
 *   GET   /deportivo/eventos
 *   GET   /deportivo/categorias/{id_categoria}/jugadores
 *   POST  /deportivo/eventos/{id_evento}/convocar
 *   POST  /deportivo/eventos
 *   PATCH /deportivo/eventos/{id_evento}
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import CalendarioMensual from '../components/CalendarioMensual'
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
  List,
  LayoutGrid,
  FileDown,
  History,
  Pencil,
} from 'lucide-react'
import { useExportarConvocatoria } from '../hooks/useExportarConvocatoria'
import { useExportarAsistencias } from '../hooks/useExportarAsistencias'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TIPO_CONFIG = {
  partido:       { label: 'Partido',       icon: Trophy,      classes: 'bg-emerald-100 text-emerald-800', chip: 'bg-emerald-500' },
  entrenamiento: { label: 'Entrenamiento', icon: Dumbbell,    classes: 'bg-blue-100 text-blue-800',      chip: 'bg-blue-500'    },
  torneo:        { label: 'Torneo',        icon: Trophy,      classes: 'bg-purple-100 text-purple-800',  chip: 'bg-purple-500'  },
  institucional: { label: 'Institucional', icon: Building2,   classes: 'bg-gray-100 text-gray-700',      chip: 'bg-gray-400'    },
  otro:          { label: 'Evento',        icon: CalendarDays, classes: 'bg-gray-100 text-gray-700',     chip: 'bg-gray-400'    },
}

const formatoFecha = (fecha) =>
  new Date(fecha).toLocaleDateString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'short',
  })

const formatoHora = (fecha) =>
  new Date(fecha).toLocaleTimeString('es-AR', {
    hour: '2-digit', minute: '2-digit',
  })

/**
 * <input type="datetime-local"> devuelve un string naive tipo
 * "2026-07-22T23:27", sin timezone — representa la hora LOCAL que el
 * usuario tipeó/eligió. `new Date(...)` de JS interpreta ese string naive
 * usando la zona horaria del navegador (Argentina, UTC-3) y `.toISOString()`
 * lo convierte correctamente a UTC real. Sin este paso, mandar el string
 * crudo al backend hace que se guarde 3hs adelantado/atrasado (se pierde
 * la conversión de zona horaria por completo).
 */
function datetimeLocalToISO(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

/**
 * Inverso de datetimeLocalToISO: toma un ISO en UTC (lo que devuelve el
 * backend, ej "2026-07-23T02:27:00.000Z") y arma el string naive que espera
 * un <input type="datetime-local">. `new Date(iso)` ya lo interpreta en la
 * zona horaria del navegador (Argentina), así que getFullYear/getHours/etc.
 * devuelven directamente los componentes en hora local — no hace falta
 * restar el offset a mano.
 */
function isoToDatetimeLocal(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

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
  citado:     { label: 'Citado',     icon: HelpCircle,   classes: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  confirmado: { label: 'Confirmado', icon: CheckCircle,  classes: 'bg-green-100 text-green-800 border-green-200'   },
  rechazado:  { label: 'Rechazado',  icon: XCircle,      classes: 'bg-red-100 text-red-800 border-red-200'         },
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

// ─── Modal de Convocatoria ─────────────────────────────────────────────────────

function ConvocatoriaModal({ evento, onClose, onSaveSuccess }) {
  const { token } = useAuth()
  const [plantel, setPlantel] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedIds, setSelectedIds] = useState(new Set())

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
        const res = await fetch(
          `${API}/deportivo/categorias/${evento.id_categoria}/jugadores`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        if (!res.ok) throw new Error('No se pudo cargar el plantel de la categoría.')
        const data = await res.json()
        setPlantel(data)
        setSelectedIds(new Set(evento.convocatorias.map(c => c.id_usuario)))
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
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleSelectAll   = () => setSelectedIds(new Set(plantel.map(p => p.usuario.id_usuario)))
  const handleDeselectAll = () => setSelectedIds(new Set())

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)
    try {
      const res = await fetch(`${API}/deportivo/eventos/${evento.id_evento}/convocar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
                  <button onClick={handleSelectAll} className="text-xs font-medium text-blue-600 hover:underline">Seleccionar todos</button>
                  <button onClick={handleDeselectAll} className="text-xs font-medium text-blue-600 hover:underline">Deseleccionar todos</button>
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

        <div className="p-4 bg-gray-50 rounded-b-2xl border-t flex items-center justify-between gap-3 flex-shrink-0 flex-wrap">
          {/* Exportar PDF — accesible también desde el calendario */}
          <ExportarBotonModal evento={evento} />

          <div className="flex items-center gap-3">
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
    </div>
  )
}

// ─── Botón de exportar para el footer del modal ────────────────────────────────
// Componente separado para que tenga su propio estado de exportando
// sin interferir con el estado del modal de convocatoria.
function ExportarBotonModal({ evento }) {
  const { token } = useAuth()
  const { exportar, exportando, errorExport } = useExportarConvocatoria()
  const {
    exportar: exportarAsistencias,
    exportando: exportandoAsistencias,
    errorExport: errorAsistencias,
  } = useExportarAsistencias(token)
  const tieneConvocados = (evento?.convocatorias?.length ?? 0) > 0
  const esFinalizado = evento?.estado === 'finalizado'

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => exportar(evento)}
          disabled={exportando || !tieneConvocados}
          title={tieneConvocados ? 'Descargar lista en PDF' : 'Guardá la convocatoria primero'}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-600 font-semibold hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm"
        >
          {exportando ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
          {exportando ? 'Generando…' : 'Exportar convocatoria'}
        </button>

        {esFinalizado && (
          <button
            onClick={() => exportarAsistencias(evento)}
            disabled={exportandoAsistencias}
            title="Descargar planilla de asistencia real (quién ingresó por la puerta)"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-600 font-semibold hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm"
          >
            {exportandoAsistencias ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
            {exportandoAsistencias ? 'Generando…' : 'Exportar asistencia'}
          </button>
        )}
      </div>
      {errorExport && <p className="text-xs text-amber-700">{errorExport}</p>}
      {errorAsistencias && <p className="text-xs text-amber-700">{errorAsistencias}</p>}
    </div>
  )
}

// ─── Modal: Nuevo Evento ───────────────────────────────────────────────────────

/**
 * Modal de alta/edición de evento.
 *
 * Sin `evento` → modo creación (POST /deportivo/eventos), igual que el
 * NuevoEventoModal original.
 * Con `evento` → modo edición (PATCH /deportivo/eventos/{id}), formulario
 * precargado y con el campo "Estado" habilitado (crear siempre arranca en
 * 'programado', pero editar es justamente donde tiene sentido poder pasarlo
 * a 'en_curso'/'finalizado'/'cancelado' a mano si hace falta).
 */
function EventoFormModal({ evento, onClose, onSaveSuccess }) {
  const esEdicion = !!evento
  const { token } = useAuth()
  const [categorias, setCategorias] = useState([])
  const [loadingCategorias, setLoadingCategorias] = useState(true)
  const [formData, setFormData] = useState(() => ({
    titulo: evento?.titulo ?? '',
    tipo: evento?.tipo ?? 'partido',
    id_categoria: evento?.id_categoria ?? '',
    descripcion: evento?.descripcion ?? '',
    fecha_inicio: isoToDatetimeLocal(evento?.fecha_inicio),
    fecha_fin: isoToDatetimeLocal(evento?.fecha_fin),
    ubicacion: evento?.ubicacion ?? '',
    estado: evento?.estado ?? 'programado',
  }))
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [apiError, setApiError] = useState(null)

  useEffect(() => {
    const fetchCategorias = async () => {
      try {
        const res = await fetch(`${API}/deportivo/categorias`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) throw new Error()
        setCategorias(await res.json())
      } catch { /* no es fatal */ } finally {
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
    if (!formData.titulo || !formData.fecha_inicio) {
      setApiError('El título y la fecha de inicio son obligatorios.')
      return
    }
    setIsSubmitting(true)
    setApiError(null)

    const base = {
      titulo: formData.titulo,
      tipo: formData.tipo,
      id_categoria: formData.id_categoria ? Number(formData.id_categoria) : null,
      fecha_inicio: datetimeLocalToISO(formData.fecha_inicio),
      fecha_fin: datetimeLocalToISO(formData.fecha_fin),
      descripcion: formData.descripcion || null,
      ubicacion: formData.ubicacion || null,
    }
    const payload = esEdicion ? { ...base, estado: formData.estado } : base

    try {
      const res = await fetch(
        esEdicion ? `${API}/deportivo/eventos/${evento.id_evento}` : `${API}/deportivo/eventos`,
        {
          method: esEdicion ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        }
      )
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.detail ?? `Error al ${esEdicion ? 'editar' : 'crear'} el evento.`)
      }
      onSaveSuccess()
    } catch (err) {
      setApiError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const L = "block text-xs font-semibold text-gray-600 mb-1.5"

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center items-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90dvh]">
        <div className="p-6 border-b flex-shrink-0 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-800">{esEdicion ? 'Editar Evento' : 'Nuevo Evento'}</h2>
            <p className="text-sm text-gray-500 mt-1">
              {esEdicion ? 'Modificá los datos del evento.' : 'Crear un partido, entrenamiento u otro.'}
            </p>
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
            <label className={L}>Título del Evento</label>
            <input type="text" name="titulo" value={formData.titulo} onChange={handleChange} required className="form-input" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={L}>Tipo de Evento</label>
              <select name="tipo" value={formData.tipo} onChange={handleChange} className="form-input">
                <option value="partido">Partido</option>
                <option value="entrenamiento">Entrenamiento</option>
                <option value="torneo">Torneo</option>
                <option value="institucional">Institucional</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div>
              <label className={L}>Categoría (Opcional)</label>
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
              <label className={L}>Fecha y Hora de Inicio</label>
              <input type="datetime-local" name="fecha_inicio" value={formData.fecha_inicio} onChange={handleChange} required className="form-input" />
            </div>
            <div>
              <label className={L}>Fecha y Hora de Fin (Opcional)</label>
              <input type="datetime-local" name="fecha_fin" value={formData.fecha_fin} onChange={handleChange} className="form-input" />
            </div>
          </div>

          <div>
            <label className={L}>Ubicación (Opcional)</label>
            <input type="text" name="ubicacion" value={formData.ubicacion} onChange={handleChange} className="form-input" />
          </div>

          <div>
            <label className={L}>Descripción (Opcional)</label>
            <textarea
              name="descripcion"
              value={formData.descripcion}
              onChange={handleChange}
              rows={2}
              className="form-input resize-none"
            />
          </div>

          {/* Estado — solo tiene sentido tocarlo al editar. Al crear siempre
              arranca en 'programado' (default del backend). */}
          {esEdicion && (
            <div>
              <label className={L}>Estado</label>
              <select name="estado" value={formData.estado} onChange={handleChange} className="form-input">
                <option value="programado">Programado</option>
                <option value="en_curso">En curso</option>
                <option value="finalizado">Finalizado</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
          )}
        </div>

        <div className="p-4 bg-gray-50 rounded-b-2xl border-t flex justify-end gap-3 flex-shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-gray-600 bg-gray-200 hover:bg-gray-300 font-semibold transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={isSubmitting} className="px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700 font-semibold disabled:opacity-50 transition-colors flex items-center gap-2">
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            {esEdicion ? 'Guardar Cambios' : 'Crear Evento'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Toggle Lista / Calendario ─────────────────────────────────────────────────

function VistaToggle({ vista, onChange }) {
  return (
    <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-1">
      <button
        onClick={() => onChange('lista')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
          vista === 'lista'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        <List size={15} />
        Lista
      </button>
      <button
        onClick={() => onChange('calendario')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
          vista === 'calendario'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        <LayoutGrid size={15} />
        Calendario
      </button>
    </div>
  )
}

// ─── Componente Principal ──────────────────────────────────────────────────────

export default function TecnicoEventos() {
  const { token } = useAuth()
  const [eventos, setEventos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [modalNuevoEventoAbierto, setModalNuevoEventoAbierto] = useState(false)
  const [eventoEditando, setEventoEditando] = useState(null)
  const [expandedEventId, setExpandedEventId] = useState(null)
  const [vista, setVista] = useState('lista')
  const [mesCalendario, setMesCalendario] = useState(new Date())
  const [mostrarFinalizados, setMostrarFinalizados] = useState(false)
  const { exportar, exportando, errorExport } = useExportarConvocatoria()
  const {
    exportar: exportarAsistencias,
    exportando: exportandoAsistencias,
    errorExport: errorAsistencias,
  } = useExportarAsistencias(token)

  const fetchEventos = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const ahora = new Date().toISOString()
      // Sin 'desde': un evento 'programado' sigue siendo relevante aunque su
      // fecha_inicio ya haya pasado — nadie lo pasó a 'en_curso'/'finalizado'
      // todavía, así que sigue siendo trabajo pendiente del técnico, no algo
      // que deba desaparecer de la lista solo porque el reloj avanzó.
      const paramsProgramados = new URLSearchParams({ estado: 'programado' })

      const fetchProgramados = fetch(`${API}/deportivo/eventos?${paramsProgramados.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      // 'desde' filtra fecha_inicio >= desde: un evento 'finalizado' ya pasó,
      // así que para traerlo hay que pedir explícitamente 'hasta=ahora' y
      // NO mandar 'desde=ahora' (o directamente no mandar 'desde'). Se acota
      // a los últimos 60 días para no traer todo el historial del club.
      const hace60Dias = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
      const paramsFinalizados = new URLSearchParams({
        desde: hace60Dias, hasta: ahora, estado: 'finalizado',
      })
      const fetchFinalizados = mostrarFinalizados
        ? fetch(`${API}/deportivo/eventos?${paramsFinalizados.toString()}`, {
            headers: { Authorization: `Bearer ${token}` },
          })
        : null

      const [resProgramados, resFinalizados] = await Promise.all([
        fetchProgramados,
        fetchFinalizados,
      ])

      if (!resProgramados.ok) throw new Error('No se pudieron cargar los eventos.')
      const programados = await resProgramados.json()

      let finalizados = []
      if (resFinalizados) {
        if (!resFinalizados.ok) throw new Error('No se pudieron cargar los eventos finalizados.')
        finalizados = await resFinalizados.json()
      }

      // Más recientes primero para finalizados (exportar el último jugado
      // suele ser lo más buscado), programados en orden cronológico normal.
      const combinados = [
        ...programados,
        ...[...finalizados].sort((a, b) => new Date(b.fecha_inicio) - new Date(a.fecha_inicio)),
      ]
      setEventos(combinados)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token, mostrarFinalizados])

  useEffect(() => { fetchEventos() }, [fetchEventos])

  const handleSaveSuccess = () => {
    setSelectedEvent(null)
    fetchEventos()
  }

  const handleNuevoEventoSuccess = () => {
    setModalNuevoEventoAbierto(false)
    fetchEventos()
  }

  const handleEditarEventoSuccess = () => {
    setEventoEditando(null)
    fetchEventos()
  }

  const handleToggleExpand = (id) => {
    setExpandedEventId(prev => (prev === id ? null : id))
  }

  // ── Render chip para el calendario mensual ─────────────────────────────────
  const renderEventoCalendario = useCallback((evento) => {
    const config = TIPO_CONFIG[evento.tipo] ?? TIPO_CONFIG.otro
    return (
      <button
        onClick={() => setSelectedEvent(evento)}
        title={evento.titulo}
        className={`w-full text-left px-1.5 py-0.5 rounded text-[10px] font-semibold text-white truncate transition-opacity hover:opacity-80 ${config.chip}`}
      >
        {formatoHora(evento.fecha_inicio)} {evento.titulo}
      </button>
    )
  }, [])

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
        <EventoFormModal
          onClose={() => setModalNuevoEventoAbierto(false)}
          onSaveSuccess={handleNuevoEventoSuccess}
        />
      )}
      {eventoEditando && (
        <EventoFormModal
          evento={eventoEditando}
          onClose={() => setEventoEditando(null)}
          onSaveSuccess={handleEditarEventoSuccess}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Calendar size={24} className="text-gray-500" />
            Gestión de Eventos
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Armá las convocatorias para los próximos partidos y entrenamientos.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 flex-wrap">
          <VistaToggle vista={vista} onChange={setVista} />
          <button
            onClick={() => setMostrarFinalizados(prev => !prev)}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl font-semibold text-sm transition-colors ${
              mostrarFinalizados
                ? 'bg-slate-800 text-white hover:bg-slate-900'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            title="Incluir eventos ya finalizados (para exportar su planilla de asistencia)"
          >
            <History size={15} />
            {mostrarFinalizados ? 'Viendo finalizados' : 'Ver finalizados'}
          </button>
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

      {errorExport && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <AlertCircle size={18} className="flex-shrink-0" />
          <span className="flex-1">{errorExport}</span>
        </div>
      )}

      {errorAsistencias && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <AlertCircle size={18} className="flex-shrink-0" />
          <span className="flex-1">{errorAsistencias}</span>
        </div>
      )}

      {/* ── Vista Calendario ─────────────────────────────────────────────── */}
      {vista === 'calendario' && (
        <div className="space-y-3">
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
              {/* Leyenda de tipos */}
              <div className="flex flex-wrap items-center gap-3 px-1">
                {Object.entries(TIPO_CONFIG).map(([key, cfg]) => (
                  <span key={key} className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className={`w-2.5 h-2.5 rounded-sm ${cfg.chip}`} />
                    {cfg.label}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Vista Lista ──────────────────────────────────────────────────── */}
      {vista === 'lista' && (
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
            return (
              <div key={evento.id_evento} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="inline-flex items-center gap-2 flex-wrap">
                      <TipoBadge tipo={evento.tipo} />
                      {evento.estado === 'finalizado' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-700">
                          <History size={12} /> Finalizado
                        </span>
                      )}
                    </div>
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
                  {/* Izquierda: contador expandible */}
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

                  {/* Derecha: acciones */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Exportar convocatoria — visible solo si hay convocados */}
                    {evento.convocatorias.length > 0 && (
                      <button
                        onClick={() => exportar(evento)}
                        disabled={exportando}
                        title="Descargar lista de convocados en PDF"
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white text-gray-600 font-semibold hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 disabled:cursor-wait transition-colors text-sm"
                      >
                        {exportando
                          ? <Loader2 size={14} className="animate-spin" />
                          : <FileDown size={14} />
                        }
                        {exportando ? 'Generando…' : 'Exportar convocatoria'}
                      </button>
                    )}

                    {/* Exportar asistencia real — solo eventos ya finalizados */}
                    {evento.estado === 'finalizado' && (
                      <button
                        onClick={() => exportarAsistencias(evento)}
                        disabled={exportandoAsistencias}
                        title="Descargar planilla de asistencia real (quién ingresó por la puerta)"
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white text-gray-600 font-semibold hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 disabled:cursor-wait transition-colors text-sm"
                      >
                        {exportandoAsistencias
                          ? <Loader2 size={14} className="animate-spin" />
                          : <FileDown size={14} />
                        }
                        {exportandoAsistencias ? 'Generando…' : 'Exportar asistencia'}
                      </button>
                    )}

                    <button
                      onClick={() => setEventoEditando(evento)}
                      title="Editar título, fechas, ubicación, categoría o estado"
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white text-gray-600 font-semibold hover:bg-gray-50 hover:border-gray-300 transition-colors text-sm"
                    >
                      <Pencil size={14} />
                      Editar
                    </button>

                    <button
                      onClick={() => setSelectedEvent(evento)}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors shadow-sm text-sm"
                    >
                      <ListPlus size={15} />
                      Armar Convocatoria
                    </button>
                  </div>
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
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}