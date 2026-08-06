// frontend/src/pages/AdminVerificaciones.jsx
/**
 * Verificaciones — ruta `/admin/verificaciones`.
 *
 * Reemplaza a AdminPagos.jsx (bandeja de cuotas) + AdminTienda.jsx (bandeja
 * de indumentaria) + AdminAlquileres.jsx (bandeja de alquileres): las tres
 * hacían básicamente lo mismo (listar Órdenes pendientes, aprobar/rechazar)
 * contra el mismo endpoint `/admin/ordenes/pendientes` con distinto `?tipo=`,
 * pero como pantallas separadas — así que un socio que pagaba cuota +
 * indumentaria en la misma transferencia generaba DOS bandejas con el MISMO
 * comprobante, sin ninguna señal de que eran la misma plata.
 *
 * Acá todas las Órdenes se agrupan por `id_pago`: una tarjeta por Pago (un
 * comprobante), y adentro una fila por Orden con su propio botón
 * Aprobar/Rechazar independiente — la aprobación siempre fue por Orden
 * individual en el backend (ver utils/ordenes.py::procesar_aprobacion_orden),
 * así que agrupar visualmente no cambia nada del motor de negocio.
 *
 * Cada Orden muestra su categoría (Cuota/Alquiler/Indumentaria/Mixta) vía
 * `orden.categoria_resumen`, calculado en el backend
 * (models.py::Orden.categoria_resumen).
 *
 * Versión "simple" del diseño acordado: agrupa únicamente lo que devuelve
 * `/admin/ordenes/pendientes` (todas están en estado pendiente_verificacion).
 * Si una Orden hermana del mismo Pago ya fue resuelta antes, no aparece acá
 * — queda para una iteración futura agregar `GET /admin/pagos/{id}/ordenes`
 * si en el uso real hace falta ver también las hermanas ya resueltas.
 *
 * Backend consumido:
 *   GET  /admin/pagos/estadisticas
 *   GET  /admin/ordenes/pendientes?tipo=cuota|alquiler|compra
 *   POST /admin/ordenes/{id_orden}/aprobar
 *   POST /admin/ordenes/{id_orden}/rechazar
 */

