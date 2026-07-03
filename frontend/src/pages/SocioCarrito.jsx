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
function OrdenGeneradaModal({ orden, token, onClose }) {
  const [file,        setFile]        = useState(null)
  const [isUploading, setIsUploading] = useState(false)
  const [apiError,    setApiError]    = useState(null)
  const [success,     setSuccess]     = useState(false)

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0]
    if (selectedFile) {
      setFile(selectedFile)
      setApiError(null)
    }
  }

  const handleUpload = async () => {
    if (!file) {
      setApiError('Por favor, seleccioná un archivo antes de continuar.')
      return
    }
    setIsUploading(true)
    setApiError(null)
    setSuccess(false)

    const formData = new FormData()
    formData.append('file', file)

    try {
      // Mismo endpoint que SocioCuotas — es agnóstico al origen de la orden.
      const res = await fetch(
        `${API}/socio/cuotas/ordenes/${orden.id_orden}/comprobante`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? 'Error al subir el comprobante.')
      }
      setSuccess(true)
      setTimeout(() => onClose(), 2500)
    } catch (err) {
      setApiError(err.message)
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center items-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[92dvh]">

        {/* Header */}
        <div className="p-6 border-b flex-shrink-0 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-800">¡Compra generada!</h2>
            <p className="text-sm text-gray-500 mt-1">
              Orden #{orden.id_orden} · {formatoMoneda.format(orden.monto_total)}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isUploading}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Cuerpo */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">

          {/* Errores y éxito */}
          {apiError && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
              <span>{apiError}</span>
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm font-medium">
              <CheckCircle size={15} />
              ¡Comprobante enviado! Un administrador verificará tu pago.
            </div>
          )}

          {/* Total destacado */}
          <div className="text-center p-4 rounded-xl bg-indigo-50 border border-indigo-200">
            <p className="text-sm font-semibold text-indigo-900">Total a transferir</p>
            <p className="text-3xl font-bold text-indigo-900 mt-1">
              {formatoMoneda.format(orden.monto_total)}
            </p>
          </div>

          {/* Instrucciones */}
          <p className="text-sm text-gray-600 text-center">
            Transferí al alias <strong className="text-gray-900">CLUB.ROBERTS</strong> y subí
            el comprobante para que podamos verificar tu pago.
          </p>

          {/* Detalles de los ítems */}
          {orden.detalles?.length > 0 && (
            <div className="rounded-xl border border-gray-100 divide-y divide-gray-50 text-sm overflow-hidden">
              {orden.detalles.map(d => (
                <div key={d.id_detalle} className="flex items-center justify-between px-4 py-2.5 gap-2">
                  <span className="text-gray-700 truncate">
                    {d.producto?.nombre ?? `Producto #${d.id_producto}`}
                    {d.cantidad > 1 && (
                      <span className="ml-1 text-gray-400 text-xs">× {d.cantidad}</span>
                    )}
                  </span>
                  <span className="font-semibold text-gray-900 whitespace-nowrap">
                    {formatoMoneda.format(Number(d.precio_unitario_historico) * d.cantidad)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Upload de comprobante */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Adjuntar comprobante
            </label>
            <div className="mt-1.5">
              <label
                className={`
                  relative flex justify-center w-full px-6 py-8 border-2 border-dashed
                  rounded-xl cursor-pointer transition-colors
                  ${file
                    ? 'border-green-300 bg-green-50'
                    : 'border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50'
                  }
                  ${(isUploading || success) ? 'opacity-60 cursor-not-allowed' : ''}
                `}
              >
                <div className="text-center pointer-events-none">
                  <UploadCloud
                    className={`mx-auto h-10 w-10 ${file ? 'text-green-500' : 'text-gray-400'}`}
                  />
                  <span className={`mt-2 block text-sm font-semibold ${file ? 'text-green-800' : 'text-gray-600'}`}>
                    {file ? file.name : 'Seleccionar archivo'}
                  </span>
                  <span className="mt-1 block text-xs text-gray-500">
                    PNG, JPG, PDF (Máx. 10 MB)
                  </span>
                </div>
                <input
                  type="file"
                  className="sr-only"
                  accept="image/*,.pdf"
                  onChange={handleFileChange}
                  disabled={isUploading || success}
                />
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-50 rounded-b-2xl border-t flex justify-end gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isUploading}
            className="px-4 py-2 rounded-lg text-gray-600 bg-gray-200 hover:bg-gray-300 font-semibold transition-colors"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={handleUpload}
            disabled={!file || isUploading || success}
            className="px-4 py-2 rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 font-semibold disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {isUploading && <Loader2 size={14} className="animate-spin" />}
            {isUploading ? 'Subiendo…' : 'Subir Comprobante'}
          </button>
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

  // ── Checkout ────────────────────────────────────────────────────────────────
  const handleCheckout = async () => {
    if (!cart.length) return

    setIsCheckingOut(true)
    setCheckoutError(null)

    // El backend ignora el price del frontend y recalcula con precio_actual real.
    const payload = {
      items: cart.map(item => ({
        id_producto: item.id,
        cantidad:    item.qty,
        // mes_referencia: null (solo aplica para cuotas sociales)
      })),
    }

    try {
      const res = await fetch(`${API}/socio/carrito/checkout`, {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok) {
        // data.detail puede ser un string o una lista (errores de validación Pydantic)
        const mensaje = Array.isArray(data.detail)
          ? data.detail.map(e => e.msg ?? e).join(' · ')
          : (data.detail ?? `Error ${res.status} al procesar la compra.`)
        throw new Error(mensaje)
      }

      // Éxito: vaciar el carrito y abrir el modal de comprobante
      clearCart()
      setOrdenGenerada(data)
      setModalAbierto(true)

    } catch (err) {
      setCheckoutError(err.message)
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

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!cart.length && !modalAbierto) {
    return <CarritoVacio />
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-6">

      {/* Modal de comprobante */}
      {modalAbierto && ordenGenerada && (
        <OrdenGeneradaModal
          orden={ordenGenerada}
          token={token}
          onClose={handleCloseModal}
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
            key={item.id}
            item={item}
            onRemove={removeFromCart}
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
            onClick={() => { if (window.confirm('¿Vaciar el carrito?')) clearCart() }}
            disabled={isCheckingOut}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-500
                       hover:bg-gray-50 font-semibold text-sm transition-colors
                       disabled:opacity-50"
          >
            Vaciar carrito
          </button>

          {/* Finalizar compra */}
          <button
            onClick={handleCheckout}
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