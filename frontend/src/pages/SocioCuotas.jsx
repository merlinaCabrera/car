// frontend/src/pages/SocioCuotas.jsx
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import {
  Wallet,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  Loader2,
  X,
  CalendarClock,
  UploadCloud,
  CheckCircle,
  Info,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  ShoppingCart,
  Plus,
  Minus,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const formatoMoneda = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

const formatoFecha = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
})

/**
 * Formatea una ISO Date string ("2026-07-10") a texto legible en español.
 * Usa Date(y, m-1, d) en tiempo local para evitar el desfase UTC que
 * ocurre con `new Date("2026-07-10")` en zonas UTC- (ej: Argentina).
 */
function formatearFechaCobertura(isoDate) {
  if (!isoDate) return null
  const partes = isoDate.split('-').map(Number)
  if (partes.length !== 3 || partes.some(Number.isNaN)) return null
  const [anio, mes, dia] = partes
  return new Date(anio, mes - 1, dia).toLocaleDateString('es-AR', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

/**
 * Devuelve true si hoy supera `mes_cubierto_hasta` o si es nulo.
 * Compara solo fecha (sin horas) para coincidir con el tipo `date` del backend.
 */
function esMoroso(isoDate) {
  if (!isoDate) return true
  const [anio, mes, dia] = isoDate.split('-').map(Number)
  const cobertura = new Date(anio, mes - 1, dia)
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  return hoy > cobertura
}

// ─── Modal: subir / cambiar comprobante ───────────────────────────────────────

function OrdenGeneradaModal({ orden, onClose, token }) {
  const [file, setFile] = useState(null)
  const [isUploading, setIsUploading] = useState(false)
  const [apiError, setApiError] = useState(null)
  const [success, setSuccess] = useState(false)

  const handleFileChange = (e) => {
    const f = e.target.files[0]
    if (f) { setFile(f); setApiError(null) }
  }

  const handleUpload = async () => {
    if (!file) { setApiError('Por favor, seleccioná un archivo.'); return }
    setIsUploading(true)
    setApiError(null)
    setSuccess(false)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch(`${API}/socio/cuotas/pagos/${orden.id_pago}/comprobante`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? 'Error al subir el comprobante.')
      }
      setSuccess(true)
      setTimeout(() => onClose(), 2000)
    } catch (err) {
      setApiError(err.message)
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center items-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[92dvh]">
        <div className="p-6 border-b flex-shrink-0 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Transferencia Bancaria</h2>
            <p className="text-sm text-gray-500 mt-1">Pago #{orden.id_pago} (Orden #{orden.id_orden})</p>
          </div>
          <button onClick={onClose} disabled={isUploading} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {apiError && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
              <span>{apiError}</span>
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm font-medium">
              <CheckCircle size={15} />
              <span>¡Comprobante subido con éxito!</span>
            </div>
          )}

          <div className="text-center p-4 rounded-xl bg-blue-50 border border-blue-200">
            <p className="text-sm font-semibold text-blue-900">Total a Pagar</p>
            <p className="text-3xl font-bold text-blue-900 mt-1">{formatoMoneda.format(orden.monto_total)}</p>
          </div>

          <p className="text-sm text-gray-600 text-center">
            Transferí al alias <strong>CLUB.ROBERTS</strong> y subí el comprobante para que podamos verificar tu pago.
          </p>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Adjuntar comprobante
            </label>
            <div className="mt-1.5">
              <label className={`relative flex justify-center w-full px-6 py-8 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${file ? 'border-green-300 bg-green-50' : 'border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50'}`}>
                <div className="text-center">
                  <UploadCloud className={`mx-auto h-10 w-10 ${file ? 'text-green-500' : 'text-gray-400'}`} />
                  <span className={`mt-2 block text-sm font-semibold ${file ? 'text-green-800' : 'text-gray-600'}`}>
                    {file ? file.name : 'Seleccionar archivo'}
                  </span>
                  <span className="mt-1 block text-xs text-gray-500">PNG, JPG, PDF (Máx. 10MB)</span>
                </div>
                <input type="file" className="sr-only" accept="image/*,.pdf" onChange={handleFileChange} disabled={isUploading || success} />
              </label>
            </div>
          </div>
        </div>

        <div className="p-4 bg-gray-50 rounded-b-2xl border-t flex justify-end gap-3 flex-shrink-0">
          <button type="button" onClick={onClose} disabled={isUploading} className="px-4 py-2 rounded-lg text-gray-600 bg-gray-200 hover:bg-gray-300 font-semibold transition-colors">
            Cerrar
          </button>
          <button type="button" onClick={handleUpload} disabled={!file || isUploading || success} className="px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700 font-semibold disabled:opacity-50 transition-colors flex items-center gap-2">
            {isUploading && <Loader2 size={14} className="animate-spin" />}
            {isUploading ? 'Subiendo…' : 'Subir Comprobante'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal: elegir meses y agregar al carrito ─────────────────────────────────

/**
 * Modal con selector +/- para elegir cuántos meses pagar.
 * Al confirmar, agrega un ítem 'cuota_social' al CartContext y muestra
 * feedback de éxito antes de cerrarse.
 *
 * Ítem que se agrega al carrito:
 *   { id: 'cuota_social', name, price, qty, categoria }
 *
 * `id` fijo → CartContext detecta el ítem existente y acumula `qty`.
 * `price` = precio de 1 mes; `qty` = meses elegidos.
 * Así el carrito calcula el subtotal como price × qty, que es lo esperado.
 */
function SeleccionMesesModal({ precioCuota, idProducto, onClose }) {
  const { addToCart } = useCart()
  const [meses, setMeses] = useState(1)
  const [agregado, setAgregado] = useState(false)

  const decrementar = () => setMeses(m => Math.max(1, m - 1))
  const incrementar = () => setMeses(m => Math.min(24, m + 1))

  // Permite tipear directamente en el input con validación al salir del foco
  const handleInputChange = (e) => {
    const val = parseInt(e.target.value, 10)
    if (!isNaN(val)) setMeses(Math.min(24, Math.max(1, val)))
  }

  const handleAgregarAlCarrito = () => {
    if (!Number.isInteger(idProducto)) {
      console.error('idProducto inválido, no se puede agregar al carrito:', idProducto)
      return
    }
    addToCart({
      id: idProducto,
      name: `Cuota social × ${meses} mes${meses !== 1 ? 'es' : ''}`,
      price: precioCuota,   // precio de 1 mes (se congela aquí)
      qty: parseInt(meses, 10),           // 1 qty = 1 mes en este contexto
      categoria: 'cuota_social',
    })
    setAgregado(true)
    setTimeout(() => onClose(), 1500)
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center items-center p-4"
      onClick={e => { if (e.target === e.currentTarget && !agregado) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm flex flex-col">
        {/* Header */}
        <div className="p-6 border-b flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800">Pagar Cuotas</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Cuerpo */}
        <div className="p-6 space-y-5">
          {agregado ? (
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <div className="p-3 rounded-full bg-green-100 text-green-600">
                <CheckCircle size={28} />
              </div>
              <p className="font-semibold text-gray-800">¡Agregado al carrito!</p>
              <p className="text-sm text-gray-500">Podés seguir comprando o ir al carrito para finalizar.</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-500 text-center">
                Elegí cuántos meses querés abonar y finalizá la compra desde el carrito.
              </p>

              {/* Selector +/- con input editable */}
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={decrementar}
                  disabled={meses <= 1}
                  className="w-10 h-10 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-700 disabled:opacity-40 transition-colors flex-shrink-0"
                >
                  <Minus size={16} />
                </button>

                <div className="text-center w-28">
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={meses}
                    onChange={handleInputChange}
                    className="w-full text-center text-3xl font-bold text-gray-900 bg-transparent border-0 outline-none focus:ring-0 p-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <p className="text-xs text-gray-400 -mt-1">{meses === 1 ? 'mes' : 'meses'}</p>
                </div>

                <button
                  onClick={incrementar}
                  disabled={meses >= 24}
                  className="w-10 h-10 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-700 disabled:opacity-40 transition-colors flex-shrink-0"
                >
                  <Plus size={16} />
                </button>
              </div>

              {/* Resumen precio */}
              <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-blue-50 border border-blue-200">
                <div>
                  <p className="text-xs text-blue-700 font-medium">
                    {formatoMoneda.format(precioCuota)} × {meses} mes{meses !== 1 ? 'es' : ''}
                  </p>
                  <p className="text-sm font-semibold text-blue-900">Total</p>
                </div>
                <span className="text-xl font-bold text-blue-900">
                  {formatoMoneda.format(precioCuota * meses)}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!agregado && (
          <div className="p-4 bg-gray-50 rounded-b-2xl border-t flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-gray-600 bg-gray-200 hover:bg-gray-300 font-semibold transition-colors text-sm"
            >
              Cancelar
            </button>
            <button
              onClick={handleAgregarAlCarrito}
              className="px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700 font-semibold transition-colors text-sm flex items-center gap-2"
            >
              <ShoppingCart size={15} />
              Agregar al carrito
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Tarjeta de Estado de Cuenta ──────────────────────────────────────────────

function EstadoCard({ estado, loading, error, ordenPendiente, onAbrirCarrito }) {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 animate-pulse space-y-3">
        <div className="h-5 w-32 bg-gray-200 rounded-full" />
        <div className="h-7 w-56 bg-gray-200 rounded-md" />
        <div className="h-4 w-44 bg-gray-200 rounded-md" />
        <div className="h-3 w-52 bg-gray-100 rounded-md" />
      </div>
    )
  }

  if (error || !estado) return null

  const moroso     = esMoroso(estado.mes_cubierto_hasta)
  const tieneDeuda = estado.deuda_historica_meses > 0
  const esGrave    = estado.deuda_historica_meses >= 2
  const fechaLegible = formatearFechaCobertura(estado.mes_cubierto_hasta)
  const diaVenc    = estado.dia_vencimiento_cuota ?? null

  const paleta = moroso
    ? esGrave
      ? { card: 'bg-red-50 border-red-200',    icon: 'bg-red-100 text-red-700',    label: 'text-red-700',    sub: 'text-red-700',    aux: 'text-red-500',    badge: 'bg-red-100 text-red-700 border border-red-200',    btn: 'bg-red-600 hover:bg-red-700' }
      : { card: 'bg-amber-50 border-amber-200', icon: 'bg-amber-100 text-amber-700', label: 'text-amber-700', sub: 'text-amber-700', aux: 'text-amber-500', badge: 'bg-amber-100 text-amber-800 border border-amber-200', btn: 'bg-amber-600 hover:bg-amber-700' }
    : { card: 'bg-white border-gray-100',       icon: 'bg-green-100 text-green-700', label: 'text-gray-500',  sub: 'text-gray-600',  aux: 'text-gray-400',  badge: 'bg-green-100 text-green-700 border border-green-200',  btn: '' }

  return (
    <div className={`rounded-2xl shadow-sm border p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-5 ${paleta.card}`}>
      <div className="flex items-start gap-4">
        <div className={`p-3 rounded-xl flex-shrink-0 mt-0.5 ${paleta.icon}`}>
          {moroso ? <ShieldAlert size={22} /> : <ShieldCheck size={22} />}
        </div>

        <div className="space-y-1.5">
          <p className={`text-xs font-semibold uppercase tracking-wide ${paleta.label}`}>
            Estado de Cuenta
          </p>

          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${paleta.badge}`}>
            {moroso
              ? <><AlertTriangle size={11} /> Moroso</>
              : <><CheckCircle2 size={11} /> Acceso activo</>}
          </span>

          <p className={`text-sm font-medium leading-snug ${paleta.sub}`}>
            {moroso
              ? tieneDeuda
                ? <>{estado.deuda_historica_meses} mes{estado.deuda_historica_meses !== 1 ? 'es' : ''} adeudado{estado.deuda_historica_meses !== 1 ? 's' : ''}&nbsp;·&nbsp;{formatoMoneda.format(estado.deuda_total_pesos)}</>
                : 'Tu cobertura ha vencido.'
              : fechaLegible
                ? <>Tu acceso está activo hasta el <strong>{fechaLegible}</strong>.</>
                : 'Tu acceso está vigente.'}
          </p>

          {diaVenc != null && (
            <p className={`text-xs flex items-center gap-1 ${paleta.aux}`}>
              <CalendarClock size={12} className="flex-shrink-0" />
              Tu cuota vence el día <strong>{diaVenc}</strong> de cada mes.
            </p>
          )}
        </div>
      </div>

      {/* CTA "Pagar cuotas" → abre SeleccionMesesModal */}
      {moroso && tieneDeuda && !ordenPendiente && (
        <button
          onClick={onAbrirCarrito}
          className={`w-full sm:w-auto flex justify-center items-center gap-2 px-5 py-3 rounded-xl font-bold text-white transition-colors flex-shrink-0 ${paleta.btn}`}
        >
          <ShoppingCart size={16} />
          Pagar cuotas
        </button>
      )}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function SocioCuotas() {
  const { token } = useAuth()

  const [estado, setEstado] = useState(null)
  const [historial, setHistorial] = useState([])
  const [ordenPendiente, setOrdenPendiente] = useState(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [isCanceling, setIsCanceling] = useState(false)

  // Modales
  const [mostrarUpload, setMostrarUpload] = useState(false)
  const [mostrarSeleccionMeses, setMostrarSeleccionMeses] = useState(false)

  const fetchData = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const [estRes, histRes, pendRes] = await Promise.all([
        fetch(`${API}/socio/cuotas/estado`,         { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/socio/cuotas/historial`,       { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/socio/cuotas/orden-pendiente`, { headers: { Authorization: `Bearer ${token}` } }),
      ])
      if (!estRes.ok || !histRes.ok || !pendRes.ok) {
        throw new Error('No se pudo cargar la información de cuotas.')
      }
      setEstado(await estRes.json())
      setHistorial(await histRes.json())
      setOrdenPendiente(await pendRes.json())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { fetchData() }, [fetchData])

  const handleCancelarOrden = async () => {
    if (!window.confirm('¿Seguro que querés cancelar esta orden de pago?')) return
    setIsCanceling(true)
    try {
      const res = await fetch(`${API}/socio/cuotas/ordenes/${ordenPendiente.id_orden}/cancelar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Error al cancelar la orden.')
      await fetchData()
    } catch (err) {
      alert(err.message)
    } finally {
      setIsCanceling(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto text-center">
        <Loader2 className="animate-spin inline-block text-gray-400 mt-10" size={32} />
      </div>
    )
  }

  // ── El comprobante vive en el Pago padre, no en la Orden ──────────────────
  // OrdenSocioPendienteResponse incluye el objeto `pago` anidado.
  // La fuente de verdad para el comprobante es `ordenPendiente.pago.comprobante_url`.
  const comprobanteUrl = ordenPendiente?.pago?.comprobante_url ?? null

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">

      {/* Modal: subir/cambiar comprobante de orden pendiente */}
      {mostrarUpload && ordenPendiente && (
        <OrdenGeneradaModal
          orden={ordenPendiente}
          token={token}
          onClose={() => { setMostrarUpload(false); fetchData() }}
        />
      )}

      {/* Modal: selector de meses → carrito */}
      {mostrarSeleccionMeses && (
        <SeleccionMesesModal
          precioCuota={estado?.precio_cuota_actual ?? 0}
          idProducto={estado?.id_producto}
          onClose={() => setMostrarSeleccionMeses(false)}
        />
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
          <Wallet size={24} className="text-gray-500" />
          Gestión de Cuotas
        </h1>
        <p className="text-sm text-gray-500 mt-1">Mantené tu cuenta al día para acceder al club.</p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* ── TAREA 1: Banner de Orden Pendiente ──────────────────────────────
           Lee comprobante de `ordenPendiente.pago.comprobante_url`.
           Muestra link "Ver comprobante" cuando ya hay uno subido.          */}
      {ordenPendiente && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-blue-100 text-blue-700 hidden sm:block flex-shrink-0">
              <Info size={24} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold text-blue-900">Tenés un pago en proceso</h3>
              <p className="text-sm text-blue-800 mt-0.5">
                Orden #{ordenPendiente.id_orden} — Total a transferir:{' '}
                <span className="font-bold">{formatoMoneda.format(ordenPendiente.monto_total)}</span>
              </p>

              {/* Estado del comprobante + link para verlo */}
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                {comprobanteUrl ? (
                  <>
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                      <CheckCircle size={14} />
                      Comprobante en revisión
                    </span>
                    <a
                      href={`${API}${comprobanteUrl}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 underline underline-offset-2 transition-colors"
                    >
                      <ExternalLink size={12} />
                      Ver comprobante
                    </a>
                  </>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700">
                    <AlertTriangle size={14} />
                    Falta subir el comprobante de transferencia
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Acciones */}
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <button
              onClick={() => setMostrarUpload(true)}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors text-sm"
            >
              {comprobanteUrl ? 'Cambiar Comprobante' : 'Subir Comprobante'}
            </button>
            <button
              onClick={handleCancelarOrden}
              disabled={isCanceling}
              className="px-4 py-2.5 bg-white border border-red-200 text-red-600 hover:bg-red-50 rounded-xl font-bold transition-colors text-sm disabled:opacity-50"
            >
              {isCanceling ? 'Cancelando...' : 'Cancelar Trámite'}
            </button>
          </div>
        </div>
      )}

      {/* Estado de Cuenta */}
      <EstadoCard
        estado={estado}
        loading={false}
        error={error}
        ordenPendiente={ordenPendiente}
        onAbrirCarrito={() => setMostrarSeleccionMeses(true)}
      />

      {/* ── TAREA 2: Botón único "Pagar Cuotas" → SeleccionMesesModal ────────
           Reemplaza los tres botones fijos (1/2/6 meses).
           Solo visible cuando no hay orden pendiente en curso.               */}
      {!ordenPendiente && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-2">
          <div>
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
              Pagar Cuotas
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Elegí cuántos meses abonar y agregalo al carrito junto con otros productos si querés.
            </p>
          </div>
          <button
            onClick={() => setMostrarSeleccionMeses(true)}
            className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-colors flex-shrink-0"
          >
            <ShoppingCart size={16} />
            Pagar Cuotas
          </button>
        </div>
      )}

      {/* ── TAREA 3: Historial — usa pago.comprobante_url ────────────────────
           El schema HistorialPagoCuotaResponse expone el comprobante
           en `pago.comprobante_url`. Se acepta también `comprobante_url`
           directo como fallback por retrocompatibilidad.                     */}
      <div>
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">
          Historial de Pagos
        </h2>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-50">
          {historial.map(pago => {
            const urlComprobante = pago.pago?.comprobante_url ?? pago.comprobante_url ?? null
            return (
              <div key={pago.id_orden} className="p-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-gray-100 text-gray-500 flex-shrink-0">
                    <Receipt size={16} />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      {formatoFecha.format(new Date(pago.fecha_pago))}
                    </p>
                    <p className="text-xs text-gray-500">
                      {pago.cantidad_meses} mes{pago.cantidad_meses !== 1 ? 'es' : ''} — {formatoMoneda.format(pago.monto_pagado)}
                    </p>
                  </div>
                </div>

                {urlComprobante && (
                  <a
                    href={`${API}${urlComprobante}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    <ExternalLink size={14} />
                    Ver comprobante
                  </a>
                )}
              </div>
            )
          })}

          {historial.length === 0 && (
            <div className="text-center py-12 text-gray-500 text-sm">
              Todavía no registrás pagos completados.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}