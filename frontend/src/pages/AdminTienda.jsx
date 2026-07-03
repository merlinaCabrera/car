// frontend/src/pages/AdminTienda.jsx
/**
 * Panel de Órdenes de Tienda — ruta `/admin/tienda`.
 *
 * Verificación de compras de indumentaria y alquileres (todo lo que NO es
 * cuota social — ver admin_ordenes.py: filtro `tipo=tienda`).
 *
 * Mismo diseño y convenciones que AdminPagos.jsx: tabla con skeletons de
 * carga, banner de error con reintento, y un modal de verificación con
 * comprobante + detalle de ítems para aprobar o rechazar.
 *
 * Backend consumido:
 *   GET  /admin/ordenes/pendientes?tipo=tienda
 *   POST /admin/ordenes/{id_orden}/aprobar
 *   POST /admin/ordenes/{id_orden}/rechazar
 */

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  ShoppingBag,
  AlertCircle,
  RefreshCw,
  Loader2,
  X,
  FileCheck,
  Check,
  FileText,
  ExternalLink,
  Package,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const formatoMoneda = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

// Resumen corto para la tabla, ej: "Remera x2, Pantalón x1"
function resumenItems(detalles) {
  if (!detalles || detalles.length === 0) return '—'
  return detalles
    .map(d => `${d.producto?.nombre ?? 'Producto'} x${d.cantidad}`)
    .join(', ')
}

// ─── Modal de Verificación de órdenes de tienda ──────────────────────────────

function VerificacionTiendaModal({ orden, onClose, onActionSuccess, token }) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [apiError, setApiError] = useState(null)
  const [showRechazoInput, setShowRechazoInput] = useState(false)
  const [motivoRechazo, setMotivoRechazo] = useState('')

  const esPdf = orden.pago?.comprobante_url?.toLowerCase().endsWith('.pdf')

  const handleAprobar = async () => {
    setIsSubmitting(true)
    setApiError(null)
    try {
      const res = await fetch(`${API}/admin/ordenes/${orden.id_orden}/aprobar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? 'Error al aprobar la orden.')
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
        throw new Error(err.detail ?? 'Error al rechazar la orden.')
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
            <h2 className="text-xl font-bold text-gray-800">Verificar Orden de Tienda</h2>
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

          <div className="flex items-center justify-between px-4 py-4 rounded-xl bg-blue-50 border border-blue-200">
            <span className="text-sm font-semibold text-blue-900">Monto transferido (declarado)</span>
            <span className="text-xl font-bold text-blue-900">{formatoMoneda.format(orden.monto_total)}</span>
          </div>

          {/* Detalle de ítems comprados */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
              <Package size={15} className="text-gray-400" /> Ítems de la orden
            </h3>
            <div className="border rounded-lg divide-y divide-gray-100 overflow-hidden">
              {(orden.detalles ?? []).map(d => (
                <div key={d.id_detalle} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">{d.producto?.nombre ?? 'Producto'}</p>
                    <p className="text-xs text-gray-500">
                      {d.cantidad} × {formatoMoneda.format(d.precio_unitario_historico)}
                    </p>
                  </div>
                  <span className="font-semibold text-gray-900 flex-shrink-0 ml-3">
                    {formatoMoneda.format(d.precio_unitario_historico * d.cantidad)}
                  </span>
                </div>
              ))}
              {(!orden.detalles || orden.detalles.length === 0) && (
                <p className="text-sm text-gray-500 p-4 text-center">Sin ítems.</p>
              )}
            </div>
          </div>

          {/* Comprobante adjunto */}
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
                {isSubmitting && <Loader2 size={14} className="animate-spin" />} <Check size={14} /> Aprobar Orden
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function AdminTienda() {
  const { token } = useAuth()

  const [ordenes, setOrdenes] = useState([])
  const [loadingOrdenes, setLoadingOrdenes] = useState(true)
  const [errorOrdenes, setErrorOrdenes] = useState(null)

  const fetchOrdenesPendientes = useCallback(async () => {
    if (!token) return
    setLoadingOrdenes(true)
    setErrorOrdenes(null)
    try {
      const res = await fetch(`${API}/admin/ordenes/pendientes?tipo=tienda`, {
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

  useEffect(() => {
    fetchOrdenesPendientes()
  }, [fetchOrdenesPendientes])

  // ── Modal de verificación ─────────────────────────────────────────────────────
  const [ordenSeleccionada, setOrdenSeleccionada] = useState(null)

  const handleAccionOrdenExitosa = () => {
    setOrdenSeleccionada(null)
    fetchOrdenesPendientes()
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">

      {/* Modal de verificación */}
      {ordenSeleccionada && (
        <VerificacionTiendaModal
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
            <ShoppingBag size={24} className="text-gray-500" />
            Órdenes de Tienda
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Verificación de compras de indumentaria y alquileres.
          </p>
        </div>
        <button
          onClick={fetchOrdenesPendientes}
          disabled={loadingOrdenes}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 transition-colors flex-shrink-0"
          title="Actualizar Datos"
        >
          <RefreshCw size={16} className={loadingOrdenes ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Órdenes pendientes */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <FileCheck size={20} className="text-gray-500" />
            Pedidos por Verificar
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
                {['Fecha', 'Socio', 'Ítems', 'Monto Total', 'Acciones'].map(h => (
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
                  <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                    {new Date(o.fecha_creacion).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{o.usuario.apellido}, {o.usuario.nombre}</div>
                    {o.usuario.email && <div className="text-xs text-gray-400 mt-0.5">{o.usuario.email}</div>}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate" title={resumenItems(o.detalles)}>
                    {resumenItems(o.detalles)}
                  </td>
                  <td className="px-6 py-4 text-sm font-semibold text-gray-900 whitespace-nowrap">
                    {formatoMoneda.format(o.monto_total)}
                  </td>
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
                    ✅ No hay órdenes de tienda pendientes de verificación por el momento.
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