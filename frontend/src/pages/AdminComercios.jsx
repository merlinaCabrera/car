// frontend/src/pages/AdminComercios.jsx
/**
 * Panel de gestión de Comercios Asociados (beneficios para socios).
 *
 * Sigue el mismo patrón que AdminSocios.jsx:
 *   - Tabla limpia con estados de carga (skeleton) y error con reintento.
 *   - Modal sobrepuesto para crear/editar, con validación de formulario.
 *   - handleSaveComercio hace fail-fast: si el POST/PATCH falla, se corta
 *     ahí y el error se muestra en el banner rojo del modal.
 *   - Baja lógica por defecto (PATCH backend usa DELETE → es_activo=false)
 *     con botón de reactivar, igual que en AdminSocios.
 *
 * Backend: /admin/comercios (GET, GET/{id}, POST, PATCH/{id}, DELETE/{id})
 *          — ver backend/routers/admin_comercios.py
 *
 * El selector de "cuenta de acceso" (id_usuario_acceso) reutiliza el mismo
 * catálogo de usuarios que consume AdminSocios (GET /admin/usuarios/),
 * filtrado del lado del cliente para destacar las cuentas con rol 'invitado'
 * arriba de la lista (sin ocultar el resto, por si se quiere vincular un
 * socio existente).
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  PlusCircle,
  Edit,
  Trash2,
  RefreshCw,
  AlertCircle,
  Store,
  UserCheck,
  UserX,
  Undo2,
  Loader2,
  Link2,
  Link2Off,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

// ─── Modal principal ──────────────────────────────────────────────────────────

function ComercioFormModal({ comercio, onClose, onSave, usuarios }) {
  const [formData, setFormData] = useState({
    nombre_fantasia:     comercio?.nombre_fantasia     ?? '',
    rubro:               comercio?.rubro               ?? '',
    beneficio_ofrecido:  comercio?.beneficio_ofrecido  ?? '',
    es_activo:           comercio?.es_activo           ?? true,
    id_usuario_acceso:   comercio?.id_usuario_acceso   != null
      ? String(comercio.id_usuario_acceso)
      : '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [apiError,     setApiError]     = useState(null)
  const [formErrors,   setFormErrors]   = useState({})

  const isEditMode = !!comercio

  // Cuentas con rol 'invitado' primero, después el resto (por si se quiere
  // vincular directamente a un socio existente).
  const usuariosOrdenados = useMemo(() => {
    const esInvitado = (u) => (u.roles_asignados ?? []).some(r => r.rol?.nombre === 'invitado')
    return [...usuarios].sort((a, b) => Number(esInvitado(b)) - Number(esInvitado(a)))
  }, [usuarios])

  const validate = () => {
    const errs = {}
    if (!formData.nombre_fantasia.trim())    errs.nombre_fantasia    = 'El nombre de fantasía es obligatorio.'
    if (!formData.beneficio_ofrecido.trim()) errs.beneficio_ofrecido = 'Describí el beneficio ofrecido.'
    setFormErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return

    setIsSubmitting(true)
    setApiError(null)

    const payload = {
      nombre_fantasia:    formData.nombre_fantasia.trim(),
      rubro:              formData.rubro.trim() || null,
      beneficio_ofrecido: formData.beneficio_ofrecido.trim(),
      es_activo:          formData.es_activo,
      id_usuario_acceso:  formData.id_usuario_acceso ? Number(formData.id_usuario_acceso) : null,
    }

    try {
      await onSave(payload, comercio?.id_comercio ?? null)
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

        {/* Header fijo */}
        <div className="p-6 border-b flex-shrink-0">
          <h2 className="text-xl font-bold text-gray-800">
            {isEditMode ? 'Editar Comercio' : 'Nuevo Comercio Asociado'}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {isEditMode
              ? `Editando a ${comercio.nombre_fantasia}`
              : 'Completá los datos del comercio y su beneficio para los socios.'
            }
          </p>
        </div>

        {/* Cuerpo scrolleable */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="p-6 space-y-4 overflow-y-auto flex-1">

            {/* Banner de error de API */}
            {apiError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                <span>{apiError}</span>
              </div>
            )}

            <div>
              <input
                name="nombre_fantasia" value={formData.nombre_fantasia}
                onChange={e => setFormData({ ...formData, nombre_fantasia: e.target.value })}
                placeholder="Nombre de Fantasía" required
                className={`form-input ${formErrors.nombre_fantasia ? 'border-red-500' : ''}`}
              />
              {formErrors.nombre_fantasia && <p className="text-red-600 text-xs mt-1">{formErrors.nombre_fantasia}</p>}
            </div>

            <div>
              <input
                name="rubro" value={formData.rubro}
                onChange={e => setFormData({ ...formData, rubro: e.target.value })}
                placeholder="Rubro (ej: Indumentaria deportiva)"
                className="form-input"
              />
            </div>

            <div>
              <textarea
                name="beneficio_ofrecido" value={formData.beneficio_ofrecido}
                onChange={e => setFormData({ ...formData, beneficio_ofrecido: e.target.value })}
                placeholder="Beneficio ofrecido (ej: 15% de descuento presentando el carnet)"
                required rows={3}
                className={`form-input resize-none ${formErrors.beneficio_ofrecido ? 'border-red-500' : ''}`}
              />
              {formErrors.beneficio_ofrecido && <p className="text-red-600 text-xs mt-1">{formErrors.beneficio_ofrecido}</p>}
            </div>

            {/* ── Vínculo con cuenta de acceso (escáner) ─────────────── */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                <Link2 size={13} />
                Cuenta de acceso (escáner)
              </label>
              <select
                value={formData.id_usuario_acceso}
                onChange={e => setFormData({ ...formData, id_usuario_acceso: e.target.value })}
                className="form-input"
              >
                <option value="">— Sin vincular —</option>
                {usuariosOrdenados.map(u => {
                  const roles = (u.roles_asignados ?? []).map(r => r.rol?.nombre).filter(Boolean)
                  const esInvitado = roles.includes('invitado')
                  return (
                    <option key={u.id_usuario} value={u.id_usuario}>
                      {u.apellido}, {u.nombre} — DNI {u.dni}{esInvitado ? ' (invitado)' : ''}
                    </option>
                  )
                })}
              </select>
              <p className="text-xs text-gray-400">
                La cuenta vinculada podrá usar el escáner de control de acceso para validar beneficios.
              </p>
            </div>

            {/* ── Estado activo/inactivo ──────────────────────────────── */}
            <label className="flex items-center gap-3 p-3 rounded-xl border-2 border-gray-200 bg-white cursor-pointer select-none">
              <input
                type="checkbox"
                checked={formData.es_activo}
                onChange={e => setFormData({ ...formData, es_activo: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-semibold text-gray-700">Comercio activo</span>
            </label>
          </div>

          {/* Footer fijo */}
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

export default function AdminComercios() {
  const { token } = useAuth()

  const [comercios,        setComercios]        = useState([])
  const [loading,          setLoading]           = useState(true)
  const [error,            setError]             = useState(null)
  const [isModalOpen,      setIsModalOpen]       = useState(false)
  const [editingComercio,  setEditingComercio]   = useState(null)

  // ── Catálogo de usuarios — fetch único al montar (para el selector) ────────
  const [usuarios, setUsuarios] = useState([])

  useEffect(() => {
    if (!token) return
    fetch(`${API}/admin/usuarios/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : [])
      .then(data => setUsuarios(data))
      .catch(() => setUsuarios([]))
  }, [token])

  // ── Fetch de comercios ──────────────────────────────────────────────────────
  const fetchComercios = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/admin/comercios`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`Error ${res.status}: No se pudo cargar la lista de comercios.`)
      setComercios(await res.json())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { fetchComercios() }, [fetchComercios])

  // ── Guardar comercio (POST o PATCH) — fail-fast ────────────────────────────
  const handleSaveComercio = async (data, id) => {
    const isEdit = !!id
    const url    = isEdit ? `${API}/admin/comercios/${id}` : `${API}/admin/comercios`
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
      throw new Error(err.detail ?? `Error al ${isEdit ? 'actualizar' : 'crear'} el comercio.`)
    }

    fetchComercios()
  }

  // ── Handlers de tabla ───────────────────────────────────────────────────────
  const handleDeleteComercio = async (comercio) => {
    if (!window.confirm(
      `¿Dar de baja a "${comercio.nombre_fantasia}"? Esta acción es lógica y no borra el historial.`
    )) return

    try {
      const res = await fetch(`${API}/admin/comercios/${comercio.id_comercio}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? 'Error al dar de baja el comercio.')
      }
      fetchComercios()
    } catch (err) {
      window.alert(`Error: ${err.message}`)
    }
  }

  const handleReactivarComercio = async (comercio) => {
    if (!window.confirm(`¿Reactivar "${comercio.nombre_fantasia}"?`)) return

    try {
      const res = await fetch(`${API}/admin/comercios/${comercio.id_comercio}`, {
        method: 'PATCH',
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ es_activo: true }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? 'Error al reactivar el comercio.')
      }
      fetchComercios()
    } catch (err) {
      window.alert(`Error: ${err.message}`)
    }
  }

  const openModalForCreate = () => { setEditingComercio(null); setIsModalOpen(true) }
  const openModalForEdit   = (comercio) => { setEditingComercio(comercio); setIsModalOpen(true) }
  const closeModal         = () => setIsModalOpen(false)

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5 sm:space-y-6">

      {/* Modal */}
      {isModalOpen && (
        <ComercioFormModal
          comercio={editingComercio}
          onClose={closeModal}
          onSave={handleSaveComercio}
          usuarios={usuarios}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2 sm:gap-3">
            <Store size={22} className="text-gray-500 flex-shrink-0" />
            Comercios Adheridos
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Alta, edición y baja de los comercios que ofrecen beneficios a los socios.
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 mt-1">
          <button
            onClick={openModalForCreate}
            className="inline-flex items-center gap-2 px-3.5 py-2 sm:px-4 rounded-xl bg-blue-600 text-white text-sm sm:text-base font-semibold hover:bg-blue-700 transition-colors shadow-sm whitespace-nowrap"
          >
            <PlusCircle size={16} />
            <span className="hidden sm:inline">Nuevo Comercio</span>
            <span className="sm:hidden">Nuevo</span>
          </button>
          <button
            onClick={fetchComercios} disabled={loading}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 transition-colors flex-shrink-0"
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
          <button onClick={fetchComercios} className="underline underline-offset-2 font-medium hover:text-red-900">
            Reintentar
          </button>
        </div>
      )}

      {/* Tarjetas — mobile (skeleton de carga) */}
      {loading && (
        <div className="md:hidden bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-50">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="p-4 animate-pulse space-y-2">
              <div className="h-4 bg-gray-200 rounded-md w-2/3" />
              <div className="h-3 bg-gray-100 rounded-md w-1/2" />
            </div>
          ))}
        </div>
      )}

      {/* Tarjetas — mobile */}
      {!loading && (
        <div className="md:hidden bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-50">
          {comercios.map(comercio => (
            <div key={comercio.id_comercio} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-gray-900 truncate">{comercio.nombre_fantasia}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{comercio.rubro ?? '—'}</div>
                </div>
                {comercio.es_activo ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 flex-shrink-0">
                    <UserCheck size={12} /> Activo
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 flex-shrink-0">
                    <UserX size={12} /> Inactivo
                  </span>
                )}
              </div>

              <p className="text-sm text-gray-600">{comercio.beneficio_ofrecido}</p>

              <div className="text-sm">
                {comercio.usuario_acceso ? (
                  <span className="inline-flex items-center gap-1.5 text-gray-700">
                    <Link2 size={13} className="text-blue-500 flex-shrink-0" />
                    {comercio.usuario_acceso.apellido}, {comercio.usuario_acceso.nombre}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-gray-400">
                    <Link2Off size={13} />
                    Sin vincular
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1 pt-2 border-t border-gray-50 -mx-1">
                <button
                  onClick={() => openModalForEdit(comercio)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-100 rounded-lg transition-colors text-xs font-medium"
                  title="Editar Comercio"
                >
                  <Edit size={16} /> Editar
                </button>
                {comercio.es_activo ? (
                  <button
                    onClick={() => handleDeleteComercio(comercio)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 p-2 text-gray-500 hover:text-red-600 hover:bg-red-100 rounded-lg transition-colors text-xs font-medium"
                    title="Dar de baja"
                  >
                    <Trash2 size={16} /> Baja
                  </button>
                ) : (
                  <button
                    onClick={() => handleReactivarComercio(comercio)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 p-2 text-gray-500 hover:text-green-600 hover:bg-green-100 rounded-lg transition-colors text-xs font-medium"
                    title="Reactivar Comercio"
                  >
                    <Undo2 size={16} /> Reactivar
                  </button>
                )}
              </div>
            </div>
          ))}

          {comercios.length === 0 && (
            <div className="text-center py-12 text-gray-500 text-sm px-4">
              No hay comercios asociados cargados todavía.
            </div>
          )}
        </div>
      )}

      {/* Tabla — desktop */}
      <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              {['Comercio', 'Rubro', 'Beneficio', 'Acceso', 'Estado', 'Acciones'].map(h => (
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

            {!loading && comercios.map(comercio => (
              <tr key={comercio.id_comercio} className="hover:bg-gray-50/70 transition-colors">
                <td className="px-6 py-4">
                  <div className="font-medium text-gray-900">{comercio.nombre_fantasia}</div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">{comercio.rubro ?? '—'}</td>
                <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate" title={comercio.beneficio_ofrecido}>
                  {comercio.beneficio_ofrecido}
                </td>
                <td className="px-6 py-4 text-sm">
                  {comercio.usuario_acceso ? (
                    <span className="inline-flex items-center gap-1.5 text-gray-700">
                      <Link2 size={13} className="text-blue-500" />
                      {comercio.usuario_acceso.apellido}, {comercio.usuario_acceso.nombre}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-gray-400">
                      <Link2Off size={13} />
                      Sin vincular
                    </span>
                  )}
                </td>
                <td className="px-6 py-4">
                  {comercio.es_activo ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      <UserCheck size={12} /> Activo
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                      <UserX size={12} /> Inactivo
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-right space-x-1 whitespace-nowrap">
                  <button
                    onClick={() => openModalForEdit(comercio)}
                    className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                    title="Editar Comercio"
                  >
                    <Edit size={16} />
                  </button>
                  {comercio.es_activo ? (
                    <button
                      onClick={() => handleDeleteComercio(comercio)}
                      className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                      title="Dar de baja"
                    >
                      <Trash2 size={16} />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleReactivarComercio(comercio)}
                      className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-100 rounded-lg transition-colors"
                      title="Reactivar Comercio"
                    >
                      <Undo2 size={16} />
                    </button>
                  )}
                </td>
              </tr>
            ))}

            {!loading && comercios.length === 0 && (
              <tr>
                <td colSpan="6" className="text-center py-12 text-gray-500">
                  No hay comercios asociados cargados todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}