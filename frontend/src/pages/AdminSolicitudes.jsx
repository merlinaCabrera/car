// frontend/src/pages/AdminSolicitudes.jsx
import { useState, useEffect, useCallback } from 'react'
import ConfirmDialog from '../components/ConfirmDialog'
import { useAuth } from '../context/AuthContext'
import {
  CheckCircle,
  Clock,
  RefreshCw,
  AlertCircle,
  UserCheck,
  Users,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Mail,
  Cake,
  XCircle,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function EstadoVacio({ mensaje }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-12">
      <div className="flex flex-col items-center justify-center text-center text-gray-500">
        <CheckCircle size={48} strokeWidth={1.5} className="text-green-500 mb-4" />
        <p className="font-semibold text-lg text-gray-700">¡Todo en orden!</p>
        <p className="text-sm mt-1 max-w-xs">
          {mensaje ?? 'No hay nuevas solicitudes de alta pendientes de aprobación en este momento.'}
        </p>
      </div>
    </div>
  )
}

function EstadoSinPermiso() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-12">
      <div className="flex flex-col items-center justify-center text-center text-gray-500">
        <ShieldAlert size={48} strokeWidth={1.5} className="text-amber-500 mb-4" />
        <p className="font-semibold text-lg text-gray-700">No tenés acceso a esta sección</p>
        <p className="text-sm mt-1 max-w-xs">
          Tu cuenta no tiene permisos de administrador. Iniciá sesión con una cuenta de admin para
          ver las solicitudes de alta.
        </p>
      </div>
    </div>
  )
}

function EstadoError({ mensaje, onReintentar }) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
      <AlertCircle size={18} className="flex-shrink-0" />
      <span className="flex-1">{mensaje}</span>
      <button
        onClick={onReintentar}
        className="underline underline-offset-2 font-medium hover:text-red-900"
      >
        Reintentar
      </button>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 animate-pulse">
      <div className="h-4 bg-gray-200 rounded-md w-2/3 mb-2" />
      <div className="h-3 bg-gray-100 rounded-md w-1/3" />
    </div>
  )
}

