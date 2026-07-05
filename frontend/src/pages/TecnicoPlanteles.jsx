// frontend/src/pages/TecnicoPlanteles.jsx
/**
 * Gestión de Planteles — ruta `/gestion-planteles`.
 *
 * Flujo: el Personal Técnico ve sus categorías deportivas como tarjetas,
 * crea nuevas desde un modal, y al entrar a una ve el plantel de la
 * temporada actual con un buscador de socios para inscribir nuevos jugadores.
 *
 * Backend consumido:
 *   GET    /deportivo/categorias?incluir_inactivas=true
 *   POST   /deportivo/categorias
 *   GET    /deportivo/categorias/{id}/jugadores
 *   POST   /deportivo/categorias/{id}/jugadores
 *   DELETE /deportivo/categorias/{id}/jugadores/{id_usuario}
 *   GET    /admin/usuarios/  (buscador de socios, reutilizado de AdminSocios)
 */

import { useState, useEffect, useCallback } from 'react'
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
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const TEMPORADA_ACTUAL = String(new Date().getFullYear())

// ─── Modal: Nueva Categoría ────────────────────────────────────────────────────

function NuevaCategoriaModal({ onClose, onSave }) {
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [apiError, setApiError] = useState(null)
  const [formError, setFormError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!nombre.trim()) {
      setFormError('El nombre es obligatorio.')
      return
    }
    setFormError(null)
    setIsSubmitting(true)
    setApiError(null)
    try {
      await onSave({ nombre: nombre.trim(), descripcion: descripcion.trim() || null, es_activa: true })
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
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col">
        <div className="p-6 border-b flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Nueva Categoría</h2>
            <p className="text-sm text-gray-500 mt-1">Ej: Sub-15, Primera División, Veteranos.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4">
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
          </div>

          <div className="p-4 bg-gray-50 rounded-b-2xl border-t flex justify-end gap-3">
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

// ─── Modal: Inscribir Jugador ──────────────────────────────────────────────────

function InscribirJugadorModal({ categoria, onClose, onSave }) {
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
        const res = await fetch(`${API}/admin/usuarios/?busqueda=${encodeURIComponent(q)}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          setResultados(Array.isArray(data) ? data.slice(0, 8) : [])
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
        temporada: TEMPORADA_ACTUAL,
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
            <p className="text-sm text-gray-500 mt-1">{categoria.nombre} · Temporada {TEMPORADA_ACTUAL}</p>
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
                  placeholder="Buscar socio por nombre o DNI…"
                  className="form-input pl-9"
                  autoFocus
                />
              </div>

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

// ─── Vista: Plantel de una categoría ───────────────────────────────────────────

function VistaPlantel({ categoria, onVolver }) {
  const { token } = useAuth()
  const [jugadores, setJugadores] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [modalInscribirAbierto, setModalInscribirAbierto] = useState(false)

  const fetchJugadores = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `${API}/deportivo/categorias/${categoria.id_categoria}/jugadores?temporada=${TEMPORADA_ACTUAL}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!res.ok) throw new Error(`Error ${res.status}: No se pudo cargar el plantel.`)
      setJugadores(await res.json())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [categoria.id_categoria, token])

  useEffect(() => { fetchJugadores() }, [fetchJugadores])

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
    if (!window.confirm(`¿Sacar a ${nombreCompleto} del plantel de ${categoria.nombre}?`)) return
    try {
      const res = await fetch(
        `${API}/deportivo/categorias/${categoria.id_categoria}/jugadores/${idUsuario}?temporada=${TEMPORADA_ACTUAL}`,
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

  return (
    <div className="space-y-6">
      {modalInscribirAbierto && (
        <InscribirJugadorModal
          categoria={categoria}
          onClose={() => setModalInscribirAbierto(false)}
          onSave={handleInscribir}
        />
      )}

      <div className="flex items-center gap-3">
        <button onClick={onVolver} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{categoria.nombre}</h1>
          <p className="text-sm text-gray-500">Plantel · Temporada {TEMPORADA_ACTUAL}</p>
        </div>
        <button
          onClick={() => setModalInscribirAbierto(true)}
          className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors shadow-sm"
        >
          <PlusCircle size={16} />
          Inscribir Jugador
        </button>
      </div>

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
              {['Jugador', 'DNI', 'Capitán', 'Acciones'].map(h => (
                <th key={h} className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading && [...Array(4)].map((_, i) => (
              <tr key={i} className="animate-pulse">
                <td colSpan="4" className="px-6 py-4"><div className="h-4 bg-gray-200 rounded-md" /></td>
              </tr>
            ))}

            {!loading && jugadores.map(j => (
              <tr key={j.id_usuario} className="hover:bg-gray-50/70 transition-colors">
                <td className="px-6 py-4 font-medium text-gray-900">
                  {j.usuario ? `${j.usuario.apellido}, ${j.usuario.nombre}` : `Usuario #${j.id_usuario}`}
                </td>
                <td className="px-6 py-4 text-sm font-mono text-gray-600">{j.usuario?.dni ?? '—'}</td>
                <td className="px-6 py-4">
                  {j.es_capitan ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                      <Star size={11} /> Capitán
                    </span>
                  ) : (
                    <span className="text-gray-400 text-sm">—</span>
                  )}
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
                <td colSpan="4" className="text-center py-12 text-gray-500">
                  Todavía no hay jugadores inscriptos en esta categoría.
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

  if (categoriaSeleccionada) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <VistaPlantel categoria={categoriaSeleccionada} onVolver={() => setCategoriaSeleccionada(null)} />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {modalCategoriaAbierto && (
        <NuevaCategoriaModal onClose={() => setModalCategoriaAbierto(false)} onSave={handleCrearCategoria} />
      )}

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Shield size={24} className="text-gray-500" />
            Gestión de Planteles
          </h1>
          <p className="text-sm text-gray-500 mt-1">Categorías deportivas, jugadores y capitanes.</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 mt-1">
          <button
            onClick={() => setModalCategoriaAbierto(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors shadow-sm"
          >
            <PlusCircle size={16} />
            Nueva Categoría
          </button>
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

        {!loading && categorias.map(cat => (
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
            <p className="text-xs text-blue-600 font-medium mt-3 flex items-center gap-1.5">
              <Users size={13} /> Ver plantel
            </p>
          </button>
        ))}

        {!loading && categorias.length === 0 && (
          <div className="col-span-full text-center py-12 text-gray-500">
            Todavía no hay categorías deportivas cargadas.
          </div>
        )}
      </div>
    </div>
  )
}