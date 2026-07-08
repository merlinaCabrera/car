// frontend/src/pages/AdminSocios.jsx
/**
 * Panel de gestión de socios para el administrador.
 *
 * Novedades respecto a la versión anterior:
 *   1. Filtro por rol: tabs en la parte superior que pasan `?rol=` al
 *      backend. El backend (admin_usuarios.py) ya acepta GET /admin/usuarios/?rol=...
 *   2. Botón "Registrar Pago" en cada fila de la tabla — abre el modal de
 *      cobro en ventanilla migrado desde AdminPagos.jsx.
 *   3. CobroModal migrado aquí por completo, incluyendo el fetch de precio
 *      y el POST a /admin/pagos/registrar-pago-manual.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
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
  Banknote,
  X,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const formatoMoneda = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

const DESCUENTO_MENOR_PORCENTAJE = 0.40

// ─── Helpers de fecha (sin desfase UTC) ──────────────────────────────────────
// Duplicados intencionalmente respecto a SocioCuotas.jsx: cada página de este
// proyecto es un módulo independiente (mismo patrón que ya usan los routers
// del backend con _extraer_ip/_registrar_audit).

/**
 * Construye un Date en tiempo local desde partes individuales.
 * Evita el desfase UTC que produce `new Date("YYYY-MM-DD")` en zonas negativas
 * como America/Argentina/Buenos_Aires (UTC-3).
 */
function fechaLocal(anio, mes1based, dia) {
  return new Date(anio, mes1based - 1, dia)
}

/**
 * Parsea una ISO Date string "YYYY-MM-DD" a Date local. Devuelve null si es
 * nulo/undefined/inválido.
 */
function parsearISO(isoDate) {
  if (!isoDate) return null
  const partes = String(isoDate).split('-').map(Number)
  if (partes.length !== 3 || partes.some(Number.isNaN)) return null
  return fechaLocal(partes[0], partes[1], partes[2])
}

/**
 * Edad en años completos a partir de una fecha de nacimiento ISO ("YYYY-MM-DD").
 * Devuelve null si no hay fecha de nacimiento cargada.
 */
function calcularEdad(fechaNacimientoISO) {
  const nacimiento = parsearISO(fechaNacimientoISO)
  if (!nacimiento) return null
  const hoy = new Date()
  let edad = hoy.getFullYear() - nacimiento.getFullYear()
  const mes = hoy.getMonth() - nacimiento.getMonth()
  if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) {
    edad--
  }
  return edad
}

/**
 * Fuente única de verdad para el estado financiero del socio (moroso / al día
 * / meses adeudados), calculado "al vuelo" en vez de leer el campo crudo
 * `socio.deuda_historica_meses` de la API (que queda obsoleto con el tiempo).
 *
 * Reglas de negocio:
 *   · fechaBase = mes_cubierto_hasta si no es nulo (SIN importar si está en
 *     el pasado o en el futuro).
 *   · Si mes_cubierto_hasta es nulo, fechaBase = fecha_ingreso normalizada al
 *     día de vencimiento (con clamp al último día del mes).
 *   · hoy <= fechaBase  → { moroso: false, mesesAdeudados: 0 }
 *   · hoy >  fechaBase  → moroso: true, con la diferencia de meses de
 *     calendario entre hoy y fechaBase (+1 si ya pasó el día de vencimiento
 *     del mes en curso). Así, un socio nuevo o que debe el mes en curso NO
 *     es moroso hasta pasado el día de vencimiento (ej. día 11 si vence el 10).
 */
function calcularEstadoFinanciero(mesCubiertoHastaISO, fechaIngresoISO, diaVencimiento = 10) {
  let fechaBase = parsearISO(mesCubiertoHastaISO)

  if (!fechaBase) {
    const ingreso = parsearISO(fechaIngresoISO)
    if (ingreso) {
      const ultimoDiaMes = new Date(ingreso.getFullYear(), ingreso.getMonth() + 1, 0).getDate()
      const diaClamp = Math.min(diaVencimiento, ultimoDiaMes)
      fechaBase = fechaLocal(ingreso.getFullYear(), ingreso.getMonth() + 1, diaClamp)
    }
  }

  if (!fechaBase) return { moroso: false, mesesAdeudados: 0 }

  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

  if (hoy <= fechaBase) return { moroso: false, mesesAdeudados: 0 }

  let mesesAdeudados =
    (hoy.getFullYear() - fechaBase.getFullYear()) * 12 +
    (hoy.getMonth() - fechaBase.getMonth())

  if (hoy.getDate() > fechaBase.getDate()) {
    mesesAdeudados += 1
  }

  return { moroso: true, mesesAdeudados }
}

