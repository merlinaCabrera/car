// frontend/src/pages/TecnicoPlanteles.jsx
/**
 * Gestión de Planteles — ruta `/gestion-planteles`.
 *
 * Flujo: el Personal Técnico y el Admin General ven sus categorías
 * deportivas como tarjetas y, al entrar a una, ven el plantel de la
 * temporada seleccionada con:
 *   - Un buscador de socios con rol 'jugador' para inscribir excepciones manuales.
 *   - Una tabla de jugadores donde se puede tildar/destildar la capitanía
 *     y ver el año de nacimiento de cada uno.
 *   - El botón "Autocompletar" (visible SOLO para admin_general) que inscribe
 *     masivamente a todos los jugadores cuya fecha_nacimiento entra en el
 *     corte de la categoría.
 *
 * Reparto de permisos (alineado con dependencies.require_roles del backend):
 *   - "Nueva Categoría" y "Editar Categoría" (nombre, estado, cortes de edad)
 *     son EXCLUSIVOS de admin_general — el Personal Técnico solo administra
 *     jugadores dentro de las categorías que el admin ya creó.
 *   - Inscribir/dar de baja jugadores y tildar capitanes están disponibles
 *     para ambos roles (el backend acepta "tecnico" y "admin_general" por
 *     igual en esos endpoints).
 *
 * Backend consumido:
 *   GET    /deportivo/categorias?incluir_inactivas=true
 *   POST   /deportivo/categorias                      (solo admin_general)
 *   PATCH  /deportivo/categorias/{id}                  (solo admin_general — cortes de edad, nombre, etc.)
 *   GET    /deportivo/categorias/{id}/jugadores?temporada=YYYY
 *   POST   /deportivo/categorias/{id}/jugadores
 *   DELETE /deportivo/categorias/{id}/jugadores/{id_usuario}?temporada=YYYY
 *   PATCH  /deportivo/categorias/{id}/jugadores/{id_usuario}  (tildar/destildar capitán)
 *   POST   /deportivo/categorias/{id}/autocompletar    (solo admin_general)
 *   GET    /deportivo/jugadores/buscar?q=...           (buscador de excepciones)
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  Shield,
  PlusCircle,
  Users,
  ArrowLeft,
  Search,
  Star,
  Trash2,
  AlertCircle,
  RefreshCw,
  Loader2,
  X,
  Wand2,
  Pencil,
  CalendarRange,
  CheckCircle2,
  Info,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const ANIO_ACTUAL = new Date().getFullYear()
const TEMPORADA_ACTUAL = String(ANIO_ACTUAL)
// Selector de temporada: un año hacia atrás, el actual, y uno hacia adelante
// (para armar el plantel de la próxima temporada con anticipación).
const TEMPORADAS_DISPONIBLES = [ANIO_ACTUAL - 1, ANIO_ACTUAL, ANIO_ACTUAL + 1].map(String)

// ─── Helper: roles del usuario logueado ────────────────────────────────────────
// Mismo criterio que MainLayout.jsx: soporta array de strings (JWT) y array
// de objetos (API), priorizando el que tenga datos.
function useRolesDeUsuario() {
  const { user } = useAuth()
  return useMemo(() => {
    const fromJwt = user?.roles
    const fromApi = user?.roles_asignados?.map(r => r.rol?.nombre).filter(Boolean)
    if (fromApi?.length) return fromApi
    if (fromJwt?.length) return fromJwt
    return []
  }, [user])
}

function formatearFecha(iso) {
  if (!iso) return null
  const [anio, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${anio}`
}

// ─── Modal: Nueva Categoría ────────────────────────────────────────────────────

function NuevaCategoriaModal({ onClose, onSave }) {
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [fechaCorteMin, setFechaCorteMin] = useState('')
  const [fechaCorteMax, setFechaCorteMax] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [apiError, setApiError] = useState(null)
  const [formError, setFormError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!nombre.trim()) {
      setFormError('El nombre es obligatorio.')
      return
    }
    if (fechaCorteMin && fechaCorteMax && fechaCorteMin > fechaCorteMax) {
      setFormError('La fecha "nacidos desde" no puede ser posterior a "nacidos hasta".')
      return
    }
    setFormError(null)
    setIsSubmitting(true)
    setApiError(null)
    try {
      await onSave({
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        es_activa: true,
        fecha_corte_min: fechaCorteMin || null,
        fecha_corte_max: fechaCorteMax || null,
      })
      onClose()
    } catch (err) {
      setApiError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center items-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[92dvh]">
        <div className="p-6 border-b flex-shrink-0 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Nueva Categoría</h2>
            <p className="text-sm text-gray-500 mt-1">Ej: Sub-15, Primera División, Veteranos.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            {apiError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                <span>{apiError}</span>
              </div>
            )}
            <div>
              <input
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                placeholder="Nombre de la categoría"
                required
                className={`form-input ${formError ? 'border-red-500' : ''}`}
              />
              {formError && <p className="text-red-600 text-xs mt-1">{formError}</p>}
            </div>
            <textarea
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              placeholder="Descripción (opcional)"
              rows={3}
              className="form-input resize-none"
            />

            <div className="pt-2 border-t">
              <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5 mb-1">
                <Wand2 size={14} className="text-purple-500" />
                Cortes de edad (para Autocompletar)
              </p>
              <p className="text-xs text-gray-500 mb-3">
                Opcional. Si completás ambas fechas, el Admin General va a poder inscribir
                masivamente a todos los jugadores nacidos en ese rango.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Nacidos desde</label>
                  <input
                    type="date"
                    value={fechaCorteMin}
                    onChange={e => setFechaCorteMin(e.target.value)}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Nacidos hasta</label>
                  <input
                    type="date"
                    value={fechaCorteMax}
                    onChange={e => setFechaCorteMax(e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-gray-50 rounded-b-2xl border-t flex justify-end gap-3 flex-shrink-0">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-gray-600 bg-gray-200 hover:bg-gray-300 font-semibold transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={isSubmitting} className="px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700 font-semibold disabled:opacity-50 transition-colors flex items-center gap-2">
              {isSubmitting && <Loader2 size={14} className="animate-spin" />}
              {isSubmitting ? 'Creando…' : 'Crear Categoría'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Modal: Editar Categoría (nombre, estado y cortes de edad) ─────────────────

function EditarCategoriaModal({ categoria, onClose, onSave }) {
  const [nombre, setNombre] = useState(categoria.nombre)
  const [descripcion, setDescripcion] = useState(categoria.descripcion ?? '')
  const [esActiva, setEsActiva] = useState(categoria.es_activa)
  const [fechaCorteMin, setFechaCorteMin] = useState(categoria.fecha_corte_min ?? '')
  const [fechaCorteMax, setFechaCorteMax] = useState(categoria.fecha_corte_max ?? '')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [apiError, setApiError] = useState(null)
  const [formError, setFormError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!nombre.trim()) {
      setFormError('El nombre es obligatorio.')
      return
    }
    if (fechaCorteMin && fechaCorteMax && fechaCorteMin > fechaCorteMax) {
      setFormError('La fecha "nacidos desde" no puede ser posterior a "nacidos hasta".')
      return
    }
    setFormError(null)
    setIsSubmitting(true)
    setApiError(null)
    try {
      await onSave({
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        es_activa: esActiva,
        fecha_corte_min: fechaCorteMin || null,
        fecha_corte_max: fechaCorteMax || null,
      })
      onClose()
    } catch (err) {
      setApiError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center items-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[92dvh]">
        <div className="p-6 border-b flex-shrink-0 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Editar Categoría</h2>
            <p className="text-sm text-gray-500 mt-1">{categoria.nombre}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            {apiError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                <span>{apiError}</span>
              </div>
            )}
            <div>
              <input
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                placeholder="Nombre de la categoría"
                required
                className={`form-input ${formError ? 'border-red-500' : ''}`}
              />
              {formError && <p className="text-red-600 text-xs mt-1">{formError}</p>}
            </div>
            <textarea
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              placeholder="Descripción (opcional)"
              rows={3}
              className="form-input resize-none"
            />

            <label className="flex items-center gap-3 p-3 rounded-xl border-2 border-gray-200 bg-white cursor-pointer select-none">
              <input type="checkbox" checked={esActiva} onChange={e => setEsActiva(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              <span className="text-sm font-semibold text-gray-700">Categoría activa</span>
            </label>

            <div className="pt-2 border-t">
              <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5 mb-1">
                <Wand2 size={14} className="text-purple-500" />
                Cortes de edad (para Autocompletar)
              </p>
              <p className="text-xs text-gray-500 mb-3">
                Si falta cualquiera de las dos fechas, el botón Autocompletar queda deshabilitado
                para esta categoría.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Nacidos desde</label>
                  <input
                    type="date"
                    value={fechaCorteMin}
                    onChange={e => setFechaCorteMin(e.target.value)}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Nacidos hasta</label>
                  <input
                    type="date"
                    value={fechaCorteMax}
                    onChange={e => setFechaCorteMax(e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-gray-50 rounded-b-2xl border-t flex justify-end gap-3 flex-shrink-0">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-gray-600 bg-gray-200 hover:bg-gray-300 font-semibold transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={isSubmitting} className="px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700 font-semibold disabled:opacity-50 transition-colors flex items-center gap-2">
              {isSubmitting && <Loader2 size={14} className="animate-spin" />}
              {isSubmitting ? 'Guardando…' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Modal: Inscribir Jugador (excepción manual) ───────────────────────────────

function InscribirJugadorModal({ categoria, temporada, onClose, onSave }) {
  const { token } = useAuth()
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState([])
  const [buscando, setBuscando] = useState(false)
  const [socioSeleccionado, setSocioSeleccionado] = useState(null)
  const [esCapitan, setEsCapitan] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [apiError, setApiError] = useState(null)

  useEffect(() => {
    const q = busqueda.trim()
    if (q.length < 2) { setResultados([]); return }

    const timeout = setTimeout(async () => {
      setBuscando(true)
      try {
        const res = await fetch(`${API}/deportivo/jugadores/buscar?q=${encodeURIComponent(q)}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          setResultados(Array.isArray(data) ? data.slice(0, 8) : [])
        } else {
          setResultados([])
        }
      } catch {
        setResultados([])
      } finally {
        setBuscando(false)
      }
    }, 350)

    return () => clearTimeout(timeout)
  }, [busqueda, token])

  const handleInscribir = async () => {
    if (!socioSeleccionado) return
    setIsSubmitting(true)
    setApiError(null)
    try {
      await onSave({
        id_usuario: socioSeleccionado.id_usuario,
        id_categoria: categoria.id_categoria,
        temporada,
        es_capitan: esCapitan,
      })
      onClose()
    } catch (err) {
      setApiError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center items-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[92dvh]">
        <div className="p-6 border-b flex-shrink-0 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Inscribir Jugador</h2>
            <p className="text-sm text-gray-500 mt-1">{categoria.nombre} · Temporada {temporada}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
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

          {!socioSeleccionado ? (
            <>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  placeholder="Buscar jugador por nombre o DNI…"
                  className="form-input pl-9"
                  autoFocus
                />
              </div>
              <p className="text-xs text-gray-400 -mt-2">
                Solo aparecen socios con el rol <b>jugador</b> asignado.
              </p>

              <div className="space-y-1">
                {buscando && <p className="text-sm text-gray-400 text-center py-3">Buscando…</p>}
                {!buscando && busqueda.trim().length >= 2 && resultados.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-3">Sin resultados.</p>
                )}
                {resultados.map(u => (
                  <button
                    key={u.id_usuario}
                    onClick={() => setSocioSeleccionado(u)}
                    className="w-full text-left px-4 py-2.5 rounded-lg hover:bg-blue-50 border border-gray-100 transition-colors flex items-center justify-between"
                  >
                    <span className="font-medium text-gray-800">{u.apellido}, {u.nombre}</span>
                    <span className="text-xs text-gray-400 font-mono">DNI {u.dni}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-blue-50 border border-blue-200">
                <div>
                  <p className="font-semibold text-blue-900">{socioSeleccionado.apellido}, {socioSeleccionado.nombre}</p>
                  <p className="text-xs text-blue-700">DNI {socioSeleccionado.dni}</p>
                </div>
                <button onClick={() => setSocioSeleccionado(null)} className="text-xs font-medium text-blue-700 underline underline-offset-2">
                  Cambiar
                </button>
              </div>

              <label className="flex items-center gap-3 p-3 rounded-xl border-2 border-gray-200 bg-white cursor-pointer select-none">
                <input type="checkbox" checked={esCapitan} onChange={e => setEsCapitan(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                  <Star size={14} className="text-amber-500" /> Marcar como capitán
                </span>
              </label>
            </>
          )}
        </div>

        <div className="p-4 bg-gray-50 rounded-b-2xl border-t flex justify-end gap-3 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-gray-600 bg-gray-200 hover:bg-gray-300 font-semibold transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleInscribir}
            disabled={!socioSeleccionado || isSubmitting}
            className="px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700 font-semibold disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            Inscribir
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal: Autocompletar Plantel (solo admin_general) ─────────────────────────

function AutocompletarModal({ categoria, temporada, onClose, onConfirm }) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [apiError, setApiError] = useState(null)

  const handleConfirmar = async () => {
    setIsSubmitting(true)
    setApiError(null)
    try {
      await onConfirm()
      onClose()
    } catch (err) {
      setApiError(err.message)
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center items-center p-4"
      onClick={e => { if (e.target === e.currentTarget && !isSubmitting) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col">
        <div className="p-6 border-b flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-purple-100 text-purple-600 flex-shrink-0">
            <Wand2 size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800">Autocompletar Plantel</h2>
            <p className="text-sm text-gray-500 mt-1">{categoria.nombre} · Temporada {temporada}</p>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {apiError && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
              <span>{apiError}</span>
            </div>
          )}
          <p className="text-sm text-gray-600">
            Se va a inscribir automáticamente a todos los socios con rol <b>jugador</b> nacidos
            entre el <b>{formatearFecha(categoria.fecha_corte_min)}</b> y el{' '}
            <b>{formatearFecha(categoria.fecha_corte_max)}</b> (inclusive) en el plantel de{' '}
            <b>{categoria.nombre}</b> para la temporada <b>{temporada}</b>.
          </p>
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
            <Info size={14} className="flex-shrink-0 mt-0.5" />
            <span>
              Los jugadores que ya estén en el plantel (por autocompletado previo o como
              excepción manual) no se duplican ni se modifican.
            </span>
          </div>
        </div>

        <div className="p-4 bg-gray-50 rounded-b-2xl border-t flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={isSubmitting} className="px-4 py-2 rounded-lg text-gray-600 bg-gray-200 hover:bg-gray-300 font-semibold transition-colors disabled:opacity-50">
            Cancelar
          </button>
          <button
            onClick={handleConfirmar}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-lg text-white bg-purple-600 hover:bg-purple-700 font-semibold disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            {isSubmitting ? 'Autocompletando…' : 'Confirmar Autocompletar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Vista: Plantel de una categoría ───────────────────────────────────────────

function VistaPlantel({ categoria, onVolver, onCategoriaActualizada }) {
  const { token } = useAuth()
  const userRoles = useRolesDeUsuario()
  const esAdminGeneral = userRoles.includes('admin_general')

  const [temporada, setTemporada] = useState(TEMPORADA_ACTUAL)
  const [jugadores, setJugadores] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [modalInscribirAbierto, setModalInscribirAbierto] = useState(false)
  const [modalAutocompletarAbierto, setModalAutocompletarAbierto] = useState(false)
  const [modalEditarAbierto, setModalEditarAbierto] = useState(false)
  const [resultadoAutocompletar, setResultadoAutocompletar] = useState(null)
  const [capitanEnCurso, setCapitanEnCurso] = useState(null) // id_usuario cuya capitanía se está actualizando

  const tieneCortesConfigurados = Boolean(categoria.fecha_corte_min && categoria.fecha_corte_max)

  const fetchJugadores = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `${API}/deportivo/categorias/${categoria.id_categoria}/jugadores?temporada=${temporada}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!res.ok) throw new Error(`Error ${res.status}: No se pudo cargar el plantel.`)
      setJugadores(await res.json())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [categoria.id_categoria, temporada, token])

  useEffect(() => { fetchJugadores() }, [fetchJugadores])
  useEffect(() => { setResultadoAutocompletar(null) }, [temporada])

  const handleInscribir = async (payload) => {
    const res = await fetch(`${API}/deportivo/categorias/${categoria.id_categoria}/jugadores`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail ?? 'Error al inscribir al jugador.')
    }
    fetchJugadores()
  }

  const handleEliminar = async (idUsuario, nombreCompleto) => {
    if (!window.confirm(`¿Sacar a ${nombreCompleto} del plantel de ${categoria.nombre} (temporada ${temporada})?`)) return
    try {
      const res = await fetch(
        `${API}/deportivo/categorias/${categoria.id_categoria}/jugadores/${idUsuario}?temporada=${temporada}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? 'Error al eliminar al jugador.')
      }
      fetchJugadores()
    } catch (err) {
      window.alert(`Error: ${err.message}`)
    }
  }

  const handleAutocompletar = async () => {
    const res = await fetch(`${API}/deportivo/categorias/${categoria.id_categoria}/autocompletar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ temporada }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail ?? 'Error al autocompletar el plantel.')
    }
    const data = await res.json()
    setResultadoAutocompletar(data)
    fetchJugadores()
  }

  const handleGuardarEdicion = async (payload) => {
    const actualizada = await onCategoriaActualizada(categoria.id_categoria, payload)
    return actualizada
  }

  const handleToggleCapitan = async (idUsuario, esCapitanActual) => {
    setCapitanEnCurso(idUsuario)
    try {
      const res = await fetch(
        `${API}/deportivo/categorias/${categoria.id_categoria}/jugadores/${idUsuario}`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ temporada, es_capitan: !esCapitanActual }),
        }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? 'Error al actualizar la capitanía.')
      }
      const actualizado = await res.json()
      setJugadores(prev =>
        prev.map(j => (j.id_usuario === idUsuario ? { ...j, es_capitan: actualizado.es_capitan } : j))
      )
    } catch (err) {
      window.alert(`Error: ${err.message}`)
    } finally {
      setCapitanEnCurso(null)
    }
  }

  return (
    <div className="space-y-6">
      {modalInscribirAbierto && (
        <InscribirJugadorModal
          categoria={categoria}
          temporada={temporada}
          onClose={() => setModalInscribirAbierto(false)}
          onSave={handleInscribir}
        />
      )}
      {modalAutocompletarAbierto && (
        <AutocompletarModal
          categoria={categoria}
          temporada={temporada}
          onClose={() => setModalAutocompletarAbierto(false)}
          onConfirm={handleAutocompletar}
        />
      )}
      {esAdminGeneral && modalEditarAbierto && (
        <EditarCategoriaModal
          categoria={categoria}
          onClose={() => setModalEditarAbierto(false)}
          onSave={handleGuardarEdicion}
        />
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onVolver} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-[160px]">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            {categoria.nombre}
            {esAdminGeneral && (
              <button
                onClick={() => setModalEditarAbierto(true)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                title="Editar categoría"
              >
                <Pencil size={15} />
              </button>
            )}
          </h1>
          <p className="text-sm text-gray-500">Plantel · Temporada {temporada}</p>
        </div>

        {/* Selector de temporada */}
        <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-600">
          <CalendarRange size={15} className="text-gray-400" />
          <select
            value={temporada}
            onChange={e => setTemporada(e.target.value)}
            className="bg-transparent focus:outline-none font-medium text-gray-800"
          >
            {TEMPORADAS_DISPONIBLES.map(anio => (
              <option key={anio} value={anio}>{anio}</option>
            ))}
          </select>
        </label>

        {/* Autocompletar — solo Admin General */}
        {esAdminGeneral && (
          <button
            onClick={() => setModalAutocompletarAbierto(true)}
            disabled={!tieneCortesConfigurados}
            title={
              tieneCortesConfigurados
                ? 'Inscribir masivamente por fecha de nacimiento'
                : 'Configurá los cortes de edad desde "Editar" antes de autocompletar'
            }
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-700 disabled:bg-gray-200 disabled:text-gray-400 transition-colors shadow-sm"
          >
            <Wand2 size={16} />
            Autocompletar
          </button>
        )}

        <button
          onClick={() => setModalInscribirAbierto(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors shadow-sm"
        >
          <PlusCircle size={16} />
          Inscribir Jugador
        </button>
      </div>

      {esAdminGeneral && !tieneCortesConfigurados && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-sm">
          <Info size={18} className="flex-shrink-0" />
          <span className="flex-1">
            Esta categoría todavía no tiene cortes de edad configurados, así que no se puede
            autocompletar. Usá el ícono de lápiz para definir el rango de fechas de nacimiento.
          </span>
        </div>
      )}

      {resultadoAutocompletar && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
          <CheckCircle2 size={18} className="flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Autocompletado terminado.</p>
            <p>
              Se encontraron <b>{resultadoAutocompletar.candidatos_encontrados}</b> jugadores dentro
              del corte de edad y se inscribieron <b>{resultadoAutocompletar.inscriptos_nuevos}</b> nuevos
              (el resto ya estaba en el plantel).
            </p>
          </div>
          <button onClick={() => setResultadoAutocompletar(null)} className="text-emerald-600 hover:text-emerald-900">
            <X size={16} />
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle size={18} className="flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={fetchJugadores} className="underline underline-offset-2 font-medium hover:text-red-900">
            Reintentar
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              {['Jugador', 'DNI', 'Año', 'Capitán', 'Acciones'].map(h => (
                <th key={h} className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading && [...Array(4)].map((_, i) => (
              <tr key={i} className="animate-pulse">
                <td colSpan="5" className="px-6 py-4"><div className="h-4 bg-gray-200 rounded-md" /></td>
              </tr>
            ))}

            {!loading && jugadores.map(j => (
              <tr key={j.id_usuario} className="hover:bg-gray-50/70 transition-colors">
                <td className="px-6 py-4 font-medium text-gray-900">
                  {j.usuario ? `${j.usuario.apellido}, ${j.usuario.nombre}` : `Usuario #${j.id_usuario}`}
                </td>
                <td className="px-6 py-4 text-sm font-mono text-gray-600">{j.usuario?.dni ?? '—'}</td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {j.usuario?.fecha_nacimiento
                    ? new Date(j.usuario.fecha_nacimiento).getFullYear()
                    : '—'}
                </td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => handleToggleCapitan(j.id_usuario, j.es_capitan)}
                    disabled={capitanEnCurso === j.id_usuario}
                    title={j.es_capitan ? 'Quitar capitanía' : 'Nombrar capitán'}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors disabled:opacity-50 ${
                      j.es_capitan
                        ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'
                    }`}
                  >
                    {capitanEnCurso === j.id_usuario ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <Star size={11} className={j.es_capitan ? 'fill-amber-500 text-amber-500' : ''} />
                    )}
                    {j.es_capitan ? 'Capitán' : 'Nombrar'}
                  </button>
                </td>
                <td className="px-6 py-4 text-right">
                  <button
                    onClick={() => handleEliminar(j.id_usuario, j.usuario ? `${j.usuario.nombre} ${j.usuario.apellido}` : `#${j.id_usuario}`)}
                    className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                    title="Sacar del plantel"
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}

            {!loading && jugadores.length === 0 && (
              <tr>
                <td colSpan="5" className="text-center py-12 text-gray-500">
                  Todavía no hay jugadores inscriptos en esta categoría para la temporada {temporada}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function TecnicoPlanteles() {
  const { token } = useAuth()
  const userRoles = useRolesDeUsuario()
  const esAdminGeneral = userRoles.includes('admin_general')

  const [categorias, setCategorias] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [modalCategoriaAbierto, setModalCategoriaAbierto] = useState(false)
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState(null)

  const fetchCategorias = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/deportivo/categorias?incluir_inactivas=true`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`Error ${res.status}: No se pudieron cargar las categorías.`)
      setCategorias(await res.json())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { fetchCategorias() }, [fetchCategorias])

  const handleCrearCategoria = async (payload) => {
    const res = await fetch(`${API}/deportivo/categorias`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail ?? 'Error al crear la categoría.')
    }
    fetchCategorias()
  }

  // PATCH de categoría — usado tanto para editar cortes/nombre/estado como
  // para mantener sincronizada la categoría seleccionada dentro de VistaPlantel.
  const handleActualizarCategoria = async (idCategoria, payload) => {
    const res = await fetch(`${API}/deportivo/categorias/${idCategoria}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail ?? 'Error al actualizar la categoría.')
    }
    const actualizada = await res.json()
    setCategorias(prev => prev.map(c => (c.id_categoria === actualizada.id_categoria ? actualizada : c)))
    setCategoriaSeleccionada(actualizada)
    return actualizada
  }

  if (categoriaSeleccionada) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <VistaPlantel
          categoria={categoriaSeleccionada}
          onVolver={() => setCategoriaSeleccionada(null)}
          onCategoriaActualizada={handleActualizarCategoria}
        />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {esAdminGeneral && modalCategoriaAbierto && (
        <NuevaCategoriaModal onClose={() => setModalCategoriaAbierto(false)} onSave={handleCrearCategoria} />
      )}

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Shield size={24} className="text-gray-500" />
            {esAdminGeneral ? 'Planteles' : 'Gestión de Planteles'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">Categorías deportivas, jugadores y capitanes.</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 mt-1">
          {/* Solo el Admin General crea/elimina categorías y edita sus años rango.
              El Personal Técnico solo administra jugadores dentro de las
              categorías que el admin ya dio de alta. */}
          {esAdminGeneral && (
            <button
              onClick={() => setModalCategoriaAbierto(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors shadow-sm"
            >
              <PlusCircle size={16} />
              Nueva Categoría
            </button>
          )}
          <button onClick={fetchCategorias} disabled={loading} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 transition-colors" title="Actualizar">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle size={18} className="flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={fetchCategorias} className="underline underline-offset-2 font-medium hover:text-red-900">
            Reintentar
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {loading && [...Array(3)].map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 h-28 animate-pulse" />
        ))}

        {!loading && categorias.map(cat => {
          const tieneCortes = Boolean(cat.fecha_corte_min && cat.fecha_corte_max)
          return (
            <button
              key={cat.id_categoria}
              onClick={() => setCategoriaSeleccionada(cat)}
              className="text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md hover:border-blue-200 transition-all"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-bold text-gray-900">{cat.nombre}</p>
                {!cat.es_activa && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-500 flex-shrink-0">
                    Inactiva
                  </span>
                )}
              </div>
              {cat.descripcion && (
                <p className="text-sm text-gray-500 mt-1 line-clamp-2">{cat.descripcion}</p>
              )}
              <div className="flex items-center justify-between mt-3">
                <p className="text-xs text-blue-600 font-medium flex items-center gap-1.5">
                  <Users size={13} /> Ver plantel
                </p>
                {tieneCortes ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-purple-600" title="Tiene cortes de edad configurados">
                    <Wand2 size={11} /> Autocompletar
                  </span>
                ) : (
                  <span className="text-[11px] text-gray-300">Sin cortes</span>
                )}
              </div>
            </button>
          )
        })}

        {!loading && categorias.length === 0 && (
          <div className="col-span-full text-center py-12 text-gray-500">
            Todavía no hay categorías deportivas cargadas.
          </div>
        )}
      </div>
    </div>
  )
}