import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useAdminResource } from '../hooks/useAdminResource'
import CategoriaOrdenBadge from '../components/admin/CategoriaOrdenBadge'
import {
  Wallet,
  UserCheck,
  UserX,
  Landmark,
  AlertCircle,
  RefreshCw,
  Loader2,
  X,
  Check,
  FileText,
  ExternalLink,
  Receipt,
  Package,
  User,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const formatoMoneda = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

const FILTROS_TIPO = [
  { value: '', label: 'Todo' },
  { value: 'cuota', label: 'Cuotas' },
  { value: 'alquiler', label: 'Alquileres' },
  { value: 'compra', label: 'Compras' },
]

const METODO_PAGO_BADGE = {
  mercado_pago: { label: '💳 MP', classes: 'bg-blue-100 text-blue-800' },
  efectivo: { label: '💵 Efectivo', classes: 'bg-gray-100 text-gray-700' },
  transferencia: { label: '🏦 Transfer.', classes: 'bg-indigo-100 text-indigo-700' },
}

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

// ─── Modal de verificación de una Orden individual ───────────────────────────
// Fusiona lo mejor de los 3 modales viejos: desglose de ítems (venía del de
// Alquileres), visor de comprobante + indicador de Mercado Pago + ajuste
// manual de meses de cuota (venían del de Pagos).

function VerificacionModal({ orden, onClose, onActionSuccess, token }) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [apiError, setApiError] = useState(null)
  const [showRechazoInput, setShowRechazoInput] = useState(false)
  const [motivoRechazo, setMotivoRechazo] = useState('')

  const esPdf = orden.pago?.comprobante_url?.toLowerCase().endsWith('.pdf')
  const esMercadoPago = orden.pago?.metodo_pago === 'mercado_pago'

  // Campo editable de meses a imputar — solo aparece si esta Orden puntual
  // tiene un ítem de cuota_social (puede ser una orden 'cuota' pura o una
  // 'mixta' que además tenga cuota).
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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
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
      setApiError('Debés ingresar un motivo para el rechazo.')
      return
    }
    setIsSubmitting(true)
    setApiError(null)
    try {
      const res = await fetch(`${API}/admin/ordenes/${orden.id_orden}/rechazar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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

        <div className="p-6 border-b flex-shrink-0 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-gray-800">Verificar Orden</h2>
              <CategoriaOrdenBadge categoria={orden.categoria_resumen} />
            </div>
            <p className="text-sm text-gray-500 mt-1 truncate">
              Orden #{orden.id_orden} de {orden.usuario?.nombre} {orden.usuario?.apellido}
              {' · Pago #'}{orden.id_pago}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors flex-shrink-0">
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
              <span className="text-sm font-semibold text-blue-900">
                {esMercadoPago ? 'Monto de esta orden (cobrado por MP)' : 'Monto de esta orden'}
              </span>
              <span className="text-xl font-bold text-blue-900">{formatoMoneda.format(orden.monto_total)}</span>
            </div>
            {esMercadoPago && (
              <div className="flex items-center gap-2 border-t border-blue-200/60 pt-3 mt-1 text-sm text-blue-800">
                <span>💳</span>
                <span>Pago procesado y verificado automáticamente por Mercado Pago.</span>
              </div>
            )}
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

          {/* Desglose de ítems — útil sobre todo en órdenes 'mixta' para ver
              exactamente qué combina antes de aprobar/rechazar de un tirón. */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
              <Package size={15} className="text-gray-400" /> Ítems de esta orden
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

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-700">Comprobante adjunto (Pago #{orden.id_pago}):</h3>
            {orden.pago?.comprobante_url ? (
              <div className="border rounded-lg overflow-hidden">
                {esPdf ? (
                  <a
                    href={`${API}${orden.pago.comprobante_url}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-4 bg-gray-50 hover:bg-gray-100"
                  >
                    <FileText className="h-8 w-8 text-red-500" />
                    <div>
                      <p className="font-semibold text-gray-800">Comprobante.pdf</p>
                      <p className="text-sm text-blue-600 flex items-center gap-1">
                        Abrir en nueva pestaña <ExternalLink size={12} />
                      </p>
                    </div>
                  </a>
                ) : (
                  <img
                    src={`${API}${orden.pago.comprobante_url}`}
                    alt={`Comprobante orden #${orden.id_orden}`}
                    className="w-full h-auto max-h-96 object-contain bg-gray-100"
                  />
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
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Motivo del Rechazo
              </label>
              <textarea
                value={motivoRechazo}
                onChange={e => setMotivoRechazo(e.target.value)}
                placeholder="Ej: El monto no coincide, comprobante ilegible..."
                className="form-input mt-1.5"
                rows={2}
              />
            </div>
          )}
        </div>

        <div className="p-4 bg-gray-50 rounded-b-2xl border-t flex justify-between items-center gap-3 flex-shrink-0">
          {showRechazoInput ? (
            <>
              <button onClick={() => setShowRechazoInput(false)} className="text-sm font-medium text-gray-600 hover:text-gray-800">
                Cancelar
              </button>
              <button
                onClick={handleRechazar}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-lg text-white bg-red-600 hover:bg-red-700 font-semibold disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                Confirmar Rechazo
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setShowRechazoInput(true)}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-lg text-red-600 bg-red-100 hover:bg-red-200 font-semibold disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                <X size={14} /> Rechazar
              </button>
              <button
                onClick={handleAprobar}
                disabled={isSubmitting || (!esMercadoPago && !orden.pago?.comprobante_url)}
                className="px-4 py-2 rounded-lg text-white bg-green-600 hover:bg-green-700 font-semibold disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                <Check size={14} /> Aprobar Orden
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Tarjeta agrupada por Pago ────────────────────────────────────────────────

function TarjetaPago({ pago, ordenes, onVerificar }) {
  const metodo = METODO_PAGO_BADGE[pago?.metodo_pago] ?? METODO_PAGO_BADGE.transferencia
  const esMultiple = ordenes.length > 1
  const socio = ordenes[0]?.usuario

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header del Pago — el comprobante único, visible una sola vez aunque
          haya varias Órdenes abajo. Esto es lo que antes se veía duplicado
          en 2 o 3 pantallas distintas sin ninguna señal de que era la misma
          plata. */}
      <div className="p-4 sm:p-5 bg-gray-50 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-xl bg-white border border-gray-200 flex-shrink-0">
            <Receipt size={18} className="text-gray-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-gray-900">Pago #{pago?.id_pago}</p>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${metodo.classes}`}>
                {metodo.label}
              </span>
              {esMultiple && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                  {ordenes.length} órdenes en este comprobante
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 flex items-center gap-1.5 mt-0.5 truncate">
              <User size={12} className="flex-shrink-0" />
              {socio?.apellido}, {socio?.nombre} · DNI {socio?.dni}
            </p>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xs text-gray-400">Monto transferido (declarado)</p>
          <p className="text-lg font-bold text-gray-900">{formatoMoneda.format(pago?.monto_total)}</p>
        </div>
      </div>

      {/* Filas — una por Orden, cada una con su propio Aprobar/Rechazar */}
      <div className="divide-y divide-gray-50">
        {ordenes.map(o => (
          <div key={o.id_orden} className="p-4 sm:p-5 flex items-center justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <CategoriaOrdenBadge categoria={o.categoria_resumen} />
                <span className="text-xs text-gray-400">Orden #{o.id_orden}</span>
              </div>
              <p className="text-sm text-gray-600 truncate">
                {(o.detalles ?? []).map(d => `${d.producto?.nombre ?? 'Producto'} x${d.cantidad}`).join(', ') || 'Sin ítems'}
              </p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="text-sm font-semibold text-gray-900">{formatoMoneda.format(o.monto_total)}</span>
              <button
                onClick={() => onVerificar(o)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-blue-700 bg-blue-50 hover:bg-blue-100 font-semibold text-sm transition-colors"
              >
                Verificar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function AdminVerificaciones() {
  const { token } = useAuth()
  // Permite llegar con un tab ya seleccionado, ej. /admin/verificaciones?tipo=cuota
  // — usado por los alias de redirect que reemplazan a las 3 páginas viejas
  // (/admin/pagos, /admin/tienda, /admin/alquileres) en App.jsx.
  const [searchParams] = useSearchParams()
  const tipoInicial = searchParams.get('tipo') ?? ''
  const [filtroTipo, setFiltroTipo] = useState(
    FILTROS_TIPO.some(f => f.value === tipoInicial) ? tipoInicial : ''
  )
  const [ordenSeleccionada, setOrdenSeleccionada] = useState(null)

  const estadisticas = useAdminResource('/admin/pagos/estadisticas')
  const ordenesPath = filtroTipo
    ? `/admin/ordenes/pendientes?tipo=${encodeURIComponent(filtroTipo)}`
    : '/admin/ordenes/pendientes'
  const ordenesResource = useAdminResource(ordenesPath)

  const refrescarTodo = () => {
    estadisticas.refetch()
    ordenesResource.refetch()
  }

  const handleAccionExitosa = () => {
    setOrdenSeleccionada(null)
    refrescarTodo()
  }

  // Agrupar el array plano de Órdenes por id_pago — cada grupo se convierte
  // en una TarjetaPago. Se preserva el orden de llegada (fecha_creacion asc,
  // como ya lo devuelve el backend).
  const gruposPorPago = useMemo(() => {
    const ordenes = ordenesResource.data ?? []
    const mapa = new Map()
    for (const orden of ordenes) {
      const clave = orden.id_pago
      if (!mapa.has(clave)) mapa.set(clave, { pago: orden.pago, ordenes: [] })
      mapa.get(clave).ordenes.push(orden)
    }
    return Array.from(mapa.values())
  }, [ordenesResource.data])

  const loadingGlobal = estadisticas.loading || ordenesResource.loading

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6 sm:space-y-8">

      {ordenSeleccionada && (
        <VerificacionModal
          orden={ordenSeleccionada}
          onClose={() => setOrdenSeleccionada(null)}
          onActionSuccess={handleAccionExitosa}
          token={token}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2 sm:gap-3">
            <Wallet size={22} className="text-gray-500 flex-shrink-0" />
            Verificaciones
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Comprobantes agrupados por pago — cuotas, alquileres e indumentaria juntos.
            El cobro en ventanilla se registra desde{' '}
            <span className="font-semibold text-gray-700">Gestión de Socios</span>.
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

      {/* ── Estadísticas financieras ─────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            icon={UserCheck}
            colorClasses="bg-green-100 text-green-700"
            titulo="Socios al Día"
            valor={estadisticas.data?.total_socios_al_dia}
            loading={estadisticas.loading}
            error={estadisticas.error}
          />
          <StatCard
            icon={UserX}
            colorClasses="bg-red-100 text-red-700"
            titulo="Socios Morosos"
            valor={estadisticas.data?.total_socios_morosos}
            loading={estadisticas.loading}
            error={estadisticas.error}
          />
          <StatCard
            icon={Landmark}
            colorClasses="bg-blue-100 text-blue-700"
            titulo="Deuda Estimada en Calle"
            valor={estadisticas.data?.deuda_total_estimada}
            loading={estadisticas.loading}
            error={estadisticas.error}
            formato={formatoMoneda.format}
          />
        </div>
        {estadisticas.error && !estadisticas.loading && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            <AlertCircle size={18} className="flex-shrink-0" />
            <span className="flex-1">{estadisticas.error}</span>
            <button onClick={estadisticas.refetch} className="underline underline-offset-2 font-medium hover:text-red-900">
              Reintentar
            </button>
          </div>
        )}
      </div>

      {/* ── Bandeja agrupada por Pago ────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Pendientes de Verificación</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Cada tarjeta es un comprobante — puede contener varias órdenes.
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {FILTROS_TIPO.map(f => (
              <button
                key={f.value}
                onClick={() => setFiltroTipo(f.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  filtroTipo === f.value ? 'bg-slate-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {ordenesResource.error && !ordenesResource.loading && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            <AlertCircle size={18} className="flex-shrink-0" />
            <span className="flex-1">{ordenesResource.error}</span>
            <button onClick={ordenesResource.refetch} className="underline underline-offset-2 font-medium hover:text-red-900">
              Reintentar
            </button>
          </div>
        )}

        {ordenesResource.loading && (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm h-28 animate-pulse" />
            ))}
          </div>
        )}

        {!ordenesResource.loading && !ordenesResource.error && (
          <div className="space-y-3">
            {gruposPorPago.map(({ pago, ordenes }) => (
              <TarjetaPago
                key={pago?.id_pago ?? ordenes[0].id_orden}
                pago={pago}
                ordenes={ordenes}
                onVerificar={setOrdenSeleccionada}
              />
            ))}

            {gruposPorPago.length === 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-gray-500 text-sm">
                ✅ No hay órdenes pendientes de verificación por el momento.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}