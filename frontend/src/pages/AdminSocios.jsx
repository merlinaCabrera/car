// frontend/src/pages/AdminSocios.jsx
/**
 * Panel de gestión de socios para el administrador.
 *
 * ── Cambios respecto a la versión anterior ────────────────────────────────────
 * 1. AdminSocios fetcha el catálogo de roles una sola vez al montar
 *    (GET /admin/usuarios/roles) y lo pasa al modal como prop.
 *
 * 2. SocioFormModal recibe `catalogoRoles` y `token`.
 *    En modo edición, fetchea los roles actuales del usuario desde
 *    GET /admin/usuarios/{id_usuario} (endpoint que necesitás agregar al backend —
 *    ver nota al final del archivo).
 *
 * 3. La sección "Roles del Usuario" con checkboxes aparece solo en modo edición.
 *    Estado `selectedRoles`: array de id_rol (integers).
 *
 * 4. handleSaveSocio extendido: hace PATCH de datos + PUT de roles en secuencia.
 *    Ambos errores se propagan al catch del modal y se muestran en el banner rojo.
 *    Si el PATCH falla, el PUT de roles NO se ejecuta (fail-fast).
 *    Si el PATCH tiene éxito pero el PUT falla, se muestra el mensaje diferenciado.
 */

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  PlusCircle,
  Edit,
  Trash2,
  RefreshCw,
  AlertCircle,
  Users,
  UserX,
  UserCheck,
  Eye,
  EyeOff,
  Undo2,
  ShieldCheck,
  Loader2,
  Search,
  CheckCircle,
  UserPlus,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

// ─── Sub-componente: Checkbox elegante para un rol ───────────────────────────

