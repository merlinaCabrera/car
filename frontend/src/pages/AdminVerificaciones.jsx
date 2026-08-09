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
 *   GET  /admin/ordenes?estado=...&tipo=...&q=...
 *   POST /admin/ordenes/{id_orden}/aprobar
 *   POST /admin/ordenes/{id_orden}/rechazar
 */

import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useAdminResource } from '../hooks/useAdminResource'
import CategoriaOrdenBadge from '../components/admin/CategoriaOrdenBadge'
import {
  Wallet,
  AlertCircle,
  RefreshCw,
  Loader2,
  X,
  Check,
  CheckCheck,
  FileText,
  ExternalLink,
  Receipt,
  Package,
  User,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Search,
  Clock,
  Ban,
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

// El orden acá define el orden de los botones — "Pendientes" primero porque
// es el caso de uso principal de la pantalla (a diferencia de FILTROS_TIPO,
// donde "Todo" tiene sentido como default).
const FILTROS_ESTADO = [
  { value: 'pendiente_verificacion', label: 'Pendientes' },
  { value: 'aprobada', label: 'Aceptadas' },
  { value: 'rechazada', label: 'Rechazadas' },
  { value: 'expirada', label: 'Expiradas' },
  { value: 'cancelada_socio', label: 'Canceladas' },
  { value: '', label: 'Todos los estados' },
]

// Info visual para los 4 estados "terminales" (todo lo que no sea
// pendiente_verificacion) — se usa tanto para las filas ya resueltas
// localmente en esta sesión como para las que ya venían resueltas del
// backend (al mirar los tabs Aceptadas/Rechazadas/Expiradas/Canceladas).
const ESTADO_ORDEN_INFO = {
  aprobada: { label: 'Aprobada', icon: CheckCircle2, classes: 'text-green-700 bg-green-50' },
  rechazada: { label: 'Rechazada', icon: XCircle, classes: 'text-red-600 bg-red-50' },
  expirada: { label: 'Expirada', icon: Clock, classes: 'text-gray-500 bg-gray-100' },
  cancelada_socio: { label: 'Cancelada por el socio', icon: Ban, classes: 'text-gray-500 bg-gray-100' },
}

/**
 * Determina cómo se debe mostrar una fila de Orden: null si sigue pendiente
 * (muestra el botón "Verificar"), o el estado a exhibir como badge de solo
 * lectura. Dos fuentes posibles, en este orden de prioridad:
 *   1. resueltosEnSesion — la acabás de aprobar/rechazar vos ahora mismo,
 *      en esta misma sesión de pantalla (ver comentario en el componente
 *      principal sobre por qué no se refetchea la lista completa).
 *   2. orden.estado — si estás mirando el tab Aceptadas/Rechazadas/etc.,
 *      el backend ya te la devuelve resuelta de antes.
 */
function estadoVisualDeOrden(orden, resueltosEnSesion) {
  const local = resueltosEnSesion.get(orden.id_orden)
  if (local) return local
  return orden.estado !== 'pendiente_verificacion' ? orden.estado : null
}

const METODO_PAGO_BADGE = {
  mercado_pago: { label: '💳 MP', classes: 'bg-blue-100 text-blue-800' },
  efectivo: { label: '💵 Efectivo', classes: 'bg-gray-100 text-gray-700' },
  transferencia: { label: '🏦 Transfer.', classes: 'bg-indigo-100 text-indigo-700' },
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
      onActionSuccess(orden.id_orden, 'aprobada')
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
      onActionSuccess(orden.id_orden, 'rechazada')
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
// Colapsada por defecto: solo el "título" (comprobante, socio, monto) queda
// siempre visible; el detalle de cada Orden (con su propio Verificar) se
// despliega al click. Si el Pago tiene más de una Orden, aparece un botón
// para aprobar todas las que sigan pendientes de un solo tiro.

function TarjetaPago({ pago, ordenes, resueltosEnSesion, onVerificar, onAprobarTodo, aprobandoTodo }) {
  const [expandido, setExpandido] = useState(false)
  const metodo = METODO_PAGO_BADGE[pago?.metodo_pago] ?? METODO_PAGO_BADGE.transferencia
  const esMultiple = ordenes.length > 1
  const socio = ordenes[0]?.usuario

  const pendientes = ordenes.filter(o => estadoVisualDeOrden(o, resueltosEnSesion) === null)
  const hayPendientes = pendientes.length > 0

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header del Pago — el comprobante único, visible una sola vez aunque
          haya varias Órdenes abajo. Esto es lo que antes se veía duplicado
          en 2 o 3 pantallas distintas sin ninguna señal de que era la misma
          plata. Clickeable: expande/colapsa el detalle de abajo. */}
      <button
        type="button"
        onClick={() => setExpandido(e => !e)}
        className="w-full text-left p-4 sm:p-5 bg-gray-50 hover:bg-gray-100 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap transition-colors"
      >
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
              {!hayPendientes && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                  <CheckCircle2 size={11} /> Verificado
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 flex items-center gap-1.5 mt-0.5 truncate">
              <User size={12} className="flex-shrink-0" />
              {socio?.apellido}, {socio?.nombre} · DNI {socio?.dni}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0 w-full sm:w-auto justify-between sm:justify-end">
          <div className="text-right">
            <p className="text-xs text-gray-400 hidden sm:block">Monto transferido (declarado)</p>
            <p className="text-base sm:text-lg font-bold text-gray-900">{formatoMoneda.format(pago?.monto_total)}</p>
          </div>
          {expandido ? <ChevronUp size={18} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={18} className="text-gray-400 flex-shrink-0" />}
        </div>
      </button>

      {expandido && (
        <>
          {/* Aprobar todo — solo si hay 2+ órdenes y más de una sigue pendiente.
              Con una sola orden pendiente no aporta nada sobre el botón
              individual de la fila, así que no se muestra. */}
          {esMultiple && pendientes.length > 1 && (
            <div className="px-4 sm:px-5 py-3 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-emerald-800">
                {pendientes.length} de {ordenes.length} órdenes siguen pendientes en este comprobante.
              </p>
              <button
                onClick={(e) => { e.stopPropagation(); onAprobarTodo(pago, pendientes) }}
                disabled={aprobandoTodo}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors disabled:opacity-50"
              >
                {aprobandoTodo ? <Loader2 size={13} className="animate-spin" /> : <CheckCheck size={13} />}
                Aprobar Pago Completo
              </button>
            </div>
          )}

          {/* Filas — una por Orden. Las ya resueltas (en esta sesión, o de
              antes si estás mirando un tab de solo lectura) quedan visibles
              atenuadas con su resultado en vez de desaparecer. */}
          <div className="divide-y divide-gray-50">
            {ordenes.map(o => {
              const resuelta = estadoVisualDeOrden(o, resueltosEnSesion)
              const infoResuelta = resuelta ? ESTADO_ORDEN_INFO[resuelta] : null
              return (
                <div
                  key={o.id_orden}
                  className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 ${resuelta ? 'bg-gray-50/60' : ''}`}
                >
                  <div className={`min-w-0 flex-1 ${resuelta ? 'opacity-60' : ''}`}>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <CategoriaOrdenBadge categoria={o.categoria_resumen} />
                      <span className="text-xs text-gray-400">Orden #{o.id_orden}</span>
                    </div>
                    <p className="text-sm text-gray-600 truncate">
                      {(o.detalles ?? []).map(d => `${d.producto?.nombre ?? 'Producto'} x${d.cantidad}`).join(', ') || 'Sin ítems'}
                    </p>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-3 flex-shrink-0">
                    <span className={`text-sm font-semibold ${resuelta ? 'text-gray-400' : 'text-gray-900'}`}>
                      {formatoMoneda.format(o.monto_total)}
                    </span>
                    {infoResuelta && (
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-sm flex-shrink-0 ${infoResuelta.classes}`}>
                        <infoResuelta.icon size={14} /> {infoResuelta.label}
                      </span>
                    )}
                    {!resuelta && (
                      <button
                        onClick={() => onVerificar(o)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-blue-700 bg-blue-50 hover:bg-blue-100 font-semibold text-sm transition-colors flex-shrink-0"
                      >
                        Verificar
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
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
  const [filtroEstado, setFiltroEstado] = useState('pendiente_verificacion')

  // Búsqueda por DNI o nombre — debounced para no pegarle al backend en
  // cada tecla. 400ms es un punto medio razonable: suficiente para que no
  // dispare con cada letra, corto para que no se sienta trabado.
  const [busqueda, setBusqueda] = useState('')
  const [busquedaDebounced, setBusquedaDebounced] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setBusquedaDebounced(busqueda.trim()), 400)
    return () => clearTimeout(t)
  }, [busqueda])

  // Órdenes resueltas (aprobada/rechazada) durante esta sesión de la pantalla
  // — Map<id_orden, 'aprobada'|'rechazada'>. Se usa para seguir mostrando la
  // fila en gris con su resultado en vez de que desaparezca de golpe: el
  // backend ya no la devuelve en /pendientes apenas se resuelve, así que si
  // refrescáramos la lista completa la perderíamos. Se limpia al cambiar de
  // filtro (tipo, estado o búsqueda) o al tocar "Actualizar" — momentos en
  // los que tiene sentido arrancar de cero.
  const [resueltosEnSesion, setResueltosEnSesion] = useState(new Map())
  const [aprobandoTodoPagoId, setAprobandoTodoPagoId] = useState(null)

  useEffect(() => {
    setResueltosEnSesion(new Map())
  }, [filtroTipo, filtroEstado, busquedaDebounced])

  // Endpoint general (GET /admin/ordenes) en vez de /pendientes: permite
  // pedir cualquier estado — no solo pendiente_verificacion — y buscar por
  // socio. /pendientes sigue existiendo tal cual para lo que ya lo usaba
  // (contadores del dashboard, etc.), no se tocó.
  const ordenesParams = new URLSearchParams()
  if (filtroEstado) ordenesParams.set('estado', filtroEstado)
  if (filtroTipo) ordenesParams.set('tipo', filtroTipo)
  if (busquedaDebounced) ordenesParams.set('q', busquedaDebounced)
  const ordenesPath = `/admin/ordenes?${ordenesParams.toString()}`
  const ordenesResource = useAdminResource(ordenesPath)

  // El reset de resueltosEnSesion al cambiar de filtro lo maneja el useEffect
  // de arriba — estos setters solo cambian el valor del filtro en sí.
  const cambiarFiltroTipo = (tipo) => setFiltroTipo(tipo)
  const cambiarFiltroEstado = (estado) => setFiltroEstado(estado)

  const refrescarTodo = () => {
    ordenesResource.refetch()
    setResueltosEnSesion(new Map())
  }

  // Tras aprobar/rechazar UNA orden desde el modal: no se re-pide la lista
  // completa (eso haría desaparecer la fila al toque, perdiendo el feedback
  // visual). Solo se marca localmente como resuelta.
  const handleAccionExitosa = (idOrden, resultado) => {
    setOrdenSeleccionada(null)
    setResueltosEnSesion(prev => new Map(prev).set(idOrden, resultado))
  }

  // "Aprobar Pago Completo" — aprueba, una por una, todas las órdenes que
  // todavía estén pendientes dentro de un mismo Pago. Reusa el endpoint
  // individual de siempre (POST /admin/ordenes/{id}/aprobar); no existe
  // (ni hace falta) un endpoint de aprobación masiva en el backend — cada
  // Orden se sigue aprobando de a una, solo que el click es uno solo.
  // Sin ajuste de "meses a imputar": si alguna orden de cuota necesita ese
  // ajuste manual, hay que aprobarla individual desde "Verificar".
  const handleAprobarTodo = async (pago, pendientes) => {
    const confirmado = window.confirm(
      `¿Aprobar las ${pendientes.length} órdenes pendientes del Pago #${pago?.id_pago}? Esta acción no se puede deshacer.`
    )
    if (!confirmado) return

    setAprobandoTodoPagoId(pago?.id_pago)
    const resultados = new Map()
    for (const orden of pendientes) {
      try {
        const res = await fetch(`${API}/admin/ordenes/${orden.id_orden}/aprobar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({}),
        })
        resultados.set(orden.id_orden, res.ok ? 'aprobada' : 'error')
      } catch {
        resultados.set(orden.id_orden, 'error')
      }
    }
    setResueltosEnSesion(prev => {
      const siguiente = new Map(prev)
      for (const [idOrden, resultado] of resultados) {
        if (resultado !== 'error') siguiente.set(idOrden, resultado)
      }
      return siguiente
    })
    setAprobandoTodoPagoId(null)

    const fallidas = [...resultados.values()].filter(r => r === 'error').length
    if (fallidas > 0) {
      window.alert(`${fallidas} de ${pendientes.length} órdenes no se pudieron aprobar. Revisalas individualmente con "Verificar".`)
    }
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

  const loadingGlobal = ordenesResource.loading

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

      {/* ── Bandeja agrupada por Pago ────────────────────────────────────────── */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">
            {FILTROS_ESTADO.find(f => f.value === filtroEstado)?.label ?? 'Órdenes'}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Cada tarjeta es un comprobante — puede contener varias órdenes.
          </p>
        </div>

        {/* Buscador por DNI o nombre del socio */}
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por DNI, nombre o apellido del socio..."
            className="form-input w-full pl-10 text-sm"
          />
          {busqueda && (
            <button
              onClick={() => setBusqueda('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              title="Limpiar búsqueda"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Tabs de categoría (tipo de ítem) — mismo estilo "pill gris" que
            AdminSocios.jsx (TABS_ROLES/TABS_ESTADO), para que los filtros se
            vean consistentes en toda la sección de admin. */}
        <div className="flex gap-1 overflow-x-auto p-1 bg-gray-100 rounded-xl w-full sm:w-fit [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FILTROS_TIPO.map(f => (
            <button
              key={f.value}
              onClick={() => cambiarFiltroTipo(f.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all flex-shrink-0 ${
                filtroTipo === f.value
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Tabs de estado — separados de los de categoría porque son ejes
            de filtro independientes (categoría × estado se combinan libre).
            Mismo estilo "pill gris" que la fila de arriba. */}
        <div className="flex gap-1 overflow-x-auto p-1 bg-gray-100 rounded-xl w-full sm:w-fit [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FILTROS_ESTADO.map(f => (
            <button
              key={f.value}
              onClick={() => cambiarFiltroEstado(f.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all flex-shrink-0 whitespace-nowrap ${
                filtroEstado === f.value
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {f.label}
            </button>
          ))}
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
                resueltosEnSesion={resueltosEnSesion}
                onVerificar={setOrdenSeleccionada}
                onAprobarTodo={handleAprobarTodo}
                aprobandoTodo={aprobandoTodoPagoId === pago?.id_pago}
              />
            ))}

            {gruposPorPago.length === 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-gray-500 text-sm">
                {busquedaDebounced
                  ? `Sin resultados para "${busquedaDebounced}" en este filtro.`
                  : filtroEstado === 'pendiente_verificacion'
                    ? '✅ No hay órdenes pendientes de verificación por el momento.'
                    : 'No hay órdenes que coincidan con este filtro.'}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}