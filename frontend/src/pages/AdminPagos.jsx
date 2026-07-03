// frontend/src/pages/AdminPagos.jsx
/**
 * Panel de Tesorería — ruta `/admin/pagos`.
 *
 * Unifica en un solo panel:
 *   1. Estadísticas generales de cuotas (socios al día / morosos / deuda).
 *   2. Verificación de transferencias con comprobante (antes AdminOrdenes.jsx).
 *   3. Cobro manual en ventanilla a socios morosos (antes AdminPagos.jsx).
 *
 * Backend consumido:
 *   GET  /admin/pagos/estadisticas
 *   GET  /admin/pagos/morosos
 *   POST /admin/pagos/registrar-pago-manual
 *   GET  /admin/ordenes/pendientes
 *   POST /admin/ordenes/{id_orden}/aprobar
 *   POST /admin/ordenes/{id_orden}/rechazar
 *
 * Tras cualquier acción exitosa (cobro manual, aprobar u rechazar orden) se
 * refrescan las tres fuentes de datos en paralelo para que las estadísticas
 * y ambas tablas queden consistentes entre sí.
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
  FileCheck,
  Check,
  FileText,
  ExternalLink,
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

// ─── Modal de Verificación de transferencias ─────────────────────────────────

function VerificacionModal({ orden, onClose, onActionSuccess, token }) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [apiError, setApiError] = useState(null)
  const [showRechazoInput, setShowRechazoInput] = useState(false)
  const [motivoRechazo, setMotivoRechazo] = useState('')

  const esPdf = orden.pago?.comprobante_url?.toLowerCase().endsWith('.pdf')
  
  // Novedad: Lógica de corrección de meses
  const detalleCuota = orden.detalles?.find(d => d.producto?.categoria === 'cuota_social')
  const [mesesImputar, setMesesImputar] = useState(detalleCuota ? detalleCuota.cantidad : '')

  const handleAprobar = async () => {
    setIsSubmitting(true)
    setApiError(null)
    try {
      const body = {}
      if (detalleCuota && mesesImputar && Number(mesesImputar) !== detalleCuota.cantidad) {
        body.meses_corregidos = Number(mesesImputar)
        body.notas_admin = `Ajuste manual: se imputaron ${mesesImputar} meses (el socio solicitó ${detalleCuota.cantidad}).`
      }

      const res = await fetch(`${API}/admin/ordenes/${orden.id_orden}/aprobar`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify(body)
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? 'Error al aprobar el pago.')
      }
      onActionSuccess()
    } catch (err) {
      setApiError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRechazar = async () => {
    if (!motivoRechazo.trim()) {
      setApiError('Debes ingresar un motivo para el rechazo.')
      return
    }
    setIsSubmitting(true)
    setApiError(null)
    try {
      const res = await fetch(`${API}/admin/ordenes/${orden.id_orden}/rechazar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ motivo_rechazo: motivoRechazo }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? 'Error al rechazar el pago.')
      }
      onActionSuccess()
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
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[92dvh]">
        <div className="p-6 border-b flex-shrink-0 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Verificar Pago</h2>
            <p className="text-sm text-gray-500 mt-1">
              Orden #{orden.id_orden} de {orden.usuario?.nombre} {orden.usuario?.apellido}
            </p>
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

          <div className="flex flex-col gap-3 px-4 py-4 rounded-xl bg-blue-50 border border-blue-200">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-blue-900">Monto transferido (declarado)</span>
              <span className="text-xl font-bold text-blue-900">{formatoMoneda.format(orden.monto_total)}</span>
            </div>
            
            {detalleCuota && (
              <div className="flex items-center justify-between border-t border-blue-200/60 pt-3 mt-1">
                <label className="text-sm font-medium text-blue-900 flex-1">
                  Meses de cuota a imputar:
                </label>
                <input
                  type="number"
                  min="1"
                  value={mesesImputar}
                  onChange={(e) => setMesesImputar(e.target.value)}
                  className="form-input w-24 text-right py-1 text-sm font-bold text-blue-900 rounded-md border-blue-300"
                />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-700">Comprobante adjunto:</h3>
            {orden.pago?.comprobante_url ? (
              <div className="border rounded-lg overflow-hidden">
                {esPdf ? (
                  <a href={`${API}${orden.pago.comprobante_url}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-4 bg-gray-50 hover:bg-gray-100">
                    <FileText className="h-8 w-8 text-red-500" />
                    <div>
                      <p className="font-semibold text-gray-800">Comprobante.pdf</p>
                      <p className="text-sm text-blue-600 flex items-center gap-1">Abrir en nueva pestaña <ExternalLink size={12} /></p>
                    </div>
                  </a>
                ) : (
                  <img src={`${API}${orden.pago.comprobante_url}`} alt={`Comprobante orden #${orden.id_orden}`} className="w-full h-auto max-h-96 object-contain bg-gray-100" />
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-500 p-4 text-center bg-gray-50 rounded-lg">
                El socio aún no ha subido un comprobante.
              </p>
            )}
          </div>

          {showRechazoInput && (
            <div className="pt-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Motivo del Rechazo</label>
              <textarea value={motivoRechazo} onChange={e => setMotivoRechazo(e.target.value)} placeholder="Ej: El monto no coincide, comprobante ilegible..." className="form-input mt-1.5" rows={2} />
            </div>
          )}
        </div>

        <div className="p-4 bg-gray-50 rounded-b-2xl border-t flex justify-between items-center gap-3 flex-shrink-0">
          {showRechazoInput ? (
            <>
              <button onClick={() => setShowRechazoInput(false)} className="text-sm font-medium text-gray-600 hover:text-gray-800">Cancelar</button>
              <button onClick={handleRechazar} disabled={isSubmitting} className="px-4 py-2 rounded-lg text-white bg-red-600 hover:bg-red-700 font-semibold disabled:opacity-50 transition-colors flex items-center gap-2">
                {isSubmitting && <Loader2 size={14} className="animate-spin" />} Confirmar Rechazo
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setShowRechazoInput(true)} disabled={isSubmitting} className="px-4 py-2 rounded-lg text-red-600 bg-red-100 hover:bg-red-200 font-semibold disabled:opacity-50 transition-colors flex items-center gap-2">
                <X size={14} /> Rechazar
              </button>
              <button onClick={handleAprobar} disabled={isSubmitting || !orden.pago?.comprobante_url} className="px-4 py-2 rounded-lg text-white bg-green-600 hover:bg-green-700 font-semibold disabled:opacity-50 transition-colors flex items-center gap-2">
                {isSubmitting && <Loader2 size={14} className="animate-spin" />} <Check size={14} /> Aprobar Pago
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Modal de cobro manual ────────────────────────────────────────────────────

function CobroModal({ moroso, precioCuota, onClose, onSave }) {
  const deudaMaxima = moroso.deuda_historica_meses
  const [meses, setMeses] = useState(deudaMaxima > 0 ? deudaMaxima : 1)
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
    // Se elimina la validación de deuda máxima para permitir adelantar pagos.
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

          {moroso.deuda_historica_meses > 0 ? (
            <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
              <span className="text-sm font-medium text-amber-800">Deuda actual</span>
              <span className="text-sm font-bold text-amber-800">
                {moroso.deuda_historica_meses} mes(es) — {formatoMoneda.format(moroso.deuda_estimada)}
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-green-50 border border-green-200">
              <span className="text-sm font-medium text-green-800">Socio al día (Adelantar pago)</span>
              <span className="text-sm font-bold text-green-800">{formatoMoneda.format(0)}</span>
            </div>
          )}

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

  // ── Órdenes pendientes de verificación (transferencias) ─────────────────────
  const [ordenes, setOrdenes] = useState([])
  const [loadingOrdenes, setLoadingOrdenes] = useState(true)
  const [errorOrdenes, setErrorOrdenes] = useState(null)

  const fetchOrdenesPendientes = useCallback(async () => {
    if (!token) return
    setLoadingOrdenes(true)
    setErrorOrdenes(null)
    try {
      const res = await fetch(`${API}/admin/ordenes/pendientes?tipo=cuota`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`Error ${res.status}: No se pudieron cargar las órdenes pendientes.`)
      setOrdenes(await res.json())
    } catch (err) {
      setErrorOrdenes(err.message)
      setOrdenes([])
    } finally {
      setLoadingOrdenes(false)
    }
  }, [token])

  // ── Carga inicial: dispara las tres fuentes de datos ─────────────────────────
  useEffect(() => {
    fetchEstadisticas()
    fetchMorosos()
    fetchOrdenesPendientes()
  }, [fetchEstadisticas, fetchMorosos, fetchOrdenesPendientes])

  const refrescarTodo = () => {
    fetchEstadisticas()
    fetchMorosos()
    fetchOrdenesPendientes()
  }

  const loadingGlobal = loadingStats || loadingMorosos || loadingOrdenes

  // ── Filtro local de morosos por nombre/DNI ───────────────────────────────────
  const morososFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return morosos
    return morosos.filter(m =>
      `${m.nombre} ${m.apellido}`.toLowerCase().includes(q) ||
      m.dni.toLowerCase().includes(q)
    )
  }, [morosos, busqueda])

  // ── Modal de cobro manual ─────────────────────────────────────────────────────
  const [morosoSeleccionado, setMorosoSeleccionado] = useState(null)

  const handleRegistrarPago = async ({ id_usuario, meses_a_pagar }) => {
    const res = await fetch(`${API}/admin/pagos/registrar-pago-manual`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id_usuario, meses_a_pagar }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail ?? 'Error al registrar el pago.')
    }

    // Éxito: refrescamos todo (estadísticas + morosos + órdenes)
    refrescarTodo()
  }

  // ── Modal de verificación de órdenes ──────────────────────────────────────────
  const [ordenSeleccionada, setOrdenSeleccionada] = useState(null)

  const handleAccionOrdenExitosa = () => {
    setOrdenSeleccionada(null)
    refrescarTodo()
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">

      {/* Modal de cobro manual */}
      {morosoSeleccionado && (
        <CobroModal
          moroso={morosoSeleccionado}
          precioCuota={stats?.precio_cuota_actual ?? 0}
          onClose={() => setMorosoSeleccionado(null)}
          onSave={handleRegistrarPago}
        />
      )}

      {/* Modal de verificación de transferencias */}
      {ordenSeleccionada && (
        <VerificacionModal
          orden={ordenSeleccionada}
          onClose={() => setOrdenSeleccionada(null)}
          onActionSuccess={handleAccionOrdenExitosa}
          token={token}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Wallet size={24} className="text-gray-500" />
            Tesorería y Pagos
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Estadísticas, verificación de transferencias y cobros manuales por ventanilla.
          </p>
        </div>
        <button
          onClick={refrescarTodo}
          disabled={loadingGlobal}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 transition-colors flex-shrink-0"
          title="Actualizar Datos"
        >
          <RefreshCw size={16} className={loadingGlobal ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ── Fila 1: Estadísticas ─────────────────────────────────────────────── */}
      <div className="space-y-4">
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
      </div>

      {/* ── Fila 2: Transferencias por Verificar ────────────────────────────── */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <FileCheck size={20} className="text-gray-500" />
            Transferencias por Verificar
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Comprobantes subidos por los socios, pendientes de aprobación.
          </p>
        </div>

        {errorOrdenes && !loadingOrdenes && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            <AlertCircle size={18} className="flex-shrink-0" />
            <span className="flex-1">{errorOrdenes}</span>
            <button onClick={fetchOrdenesPendientes} className="underline underline-offset-2 font-medium hover:text-red-900">
              Reintentar
            </button>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                {['Fecha', 'Socio', 'DNI', 'Monto Total', 'Acciones'].map(h => (
                  <th key={h} className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loadingOrdenes && [...Array(3)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan="5" className="px-6 py-4"><div className="h-4 bg-gray-200 rounded-md" /></td>
                </tr>
              ))}

              {!loadingOrdenes && ordenes.map(o => (
                <tr key={o.id_orden} className="hover:bg-gray-50/70 transition-colors">
                  <td className="px-6 py-4 text-sm text-gray-500">{new Date(o.fecha_creacion).toLocaleDateString()}</td>
                  <td className="px-6 py-4 font-medium text-gray-900">{o.usuario.apellido}, {o.usuario.nombre}</td>
                  <td className="px-6 py-4 font-mono text-sm text-gray-600">{o.usuario.dni}</td>
                  <td className="px-6 py-4 text-sm font-semibold text-gray-900">{formatoMoneda.format(o.monto_total)}</td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => setOrdenSeleccionada(o)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-blue-700 bg-blue-50 hover:bg-blue-100 font-semibold text-sm transition-colors"
                    >
                      Verificar
                    </button>
                  </td>
                </tr>
              ))}

              {!loadingOrdenes && ordenes.length === 0 && (
                <tr>
                  <td colSpan="5" className="text-center py-12 text-gray-500">
                    ✅ No hay transferencias pendientes de verificación por el momento.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Fila 3: Cobro Manual en Ventanilla ──────────────────────────────── */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Banknote size={20} className="text-gray-500" />
            Cobro Manual en Ventanilla
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Registrá pagos de cuotas recibidos en efectivo u otro medio fuera de línea.
          </p>
        </div>

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
                {['Socio', 'DNI', 'Estado de Cuenta', 'Monto Deuda', 'Acciones'].map(h => (
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
                    {m.deuda_historica_meses > 0 ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                        {m.deuda_historica_meses} mes{m.deuda_historica_meses !== 1 ? 'es' : ''}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Al día
                      </span>
                    )}
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
    </div>
  )
}