function RolCheckbox({ rol, checked, onChange, disabled }) {
  return (
    <label
      className={`
        flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer
        transition-all duration-150 select-none
        ${checked
          ? 'border-indigo-400 bg-indigo-50'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      {/* Checkbox visual custom */}
      <div className={`
        mt-0.5 flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center
        transition-colors
        ${checked ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-gray-300'}
      `}>
        {checked && (
          <svg viewBox="0 0 12 10" fill="none" className="w-3 h-3">
            <path d="M1 5l3.5 3.5L11 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>

      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
      />

      {/* Texto del rol */}
      <div className="min-w-0">
        <p className={`text-sm font-semibold capitalize ${checked ? 'text-indigo-900' : 'text-gray-800'}`}>
          {rol.nombre.replace(/_/g, ' ')}
        </p>
        {rol.descripcion && (
          <p className="text-xs text-gray-500 mt-0.5 leading-snug">
            {rol.descripcion}
          </p>
        )}
      </div>
    </label>
  )
}

// ─── Sub-componente: Sección de roles en el modal ────────────────────────────

function SeccionRoles({ catalogoRoles, selectedRoles, onToggle, loadingRoles, errorRoles }) {
  return (
    <div className="space-y-3">
      {/* Divider con título */}
      <div className="flex items-center gap-3 pt-2">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="flex items-center gap-1.5 text-xs font-bold text-gray-500 uppercase tracking-widest whitespace-nowrap">
          <ShieldCheck size={13} />
          Roles del Usuario
        </span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>

      {/* Estado: cargando roles actuales */}
      {loadingRoles && (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
          <Loader2 size={15} className="animate-spin text-indigo-500" />
          Cargando roles actuales…
        </div>
      )}

      {/* Error al cargar roles actuales (no bloquea el formulario) */}
      {errorRoles && !loadingRoles && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          ⚠️ No se pudieron cargar los roles actuales. Los checkboxes inician en blanco.
        </p>
      )}

      {/* Grid de checkboxes */}
      {!loadingRoles && (
        <div className="grid grid-cols-1 gap-2">
          {catalogoRoles.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-3">
              No hay roles disponibles en el catálogo.
            </p>
          )}
          {catalogoRoles.map(rol => (
            <RolCheckbox
              key={rol.id_rol}
              rol={rol}
              checked={selectedRoles.includes(rol.id_rol)}
              onChange={() => onToggle(rol.id_rol)}
            />
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400">
        Los cambios de roles se guardan al presionar <strong>Guardar</strong>.
      </p>
    </div>
  )
}

// ─── Modal principal ──────────────────────────────────────────────────────────

function SocioFormModal({ socio, onClose, onSave, catalogoRoles, token }) {
  const [formData, setFormData] = useState({
    dni:       socio?.dni       ?? '',
    nombre:    socio?.nombre    ?? '',
    apellido:  socio?.apellido  ?? '',
    email:     socio?.email     ?? '',
    telefono:  socio?.telefono  ?? '',
    direccion: socio?.direccion ?? '',
    password:  '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [apiError,     setApiError]     = useState(null)
  const [formErrors,   setFormErrors]   = useState({})
  const [showPassword, setShowPassword] = useState(false)

  // ── Estado de roles ────────────────────────────────────────────────────────
  const [selectedRoles, setSelectedRoles] = useState([])      // array de id_rol (int)
  const [loadingRoles,  setLoadingRoles]  = useState(false)
  const [errorRoles,    setErrorRoles]    = useState(false)

  const isEditMode = !!socio

  // ── Fetch de roles actuales del usuario al abrir el modal en modo edición ──
  //
  // Necesita GET /admin/usuarios/{id_usuario} en el backend que retorne
  // UsuarioResponse (con roles_asignados[].id_rol).
  //
  // ⚠️  Si ese endpoint aún no existe, los checkboxes inician desmarcados
  //     y se muestra una advertencia no bloqueante. Agregá al backend:
  //
  //     @router.get("/{id_usuario}", response_model=schemas.UsuarioResponse)
  //     def get_usuario(id_usuario: int, db=..., _=Depends(require_roles(*_ADMIN))):
  //         u = db.query(models.Usuario).options(joinedload(...)).filter(...).first()
  //         if not u: raise HTTPException(404)
  //         return u
  //
  useEffect(() => {
    if (!isEditMode || !socio?.id_usuario || !token) return

    const fetchRolesActuales = async () => {
      setLoadingRoles(true)
      setErrorRoles(false)
      try {
        const res = await fetch(`${API}/admin/usuarios/${socio.id_usuario}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) throw new Error()
        const data = await res.json()
        // UsuarioResponse.roles_asignados → [{id_rol, rol: {...}, valido_hasta, ...}]
        const ids = (data.roles_asignados ?? []).map(ur => ur.id_rol)
        setSelectedRoles(ids)
      } catch {
        setErrorRoles(true)
        setSelectedRoles([])
      } finally {
        setLoadingRoles(false)
      }
    }

    fetchRolesActuales()
  }, [socio?.id_usuario, token, isEditMode])

  // ── Toggle de un rol en el estado local ───────────────────────────────────
  const toggleRol = (id_rol) => {
    setSelectedRoles(prev =>
      prev.includes(id_rol)
        ? prev.filter(id => id !== id_rol)
        : [...prev, id_rol]
    )
  }

  // ── Validación de campos del formulario ───────────────────────────────────
  const validate = () => {
    const errs = {}
    if (!formData.nombre.trim())   errs.nombre   = 'El nombre es obligatorio.'
    if (!formData.apellido.trim()) errs.apellido  = 'El apellido es obligatorio.'
    if (!formData.email)           errs.email     = 'El email es obligatorio.'
    else if (!/\S+@\S+\.\S+/.test(formData.email)) errs.email = 'Formato de email inválido.'

    if (!isEditMode) {
      if (!formData.dni) errs.dni = 'El DNI es obligatorio.'
      else if (!/^\d{7,10}$/.test(formData.dni)) errs.dni = 'Entre 7 y 10 dígitos numéricos.'
      if (!formData.password)               errs.password = 'La contraseña es obligatoria.'
      else if (formData.password.length < 8) errs.password = 'Mínimo 8 caracteres.'
      else if (/^\d+$/.test(formData.password)) errs.password = 'No puede ser solo números.'
    }

    if (isEditMode && formData.password) {
      if (formData.password.length < 8)    errs.password = 'Mínimo 8 caracteres.'
      else if (/^\d+$/.test(formData.password)) errs.password = 'No puede ser solo números.'
    }

    setFormErrors(errs)
    return Object.keys(errs).length === 0
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return

    setIsSubmitting(true)
    setApiError(null)

    // En edición: omitir campos vacíos para no blanquearlos en la BD
    const payload = isEditMode
      ? Object.fromEntries(Object.entries(formData).filter(([, v]) => v !== ''))
      : { ...formData }

    if (isEditMode && !payload.password) delete payload.password

    try {
      // onSave recibe (data, id_usuario, selectedRoles|null)
      // En creación: selectedRoles = null → no se hace PUT de roles
      await onSave(payload, socio?.id_usuario ?? null, isEditMode ? selectedRoles : null)
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
            {isEditMode ? 'Editar Socio' : 'Nuevo Socio'}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {isEditMode
              ? `Editando a ${socio.nombre} ${socio.apellido}`
              : 'Completá los datos para crear un nuevo socio.'
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

            {/* ── Datos personales ──────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <input
                  name="apellido" value={formData.apellido}
                  onChange={e => setFormData({ ...formData, apellido: e.target.value })}
                  placeholder="Apellido" required
                  className={`form-input ${formErrors.apellido ? 'border-red-500' : ''}`}
                />
                {formErrors.apellido && <p className="text-red-600 text-xs mt-1">{formErrors.apellido}</p>}
              </div>
            </div>

            <div>
              <input
                name="dni" value={formData.dni}
                onChange={e => setFormData({ ...formData, dni: e.target.value })}
                placeholder="DNI (sin puntos)" required disabled={isEditMode}
                className={`form-input disabled:bg-gray-100 disabled:cursor-not-allowed ${formErrors.dni ? 'border-red-500' : ''}`}
              />
              {formErrors.dni && <p className="text-red-600 text-xs mt-1">{formErrors.dni}</p>}
            </div>

            <div>
              <input
                type="email" name="email" value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                placeholder="Email" required
                className={`form-input ${formErrors.email ? 'border-red-500' : ''}`}
              />
              {formErrors.email && <p className="text-red-600 text-xs mt-1">{formErrors.email}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                name="telefono" value={formData.telefono}
                onChange={e => setFormData({ ...formData, telefono: e.target.value })}
                placeholder="Teléfono" className="form-input"
              />
              <input
                name="direccion" value={formData.direccion}
                onChange={e => setFormData({ ...formData, direccion: e.target.value })}
                placeholder="Dirección" className="form-input"
              />
            </div>

            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password" value={formData.password}
                onChange={e => setFormData({ ...formData, password: e.target.value })}
                placeholder={isEditMode ? 'Nueva contraseña (opcional)' : 'Contraseña'}
                required={!isEditMode}
                className={`form-input pr-10 ${formErrors.password ? 'border-red-500' : ''}`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(p => !p)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
              {formErrors.password && <p className="text-red-600 text-xs mt-1">{formErrors.password}</p>}
            </div>

            {/* ── Sección de roles (solo en modo edición) ───────────── */}
            {isEditMode && (
              <SeccionRoles
                catalogoRoles={catalogoRoles}
                selectedRoles={selectedRoles}
                onToggle={toggleRol}
                loadingRoles={loadingRoles}
                errorRoles={errorRoles}
              />
            )}
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
              type="submit" disabled={isSubmitting || loadingRoles}
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

export default function AdminSocios() {
  const { token } = useAuth()

  const [socios,       setSocios]       = useState([])
  const [pendientes,   setPendientes]   = useState([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(null)
  const [isModalOpen,  setIsModalOpen]  = useState(false)
  const [editingSocio, setEditingSocio] = useState(null)
  const [searchTerm,   setSearchTerm]   = useState('')
  const [approvingId,  setApprovingId]  = useState(null)

  // ── Catálogo de roles — fetch único al montar ─────────────────────────────
  const [catalogoRoles, setCatalogoRoles] = useState([])

  useEffect(() => {
    if (!token) return
    fetch(`${API}/admin/usuarios/roles`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : [])
      .then(data => setCatalogoRoles(data))
      .catch(() => setCatalogoRoles([]))
  }, [token])

  // ── Fetch de datos (socios y pendientes) ──────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const [sociosRes, pendientesRes] = await Promise.all([
        fetch(`${API}/admin/usuarios/`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/admin/usuarios/pendientes`, { headers: { Authorization: `Bearer ${token}` } }),
      ])

      if (!sociosRes.ok) throw new Error(`Error ${sociosRes.status}: No se pudo cargar la lista de socios.`)
      if (!pendientesRes.ok) throw new Error(`Error ${pendientesRes.status}: No se pudo cargar la lista de pendientes.`)

      setSocios(await sociosRes.json())
      setPendientes(await pendientesRes.json())
    } catch (err) {
      setError(err.message)
      setSocios([])
      setPendientes([])
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Guardar socio: PATCH/POST de datos + PUT de roles (en edición) ─────────
  //
  // Firma extendida: handleSaveSocio(data, id_usuario, selectedRoles)
  //   - data:          payload de campos del formulario
  //   - id_usuario:    null en creación, int en edición
  //   - selectedRoles: null en creación, array de ids en edición
  //
  // Estrategia de errores (fail-fast):
  //   1. Si el PATCH/POST falla → lanza error, no ejecuta el PUT de roles.
  //   2. Si el PATCH tiene éxito y el PUT falla → lanza error diferenciado
  //      ("Datos guardados, pero error al actualizar roles").
  //   El modal captura el error y lo muestra en el banner rojo.
  //
  const handleSaveSocio = async (data, id, selectedRoles) => {
    const isEdit  = !!id
    const url     = isEdit ? `${API}/admin/usuarios/${id}` : `${API}/admin/usuarios/`
    const method  = isEdit ? 'PATCH' : 'POST'

    // ── 1. PATCH o POST de datos del usuario ──────────────────────────────
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
      throw new Error(err.detail ?? `Error al ${isEdit ? 'actualizar' : 'crear'} el socio.`)
    }

    // ── 2. PUT de roles (solo en edición, si selectedRoles fue enviado) ────
    if (isEdit && selectedRoles !== null) {
      const rolesRes = await fetch(`${API}/admin/usuarios/${id}/roles`, {
        method: 'PUT',
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids_roles: selectedRoles }),
      })

      if (!rolesRes.ok) {
        const err = await rolesRes.json().catch(() => ({}))
        // Los datos del usuario YA se guardaron. Aclaramos eso en el mensaje.
        throw new Error(
          `Datos personales guardados correctamente, pero error al actualizar los roles: ${err.detail ?? 'Error desconocido.'}`
        )
      }
    }

    // Refrescar la tabla con los datos actualizados
    fetchData()
  }

  // ── Handlers de tabla ──────────────────────────────────────────────────────
  const handleDeleteSocio = async (socio) => {
    if (!window.confirm(
      `¿Dar de baja a ${socio.nombre} ${socio.apellido}? Esta acción es lógica y no borra el historial.`
    )) return

    try {
      const res = await fetch(`${API}/admin/usuarios/${socio.id_usuario}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? 'Error al dar de baja al socio.')
      }
      fetchData()
    } catch (err) {
      window.alert(`Error: ${err.message}`)
    }
  }

  const handleReactivateSocio = async (socio) => {
    if (!window.confirm(`¿Reactivar a ${socio.nombre} ${socio.apellido}?`)) return

    try {
      const res = await fetch(`${API}/admin/usuarios/${socio.id_usuario}/reactivar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? 'Error al reactivar al socio.')
      }
      fetchData()
    } catch (err) {
      window.alert(`Error: ${err.message}`)
    }
  }

  const handleApproveSocio = async (id_usuario) => {
    if (!window.confirm('¿Aprobar a este usuario y asignarle el rol de "socio"?')) return

    setApprovingId(id_usuario)
    try {
      const res = await fetch(`${API}/admin/usuarios/${id_usuario}/aprobar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? 'Error al aprobar al socio.')
      }
      await fetchData()
    } catch (err) {
      window.alert(`Error: ${err.message}`)
    } finally {
      setApprovingId(null)
    }
  }

  const openModalForCreate = () => { setEditingSocio(null); setIsModalOpen(true) }
  const openModalForEdit   = (socio) => { setEditingSocio(socio); setIsModalOpen(true) }
  const closeModal         = () => setIsModalOpen(false)

  const filteredSocios = socios.filter(socio => {
    const term = searchTerm.toLowerCase()
    return (
      socio.nombre.toLowerCase().includes(term) ||
      socio.apellido.toLowerCase().includes(term) ||
      socio.dni.includes(term)
    )
  })

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">

      {/* Modal */}
      {isModalOpen && (
        <SocioFormModal
          socio={editingSocio}
          onClose={closeModal}
          onSave={handleSaveSocio}
          catalogoRoles={catalogoRoles}
          token={token}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Users size={24} className="text-gray-500" />
            Gestión de Socios
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Crear, editar, aprobar y dar de baja a los socios del club.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 mt-1">
          <button
            onClick={openModalForCreate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors shadow-sm"
          >
            <PlusCircle size={16} />
            Nuevo Socio
          </button>
          <button
            onClick={fetchData} disabled={loading}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 transition-colors"
            title="Actualizar lista"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Buscador */}
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por nombre, apellido o DNI..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
        />
      </div>

      {/* Error de carga */}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle size={18} className="flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={fetchData} className="underline underline-offset-2 font-medium hover:text-red-900">
            Reintentar
          </button>
        </div>
      )}

      {/* Sección de Pendientes */}
      {!loading && pendientes.length > 0 && (
        <div className="space-y-4 p-5 rounded-2xl bg-amber-50 border-2 border-amber-200">
          <div className="flex items-center gap-3">
            <UserPlus size={20} className="text-amber-700" />
            <h2 className="text-lg font-bold text-amber-900">
              Solicitudes Pendientes de Aprobación ({pendientes.length})
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="border-b border-amber-200">
                <tr>
                  {['Socio', 'DNI', 'Fecha de Registro', 'Acciones'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-amber-800/80 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pendientes.map(p => (
                  <tr key={p.id_usuario} className="border-b border-amber-100 last:border-b-0">
                    <td className="px-4 py-3"><div className="font-medium text-gray-800">{p.apellido}, {p.nombre}</div></td>
                    <td className="px-4 py-3 font-mono text-sm text-gray-600">{p.dni}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{new Date(p.creado_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleApproveSocio(p.id_usuario)}
                        disabled={approvingId === p.id_usuario}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:bg-green-400 transition-colors"
                      >
                        {approvingId === p.id_usuario ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                        <span>{approvingId === p.id_usuario ? 'Aprobando…' : 'Aprobar Socio'}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tabla de Socios */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              {['Socio', 'DNI', 'Email', 'Estado', 'Acciones'].map(h => (
                <th key={h} className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading && [...Array(5)].map((_, i) => (
              <tr key={i} className="animate-pulse">
                <td colSpan="5" className="px-6 py-4">
                  <div className="h-4 bg-gray-200 rounded-md" />
                </td>
              </tr>
            ))}

            {!loading && filteredSocios.map(socio => (
              <tr key={socio.id_usuario} className="hover:bg-gray-50/70 transition-colors">
                <td className="px-6 py-4">
                  <div className="font-medium text-gray-900">{socio.apellido}, {socio.nombre}</div>
                </td>
                <td className="px-6 py-4 font-mono text-sm text-gray-600">{socio.dni}</td>
                <td className="px-6 py-4 text-sm text-gray-500">{socio.email ?? '—'}</td>
                <td className="px-6 py-4">
                  {socio.fecha_baja ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                      <UserX size={12} /> Inactivo
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      <UserCheck size={12} /> Activo
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-right space-x-1 whitespace-nowrap">
                  <button
                    onClick={() => openModalForEdit(socio)}
                    className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                    title="Editar Socio"
                  >
                    <Edit size={16} />
                  </button>
                  {socio.fecha_baja ? (
                    <button
                      onClick={() => handleReactivateSocio(socio)}
                      className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-100 rounded-lg transition-colors"
                      title="Reactivar Socio"
                    >
                      <Undo2 size={16} />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleDeleteSocio(socio)}
                      className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                      title="Dar de baja"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </td>
              </tr>
            ))}

            {!loading && filteredSocios.length === 0 && (
              <tr>
                <td colSpan="5" className="text-center py-12 text-gray-500">
                  {searchTerm
                    ? 'No se encontraron socios que coincidan con la búsqueda.'
                    : 'No hay socios para mostrar.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/*
 * ── NOTA: Endpoint backend requerido ────────────────────────────────────────────
 *
 * El modal de edición fetcha GET /admin/usuarios/{id_usuario} para conocer los
 * roles actuales del socio. Ese endpoint NO existe todavía en admin_usuarios.py.
 *
 * Agregar estas líneas al final de backend/routers/admin_usuarios.py:
 *
 *   @router.get(
 *       "/{id_usuario}",
 *       response_model=schemas.UsuarioResponse,
 *       summary="Detalle completo de un usuario (incluye roles_asignados)",
 *   )
 *   def get_usuario_detalle(
 *       id_usuario: int,
 *       db: Session = Depends(get_db),
 *       _: models.Usuario = Depends(require_roles(*_ADMIN)),
 *   ):
 *       usuario = (
 *           db.query(models.Usuario)
 *           .options(
 *               joinedload(models.Usuario.roles_asignados)
 *               .joinedload(models.UsuarioRol.rol)
 *           )
 *           .filter(models.Usuario.id_usuario == id_usuario)
 *           .first()
 *       )
 *       if not usuario:
 *           raise HTTPException(status_code=404, detail="Usuario no encontrado.")
 *       return usuario
 *
 * ── NOTA: Clase CSS form-input ────────────────────────────────────────────────
 *
 *   @layer components {
 *     .form-input {
 *       @apply block w-full px-3 py-2 bg-white border border-gray-300 rounded-lg
 *              shadow-sm placeholder-gray-400 text-sm
 *              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500;
 *     }
 *   }
 */