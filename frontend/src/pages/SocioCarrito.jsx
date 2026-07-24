// frontend/src/pages/SocioCarrito.jsx
/**
 * Página del carrito de compras del socio.
 *
 * ── Fuente de datos ───────────────────────────────────────────────────────────
 * Los ítems se leen de CartContext (localStorage-backed). Cada ítem:
 *   { id, name, price, qty, image? }
 *   id    → id_producto en el backend
 *   price → se ignora en el backend; solo se usa para mostrar el subtotal local.
 *           El precio real lo determina el backend en el checkout.
 *
 * ── Flujo de checkout ─────────────────────────────────────────────────────────
 * 1. "Finalizar Compra" → POST /socio/carrito/checkout con los ítems.
 * 2. Éxito → clearCart() + abre OrdenGeneradaModal con la orden devuelta.
 * 3. El modal guía al socio para subir el comprobante de transferencia.
 *    Reutiliza el endpoint agnóstico de cuotas:
 *    POST /socio/cuotas/ordenes/{id_orden}/comprobante
 *
 * ── OrdenGeneradaModal ────────────────────────────────────────────────────────
 * Copia fiel del modal de SocioCuotas.jsx con textos ajustados para compras
 * de carrito. Endpoint de upload idéntico (agnóstico al origen de la orden).
 */

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import {
  ShoppingCart,
  ShoppingBag,
  Trash2,
  Loader2,
  X,
  AlertTriangle,
  CheckCircle,
  UploadCloud,
  ArrowLeft,
  PackageX,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const formatoMoneda = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

// ─── Modal de orden generada — comprobante de transferencia ───────────────────
//
// Copia de OrdenGeneradaModal de SocioCuotas.jsx con textos de compra.
// Endpoint de upload: /socio/cuotas/ordenes/{id_orden}/comprobante (agnóstico).
//
// ─── Modal de orden generada — comprobante de transferencia ───────────────────
//
// Actualizado para el patrón Split-Order: el backend devuelve un PagoResponse.
// El upload se hace sobre /pagos/{id_pago}/comprobante.
//
// ─── Modal de checkout — 3 pasos: método → confirmar → comprobante/resultado ──
//
// PASO 0 (selección): el socio elige cómo va a pagar ANTES de que se llame
//   al backend. El checkout real ocurre recién al confirmar en este paso,
//   evitando generar una Orden si el socio cierra el modal sin intención de pagar.
//
// PASO 1a (transferencia): datos bancarios con botón "copiar alias" + upload
//   de comprobante al endpoint /socio/cuotas/pagos/{id_pago}/comprobante.
//
// PASO 1b (efectivo): mensaje de confirmación, el admin se contacta.
//
// PASO 1c (mercado pago): deshabilitado, placeholder para futura integración.

function OrdenGeneradaModal({ cartTotal, cartPayload, token, onClose, onCheckout }) {
  // Paso: 'metodo' | 'transferencia' | 'efectivo' | 'mercadopago'
  const [paso,        setPaso]        = useState('metodo')
  const [isConfirming, setIsConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState(null)
  const [orden,       setOrden]       = useState(null)   // PagoResponse del backend

  // Upload
  const [file,        setFile]        = useState(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [uploadOk,    setUploadOk]    = useState(false)

  // ── Confirmar compra con el método elegido ─────────────────────────────────
  const handleConfirmar = async (metodo) => {
    setIsConfirming(true)
    setConfirmError(null)
    try {
      const data = await onCheckout(metodo)  // llama al checkout en el padre
      setOrden(data)
      setPaso(metodo)
    } catch (err) {
      setConfirmError(err.message)
    } finally {
      setIsConfirming(false)
    }
  }

  // ── Upload de comprobante ──────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!file) { setUploadError('Seleccioná un archivo primero.'); return }
    setIsUploading(true)
    setUploadError(null)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch(
        `${API}/socio/cuotas/pagos/${orden.id_pago}/comprobante`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? 'Error al subir el comprobante.')
      }
      setUploadOk(true)
      setTimeout(() => onClose(), 2500)
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setIsUploading(false)
    }
  }

  // ── Copiar alias al portapapeles ───────────────────────────────────────────
  const [copiado, setCopiado] = useState(false)
  const copiarAlias = () => {
    navigator.clipboard.writeText('CLUB.ROBERTS')
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center items-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[92dvh]">

        {/* Header */}
        <div className="p-6 border-b flex-shrink-0 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-800">
              {paso === 'metodo'        && 'Finalizar compra'}
              {paso === 'transferencia' && (orden ? '¡Compra generada!' : 'Confirmar compra')}
              {paso === 'efectivo'      && (orden ? '¡Compra registrada!' : 'Confirmar compra')}
              {paso === 'mercado_pago'  && '¡Redirigiendo a Mercado Pago!'}
            </h2>
            {orden && (
              <p className="text-sm text-gray-500 mt-1">
                Pago #{orden.id_pago} · {formatoMoneda.format(orden.monto_total)}
              </p>
            )}
            {!orden && (
              <p className="text-sm text-gray-500 mt-1">
                Total: {formatoMoneda.format(cartTotal)}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            disabled={isConfirming || isUploading}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── PASO 0: elegir método de pago ── */}
        {paso === 'metodo' && (
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            {confirmError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
                <span>{confirmError}</span>
              </div>
            )}

            <div className="text-center p-4 rounded-xl bg-indigo-50 border border-indigo-200">
              <p className="text-sm font-semibold text-indigo-900">Total a abonar</p>
              <p className="text-3xl font-bold text-indigo-900 mt-1">{formatoMoneda.format(cartTotal)}</p>
            </div>

            <p className="text-sm text-gray-500 text-center">¿Cómo vas a pagar?</p>

            <div className="space-y-3">
              {/* Transferencia */}
              <button
                onClick={() => handleConfirmar('transferencia')}
                disabled={isConfirming}
                className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-indigo-200
                           bg-indigo-50 hover:bg-indigo-100 transition-colors text-left
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="text-2xl">🏦</span>
                <div>
                  <p className="font-bold text-indigo-900 text-sm">Transferencia bancaria</p>
                  <p className="text-xs text-indigo-600 mt-0.5">Alias CLUB.ROBERTS · Requiere comprobante</p>
                </div>
                {isConfirming && <Loader2 size={16} className="animate-spin ml-auto text-indigo-500" />}
              </button>

              {/* Efectivo */}
              <button
                onClick={() => handleConfirmar('efectivo')}
                disabled={isConfirming}
                className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-gray-200
                           bg-gray-50 hover:bg-gray-100 transition-colors text-left
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="text-2xl">💵</span>
                <div>
                  <p className="font-bold text-gray-800 text-sm">Efectivo</p>
                  <p className="text-xs text-gray-500 mt-0.5">Un administrativo se contactará con vos</p>
                </div>
              </button>

              {/* Mercado Pago */}
              <button
                onClick={() => handleConfirmar('mercado_pago')}
                disabled={isConfirming}
                className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-blue-200
                           bg-blue-50 hover:bg-blue-100 transition-colors text-left
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="text-2xl">💳</span>
                <div>
                  <p className="font-bold text-blue-900 text-sm">Mercado Pago</p>
                  <p className="text-xs text-blue-600 mt-0.5">Tarjeta, dinero en cuenta o cuotas</p>
                </div>
                {isConfirming && <Loader2 size={16} className="animate-spin ml-auto text-blue-500" />}
              </button>
            </div>
          </div>
        )}

        {/* ── PASO 1a: transferencia — datos bancarios + upload ── */}
        {paso === 'transferencia' && orden && (
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            {uploadError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
                <span>{uploadError}</span>
              </div>
            )}
            {uploadOk && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm font-medium">
                <CheckCircle size={15} />
                ¡Comprobante enviado! Un administrador verificará tu pago.
              </div>
            )}

            {/* Datos bancarios */}
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Datos para transferir</p>
              </div>
              <div className="divide-y divide-gray-100">
                <div className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-xs text-gray-400">Alias</p>
                    <p className="font-bold text-indigo-700 tracking-widest">CLUB.ROBERTS</p>
                  </div>
                  <button
                    onClick={copiarAlias}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 transition-colors"
                  >
                    {copiado ? '✓ Copiado' : 'Copiar'}
                  </button>
                </div>
                <div className="px-4 py-3">
                  <p className="text-xs text-gray-400">Titular</p>
                  <p className="font-semibold text-gray-700">Club Atlético Roberts</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-xs text-gray-400">Banco</p>
                  <p className="font-semibold text-gray-700">Banco Nación</p>
                </div>
                <div className="px-4 py-3 bg-indigo-50">
                  <p className="text-xs text-gray-400">Total a transferir</p>
                  <p className="font-bold text-indigo-900 text-lg">{formatoMoneda.format(orden.monto_total)}</p>
                </div>
              </div>
            </div>

            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-center">
              ⚠️ Tenés <strong>48 horas</strong> para subir el comprobante. Revisá también tu mail.
            </p>

            {/* Upload */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Adjuntar comprobante
              </label>
              <label
                className={`mt-1.5 relative flex justify-center w-full px-6 py-7 border-2 border-dashed
                  rounded-xl cursor-pointer transition-colors
                  ${file ? 'border-green-300 bg-green-50' : 'border-gray-300 bg-white hover:border-indigo-400 hover:bg-indigo-50'}
                  ${(isUploading || uploadOk) ? 'opacity-60 cursor-not-allowed' : ''}
                `}
              >
                <div className="text-center pointer-events-none">
                  <UploadCloud className={`mx-auto h-9 w-9 ${file ? 'text-green-500' : 'text-gray-400'}`} />
                  <span className={`mt-2 block text-sm font-semibold ${file ? 'text-green-800' : 'text-gray-600'}`}>
                    {file ? file.name : 'Seleccionar archivo'}
                  </span>
                  <span className="mt-1 block text-xs text-gray-400">PNG, JPG, PDF (Máx. 10 MB)</span>
                </div>
                <input type="file" className="sr-only" accept="image/*,.pdf"
                  onChange={e => { if (e.target.files[0]) { setFile(e.target.files[0]); setUploadError(null) } }}
                  disabled={isUploading || uploadOk}
                />
              </label>
            </div>
          </div>
        )}

        {/* ── PASO 1b: efectivo ── */}
        {paso === 'efectivo' && orden && (
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            <div className="text-center py-4">
              <span className="text-5xl">✅</span>
              <h3 className="mt-4 font-bold text-gray-800 text-lg">¡Orden registrada!</h3>
              <p className="text-sm text-gray-500 mt-2 leading-relaxed">
                Tu orden <strong>#{orden.id_pago}</strong> por{' '}
                <strong>{formatoMoneda.format(orden.monto_total)}</strong> fue generada.
                Un administrativo del club se va a comunicar con vos para coordinar el pago en efectivo.
              </p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 leading-relaxed">
              También podés ver el estado de tu orden en{' '}
              <a href="/mis-compras" className="font-bold underline">Mis Compras</a>.
            </div>
          </div>
        )}

        {/* ── PASO 1c: mercado pago — redirigir al init_point ── */}
        {paso === 'mercado_pago' && orden && (() => {
          // Redirigir automáticamente al link de pago de Mercado Pago
          // en cuanto el paso esté listo (la orden ya fue creada en el backend).
          // Usamos un setTimeout de 1500ms para que el socio vea el mensaje
          // antes de salir de la página.
          setTimeout(() => { window.location.href = orden.init_point }, 1500)
          return (
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="text-center py-6">
                <Loader2 size={48} className="animate-spin text-blue-500 mx-auto" />
                <h3 className="mt-4 font-bold text-gray-800 text-lg">Generando link de pago…</h3>
                <p className="text-sm text-gray-500 mt-2">
                  En un momento te redirigimos a Mercado Pago para completar el pago de{' '}
                  <strong>{formatoMoneda.format(orden.monto_total)}</strong>.
                </p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
                Si no sos redirigido automáticamente,{' '}
                <a
                  href={orden.init_point}
                  className="font-bold underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  hacé clic acá
                </a>.
              </div>
            </div>
          )
        })()}

        {/* Footer */}
        <div className="p-4 bg-gray-50 rounded-b-2xl border-t flex justify-end gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isConfirming || isUploading}
            className="px-4 py-2 rounded-lg text-gray-600 bg-gray-200 hover:bg-gray-300 font-semibold transition-colors"
          >
            {(paso === 'efectivo' && orden) || uploadOk ? 'Listo' : 'Cerrar'}
          </button>
          {paso === 'transferencia' && orden && (
            <button
              type="button"
              onClick={handleUpload}
              disabled={!file || isUploading || uploadOk}
              className="px-4 py-2 rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 font-semibold disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {isUploading && <Loader2 size={14} className="animate-spin" />}
              {isUploading ? 'Subiendo…' : 'Subir Comprobante'}
            </button>
          )}
        </div>

      </div>
    </div>
  )
}

