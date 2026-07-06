// frontend/src/pages/AdminProductos.jsx
/**
 * Catálogo de Productos y Servicios — ruta `/admin/productos`.
 *
 * Sigue el mismo patrón que AdminPagos.jsx / AdminComercios.jsx:
 *   - Tabla limpia con skeleton de carga y banner de error con reintento.
 *   - Buscador local (nombre o categoría, sin ir al backend).
 *   - Modal único para crear/editar, con validación y fail-fast.
 *
 * Backend consumido:
 *   GET   /admin/productos
 *   POST  /admin/productos            (ProductoServicioCreate)
 *   PATCH /admin/productos/{id}       (ProductoServicioUpdate, exclude_unset)
 *
 * Nota importante: el backend NO permite cambiar la categoría de un producto
 * existente (ProductoServicioUpdate no tiene ese campo — cambiarla rompería
 * silenciosamente la lógica que busca el producto 'cuota_social' activo en
 * admin_pagos.py / socio_cuotas.py). Por eso el <select> de categoría queda
 * deshabilitado en modo edición.
 */

import { useState, useEffect, Fragment, useCallback, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  Package,
  PlusCircle,
  Edit,
  RefreshCw,
  AlertCircle,
  Search,
  Loader2,
  X,
  Wallet,
  Infinity as InfinityIcon,
  CalendarDays,
  Save,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const CATEGORIAS = ['cuota_social', 'alquiler', 'indumentaria', 'otro']

const CATEGORIA_LABELS = {
  cuota_social: 'Cuota Social',
  alquiler:     'Alquiler',
  indumentaria: 'Indumentaria',
  otro:         'Otro',
}

const CATEGORIA_BADGE_CLASSES = {
  cuota_social: 'bg-blue-100 text-blue-800',
  alquiler:     'bg-purple-100 text-purple-800',
  indumentaria: 'bg-orange-100 text-orange-800',
  otro:         'bg-gray-100 text-gray-700',
}

const formatoMoneda = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

// ─── Modal principal (crear/editar) ────────────────────────────────────────────

function ProductoFormModal({ producto, onClose, onSave, cuotaSocialExists }) {
  const isEditMode = !!producto

  // En modo creación, si ya existe una cuota social, no mostramos la opción para crear otra.
  // En modo edición, el select está deshabilitado de todas formas.
  const categoriasDisponibles = useMemo(() => {
    if (!isEditMode && cuotaSocialExists) {
      return CATEGORIAS.filter(c => c !== 'cuota_social')
    }
    return CATEGORIAS
  }, [isEditMode, cuotaSocialExists])

  const categoriaInicial = producto?.categoria ?? categoriasDisponibles[0] ?? ''

  const [formData, setFormData] = useState({
    nombre:        producto?.nombre        ?? '',
    categoria:     producto?.categoria     ?? CATEGORIAS[0],
    descripcion:   producto?.descripcion   ?? '',
    precio_actual: producto?.precio_actual != null ? String(producto.precio_actual) : '',
    stock:         producto?.stock         != null ? String(producto.stock) : '',
    imagen_url:    producto?.imagen_url    ?? '',
    es_activo:     producto?.es_activo     ?? true,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [apiError,     setApiError]     = useState(null)
  const [formErrors,   setFormErrors]   = useState({})

  const validate = () => {
    const errs = {}
    if (!formData.nombre.trim()) errs.nombre = 'El nombre es obligatorio.'

    const precio = Number(formData.precio_actual)
    if (formData.precio_actual === '' || !Number.isFinite(precio) || precio <= 0) {
      errs.precio_actual = 'Ingresá un precio válido, mayor a $0.'
    }

    if (formData.stock !== '') {
      const stockNum = Number(formData.stock)
      if (!Number.isInteger(stockNum) || stockNum < 0) {
        errs.stock = 'El stock debe ser un entero ≥ 0 (o vacío para ilimitado).'
      }
    }

    setFormErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return

    setIsSubmitting(true)
    setApiError(null)

    // Payload base común a create/update
    const payloadComun = {
      nombre:        formData.nombre.trim(),
      descripcion:   formData.descripcion.trim() || null,
      precio_actual: Number(formData.precio_actual),
      stock:         formData.stock === '' ? null : Number(formData.stock),
      imagen_url:    formData.imagen_url.trim() || null,
      es_activo:     formData.es_activo,
    }

    // La categoría solo se manda en creación — en edición el backend ni
    // siquiera tiene el campo en ProductoServicioUpdate, así que no lo envío.
    const payload = isEditMode
      ? payloadComun
      : { ...payloadComun, categoria: formData.categoria }

    try {
      await onSave(payload, producto?.id_producto ?? null)
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
            <h2 className="text-xl font-bold text-gray-800">
              {isEditMode ? 'Editar Producto' : 'Nuevo Producto o Servicio'}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {isEditMode ? `Editando "${producto.nombre}"` : 'Completá los datos del ítem del catálogo.'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Cuerpo scrolleable */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="p-6 space-y-4 overflow-y-auto flex-1">

            {apiError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                <span>{apiError}</span>
              </div>
            )}

            <div>
              <input
                name="nombre" value={formData.nombre}
                onChange={e => setFormData({ ...formData, nombre: e.target.value })}
                placeholder="Nombre" required
                className={`form-input ${formErrors.nombre ? 'border-red-500' : ''}`}
              />
              {formErrors.nombre && <p className="text-red-600 text-xs mt-1">{formErrors.nombre}</p>}
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Categoría
              </label>
              <select
                value={formData.categoria}
                onChange={e => setFormData({ ...formData, categoria: e.target.value })}
                disabled={isEditMode}
                className={`form-input mt-1.5 ${isEditMode ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
              >
                {categoriasDisponibles.map(cat => (
                  <option key={cat} value={cat}>{CATEGORIA_LABELS[cat]}</option>
                ))}
              </select>
              {isEditMode && (
                <p className="text-xs text-gray-400 mt-1">
                  La categoría no se puede modificar una vez creado el producto.
                </p>
              )}
            </div>

            <div>
              <textarea
                name="descripcion" value={formData.descripcion}
                onChange={e => setFormData({ ...formData, descripcion: e.target.value })}
                placeholder="Descripción (opcional)"
                rows={3}
                className="form-input resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Precio
                </label>
                <input
                  type="number" min="0.01" step="0.01"
                  value={formData.precio_actual}
                  onChange={e => setFormData({ ...formData, precio_actual: e.target.value })}
                  placeholder="0.00" required
                  className={`form-input mt-1.5 ${formErrors.precio_actual ? 'border-red-500' : ''}`}
                />
                {formErrors.precio_actual && <p className="text-red-600 text-xs mt-1">{formErrors.precio_actual}</p>}
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Stock
                </label>
                <input
                  type="number" min="0" step="1"
                  value={formData.stock}
                  onChange={e => setFormData({ ...formData, stock: e.target.value })}
                  placeholder="Ilimitado"
                  className={`form-input mt-1.5 ${formErrors.stock ? 'border-red-500' : ''}`}
                />
                {formErrors.stock && <p className="text-red-600 text-xs mt-1">{formErrors.stock}</p>}
                <p className="text-xs text-gray-400 mt-1">Vacío = ilimitado (servicios).</p>
              </div>
            </div>

            <div>
              <input
                type="url"
                value={formData.imagen_url}
                onChange={e => setFormData({ ...formData, imagen_url: e.target.value })}
                placeholder="URL de la imagen (opcional)"
                className="form-input"
              />
            </div>

            {/* Toggle de estado activo */}
            <label className="flex items-center justify-between p-3 rounded-xl border-2 border-gray-200 bg-white cursor-pointer select-none">
              <span className="text-sm font-semibold text-gray-700">Producto activo</span>
              <button
                type="button"
                role="switch"
                aria-checked={formData.es_activo}
                onClick={() => setFormData({ ...formData, es_activo: !formData.es_activo })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
                  formData.es_activo ? 'bg-emerald-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    formData.es_activo ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>
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
              type="submit" disabled={isSubmitting}
              className="px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700 font-semibold disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {isSubmitting && <Loader2 size={14} className="animate-spin" />}
              {isSubmitting ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function AdminProductos() {
  const { token } = useAuth()

  const [productos,       setProductos]       = useState([])
  const [loading,         setLoading]         = useState(true)
  const [error,           setError]           = useState(null)
  const [busqueda,        setBusqueda]        = useState('')
  const [isModalOpen,     setIsModalOpen]     = useState(false)
  const [editingProducto, setEditingProducto] = useState(null)

  // Estados para la configuración del día de vencimiento
  const [diaVencimiento, setDiaVencimiento] = useState(10)
  const [isEditingDia,   setIsEditingDia]   = useState(false)
  const [nuevoDia,       setNuevoDia]       = useState(10)
  const [isLoadingDia,   setIsLoadingDia]   = useState(true)
  const [errorDia,       setErrorDia]       = useState(null)
  const [successDia,     setSuccessDia]     = useState(null)

  const fetchProductos = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/admin/productos`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`Error ${res.status}: No se pudo cargar el catálogo.`)
      setProductos(await res.json())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { fetchProductos() }, [fetchProductos])

  // ── Fetch de configuración global (día de vencimiento) ─────────────────────
  const fetchDiaVencimiento = useCallback(async () => {
    if (!token) return
    setIsLoadingDia(true)
    setErrorDia(null)
    try {
      const res = await fetch(`${API}/admin/productos/configuracion/dia-vencimiento`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('No se pudo cargar la configuración.')
      const data = await res.json()
      setDiaVencimiento(data.dia_vencimiento_cuota)
      setNuevoDia(data.dia_vencimiento_cuota)
    } catch (err) {
      setErrorDia(err.message)
    } finally {
      setIsLoadingDia(false)
    }
  }, [token])

  useEffect(() => { fetchDiaVencimiento() }, [fetchDiaVencimiento])

  // ── Guardar día de vencimiento (PATCH) ──────────────────────────────────────
  const handleSaveDiaVencimiento = async () => {
    if (nuevoDia < 1 || nuevoDia > 28) {
      setErrorDia('El día debe estar entre 1 y 28.')
      return
    }
    setIsLoadingDia(true)
    setErrorDia(null)
    setSuccessDia(null)

    try {
      const res = await fetch(`${API}/admin/productos/configuracion/dia-vencimiento`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ dia_vencimiento_cuota: Number(nuevoDia) }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? 'Error al actualizar.')
      }

      const data = await res.json()
      setDiaVencimiento(data.dia_vencimiento_cuota)
      setIsEditingDia(false)
      setSuccessDia('Día de vencimiento actualizado.')
    } catch (err) {
      setErrorDia(err.message)
    } finally {
      setIsLoadingDia(false)
    }
  }

  // ── Guardar (POST o PATCH) — fail-fast ──────────────────────────────────────
  const handleSaveProducto = async (data, id) => {
    const isEdit = !!id
    const url    = isEdit ? `${API}/admin/productos/${id}` : `${API}/admin/productos`
    const method = isEdit ? 'PATCH' : 'POST'

    const res = await fetch(url, {
      method,
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail ?? `Error al ${isEdit ? 'actualizar' : 'crear'} el producto.`)
    }

    fetchProductos()
  }

  const openModalForCreate = () => { setEditingProducto(null); setIsModalOpen(true) }
  const openModalForEdit   = (producto) => { setEditingProducto(producto); setIsModalOpen(true) }
  const closeModal         = () => setIsModalOpen(false)

  // Limpiar mensaje de éxito después de unos segundos
  useEffect(() => {
    if (successDia) {
      const timer = setTimeout(() => setSuccessDia(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [successDia])

  // ── Filtro local por nombre o categoría ─────────────────────────────────────
  const productosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return productos
    return productos.filter(p =>
      p.nombre.toLowerCase().includes(q) ||
      p.categoria.toLowerCase().includes(q) ||
      (CATEGORIA_LABELS[p.categoria] ?? '').toLowerCase().includes(q)
    )
  }, [productos, busqueda])
  
  // TAREA 1: Separar la cuota social del resto de productos
  const cuotaSocial = useMemo(() =>
    productos.find(p => p.categoria === 'cuota_social'),
  [productos])

  const otrosProductos = useMemo(() =>
    productosFiltrados.filter(p => p.categoria !== 'cuota_social'),
  [productosFiltrados])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">

      {isModalOpen && (
        <ProductoFormModal
          cuotaSocialExists={!!cuotaSocial}
          producto={editingProducto}
          onClose={closeModal}
          onSave={handleSaveProducto}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Package size={24} className="text-gray-500" />
            Catálogo de Productos y Servicios
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Cuotas, alquileres, indumentaria y demás ítems disponibles para la venta.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 mt-1">
          <button
            onClick={openModalForCreate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors shadow-sm"
          >
            <PlusCircle size={16} />
            Nuevo Producto
          </button>
          <button
            onClick={fetchProductos} disabled={loading}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 transition-colors"
            title="Actualizar lista"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Error de carga */}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle size={18} className="flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={fetchProductos} className="underline underline-offset-2 font-medium hover:text-red-900">
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
          placeholder="Buscar por nombre o categoría…"
          className="form-input pl-9"
        />
      </div>

      {/* Pedestales de Configuración Global */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: Valor de la Cuota Social */}
        {loading ? (
          <div className="bg-gray-100 rounded-2xl p-6 h-40 animate-pulse" />
        ) : cuotaSocial ? (
          <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-6 shadow-sm flex items-center justify-between gap-6">
            <div className="flex items-center gap-5">
              <div className="p-3 rounded-full bg-blue-100 text-blue-600">
                <Wallet size={28} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-blue-900">Cuota Social Base</h2>
                <p className="text-3xl font-extrabold text-gray-900 tracking-tight mt-1">
                  {formatoMoneda.format(cuotaSocial.precio_actual)}
                </p>
              </div>
            </div>
            <button
              onClick={() => openModalForEdit(cuotaSocial)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-gray-300 text-gray-700 font-semibold hover:bg-gray-100 hover:border-gray-400 transition-colors shadow-sm"
            >
              <Edit size={14} />
              Actualizar Valor
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
            <AlertCircle size={18} className="flex-shrink-0" />
            <span className="flex-1 font-medium">
              No hay una cuota social configurada. Créala desde el botón '+ Nuevo Producto'.
            </span>
          </div>
        )}

        {/* Card 2: Día de Vencimiento */}
        {isLoadingDia ? (
          <div className="bg-gray-100 rounded-2xl p-6 h-40 animate-pulse" />
        ) : (
          <div className="bg-indigo-50 border-2 border-indigo-200 rounded-2xl p-6 shadow-sm">
            {isEditingDia ? (
              <Fragment>
                <h2 className="text-lg font-bold text-indigo-900">Editar Día de Vencimiento</h2>
                <div className="mt-2 flex items-start gap-3">
                  <div className="flex-1">
                    <input
                      type="number"
                      min="1" max="28"
                      value={nuevoDia}
                      onChange={e => setNuevoDia(e.target.value)}
                      className={`form-input ${errorDia ? 'border-red-500' : ''}`}
                    />
                    {errorDia && <p className="text-red-600 text-xs mt-1">{errorDia}</p>}
                  </div>
                  <div className="flex-shrink-0 flex items-center gap-2">
                    <button
                      onClick={handleSaveDiaVencimiento}
                      disabled={isLoadingDia}
                      className="p-2.5 rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                      title="Guardar"
                    >
                      {isLoadingDia ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    </button>
                    <button
                      onClick={() => { setIsEditingDia(false); setErrorDia(null); }}
                      className="p-2.5 rounded-lg text-gray-600 bg-gray-200 hover:bg-gray-300 transition-colors"
                      title="Cancelar"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              </Fragment>
            ) : (
              <Fragment>
                <div className="flex items-center justify-between gap-6">
                  <div className="flex items-center gap-5">
                    <div className="p-3 rounded-full bg-indigo-100 text-indigo-600">
                      <CalendarDays size={28} />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-indigo-900">Día de Vencimiento</h2>
                      <p className="text-3xl font-extrabold text-gray-900 tracking-tight mt-1">
                        Día {diaVencimiento}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setIsEditingDia(true); setNuevoDia(diaVencimiento); setErrorDia(null); setSuccessDia(null); }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-gray-300 text-gray-700 font-semibold hover:bg-gray-100 hover:border-gray-400 transition-colors shadow-sm"
                  >
                    <Edit size={14} />
                    Editar
                  </button>
                </div>
                {successDia && (
                  <p className="text-sm text-green-700 font-medium mt-3 text-center">
                    {successDia}
                  </p>
                )}
                {errorDia && !isEditingDia && (
                  <p className="text-sm text-red-700 font-medium mt-3 text-center">
                    {errorDia}
                  </p>
                )}
              </Fragment>
            )}
          </div>
        )}
      </div>

      <h2 className="text-lg font-bold text-gray-800 pt-2 border-t border-gray-200">
        Otros Productos y Servicios
      </h2>

      {/* Tabla */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              {['Nombre', 'Categoría', 'Precio', 'Stock', 'Estado', 'Acciones'].map(h => (
                <th key={h} className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading && [...Array(5)].map((_, i) => (
              <tr key={i} className="animate-pulse">
                <td colSpan="6" className="px-6 py-4">
                  <div className="h-4 bg-gray-200 rounded-md" />
                </td>
              </tr>
            ))}

            {!loading && otrosProductos.map(p => (
              <tr key={p.id_producto} className="hover:bg-gray-50/70 transition-colors">
                <td className="px-6 py-4">
                  <div className="font-medium text-gray-900">{p.nombre}</div>
                  {p.descripcion && (
                    <div className="text-xs text-gray-400 mt-0.5 max-w-xs truncate" title={p.descripcion}>
                      {p.descripcion}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${CATEGORIA_BADGE_CLASSES[p.categoria] ?? 'bg-gray-100 text-gray-700'}`}>
                    {CATEGORIA_LABELS[p.categoria] ?? p.categoria}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                  {formatoMoneda.format(p.precio_actual)}
                </td>
                <td className="px-6 py-4 text-sm">
                  {p.stock == null ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                      <InfinityIcon size={12} /> Ilimitado
                    </span>
                  ) : (
                    <span className="text-gray-700">{p.stock}</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  {p.es_activo ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Activo
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                      Inactivo
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-right whitespace-nowrap">
                  <button
                    onClick={() => openModalForEdit(p)}
                    className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                    title="Editar Producto"
                  >
                    <Edit size={16} />
                  </button>
                </td>
              </tr>
            ))}

            {!loading && otrosProductos.length === 0 && (
              <tr>
                <td colSpan="6" className="text-center py-12 text-gray-500">
                  {busqueda
                    ? 'No se encontraron otros productos con ese criterio.'
                    : 'No hay otros productos o servicios cargados todavía.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}