// ─── Tarjeta de solicitud — colapsable ─────────────────────────────────────
// Colapsada: DNI, nombre y fecha de registro (lo esencial para escanear la
// lista). Al desplegar aparece el email, la fecha de nacimiento, y las
// acciones Aprobar / Rechazar.
function TarjetaSolicitud({ u, onAprobar, onRechazar, aprobando, rechazando, motivoAbierto, setMotivoAbierto }) {
  const [expandido, setExpandido] = useState(false)
  const [motivo, setMotivo] = useState('')
  const enProceso = aprobando === u.id_usuario || rechazando === u.id_usuario
  const pidiendoMotivo = motivoAbierto === u.id_usuario

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setExpandido(e => !e)}
        className="w-full text-left p-4 flex items-center justify-between gap-3 hover:bg-gray-50 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <p className="font-medium text-gray-900">{u.apellido}, {u.nombre}</p>
          <p className="text-xs text-gray-500 mt-0.5 font-mono">DNI {u.dni}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-gray-400 hidden sm:inline">
            {new Date(u.creado_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
          {expandido ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </div>
      </button>

      {expandido && (
        <div className="px-4 pb-4 space-y-2.5 border-t border-gray-50 pt-3">
          <p className="text-xs text-gray-400 sm:hidden">
            Registrado el {new Date(u.creado_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
          </p>

          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Mail size={14} className="text-gray-400 flex-shrink-0" />
            {u.email
              ? <a href={`mailto:${u.email}`} className="hover:underline truncate">{u.email}</a>
              : <span className="text-gray-300">Sin email registrado</span>
            }
          </div>

          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Cake size={14} className="text-gray-400 flex-shrink-0" />
            {u.fecha_nacimiento
              ? new Date(u.fecha_nacimiento + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })
              : <span className="text-gray-300">Sin fecha de nacimiento</span>
            }
          </div>

          {/* Cuadro de motivo — solo aparece si tocás "Rechazar" */}
          {pidiendoMotivo ? (
            <div className="pt-2 border-t border-gray-50 space-y-2">
              <input
                type="text"
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                placeholder="Motivo del rechazo (opcional)"
                className="form-input text-sm w-full"
                autoFocus
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onRechazar(u.id_usuario, motivo)}
                  disabled={enProceso}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-semibold transition-colors"
                >
                  {rechazando === u.id_usuario ? 'Rechazando…' : 'Confirmar rechazo'}
                </button>
                <button
                  onClick={() => { setMotivoAbierto(null); setMotivo('') }}
                  disabled={enProceso}
                  className="px-3 py-2 rounded-xl text-gray-500 hover:bg-gray-100 text-xs font-semibold transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 pt-2 border-t border-gray-50">
              <button
                onClick={() => onAprobar(u.id_usuario, `${u.nombre} ${u.apellido}`)}
                disabled={enProceso}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-xs font-semibold transition-colors"
              >
                <CheckCircle size={14} />
                {aprobando === u.id_usuario ? 'Aprobando…' : 'Aprobar'}
              </button>
              <button
                onClick={() => setMotivoAbierto(u.id_usuario)}
                disabled={enProceso}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-xl bg-red-50 hover:bg-red-100 disabled:opacity-60 text-red-700 text-xs font-semibold transition-colors"
              >
                <XCircle size={14} />
                Rechazar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function AdminSolicitudes() {
  const { token, user } = useAuth()

  const ROLES_ADMIN = ['admin_general', 'personal_administrativo']
  const esAdmin = !!user?.roles_asignados?.some(
    ur =>
      ur.rol?.nombre &&
      ROLES_ADMIN.includes(ur.rol.nombre) &&
      ur.rol?.es_activo !== false &&
      (!ur.valido_hasta || new Date(ur.valido_hasta) > new Date())
  )

  const [pendientes, setPendientes] = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [aprobando, setAprobando]   = useState(null)   // id_usuario en proceso
  const [rechazando, setRechazando] = useState(null)   // id_usuario en proceso
  const [motivoAbierto, setMotivoAbierto] = useState(null) // id_usuario con el cuadro de motivo abierto
  const [aprobados, setAprobados]   = useState([])     // ids ya aprobados en esta sesión

  // ── Fetch solicitudes ──────────────────────────────────────────────────────
const fetchPendientes = useCallback(async () => {
    console.log("Intentando conectar a la API en:", `${API}/admin/usuarios/pendientes`);
    // Si no hay token, no hacemos nada.
    if (!token) {
      console.warn("Fetch abortado: No hay token disponible.");
      return;
    }
    // Si el usuario logueado no tiene rol de admin, ni siquiera pedimos el
    // recurso: no tiene sentido pegarle al backend para que nos diga 403.
    if (!esAdmin) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      console.log("Token enviado al backend:", token);
      const res = await fetch(`${API}/admin/usuarios/pendientes`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
      });

      if (res.status === 401) {
        throw new Error("Tu sesión expiró. Por favor, volvé a iniciar sesión.");
      }
      if (res.status === 403) {
        // Ya sabemos que el usuario tiene rol de admin (esAdmin), así que si
        // igual llega un 403 acá es algo transitorio del lado del backend/token,
        // no "no hay nada pendiente". Lo tratamos como error real.
        throw new Error('No se pudo verificar tu permiso de administrador. Volvé a iniciar sesión.');
      }
      if (!res.ok) throw new Error(`Error ${res.status}: No se pudieron cargar.`);
      
      setPendientes(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, esAdmin]); // token es la dependencia clave aquí

  useEffect(() => {
    // Condición de guardia: solo hacer fetch si tenemos un token.
    // El AuthContext ya nos asegura que este componente no se renderiza
    // hasta que la carga inicial de autenticación haya terminado.
    if (loading && token) {
      fetchPendientes()
    } else {
      // Si no hay token (usuario no logueado), nos aseguramos que no haya estado de carga.
      setLoading(false)
    }
  }, [token, fetchPendientes])

  // ── Aprobar usuario ────────────────────────────────────────────────────────
  const [confirmAprobar, setConfirmAprobar] = useState(null) // { id_usuario, nombreCompleto }

  const aprobar = (id_usuario, nombreCompleto) => {
    setConfirmAprobar({ id_usuario, nombreCompleto })
  }

  const ejecutarAprobacion = async () => {
    if (!confirmAprobar) return
    const { id_usuario } = confirmAprobar
    setAprobando(id_usuario)
    try {
      const res = await fetch(`${API}/admin/usuarios/${id_usuario}/aprobar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail ?? `Error ${res.status} al aprobar.`)
      }

      // Quitar de la lista local optimísticamente
      setAprobados(prev => [...prev, id_usuario])
      setPendientes(prev => prev.filter(u => u.id_usuario !== id_usuario))
      setConfirmAprobar(null)
    } catch (err) {
      window.alert(`No se pudo aprobar: ${err.message}`)
    } finally {
      setAprobando(null)
    }
  }

  // ── Rechazar solicitud ─────────────────────────────────────────────────────
  const rechazar = async (id_usuario, motivo) => {
    setRechazando(id_usuario)
    try {
      const res = await fetch(`${API}/admin/usuarios/${id_usuario}/rechazar-solicitud`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ motivo: motivo || null }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail ?? `Error ${res.status} al rechazar.`)
      }

      setPendientes(prev => prev.filter(u => u.id_usuario !== id_usuario))
      setMotivoAbierto(null)
    } catch (err) {
      window.alert(`No se pudo rechazar: ${err.message}`)
    } finally {
      setRechazando(null)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5 sm:space-y-6">

      {/* Confirmación de aprobar — reemplaza al window.confirm() nativo */}
      {confirmAprobar && (
        <ConfirmDialog
          titulo={`¿Aprobar a ${confirmAprobar.nombreCompleto} como socio?`}
          mensaje="Se le asigna el rol de socio y ya puede ingresar al portal."
          confirmLabel="Aprobar"
          cargando={aprobando === confirmAprobar.id_usuario}
          onConfirm={ejecutarAprobacion}
          onCancel={() => setConfirmAprobar(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2 sm:gap-3">
            <Users size={22} className="text-gray-500 flex-shrink-0" />
            Solicitudes de Alta
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Usuarios registrados esperando ser aprobados como socios.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0 mt-1">
          {/* Badge contador */}
          {!loading && pendientes.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-amber-100 text-amber-800 border border-amber-200">
              <Clock size={13} />
              {pendientes.length} pendiente{pendientes.length !== 1 && 's'}
            </span>
          )}
          {aprobados.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-green-100 text-green-800 border border-green-200">
              <UserCheck size={13} />
              {aprobados.length} aprobado{aprobados.length !== 1 && 's'}
            </span>
          )}

          {/* Botón actualizar */}
          <button
            onClick={fetchPendientes}
            disabled={loading}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 transition-colors"
            title="Actualizar lista"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Sin permiso: usuario logueado que no es admin */}
      {!loading && !esAdmin && <EstadoSinPermiso />}

      {/* Error */}
      {!loading && esAdmin && error && <EstadoError mensaje={error} onReintentar={fetchPendientes} />}

      {/* Lista */}
      {esAdmin && !error && (
        <div className="space-y-3">
          {/* Skeletons */}
          {loading && [...Array(3)].map((_, i) => <SkeletonCard key={i} />)}

          {/* Tarjetas reales */}
          {!loading && pendientes.map(u => (
            <TarjetaSolicitud
              key={u.id_usuario}
              u={u}
              onAprobar={aprobar}
              onRechazar={rechazar}
              aprobando={aprobando}
              rechazando={rechazando}
              motivoAbierto={motivoAbierto}
              setMotivoAbierto={setMotivoAbierto}
            />
          ))}

          {/* Estado vacío */}
          {!loading && !error && pendientes.length === 0 && <EstadoVacio />}
        </div>
      )}
    </div>
  )
}