// ─── Fila de ítem del carrito ─────────────────────────────────────────────────

function ItemCarrito({ item, onRemove }) {
  return (
    <div className="flex items-center gap-4 py-4 px-5">

      {/* Imagen o placeholder */}
      <div className="flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
        {item.image ? (
          <img
            src={item.image}
            alt={item.name}
            className="w-full h-full object-cover"
            onError={e => { e.currentTarget.src = '' }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ShoppingBag size={22} className="text-gray-300" />
          </div>
        )}
      </div>

      {/* Nombre + cantidad */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 truncate">{item.name ?? `Producto #${item.id}`}</p>
        <p className="text-sm text-gray-500 mt-0.5">
          {formatoMoneda.format(item.price)} × {item.qty}
        </p>
      </div>

      {/* Subtotal */}
      <div className="flex-shrink-0 text-right">
        <p className="font-bold text-gray-900">
          {formatoMoneda.format(item.price * item.qty)}
        </p>
      </div>

      {/* Eliminar */}
      <button
        onClick={() => onRemove(item.id)}
        className="flex-shrink-0 p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        title="Quitar del carrito"
      >
        <Trash2 size={16} />
      </button>
    </div>
  )
}

// ─── Estado vacío ─────────────────────────────────────────────────────────────

function CarritoVacio() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-4">
      <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-5">
        <PackageX size={36} className="text-gray-400" />
      </div>
      <h2 className="text-xl font-bold text-gray-700">Tu carrito está vacío</h2>
      <p className="text-gray-400 text-sm mt-2 max-w-xs">
        Todavía no agregaste nada. Explorá la tienda para encontrar lo que necesitás.
      </p>
      <Link
        to="/shopping"
        className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-xl
                   bg-indigo-600 hover:bg-indigo-700 text-white font-bold
                   transition-colors shadow-sm"
      >
        <ShoppingBag size={16} />
        Ir a la tienda
      </Link>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function SocioCarrito() {
  const { token }                         = useAuth()
  const { cart, removeFromCart, clearCart, cartTotal } = useCart()
  const navigate                          = useNavigate()

  const [isCheckingOut, setIsCheckingOut] = useState(false)
  const [checkoutError, setCheckoutError] = useState(null)
  const [ordenGenerada, setOrdenGenerada] = useState(null)   // OrdenResponse del backend
  const [modalAbierto, setModalAbierto]   = useState(false)

  // ── Abrir modal de checkout (aún NO llama al backend) ────────────────────
  const handleAbrirCheckout = () => {
    if (!cart.length) return
    const itemInvalido = cart.find(item => !Number.isInteger(Number(item.id)))
    if (itemInvalido) {
      setCheckoutError(
        `El ítem "${itemInvalido.name}" quedó corrupto en tu carrito (sin ID válido). ` +
        'Quitalo y agregalo de nuevo.'
      )
      return
    }
    setCheckoutError(null)
    setModalAbierto(true)
  }

  // ── Checkout real — llamado desde el modal al confirmar método de pago ────
  // Devuelve el PagoResponse o lanza un Error (el modal lo captura).
  const handleCheckout = async (metodo) => {
    setIsCheckingOut(true)
    const payload = {
      metodo_pago: metodo,
      items: cart.map(item => ({
        id_producto: Number(item.id_producto ?? item.id),
        cantidad:    parseInt(item.qty, 10),
        ...(item.id_reserva != null ? { id_reserva: Number(item.id_reserva) } : {}),
      })),
    }
    try {
      const res = await fetch(`${API}/socio/carrito/checkout`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        const mensaje = Array.isArray(data.detail)
          ? data.detail.map(e => e.msg ?? e).join(' · ')
          : (data.detail ?? `Error ${res.status} al procesar la compra.`)
        throw new Error(mensaje)
      }
      clearCart()   // vaciar recién acá, cuando el backend confirmó
      setOrdenGenerada(data)
      return data
    } finally {
      setIsCheckingOut(false)
    }
  }

  // ── Cierre del modal ────────────────────────────────────────────────────────
  const handleCloseModal = () => {
    setModalAbierto(false)
    setOrdenGenerada(null)
    navigate('/socio')  // Redirige al panel del socio tras completar el flujo
  }

  // ── Quitar ítem: si es un alquiler con pre-reserva, liberarla en el backend ──
  const handleRemove = async (item) => {
    removeFromCart(item.id)
    if (item.categoria === 'alquiler' && item.id_reserva != null) {
      try {
        await fetch(`${API}/socio/reservas/${item.id_reserva}/liberar`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        })
      } catch {
        // No bloqueamos la UI por esto: si falla, el job de expiración
        // (20 min) la libera igual. El ítem ya salió del carrito del socio.
      }
    }
  }

  // ── Vaciar carrito: liberar TODAS las pre-reservas de alquiler antes ────────
  // (mismo motivo que handleRemove — si no, quedan 'bloqueada' hasta que las
  // agarre el job de expiración de 20 minutos, ocupando la agenda en vano).
  const handleVaciarCarrito = async () => {
    if (!window.confirm('¿Vaciar el carrito?')) return

    const itemsAlquiler = cart.filter(
      item => item.categoria === 'alquiler' && item.id_reserva != null
    )

    // Se dispara en paralelo y no bloqueamos el vaciado del carrito si alguna
    // falla: el job de expiración las limpia igual como red de seguridad.
    await Promise.allSettled(
      itemsAlquiler.map(item =>
        fetch(`${API}/socio/reservas/${item.id_reserva}/liberar`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        })
      )
    )

    clearCart()
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!cart.length && !modalAbierto) {
    return <CarritoVacio />
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-6">

      {/* Modal de comprobante */}
      {modalAbierto && (
        <OrdenGeneradaModal
          cartTotal={cartTotal}
          cartPayload={cart}
          orden={ordenGenerada}
          token={token}
          onClose={handleCloseModal}
          onCheckout={handleCheckout}
        />
      )}

      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl text-gray-500 hover:bg-gray-100 transition-colors"
          title="Volver"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShoppingCart size={22} className="text-gray-500" />
            Mi Carrito
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {cart.length} {cart.length === 1 ? 'artículo' : 'artículos'}
          </p>
        </div>
      </div>

      {/* Lista de ítems */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-50 overflow-hidden">
        {cart.map(item => (
          <ItemCarrito
            key={`${item.id}-${item.qty}`} // Usamos una combinación única
            item={item}
            onRemove={() => handleRemove(item)}
          />
        ))}
      </div>

      {/* Error de checkout */}
      {checkoutError && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <span>{checkoutError}</span>
        </div>
      )}

      {/* Resumen y acción */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">

        {/* Total calculado localmente (orientativo — el backend recalcula) */}
        <div className="flex items-center justify-between">
          <span className="text-gray-600 font-medium">Subtotal estimado</span>
          <span className="text-lg font-bold text-gray-900">{formatoMoneda.format(cartTotal)}</span>
        </div>

        <p className="text-xs text-gray-400 leading-snug">
          El monto final es confirmado por el sistema al procesar tu compra.
          Los precios pueden variar si el catálogo fue actualizado.
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          {/* Vaciar carrito */}
          <button
            onClick={handleVaciarCarrito}
            disabled={isCheckingOut}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-500
                       hover:bg-gray-50 font-semibold text-sm transition-colors
                       disabled:opacity-50"
          >
            Vaciar carrito
          </button>

          {/* Finalizar compra */}
          <button
            onClick={handleAbrirCheckout}
            disabled={isCheckingOut || !cart.length}
            className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700
                       text-white font-bold text-sm transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed
                       flex items-center justify-center gap-2 shadow-sm active:scale-95"
          >
            {isCheckingOut
              ? <><Loader2 size={16} className="animate-spin" /> Procesando…</>
              : <><ShoppingCart size={16} /> Finalizar Compra</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}