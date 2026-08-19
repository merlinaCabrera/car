// frontend/src/pages/AdminAuditoria.jsx
/**
 * Historial de acciones administrativas — visible para admin_general y
 * personal_administrativo (solo lectura). Muestra el registro del
 * AuditLog: quién hizo qué, sobre qué, y cuándo.
 *
 * Reemplaza al mail-por-cada-acción que se descartó para no saturar
 * bandejas con acciones rutinarias (aprobar/rechazar/dar de baja/
 * reactivar socios) — cualquier admin puede venir acá cuando necesite
 * chequear algo puntual.
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  History,
  Filter,
  RefreshCw,
  AlertCircle,
  Search,
  ChevronDown,
  ChevronUp,
  User,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

function EstadoError({ mensaje, onReintentar }) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
      <AlertCircle size={18} className="flex-shrink-0" />
      <span className="flex-1">{mensaje}</span>
      <button onClick={onReintentar} className="underline underline-offset-2 font-medium">Reintentar</button>
    </div>
  )
}

// ─── Tarjeta de entrada de auditoría — colapsable ──────────────────────────
function TarjetaAuditoria({ item }) {
  const [expandido, setExpandido] = useState(false)
  const tieneDetalle = item.detalle && Object.keys(item.detalle).length > 0

  const fecha = new Date(item.created_at)
  const fechaStr = fecha.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
  const horaStr = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => tieneDetalle && setExpandido(e => !e)}
        className={`w-full text-left p-4 flex items-center justify-between gap-3 ${tieneDetalle ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'} transition-colors`}
      >
        <div className="min-w-0 flex-1">
          <p className="font-medium text-gray-900">{item.etiqueta}</p>
          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
            <User size={12} className="flex-shrink-0" />
            {item.actor_nombre ? `${item.actor_nombre} · DNI ${item.actor_dni}` : 'Sistema'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-gray-400 text-right">
            {fechaStr}<br className="sm:hidden" /> <span className="hidden sm:inline">·</span> {horaStr}
          </span>
          {tieneDetalle && (
            expandido ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />
          )}
        </div>
      </button>

      {expandido && tieneDetalle && (
        <div className="px-4 pb-4 border-t border-gray-50 pt-3">
          <pre className="text-xs bg-gray-50 rounded-lg p-3 overflow-x-auto text-gray-600 whitespace-pre-wrap break-words">
            {JSON.stringify(item.detalle, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

export default function AdminAuditoria() {
  const { token } = useAuth()

  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [acciones, setAcciones] = useState([])
  const [filtroAccion, setFiltroAccion] = useState('')
  const [busqueda, setBusqueda] = useState('')

  const LIMIT = 50
  const [pagina, setPagina] = useState(0)

  const fetchAuditoria = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ skip: String(pagina * LIMIT), limit: String(LIMIT) })
      if (filtroAccion) params.set('accion', filtroAccion)

      const res = await fetch(`${API}/admin/auditoria?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`Error ${res.status}: no se pudo cargar el historial.`)
      const data = await res.json()
      setItems(data.items)
      setTotal(data.total)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token, filtroAccion, pagina])

  useEffect(() => { fetchAuditoria() }, [fetchAuditoria])

  useEffect(() => {
    if (!token) return
    fetch(`${API}/admin/auditoria/acciones-disponibles`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.ok ? res.json() : [])
      .then(setAcciones)
      .catch(() => {})
  }, [token])

  // Reset de paginación al cambiar filtro
  useEffect(() => { setPagina(0) }, [filtroAccion])

  const itemsFiltrados = useMemo(() => {
    const term = busqueda.trim().toLowerCase()
    if (!term) return items
    return items.filter(i =>
      i.actor_nombre?.toLowerCase().includes(term) ||
      i.actor_dni?.toLowerCase().includes(term) ||
      i.etiqueta.toLowerCase().includes(term)
    )
  }, [items, busqueda])

  const totalPaginas = Math.max(1, Math.ceil(total / LIMIT))

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2 sm:gap-3">
            <History size={22} className="text-gray-500 flex-shrink-0" />
            Historial
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Quién hizo qué acción administrativa, y cuándo.
          </p>
        </div>

        <div className="flex flex-nowrap items-center gap-1.5 sm:gap-3 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 sm:overflow-visible">
          <div className="relative flex-shrink-0">
            <Filter size={13} className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none z-10" />
            <select
              value={filtroAccion}
              onChange={e => setFiltroAccion(e.target.value)}
              className="form-input pl-7 pr-5 sm:pl-8 sm:pr-7 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold text-gray-600 w-auto"
              title="Filtrar por tipo de acción"
            >
              <option value="">Acción</option>
              {acciones.map(a => (
                <option key={a.valor} value={a.valor}>{a.etiqueta}</option>
              ))}
            </select>
          </div>

          <button
            onClick={fetchAuditoria}
            disabled={loading}
            className="flex-shrink-0 p-1.5 sm:p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 transition-colors"
            title="Actualizar"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="relative">
          <Search size={13} className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por admin (nombre o DNI)..."
            className="form-input pl-7 sm:pl-8 py-1.5 sm:py-2 text-xs sm:text-sm w-full"
          />
        </div>
      </div>

      {error && <EstadoError mensaje={error} onReintentar={fetchAuditoria} />}

      {!error && (
        <div className="space-y-3">
          {loading && [...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm h-16 animate-pulse" />
          ))}

          {!loading && itemsFiltrados.map(item => (
            <TarjetaAuditoria key={item.id} item={item} />
          ))}

          {!loading && itemsFiltrados.length === 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-gray-400 text-sm">
              No hay movimientos que coincidan con esos filtros.
            </div>
          )}

          {!loading && totalPaginas > 1 && !busqueda && (
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setPagina(p => Math.max(0, p - 1))}
                disabled={pagina === 0}
                className="text-sm font-semibold text-blue-600 disabled:text-gray-300 transition-colors"
              >
                ← Más recientes
              </button>
              <span className="text-xs text-gray-400">Página {pagina + 1} de {totalPaginas}</span>
              <button
                onClick={() => setPagina(p => Math.min(totalPaginas - 1, p + 1))}
                disabled={pagina >= totalPaginas - 1}
                className="text-sm font-semibold text-blue-600 disabled:text-gray-300 transition-colors"
              >
                Más antiguas →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}