/** Precio final de la cuota para un socio puntual, aplicando el descuento de menor si corresponde. */
function calcularPrecioFinal(precioCuota, fechaNacimientoISO) {
  if (!Number.isFinite(precioCuota)) return 0
  const edad = calcularEdad(fechaNacimientoISO)
  const esMenor = edad !== null && edad < 18
  return esMenor ? precioCuota * (1 - DESCUENTO_MENOR_PORCENTAJE) : precioCuota
}

// ─── Tabs de filtro por rol ───────────────────────────────────────────────────

// "Socio" es el rol base obligatorio de todos los usuarios aprobados,
// filtrarlo devolvería siempre la lista completa — se omite del selector.
const TABS_ROLES = [
  { label: 'Todos',             value: ''                    },
  { label: 'Jugadores',         value: 'jugador'             },
  { label: 'Personal Técnico',  value: 'personal_tecnico'    },
  { label: 'Administrativos',   value: 'personal_administrativo' },
  { label: 'Invitados',         value: 'invitado'            },
]

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

// ─── Sub-componente: Sección de roles en el modal de edición ─────────────────

function SeccionRoles({ catalogoRoles, selectedRoles, onToggle, loadingRoles, errorRoles }) {
  const rolesMostrables = catalogoRoles.filter(rol => rol.nombre !== 'admin_general' && rol.nombre !== 'socio')
  const rolSocio = catalogoRoles.find(rol => rol.nombre === 'socio')

  const idInvitado     = catalogoRoles.find(r => r.nombre === 'invitado')?.id_rol
  const invitadoActivo = idInvitado != null && selectedRoles.includes(idInvitado)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 pt-2">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="flex items-center gap-1.5 text-xs font-bold text-gray-500 uppercase tracking-widest whitespace-nowrap">
          <ShieldCheck size={13} />
          Roles del Usuario
        </span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>

      {invitadoActivo && (
        <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
          ℹ️ El rol <strong>Invitado</strong> es exclusivo: no puede combinarse con otros roles.
          Al asignarlo, los demás se desmarcan automáticamente.
        </p>
      )}

      {/* Rol Socio — base obligatorio, siempre activo, no editable */}
      {rolSocio && (
        <div className="flex items-start gap-3 p-3 rounded-xl border-2 border-indigo-400 bg-indigo-50 opacity-70 cursor-not-allowed" title="El rol Socio es obligatorio y no puede quitarse desde aquí.">
          <div className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center bg-indigo-600 border-indigo-600">
            <svg viewBox="0 0 12 10" fill="none" className="w-3 h-3">
              <path d="M1 5l3.5 3.5L11 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold capitalize text-indigo-900">{rolSocio.nombre}</p>
            {rolSocio.descripcion && <p className="text-xs text-gray-500 mt-0.5 leading-snug">{rolSocio.descripcion}</p>}
            <p className="text-xs text-indigo-600 mt-0.5 font-medium">Rol base — no se puede quitar</p>
          </div>
        </div>
      )}

      {loadingRoles && (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
          <Loader2 size={15} className="animate-spin text-indigo-500" />
          Cargando roles actuales…
        </div>
      )}

      {errorRoles && !loadingRoles && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          ⚠️ No se pudieron cargar los roles actuales. Los checkboxes inician en blanco.
        </p>
      )}

      {!loadingRoles && (
        <div className="grid grid-cols-1 gap-2">
          {rolesMostrables.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-3">
              No hay roles disponibles en el catálogo.
            </p>
          )}
          {rolesMostrables.map(rol => {
            const bloqueadoPorInvitado = invitadoActivo && rol.nombre !== 'invitado'
            return (
              <RolCheckbox
                key={rol.id_rol}
                rol={rol}
                checked={selectedRoles.includes(rol.id_rol)}
                onChange={() => onToggle(rol.id_rol)}
                disabled={bloqueadoPorInvitado}
              />
            )
          })}
        </div>
      )}

      <p className="text-xs text-gray-400">
        Los cambios de roles se guardan al presionar <strong>Guardar</strong>.
        El rol <span className="font-semibold">Admin General</span> solo se asigna desde la base de datos.
      </p>
    </div>
  )
}

