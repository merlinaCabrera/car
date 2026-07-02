// frontend/src/pages/AdminPagos.jsx
/**
 * Panel de Tesorería — ruta `/admin/pagos`.
 *
 * Sigue el mismo patrón que AdminSocios.jsx / AdminComercios.jsx:
 *   - Tarjetas de estadísticas con loading skeleton y banner de error.
 *   - Tabla limpia con buscador local (nombre/DNI, sin ir al backend).
 *   - Modal sobrepuesto para el cobro manual, con validación y fail-fast.
 *
 * Backend consumido:
 *   GET  /admin/pagos/estadisticas
 *   GET  /admin/pagos/morosos
 *   POST /admin/pagos/registrar-pago-manual
 *
 * Tras un cobro exitoso, se refrescan estadísticas + tabla de morosos en
 * paralelo para que los números arriba y la lista de abajo queden consistentes.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  Wallet,
  UserCheck,
  UserX,
  Landmark,
  Search,
  Banknote,
  AlertCircle,
  RefreshCw,
  Loader2,
  X,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const formatoMoneda = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

// ─── Sub-componente: tarjeta de estadística ──────────────────────────────────

function StatCard({ icon: Icon, colorClasses, titulo, valor, loading, error, formato }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex items-center gap-4">
      <div className={`p-3 rounded-xl flex-shrink-0 ${colorClasses}`}>
        <Icon size={22} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{titulo}</p>
        {loading && <div className="h-7 w-24 bg-gray-200 rounded-md animate-pulse mt-1.5" />}
        {!loading && error && (
          <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
            <AlertCircle size={12} /> Error
          </p>
        )}
        {!loading && !error && (
          <p className="text-2xl font-bold text-gray-900 mt-0.5 truncate">
            {formato ? formato(valor) : valor}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Modal de cobro manual ────────────────────────────────────────────────────

function CobroModal({ moroso, precioCuota, onClose, onSave }) {
  const deudaMaxima = moroso.deuda_historica_meses
  const [meses, setMeses] = useState(deudaMaxima)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [apiError, setApiError] = useState(null)
  const [formError, setFormError] = useState(null)

  const totalACobrar = useMemo(() => {
    const base = Number.isFinite(precioCuota) ? precioCuota : 0
    return base * (Number(meses) || 0)
  }, [meses, precioCuota])

  const validar = () => {
    const n = Number(meses)
    if (!Number.isInteger(n) || n <= 0) {
      setFormError('Ingresá una cantidad de meses válida (entero mayor a 0).')
      return false
    }
    if (n > deudaMaxima) {
      setFormError(`No puede superar los ${deudaMaxima} mes(es) adeudados.`)
      return false
    }
    setFormError(null)
    return true
  }

  const handleConfirmar = async () => {
    if (!validar()) return

    setIsSubmitting(true)
    setApiError(null)
    try {
      await onSave({ id_usuario: moroso.id_usuario, meses_a_pagar: Number(meses) })
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

        {/* Header */}
        <div className="p-6 border-b flex-shrink-0 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Registrar Pago</h2>
            <p className="text-sm text-gray-500 mt-1">
              {moroso.apellido}, {moroso.nombre} — DNI {moroso.dni}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Cuerpo */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">

          {apiError && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
              <span>{apiError}</span>
            </div>
          )}

          <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
            <span className="text-sm font-medium text-amber-800">Deuda actual</span>
            <span className="text-sm font-bold text-amber-800">
              {moroso.deuda_historica_meses} mes(es) — {formatoMoneda.format(moroso.deuda_estimada)}
            </span>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Cantidad de meses a abonar
            </label>
            <input
              type="number"
              min={1}
              max={deudaMaxima}
              step={1}
              value={meses}
              onChange={e => setMeses(e.target.value)}
              className={`form-input mt-1.5 ${formError ? 'border-red-500' : ''}`}
            />
            {formError && <p className="text-red-600 text-xs mt-1">{formError}</p>}
          </div>

          <div className="flex items-center justify-between px-4 py-4 rounded-xl bg-blue-50 border border-blue-200">
            <span className="text-sm font-semibold text-blue-900">Total a cobrar</span>
            <span className="text-xl font-bold text-blue-900">{formatoMoneda.format(totalACobrar)}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-50 rounded-b-2xl border-t flex justify-end gap-3 flex-shrink-0">
          <button
            type="button" onClick={onClose}
            className="px-4 py-2 rounded-lg text-gray-600 bg-gray-200 hover:bg-gray-300 font-semibold transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button" onClick={handleConfirmar} disabled={isSubmitting}
            className="px-4 py-2 rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 font-semibold disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            {isSubmitting ? 'Procesando…' : 'Confirmar Pago'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function AdminPagos() {
  const { token } = useAuth()

  // ── Estadísticas ────────────────────────────────────────────────────────────
  const [stats, setStats] = useState(null)
  const [loadingStats, setLoadingStats] = useState(true)
  const [errorStats, setErrorStats] = useState(null)

  const fetchEstadisticas = useCallback(async () => {
    if (!token) return
    setLoadingStats(true)
    setErrorStats(null)
    try {
      const res = await fetch(`${API}/admin/pagos/estadisticas`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`Error ${res.status}: No se pudieron cargar las estadísticas.`)
      setStats(await res.json())
    } catch (err) {
      setErrorStats(err.message)
    } finally {
      setLoadingStats(false)
    }
  }, [token])

  // ── Morosos ──────────────────────────────────────────────────────────────────
  const [morosos, setMorosos] = useState([])
  const [loadingMorosos, setLoadingMorosos] = useState(true)
  const [errorMorosos, setErrorMorosos] = useState(null)
  const [busqueda, setBusqueda] = useState('')

  const fetchMorosos = useCallback(async () => {
    if (!token) return
    setLoadingMorosos(true)
    setErrorMorosos(null)
    try {
      const res = await fetch(`${API}/admin/pagos/morosos`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`Error ${res.status}: No se pudo cargar la lista de morosos.`)
      setMorosos(await res.json())
    } catch (err) {
      setErrorMorosos(err.message)
    } finally {
      setLoadingMorosos(false)
    }
  }, [token])

  useEffect(() => {
    fetchEstadisticas()
    fetchMorosos()
  }, [fetchEstadisticas, fetchMorosos])

  const refrescarTodo = () => {
    fetchEstadisticas()
    fetchMorosos()
  }

  // ── Filtro local por nombre/DNI ────────────────────────────────────────────
  const morososFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return morosos
    return morosos.filter(m =>
      `${m.nombre} ${m.apellido}`.toLowerCase().includes(q) ||
      m.dni.toLowerCase().includes(q)
    )
  }, [morosos, busqueda])

  // ── Modal de cobro ──────────────────────────────────────────────────────────
  const [morosoSeleccionado, setMorosoSeleccionado] = useState(null)

  const handleRegistrarPago = async ({ id_usuario, meses_a_pagar }) => {
    const res = await fetch(`${API}/admin/pagos/registrar-pago-manual`, {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id_usuario, meses_a_pagar }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail ?? 'Error al registrar el pago.')
    }

    // Éxito: refrescamos estadísticas y tabla en paralelo
    refrescarTodo()
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">

      {/* Modal de cobro */}
      {morosoSeleccionado && (
        <CobroModal
          moroso={morosoSeleccionado}
          precioCuota={stats?.precio_cuota_actual ?? 0}
          onClose={() => setMorosoSeleccionado(null)}
          onSave={handleRegistrarPago}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Wallet size={24} className="text-gray-500" />
            Tesorería
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Estado de las cuotas sociales y cobros manuales por ventanilla.
          </p>
        </div>
        <button
          onClick={refrescarTodo}
          disabled={loadingStats || loadingMorosos}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 transition-colors flex-shrink-0"
          title="Actualizar todo"
        >
          <RefreshCw size={16} className={(loadingStats || loadingMorosos) ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Tarjetas de estadísticas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={UserCheck}
          colorClasses="bg-green-100 text-green-700"
          titulo="Socios al Día"
          valor={stats?.total_socios_al_dia}
          loading={loadingStats}
          error={errorStats}
        />
        <StatCard
          icon={UserX}
          colorClasses="bg-red-100 text-red-700"
          titulo="Socios Morosos"
          valor={stats?.total_socios_morosos}
          loading={loadingStats}
          error={errorStats}
        />
        <StatCard
          icon={Landmark}
          colorClasses="bg-blue-100 text-blue-700"
          titulo="Deuda Estimada en Calle"
          valor={stats?.deuda_total_estimada}
          loading={loadingStats}
          error={errorStats}
          formato={formatoMoneda.format}
        />
      </div>

      {/* Error de estadísticas (con reintento) */}
      {errorStats && !loadingStats && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle size={18} className="flex-shrink-0" />
          <span className="flex-1">{errorStats}</span>
          <button onClick={fetchEstadisticas} className="underline underline-offset-2 font-medium hover:text-red-900">
            Reintentar
          </button>
        </div>
      )}

      {/* Buscador */}
      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o DNI…"
          className="form-input pl-9"
        />
      </div>

      {/* Error de morosos (con reintento) */}
      {errorMorosos && !loadingMorosos && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle size={18} className="flex-shrink-0" />
          <span className="flex-1">{errorMorosos}</span>
          <button onClick={fetchMorosos} className="underline underline-offset-2 font-medium hover:text-red-900">
            Reintentar
          </button>
        </div>
      )}

      {/* Tabla de morosos */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              {['Socio', 'DNI', 'Meses Adeudados', 'Monto Deuda', 'Acciones'].map(h => (
                <th key={h} className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loadingMorosos && [...Array(5)].map((_, i) => (
              <tr key={i} className="animate-pulse">
                <td colSpan="5" className="px-6 py-4">
                  <div className="h-4 bg-gray-200 rounded-md" />
                </td>
              </tr>
            ))}

            {!loadingMorosos && morososFiltrados.map(m => (
              <tr key={m.id_usuario} className="hover:bg-gray-50/70 transition-colors">
                <td className="px-6 py-4">
                  <div className="font-medium text-gray-900">{m.apellido}, {m.nombre}</div>
                  {m.email && <div className="text-xs text-gray-400 mt-0.5">{m.email}</div>}
                </td>
                <td className="px-6 py-4 font-mono text-sm text-gray-600">{m.dni}</td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                    {m.deuda_historica_meses} mes{m.deuda_historica_meses !== 1 ? 'es' : ''}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                  {formatoMoneda.format(m.deuda_estimada)}
                </td>
                <td className="px-6 py-4 text-right whitespace-nowrap">
                  <button
                    onClick={() => setMorosoSeleccionado(m)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-emerald-700 bg-emerald-50 hover:bg-emerald-100 font-semibold text-sm transition-colors"
                    title="Registrar Pago"
                  >
                    <Banknote size={15} />
                    Registrar Pago
                  </button>
                </td>
              </tr>
            ))}

            {!loadingMorosos && morososFiltrados.length === 0 && (
              <tr>
                <td colSpan="5" className="text-center py-12 text-gray-500">
                  {busqueda
                    ? 'No se encontraron socios morosos con ese criterio.'
                    : 'No hay socios morosos.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}