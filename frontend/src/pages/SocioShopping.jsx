// frontend/src/pages/SocioShopping.jsx
/**
 * Tienda oficial del club — catálogo de productos para el socio.
 *
 * ── Flujo de datos ────────────────────────────────────────────────────────────
 * Mount → GET /socio/carrito/productos → grilla de tarjetas de producto
 *
 * Filtro por categoría: llama de nuevo al endpoint con ?categoria=X
 * (o filtra en cliente si el catálogo es pequeño — acá filtramos en cliente
 *  para evitar flicker de red en cada tab, ya que los datos ya están cargados).
 *
 * ── Mapeo al CartContext ──────────────────────────────────────────────────────
 * addToCart espera: { id, name, price, image, qty }
 * El qty lo maneja el CartContext internamente.
 * El price que enviamos es solo para mostrar en el carrito local;
 * el backend lo ignora y recalcula desde la BD en el checkout.
 *
 * ── Feedback "Agregado" ───────────────────────────────────────────────────────
 * Al hacer click en "Agregar al carrito", el botón cambia a "¡Agregado! ✓"
 * durante 1.5 segundos antes de volver al estado original.
 * Esto se maneja con un Set de IDs en `agregadosReciente`.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import {
  ShoppingBag,
  ShoppingCart,
  Package,
  Tag,
  Home,
  Layers,
  Shirt,
  AlertCircle,
  Check,
  RefreshCw,
  Plus,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const formatoMoneda = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

// ─── Configuración de categorías de la tienda ─────────────────────────────────

const CATEGORIAS = [
  { key: 'todas',        label: 'Todo',          Icon: Layers  },
  { key: 'indumentaria', label: 'Indumentaria',  Icon: Shirt   },
  { key: 'alquiler',     label: 'Alquileres',    Icon: Home    },
  { key: 'otro',         label: 'Otros',         Icon: Package },
]

const COLORES_CATEGORIA = {
  indumentaria: { badge: 'bg-violet-100 text-violet-700', dot: 'bg-violet-500' },
  alquiler:     { badge: 'bg-amber-100  text-amber-700',  dot: 'bg-amber-500'  },
  otro:         { badge: 'bg-slate-100  text-slate-600',  dot: 'bg-slate-400'  },
  cuota_social: { badge: 'bg-blue-100   text-blue-700',   dot: 'bg-blue-500'   },
}

// ─── Skeleton de tarjeta de producto ─────────────────────────────────────────

function ProductoSkeleton() {
  return (
    <div className="bg-white rounded-2xl overflow-hidden border border-gray-100 animate-pulse">
      <div className="aspect-[4/3] bg-gray-200" />
      <div className="p-4 space-y-3">
        <div className="h-3 bg-gray-200 rounded-full w-1/3" />
        <div className="h-5 bg-gray-200 rounded-full w-3/4" />
        <div className="h-3 bg-gray-200 rounded-full w-1/2" />
        <div className="h-6 bg-gray-200 rounded-full w-2/5 mt-1" />
        <div className="h-10 bg-gray-200 rounded-xl mt-2" />
      </div>
    </div>
  )
}

// ─── Placeholder de imagen ────────────────────────────────────────────────────

function ImagenProducto({ src, nombre, categoria }) {
  const [error, setError] = useState(false)
  const colores = COLORES_CATEGORIA[categoria] ?? COLORES_CATEGORIA.otro
  const IconCat = {
    indumentaria: Shirt,
    alquiler: Home,
    otro: Package,
  }[categoria] ?? Package

  if (!src || error) {
    return (
      <div className={`w-full h-full flex flex-col items-center justify-center gap-2
                       bg-gradient-to-br from-gray-50 to-gray-100`}>
        <div className={`p-3 rounded-full ${colores.badge}`}>
          <IconCat size={28} strokeWidth={1.5} />
        </div>
        <span className="text-xs text-gray-400 font-medium px-4 text-center leading-tight line-clamp-2">
          {nombre}
        </span>
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={nombre}
      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
      onError={() => setError(true)}
    />
  )
}

// ─── Badge de stock ───────────────────────────────────────────────────────────

function StockBadge({ stock }) {
  // stock = null → ilimitado (servicios)
  if (stock === null || stock === undefined) return null

  if (stock === 0)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px]
                        font-bold bg-red-100 text-red-700 border border-red-200">
        Sin stock
      </span>
    )
  if (stock <= 3)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px]
                        font-bold bg-amber-100 text-amber-700 border border-amber-200">
        Últimas {stock} unidades
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px]
                      font-semibold bg-green-100 text-green-700 border border-green-200">
      Stock disponible
    </span>
  )
}

// ─── Tarjeta de producto ──────────────────────────────────────────────────────

function TarjetaProducto({ producto, onAgregar, recienAgregado }) {
  const sinStock     = producto.stock !== null && producto.stock === 0
  const colores      = COLORES_CATEGORIA[producto.categoria] ?? COLORES_CATEGORIA.otro
  const labelCategoria = CATEGORIAS.find(c => c.key === producto.categoria)?.label
                          ?? producto.categoria

  return (
    <div
      className={`
        group relative bg-white rounded-2xl overflow-hidden border transition-all duration-300
        ${sinStock
          ? 'border-gray-100 opacity-75'
          : 'border-gray-100 hover:border-gray-200 hover:shadow-lg hover:-translate-y-0.5'
        }
      `}
    >
      {/* Imagen */}
      <div className="relative aspect-[4/3] overflow-hidden bg-gray-50">
        <ImagenProducto
          src={producto.imagen_url}
          nombre={producto.nombre}
          categoria={producto.categoria}
        />

        {/* Badge de categoría flotante */}
        <div className="absolute top-3 left-3">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
                            text-xs font-semibold backdrop-blur-sm shadow-sm
                            ${colores.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${colores.dot}`} />
            {labelCategoria}
          </span>
        </div>

        {/* Overlay "Sin Stock" */}
        {sinStock && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px]
                          flex items-center justify-center">
            <span className="px-4 py-2 rounded-full bg-white/90 shadow text-sm
                             font-bold text-gray-500 border border-gray-200">
              Sin Stock
            </span>
          </div>
        )}
      </div>

      {/* Contenido */}
      <div className="p-4 flex flex-col gap-2">

        {/* Stock badge */}
        <StockBadge stock={producto.stock} />

        {/* Nombre */}
        <h3 className="font-bold text-gray-900 text-base leading-snug line-clamp-2
                        group-hover:text-indigo-700 transition-colors">
          {producto.nombre}
        </h3>

        {/* Descripción */}
        {producto.descripcion && (
          <p className="text-xs text-gray-400 leading-relaxed line-clamp-2">
            {producto.descripcion}
          </p>
        )}

        {/* Precio */}
        <p className="text-xl font-extrabold text-gray-900 tracking-tight mt-1">
          {formatoMoneda.format(producto.precio_actual)}
          <span className="text-xs font-normal text-gray-400 ml-1">c/u</span>
        </p>

        {/* Botón agregar */}
        <button
          onClick={() => !sinStock && !recienAgregado && onAgregar(producto)}
          disabled={sinStock || recienAgregado}
          className={`
            mt-1 w-full flex items-center justify-center gap-2
            py-2.5 px-4 rounded-xl font-semibold text-sm
            transition-all duration-200 active:scale-95
            ${sinStock
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : recienAgregado
              ? 'bg-green-500 text-white cursor-default shadow-sm'
              : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm hover:shadow-md'
            }
          `}
        >
          {sinStock ? (
            'Sin Stock'
          ) : recienAgregado ? (
            <><Check size={15} strokeWidth={2.5} /> ¡Agregado!</>
          ) : (
            <><Plus size={15} strokeWidth={2.5} /> Agregar al carrito</>
          )}
        </button>
      </div>
    </div>
  )
}

// ─── Tabs de categoría ────────────────────────────────────────────────────────

function TabsCategorias({ activa, onChange }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pb-1">
      {CATEGORIAS.map(({ key, label, Icon }) => {
        const isActive = activa === key
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`
              flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold
              transition-all duration-200
              ${isActive
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }
            `}
          >
            <Icon size={14} strokeWidth={2} />
            {label}
          </button>
        )
      })}
    </div>
  )
}

// ─── FAB / Banner del carrito ─────────────────────────────────────────────────

function CartFAB({ itemCount }) {
  if (itemCount === 0) return null

  return (
    <Link
      to="/carrito"
      className="
        fixed bottom-6 right-6 z-30
        flex items-center gap-3
        bg-indigo-600 hover:bg-indigo-700 active:scale-95
        text-white font-bold text-sm
        px-5 py-3.5 rounded-2xl shadow-xl shadow-indigo-600/30
        transition-all duration-200
        group
      "
    >
      <div className="relative">
        <ShoppingCart size={20} strokeWidth={2} />
        <span className="
          absolute -top-2.5 -right-2.5
          min-w-[18px] h-[18px] px-1
          flex items-center justify-center
          rounded-full bg-white text-indigo-700
          text-[10px] font-extrabold
          ring-2 ring-indigo-600
        ">
          {itemCount > 99 ? '99+' : itemCount}
        </span>
      </div>
      <span>
        Ir al Carrito
        <span className="ml-1.5 font-normal opacity-80 text-xs">
          ({itemCount} {itemCount === 1 ? 'ítem' : 'ítems'})
        </span>
      </span>
    </Link>
  )
}

// ─── Estado vacío ─────────────────────────────────────────────────────────────

function ProductosVacios({ categoriaActiva }) {
  const esFiltrado = categoriaActiva !== 'todas'
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-20 text-center px-4">
      <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-5">
        <Tag size={32} className="text-gray-300" strokeWidth={1.5} />
      </div>
      <p className="font-bold text-gray-600">
        {esFiltrado ? 'No hay productos en esta categoría' : 'No hay productos disponibles'}
      </p>
      <p className="text-sm text-gray-400 mt-1">
        {esFiltrado ? 'Probá seleccionando otra categoría.' : 'Volvé a revisar más tarde.'}
      </p>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function SocioShopping() {
  const { token }                 = useAuth()
  const { cart, addToCart }       = useCart()

  const [productos,       setProductos]       = useState([])
  const [loading,         setLoading]         = useState(true)
  const [error,           setError]           = useState(null)
  const [categoriaActiva, setCategoriaActiva] = useState('todas')
  const [agregadosReciente, setAgregadosReciente] = useState(new Set())

  // Ref para timers de feedback de "¡Agregado!"
  const timersRef = useRef({})

  // ── Fetch del catálogo ─────────────────────────────────────────────────────
  const fetchProductos = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/socio/carrito/productos`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`Error ${res.status}: no se pudo cargar el catálogo.`)
      setProductos(await res.json())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    fetchProductos()
    return () => {
      // Limpiar timers al desmontar para evitar setState en componente desmontado
      Object.values(timersRef.current).forEach(clearTimeout)
    }
  }, [fetchProductos])

  // ── Filtro en cliente (sin nueva petición de red) ──────────────────────────
  const productosFiltrados = categoriaActiva === 'todas'
    ? productos
    : productos.filter(p => p.categoria === categoriaActiva)

  // ── Agregar al carrito con feedback temporal ───────────────────────────────
  const handleAgregar = (producto) => {
    // Mapeo exacto al formato que espera CartContext
    addToCart({
      id:    producto.id_producto,
      name:  producto.nombre,
      price: Number(producto.precio_actual),   // Decimal → Number para localStorage
      image: producto.imagen_url ?? null,
    })

    // Feedback visual: botón verde por 1.5s
    setAgregadosReciente(prev => new Set(prev).add(producto.id_producto))

    // Limpiar timer anterior si existe (doble-click rápido)
    if (timersRef.current[producto.id_producto]) {
      clearTimeout(timersRef.current[producto.id_producto])
    }
    timersRef.current[producto.id_producto] = setTimeout(() => {
      setAgregadosReciente(prev => {
        const next = new Set(prev)
        next.delete(producto.id_producto)
        return next
      })
    }, 1500)
  }

  // ── Conteo total de ítems para el FAB ─────────────────────────────────────
  const totalItems = cart.reduce((sum, item) => sum + item.qty, 0)

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 pb-28">

      {/* FAB del carrito */}
      <CartFAB itemCount={totalItems} />

      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-20 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 space-y-3">

          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <ShoppingBag size={20} className="text-indigo-600" />
                Tienda Oficial
              </h1>
              <p className="text-xs text-gray-400 mt-0.5">
                {loading ? 'Cargando…' : `${productosFiltrados.length} producto${productosFiltrados.length !== 1 ? 's' : ''}`}
              </p>
            </div>

            <button
              onClick={fetchProductos}
              disabled={loading}
              className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40"
              title="Actualizar catálogo"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Tabs */}
          <TabsCategorias activa={categoriaActiva} onChange={setCategoriaActiva} />
        </div>
      </div>

      {/* Contenido */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">

        {/* Error */}
        {error && (
          <div className="flex items-center gap-3 p-4 mb-6 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            <AlertCircle size={16} className="flex-shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={fetchProductos} className="underline underline-offset-2 font-medium hover:text-red-900">
              Reintentar
            </button>
          </div>
        )}

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">

          {/* Skeletons de carga */}
          {loading && [...Array(8)].map((_, i) => <ProductoSkeleton key={i} />)}

          {/* Tarjetas reales */}
          {!loading && productosFiltrados.map(producto => (
            <TarjetaProducto
              key={producto.id_producto}
              producto={producto}
              onAgregar={handleAgregar}
              recienAgregado={agregadosReciente.has(producto.id_producto)}
            />
          ))}

          {/* Estado vacío */}
          {!loading && productosFiltrados.length === 0 && !error && (
            <ProductosVacios categoriaActiva={categoriaActiva} />
          )}
        </div>
      </div>
    </div>
  )
}