// frontend/src/pages/AdminSolicitudes.jsx
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  CheckCircle,
  Clock,
  RefreshCw,
  AlertCircle,
  UserCheck,
  Users,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function EstadoVacio() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-12">
      <div className="flex flex-col items-center justify-center text-center text-gray-500">
        <CheckCircle size={48} strokeWidth={1.5} className="text-green-500 mb-4" />
        <p className="font-semibold text-lg text-gray-700">¡Todo en orden!</p>
        <p className="text-sm mt-1 max-w-xs">No hay nuevas solicitudes de alta pendientes de aprobación en este momento.</p>
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

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {[...Array(5)].map((_, i) => (
        <td key={i} className="px-6 py-4">
          <div className="h-4 bg-gray-200 rounded-md" style={{ width: `${60 + i * 10}%` }} />
        </td>
      ))}
    </tr>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function AdminSolicitudes() {
  const { token } = useAuth()

  const [pendientes, setPendientes] = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [aprobando, setAprobando]   = useState(null)   // id_usuario en proceso
  const [aprobados, setAprobados]   = useState([])     // ids ya aprobados en esta sesión

  // ── Fetch solicitudes ──────────────────────────────────────────────────────
const fetchPendientes = useCallback(async () => {
    console.log("Intentando conectar a la API en:", `${API}/admin/usuarios/pendientes`);
    // Si no hay token, no hacemos nada.
    if (!token) {
      console.warn("Fetch abortado: No hay token disponible.");
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
      if (!res.ok) throw new Error(`Error ${res.status}: No se pudieron cargar.`);
      
      setPendientes(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]); // token es la dependencia clave aquí

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
  const aprobar = async (id_usuario, nombreCompleto) => {
    if (!window.confirm(`¿Confirmar aprobación de ${nombreCompleto} como socio?`)) return

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
    } catch (err) {
      window.alert(`No se pudo aprobar: ${err.message}`)
    } finally {
      setAprobando(null)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Users size={24} className="text-gray-500" />
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

      {/* Error */}
      {error && <EstadoError mensaje={error} onReintentar={fetchPendientes} />}

      {/* Tabla */}
      {!error && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                {['DNI', 'Apellido y Nombre', 'Email', 'Fecha de Registro', 'Acción'].map(h => (
                  <th
                    key={h}
                    className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-50">
              {/* Skeletons */}
              {loading && [...Array(4)].map((_, i) => <SkeletonRow key={i} />)}

              {/* Filas reales */}
              {!loading && pendientes.map(u => (
                <tr
                  key={u.id_usuario}
                  className="hover:bg-gray-50/70 transition-colors group"
                >
                  <td className="px-6 py-4 font-mono text-sm font-medium text-gray-900 tracking-wide">
                    {u.dni}
                  </td>

                  <td className="px-6 py-4 text-sm text-gray-800 font-medium">
                    {u.apellido}, {u.nombre}
                  </td>

                  <td className="px-6 py-4 text-sm text-gray-500">
                    {u.email
                      ? <a href={`mailto:${u.email}`} className="hover:underline">{u.email}</a>
                      : <span className="text-gray-300">—</span>
                    }
                  </td>

                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(u.creado_at).toLocaleDateString('es-AR', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </td>

                  <td className="px-6 py-4">
                    <button
                      onClick={() => aprobar(u.id_usuario, `${u.nombre} ${u.apellido}`)}
                      disabled={aprobando === u.id_usuario}
                      className="inline-flex items-center gap-2 px-4 py-1.5 rounded-xl
                                 bg-green-600 hover:bg-green-700 active:bg-green-800
                                 disabled:opacity-60 disabled:cursor-not-allowed
                                 text-white text-sm font-semibold transition-colors shadow-sm"
                    >
                      <CheckCircle size={14} />
                      {aprobando === u.id_usuario ? 'Aprobando…' : 'Aprobar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Estado vacío */}
          {!loading && !error && pendientes.length === 0 && <EstadoVacio />}
        </div>
      )}
    </div>
  )
}