// ─── Modal de edición / creación de socio ─────────────────────────────────────

function SocioFormModal({ socio, onClose, onSave, catalogoRoles, token }) {
  const [formData, setFormData] = useState({
    dni:       socio?.dni       ?? '',
    nombre:    socio?.nombre    ?? '',
    apellido:  socio?.apellido  ?? '',
    email:     socio?.email     ?? '',
    telefono:  socio?.telefono  ?? '',
    direccion: socio?.direccion ?? '',
    fecha_nacimiento: socio?.fecha_nacimiento ?? '',
    password:  '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [apiError,     setApiError]     = useState(null)
  const [formErrors,   setFormErrors]   = useState({})
  const [showPassword, setShowPassword] = useState(false)

  const [selectedRoles, setSelectedRoles] = useState([])
  const [loadingRoles,  setLoadingRoles]  = useState(false)
  const [errorRoles,    setErrorRoles]    = useState(false)

  const isEditMode = !!socio

  useEffect(() => {
    if (!isEditMode || !socio?.id_usuario || !token) return

    const fetchSocioData = async () => {
      setLoadingRoles(true)
      setErrorRoles(false)
      try {
        const res = await fetch(`${API}/admin/usuarios/${socio.id_usuario}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) throw new Error('No se pudo cargar la información completa del socio.')
        const data = await res.json()

        // 1. Actualizar los roles
        const ids = (data.roles_asignados ?? []).map(ur => ur.id_rol)
        setSelectedRoles(ids)

        // 2. Actualizar el formulario con los datos completos (incluyendo fecha_nacimiento)
        setFormData(prev => ({
          ...prev,
          dni: data.dni ?? '',
          nombre: data.nombre ?? '',
          apellido: data.apellido ?? '',
          email: data.email ?? '',
          telefono: data.telefono ?? '',
          direccion: data.direccion ?? '',
          fecha_nacimiento: data.fecha_nacimiento ? String(data.fecha_nacimiento).split('T')[0] : '',
          password: '', // El campo de contraseña siempre inicia vacío en modo edición
        }))
      } catch (err) {
        setErrorRoles(true)
        setApiError(err.message)
        setSelectedRoles([])
      } finally {
        setLoadingRoles(false)
      }
    }

    fetchSocioData()
  }, [socio?.id_usuario, token, isEditMode])

  const toggleRol = (id_rol) => {
    const idInvitado = catalogoRoles.find(r => r.nombre === 'invitado')?.id_rol

    setSelectedRoles(prev => {
      const yaSeleccionado = prev.includes(id_rol)

      if (yaSeleccionado) {
        return prev.filter(id => id !== id_rol)
      }

      if (idInvitado != null && id_rol === idInvitado) {
        return [idInvitado]
      }

      const sinInvitado = (idInvitado != null)
        ? prev.filter(id => id !== idInvitado)
        : prev
      return [...sinInvitado, id_rol]
    })
  }

  const validate = () => {
    const errs = {}
    if (!formData.nombre.trim())   errs.nombre   = 'El nombre es obligatorio.'
    if (!formData.apellido.trim()) errs.apellido  = 'El apellido es obligatorio.'
    if (!formData.email)           errs.email     = 'El email es obligatorio.'
    else if (!/\S+@\S+\.\S+/.test(formData.email)) errs.email = 'Formato de email inválido.'

    if (!isEditMode) {
      if (!formData.dni) errs.dni = 'El DNI es obligatorio.'
      else if (!/^\d{7,10}$/.test(formData.dni)) errs.dni = 'Entre 7 y 10 dígitos numéricos.'
      if (!formData.fecha_nacimiento) errs.fecha_nacimiento = 'La fecha de nacimiento es obligatoria.'
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

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return

    setIsSubmitting(true)
    setApiError(null)

    const payload = isEditMode
      ? Object.fromEntries(Object.entries(formData).filter(([, v]) => v !== ''))
      : { ...formData }

    if (isEditMode && !payload.password) delete payload.password

    try {
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

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="p-6 space-y-4 overflow-y-auto flex-1">

            {apiError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                <span>{apiError}</span>
              </div>
            )}

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

            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Fecha de Nacimiento</label>
              <input
                type="date" name="fecha_nacimiento" value={formData.fecha_nacimiento}
                onChange={e => setFormData({ ...formData, fecha_nacimiento: e.target.value })}
                required
                className={`form-input mt-1.5 ${formErrors.fecha_nacimiento ? 'border-red-500' : ''}`}
              />
              {formErrors.fecha_nacimiento && <p className="text-red-600 text-xs mt-1">{formErrors.fecha_nacimiento}</p>}
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

// ─── Modal de cobro manual en ventanilla (migrado desde AdminPagos) ──────────
//
// Recibe el socio seleccionado (con deuda_historica_meses y deuda_estimada)
// y el precio actual de la cuota (fetcheado por AdminSocios al montar).
// El backend aplica automáticamente la tarifa correcta (Cuota Menor vs adulto)
// al ejecutar /admin/pagos/registrar-pago-manual — el precio que mostramos
// acá es orientativo, basado en el precio_cuota_actual de estadísticas.

function CobroModal({ socio, precioCuota, onClose, onSave, diaVencimiento }) {
  const estadoFinanciero = useMemo(
    () => calcularEstadoFinanciero(socio.mes_cubierto_hasta, socio.fecha_ingreso, diaVencimiento),
    [socio.mes_cubierto_hasta, socio.fecha_ingreso, diaVencimiento]
  )
  const { moroso, mesesAdeudados } = estadoFinanciero

  const [meses, setMeses] = useState(moroso && mesesAdeudados > 0 ? mesesAdeudados : 1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [apiError, setApiError] = useState(null)
  const [formError, setFormError] = useState(null)

  const edad = useMemo(() => calcularEdad(socio.fecha_nacimiento), [socio.fecha_nacimiento])
  const esMenor = edad !== null && edad < 18

  const precioFinalSocio = useMemo(
    () => calcularPrecioFinal(precioCuota, socio.fecha_nacimiento),
    [precioCuota, socio.fecha_nacimiento]
  )

  const deudaRealPesos = useMemo(
    () => mesesAdeudados * precioFinalSocio,
    [mesesAdeudados, precioFinalSocio]
  )

  const totalACobrar = useMemo(() => {
    return precioFinalSocio * (Number(meses) || 0)
  }, [meses, precioFinalSocio])

  const validar = () => {
    const n = Number(meses)
    if (!Number.isInteger(n) || n <= 0) {
      setFormError('Ingresá una cantidad de meses válida (entero mayor a 0).')
      return false
    }
    setFormError(null)
    return true
  }

  const handleConfirmar = async () => {
    if (!validar()) return
    setIsSubmitting(true)
    setApiError(null)
    try {
      await onSave({ id_usuario: socio.id_usuario, meses_a_pagar: Number(meses) })
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

        <div className="p-6 border-b flex-shrink-0 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Registrar Pago en Ventanilla</h2>
            <p className="text-sm text-gray-500 mt-1">
              {socio.apellido}, {socio.nombre} — DNI {socio.dni}
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

          {moroso ? (
            <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
              <span className="text-sm font-medium text-amber-800">Deuda actual</span>
              <span className="text-sm font-bold text-amber-800">
                {mesesAdeudados} mes{mesesAdeudados !== 1 ? 'es' : ''} — {formatoMoneda.format(deudaRealPesos)}
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-green-50 border border-green-200">
              <span className="text-sm font-medium text-green-800">Socio al día (Adelantar pago)</span>
              <span className="text-sm font-bold text-green-800">{formatoMoneda.format(0)}</span>
            </div>
          )}

          {esMenor && (
            <div className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-blue-50 border border-blue-200 text-blue-800">
              <span className="text-sm font-semibold">
                Aplica Tarifa Menor (40% de descuento)
              </span>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Cantidad de meses a abonar
            </label>
            <input
              type="number"
              min={1}
              step={1}
              value={meses}
              onChange={e => setMeses(e.target.value)}
              className={`form-input mt-1.5 ${formError ? 'border-red-500' : ''}`}
            />
            {formError && <p className="text-red-600 text-xs mt-1">{formError}</p>}
          </div>

          <div className="flex items-center justify-between px-4 py-4 rounded-xl bg-blue-50 border border-blue-200">
            <span className="text-sm font-semibold text-blue-900">Total a cobrar</span>
            <span className="text-xl font-bold text-blue-900">{formatoMoneda.format(totalACobrar)}</span>
          </div>

          <p className="text-xs text-gray-400 leading-relaxed">
            El sistema aplica automáticamente un descuento para socios menores de 18 años. El total a cobrar ya refleja este beneficio.
          </p>
        </div>

        <div className="p-4 bg-gray-50 rounded-b-2xl border-t flex justify-end gap-3 flex-shrink-0">
          <button
            type="button" onClick={onClose}
            className="px-4 py-2 rounded-lg text-gray-600 bg-gray-200 hover:bg-gray-300 font-semibold transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button" onClick={handleConfirmar} disabled={isSubmitting}
            className="px-4 py-2 rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 font-semibold disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            {isSubmitting ? 'Procesando…' : 'Confirmar Pago'}
          </button>
        </div>
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
  const [rolFiltro,    setRolFiltro]    = useState('')       // tab activo
  const [socioACobrar, setSocioACobrar] = useState(null)    // abre CobroModal
  const [precioCuota,  setPrecioCuota]  = useState(0)       // precio de referencia
  const [diaVencimiento, setDiaVencimiento] = useState(10);

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

  // ── Fetch de datos de configuración (precio de cuota, día de vencimiento) ──
  useEffect(() => {
    if (!token) return
    fetch(`${API}/admin/pagos/estadisticas`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setPrecioCuota(Number(data.precio_cuota_actual) || 0)
          setDiaVencimiento(Number(data.dia_vencimiento_cuota) || 10)
        }
      })
      .catch(() => {})
  }, [token])

  // ── Fetch de datos (socios y pendientes) ──────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const params = rolFiltro ? `?rol=${encodeURIComponent(rolFiltro)}` : ''
      const [sociosRes, pendientesRes] = await Promise.all([
        fetch(`${API}/admin/usuarios/${params}`, { headers: { Authorization: `Bearer ${token}` } }),
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
  }, [token, rolFiltro])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Guardar socio ──────────────────────────────────────────────────────────
  const handleSaveSocio = async (data, id, selectedRoles) => {
    const isEdit = !!id
    const url    = isEdit ? `${API}/admin/usuarios/${id}` : `${API}/admin/usuarios/`
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
      throw new Error(err.detail ?? `Error al ${isEdit ? 'actualizar' : 'crear'} el socio.`)
    }

    if (isEdit && selectedRoles !== null) {
      // Filtrar roles protegidos que el backend preserva automáticamente
      const rolesProtegidos = catalogoRoles
        .filter(r => r.nombre === 'socio' || r.nombre === 'admin_general')
        .map(r => r.id_rol)
      const idsFiltrados = selectedRoles.filter(id => !rolesProtegidos.includes(id))

      const rolesRes = await fetch(`${API}/admin/usuarios/${id}/roles`, {
        method: 'PUT',
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids_roles: idsFiltrados }),
      })

      if (!rolesRes.ok) {
        const err = await rolesRes.json().catch(() => ({}))
        throw new Error(
          `Datos personales guardados correctamente, pero error al actualizar los roles: ${err.detail ?? 'Error desconocido.'}`
        )
      }
    }

    fetchData()
  }

  // ── Registrar pago manual (modal de cobro) ─────────────────────────────────
  const handleRegistrarPago = async ({ id_usuario, meses_a_pagar }) => {
    const res = await fetch(`${API}/admin/pagos/registrar-pago-manual`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id_usuario, meses_a_pagar }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail ?? 'Error al registrar el pago.')
    }

    // Refrescar la tabla para actualizar el estado de cuenta del socio
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

  // ── Filtro local por texto ─────────────────────────────────────────────────
  const filteredSocios = useMemo(() => {
    const term = searchTerm.toLowerCase()
    if (!term) return socios
    return socios.filter(s =>
      s.nombre.toLowerCase().includes(term) ||
      s.apellido.toLowerCase().includes(term) ||
      s.dni.includes(term)
    )
  }, [socios, searchTerm])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5 sm:space-y-6">

      {/* Modal de edición / creación */}
      {isModalOpen && (
        <SocioFormModal
          socio={editingSocio}
          onClose={closeModal}
          onSave={handleSaveSocio}
          catalogoRoles={catalogoRoles}
          token={token}
        />
      )}

      {/* Modal de cobro en ventanilla */}
      {socioACobrar && (
        <CobroModal
          socio={socioACobrar}
          precioCuota={precioCuota}
          onClose={() => setSocioACobrar(null)}
          onSave={handleRegistrarPago}
          diaVencimiento={diaVencimiento}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2 sm:gap-3">
            <Users size={22} className="text-gray-500 flex-shrink-0" />
            Gestión de Socios
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Crear, editar, aprobar, cobrar y dar de baja a los socios del club.
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 mt-1">
          <button
            onClick={openModalForCreate}
            className="inline-flex items-center gap-2 px-3.5 py-2 sm:px-4 rounded-xl bg-blue-600 text-white text-sm sm:text-base font-semibold hover:bg-blue-700 transition-colors shadow-sm whitespace-nowrap"
          >
            <PlusCircle size={16} />
            <span className="hidden sm:inline">Nuevo Socio</span>
            <span className="sm:hidden">Nuevo</span>
          </button>
          <button
            onClick={fetchData} disabled={loading}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 transition-colors flex-shrink-0"
            title="Actualizar lista"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Tabs de filtro por rol ─────────────────────────────────────────── */}
      <div className="flex gap-1 overflow-x-auto p-1 bg-gray-100 rounded-xl w-full sm:w-fit [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS_ROLES.map(tab => (
          <button
            key={tab.value}
            onClick={() => { setRolFiltro(tab.value); setSearchTerm('') }}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all flex-shrink-0 ${
              rolFiltro === tab.value
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
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

      {/* Sección de Pendientes (no se filtra por rol) */}
      {!loading && pendientes.length > 0 && (
        <div className="space-y-4 p-4 sm:p-5 rounded-2xl bg-amber-50 border-2 border-amber-200">
          <div className="flex items-center gap-2 sm:gap-3">
            <UserPlus size={20} className="text-amber-700 flex-shrink-0" />
            <h2 className="text-base sm:text-lg font-bold text-amber-900">
              Solicitudes Pendientes ({pendientes.length})
            </h2>
          </div>

          {/* Vista de tarjetas — mobile */}
          <div className="md:hidden divide-y divide-amber-200/70 -mx-1">
            {pendientes.map(p => (
              <div key={p.id_usuario} className="flex items-center justify-between gap-3 px-1 py-3">
                <div className="min-w-0">
                  <div className="font-medium text-gray-800 truncate">{p.apellido}, {p.nombre}</div>
                  <div className="text-xs text-gray-500 mt-0.5 font-mono">
                    DNI {p.dni} · {new Date(p.creado_at).toLocaleDateString()}
                  </div>
                </div>
                <button
                  onClick={() => handleApproveSocio(p.id_usuario)}
                  disabled={approvingId === p.id_usuario}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:bg-green-400 transition-colors flex-shrink-0"
                >
                  {approvingId === p.id_usuario ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                  <span>{approvingId === p.id_usuario ? 'Aprobando…' : 'Aprobar'}</span>
                </button>
              </div>
            ))}
          </div>

          {/* Vista de tabla — desktop */}
          <div className="hidden md:block overflow-x-auto">
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

      {/* Tabla de Socios — skeleton de carga en mobile */}
      {loading && (
        <div className="md:hidden bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-50">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="p-4 animate-pulse space-y-2">
              <div className="h-4 bg-gray-200 rounded-md w-2/3" />
              <div className="h-3 bg-gray-100 rounded-md w-1/3" />
            </div>
          ))}
        </div>
      )}

      {/* Vista de tarjetas — mobile */}
      {!loading && (
        <div className="md:hidden bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-50">
          {filteredSocios.map(socio => {
            const { moroso: socioMoroso, mesesAdeudados: socioMesesAdeudados } = calcularEstadoFinanciero(
              socio.mes_cubierto_hasta,
              socio.fecha_ingreso,
              diaVencimiento
            )
            const socioPrecioFinal = calcularPrecioFinal(precioCuota, socio.fecha_nacimiento)
            const socioDeudaPesos = socioMesesAdeudados * socioPrecioFinal

            return (
              <div key={socio.id_usuario} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 truncate">{socio.apellido}, {socio.nombre}</div>
                    <div className="text-xs text-gray-500 mt-0.5 font-mono">DNI {socio.dni}</div>
                    {socio.email && <div className="text-xs text-gray-400 mt-0.5 truncate">{socio.email}</div>}
                  </div>
                  {socio.fecha_baja ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 flex-shrink-0">
                      <UserX size={12} /> Inactivo
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 flex-shrink-0">
                      <UserCheck size={12} /> Activo
                    </span>
                  )}
                </div>

                <div>
                  {socioMoroso ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                      {socioMesesAdeudados} mes{socioMesesAdeudados !== 1 ? 'es' : ''} — {formatoMoneda.format(socioDeudaPesos)}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Al día
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 pt-2 border-t border-gray-50 -mx-1">
                  {!socio.fecha_baja && (
                    <button
                      onClick={() => setSocioACobrar(socio)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 p-2 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors text-xs font-medium"
                      title="Registrar Pago"
                    >
                      <Banknote size={16} /> Cobrar
                    </button>
                  )}
                  <button
                    onClick={() => openModalForEdit(socio)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-100 rounded-lg transition-colors text-xs font-medium"
                    title="Editar Socio"
                  >
                    <Edit size={16} /> Editar
                  </button>
                  {socio.fecha_baja ? (
                    <button
                      onClick={() => handleReactivateSocio(socio)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 p-2 text-gray-500 hover:text-green-600 hover:bg-green-100 rounded-lg transition-colors text-xs font-medium"
                      title="Reactivar Socio"
                    >
                      <Undo2 size={16} /> Reactivar
                    </button>
                  ) : (
                    <button
                      onClick={() => handleDeleteSocio(socio)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 p-2 text-gray-500 hover:text-red-600 hover:bg-red-100 rounded-lg transition-colors text-xs font-medium"
                      title="Dar de baja"
                    >
                      <Trash2 size={16} /> Baja
                    </button>
                  )}
                </div>
              </div>
            )
          })}

          {filteredSocios.length === 0 && (
            <div className="text-center py-12 text-gray-500 text-sm px-4">
              {searchTerm
                ? 'No se encontraron socios que coincidan con la búsqueda.'
                : rolFiltro
                  ? `No hay usuarios con el rol "${rolFiltro}".`
                  : 'No hay socios para mostrar.'}
            </div>
          )}
        </div>
      )}

      {/* Tabla de Socios — desktop */}
      <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              {['Socio', 'DNI', 'Email', 'Estado de Cuenta', 'Estado', 'Acciones'].map(h => (
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

            {!loading && filteredSocios.map(socio => {
              const { moroso: socioMoroso, mesesAdeudados: socioMesesAdeudados } = calcularEstadoFinanciero(
                socio.mes_cubierto_hasta,
                socio.fecha_ingreso,
                diaVencimiento
              )
              const socioPrecioFinal = calcularPrecioFinal(precioCuota, socio.fecha_nacimiento)
              const socioDeudaPesos = socioMesesAdeudados * socioPrecioFinal

              return (
              <tr key={socio.id_usuario} className="hover:bg-gray-50/70 transition-colors">
                <td className="px-6 py-4">
                  <div className="font-medium text-gray-900">{socio.apellido}, {socio.nombre}</div>
                  {socio.email && <div className="text-xs text-gray-400 mt-0.5">{socio.email}</div>}
                </td>
                <td className="px-6 py-4 font-mono text-sm text-gray-600">{socio.dni}</td>
                <td className="px-6 py-4 text-sm text-gray-500">{socio.email ?? '—'}</td>
                <td className="px-6 py-4">
                  {socioMoroso ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                      {socioMesesAdeudados} mes{socioMesesAdeudados !== 1 ? 'es' : ''} — {formatoMoneda.format(socioDeudaPesos)}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Al día
                    </span>
                  )}
                </td>
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
                  {/* Registrar Pago — solo para socios activos */}
                  {!socio.fecha_baja && (
                    <button
                      onClick={() => setSocioACobrar(socio)}
                      className="p-2 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                      title="Registrar Pago"
                    >
                      <Banknote size={16} />
                    </button>
                  )}
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
              )
            })}

            {!loading && filteredSocios.length === 0 && (
              <tr>
                <td colSpan="6" className="text-center py-12 text-gray-500">
                  {searchTerm
                    ? 'No se encontraron socios que coincidan con la búsqueda.'
                    : rolFiltro
                      ? `No hay usuarios con el rol "${rolFiltro}".`
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