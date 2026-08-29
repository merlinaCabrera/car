// frontend/src/components/admin/FaqBlock.jsx
/**
 * Bloque de gestión de Preguntas Frecuentes — vive DENTRO de
 * AdminComercios.jsx, mismo patrón visual que SponsorsBlock (bloque
 * desplegable, tabla desktop + tarjeta mobile, modal de alta/edición).
 *
 * Backend: GET/POST /admin/comercios/faq, PATCH/DELETE /admin/comercios/faq/{id}
 *
 * A diferencia de Sponsors/Comercios, acá SÍ tiene sentido el borrado
 * físico (no hay historial de negocio atado a una pregunta), así que el
 * botón "Eliminar" borra de verdad, con confirmación.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import {
  PlusCircle,
  Pencil,
  Trash2,
  RefreshCw,
  AlertCircle,
  Loader2,
  X,
  Save,
  Globe,
  Lock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

// ─── Modal: crear / editar ──────────────────────────────────────────────────

function FaqFormModal({ entry, onClose, onSaved, token }) {
  const isEditMode = !!entry
  const [categoria, setCategoria] = useState(entry?.categoria ?? '')
  const [pregunta, setPregunta] = useState(entry?.pregunta ?? '')
  const [respuesta, setRespuesta] = useState(entry?.respuesta ?? '')
  const [esPublica, setEsPublica] = useState(entry?.es_publica ?? false)
  const [esActiva, setEsActiva] = useState(entry?.es_activa ?? true)
  const [orden, setOrden] = useState(entry?.orden ?? 0)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setGuardando(true)
    try {
      const payload = {
        categoria: categoria.trim(),
        pregunta: pregunta.trim(),
        respuesta: respuesta.trim(),
        es_publica: esPublica,
        es_activa: esActiva,
        orden: Number(orden) || 0,
      }
      const url = isEditMode
        ? `${API}/admin/comercios/faq/${entry.id_faq}`
        : `${API}/admin/comercios/faq`
      const res = await fetch(url, {
        method: isEditMode ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? 'No se pudo guardar la pregunta.')
      }
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col">
        <div className="p-4 border-b flex items-center justify-between flex-shrink-0">
          <h3 className="font-bold text-gray-900">{isEditMode ? 'Editar pregunta' : 'Nueva pregunta'}</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                <AlertCircle size={14} className="flex-shrink-0" /> {error}
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Categoría</label>
              <input
                type="text"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                required
                maxLength={80}
                placeholder="Ej: Cuotas, Alquileres, Mi cuenta…"
                className="form-input"
              />
              <p className="text-xs text-gray-400 mt-1">Agrupa preguntas relacionadas en /ayuda. Si escribís una categoría ya usada, se agrupan juntas.</p>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Pregunta</label>
              <input
                type="text"
                value={pregunta}
                onChange={(e) => setPregunta(e.target.value)}
                required
                maxLength={300}
                placeholder="¿Cómo pago mi cuota?"
                className="form-input"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Respuesta</label>
              <textarea
                value={respuesta}
                onChange={(e) => setRespuesta(e.target.value)}
                required
                rows={5}
                placeholder="Respuesta completa, en un tono claro y directo…"
                className="form-input resize-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="number"
                value={orden}
                onChange={(e) => setOrden(e.target.value)}
                className="form-input w-24"
              />
              <p className="text-xs text-gray-400">Orden dentro de su categoría (menor número, aparece primero).</p>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" checked={esPublica} onChange={(e) => setEsPublica(e.target.checked)} className="w-4 h-4" />
                <span className="text-sm text-gray-700">
                  <span className="font-semibold">Pública</span> — visible en /ayuda sin necesidad de iniciar sesión.
                  {' '}Si no está tildado, solo la ven los socios logueados.
                </span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" checked={esActiva} onChange={(e) => setEsActiva(e.target.checked)} className="w-4 h-4" />
                <span className="text-sm text-gray-700">
                  <span className="font-semibold">Activa</span> — destildá para ocultarla sin borrarla.
                </span>
              </label>
            </div>
          </div>

          <div className="p-4 bg-gray-50 rounded-b-2xl border-t flex justify-end gap-3 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-gray-600 bg-gray-200 hover:bg-gray-300 font-semibold transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700 font-semibold disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {guardando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Fila (tabla desktop + tarjeta mobile en un solo componente) ────────────

function FilaFaq({ entry, onEditar, onEliminar }) {
  return (
    <div className="p-4 flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{entry.categoria}</span>
          {entry.es_publica ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-100 text-blue-800">
              <Globe size={10} /> Pública
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600">
              <Lock size={10} /> Solo socios
            </span>
          )}
          {!entry.es_activa && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-100 text-red-700">
              Oculta
            </span>
          )}
        </div>
        <p className="font-medium text-gray-900">{entry.pregunta}</p>
        <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{entry.respuesta}</p>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={() => onEditar(entry)}
          className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
          title="Editar"
        >
          <Pencil size={16} />
        </button>
        <button
          onClick={() => onEliminar(entry)}
          className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-100 rounded-lg transition-colors"
          title="Eliminar"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  )
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function FaqBlock() {
  const { token } = useAuth()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [editando, setEditando] = useState(null)
  const [categoriasColapsadas, setCategoriasColapsadas] = useState(new Set())

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/admin/comercios/faq`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`Error ${res.status}: No se pudieron cargar las preguntas.`)
      setEntries(await res.json())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  const porCategoria = useMemo(() => {
    const grupos = new Map()
    for (const entry of entries) {
      if (!grupos.has(entry.categoria)) grupos.set(entry.categoria, [])
      grupos.get(entry.categoria).push(entry)
    }
    return grupos
  }, [entries])

  const toggleCategoria = (cat) => {
    setCategoriasColapsadas(prev => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }

  const handleEliminar = async (entry) => {
    if (!window.confirm(`¿Eliminar la pregunta "${entry.pregunta}"? Esta acción no se puede deshacer.`)) return
    try {
      const res = await fetch(`${API}/admin/comercios/faq/${entry.id_faq}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok && res.status !== 204) throw new Error('No se pudo eliminar la pregunta.')
      fetchEntries()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleSaved = () => {
    setModalAbierto(false)
    setEditando(null)
    fetchEntries()
  }

  return (
    <div className="space-y-4">
      {modalAbierto && (
        <FaqFormModal
          entry={editando}
          token={token}
          onClose={() => { setModalAbierto(false); setEditando(null) }}
          onSaved={handleSaved}
        />
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-gray-500">
          Se muestran en <span className="font-mono">/ayuda</span>. Las públicas también las ve cualquier visitante, sin iniciar sesión.
        </p>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => { setEditando(null); setModalAbierto(true) }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-green-600 text-white font-semibold hover:bg-green-700 transition-colors text-sm"
          >
            <PlusCircle size={15} /> Nueva pregunta
          </button>
          <button onClick={fetchEntries} disabled={loading} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 transition-colors">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle size={16} className="flex-shrink-0" /> {error}
        </div>
      )}

      {loading && <div className="p-6 text-center text-gray-400 text-sm">Cargando…</div>}

      {!loading && entries.length === 0 && (
        <div className="p-6 text-center text-gray-500 text-sm bg-white rounded-2xl border border-gray-100">
          Todavía no hay preguntas cargadas.
        </div>
      )}

      {!loading && [...porCategoria.entries()].map(([categoria, items]) => {
        const colapsada = categoriasColapsadas.has(categoria)
        return (
          <div key={categoria} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <button
              onClick={() => toggleCategoria(categoria)}
              className="w-full flex items-center justify-between gap-3 p-3.5 bg-gray-50/70 hover:bg-gray-100 transition-colors"
            >
              <span className="font-semibold text-gray-700 text-sm">{categoria} <span className="text-gray-400 font-normal">({items.length})</span></span>
              {colapsada ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronUp size={16} className="text-gray-400" />}
            </button>
            {!colapsada && (
              <div className="divide-y divide-gray-50">
                {items.map(entry => (
                  <FilaFaq
                    key={entry.id_faq}
                    entry={entry}
                    onEditar={(e) => { setEditando(e); setModalAbierto(true) }}
                    onEliminar={handleEliminar}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}