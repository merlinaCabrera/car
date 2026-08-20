// frontend/src/pages/CambiarPasswordObligatorio.jsx
/**
 * Pantalla forzada de cambio de contraseña — para cuentas creadas
 * manualmente por un admin (con contraseña temporal) que todavía no la
 * cambiaron. El backend ya tenía toda la lógica (requiere_cambio_password +
 * PATCH /usuarios/me/password) desde hace tiempo, pero nunca se conectó a
 * nada en el frontend — RutaPrivada redirige acá cuando detecta el flag.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Eye, EyeOff, KeyRound } from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export default function CambiarPasswordObligatorio() {
  const { token, refreshUser } = useAuth()
  const navigate = useNavigate()

  const [passwordActual, setPasswordActual] = useState('')
  const [passwordNuevo, setPasswordNuevo] = useState('')
  const [passwordConfirmacion, setPasswordConfirmacion] = useState('')
  const [mostrar, setMostrar] = useState(false)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (passwordNuevo !== passwordConfirmacion) {
      setError('Las contraseñas nuevas no coinciden.')
      return
    }
    if (passwordNuevo.length < 8) {
      setError('La contraseña nueva debe tener al menos 8 caracteres.')
      return
    }
    if (passwordActual === passwordNuevo) {
      setError('La contraseña nueva tiene que ser distinta a la temporal.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`${API}/usuarios/me/password`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          password_actual: passwordActual,
          password_nuevo: passwordNuevo,
          password_nuevo_confirmacion: passwordConfirmacion,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail ?? 'No se pudo cambiar la contraseña.')
      }

      // Refresca el perfil en el contexto: requiere_cambio_password ya
      // debería venir en false, así RutaPrivada deja de redirigir para acá.
      await refreshUser()
      navigate('/socio', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 space-y-6">
        <div className="text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mb-3">
            <KeyRound size={22} className="text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Cambiá tu contraseña</h1>
          <p className="text-slate-500 mt-2 text-sm">
            Tu cuenta se creó con una contraseña temporal. Antes de seguir, elegí una nueva
            que solo vos conozcas.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type={mostrar ? 'text' : 'password'}
            placeholder="Contraseña temporal (la que te dio el club)"
            value={passwordActual}
            onChange={e => setPasswordActual(e.target.value)}
            required
            className="w-full p-3 rounded-lg border bg-slate-50 focus:border-blue-500 focus:ring-blue-500"
          />
          <div className="relative">
            <input
              type={mostrar ? 'text' : 'password'}
              placeholder="Contraseña nueva"
              value={passwordNuevo}
              onChange={e => setPasswordNuevo(e.target.value)}
              required
              className="w-full p-3 pr-10 rounded-lg border bg-slate-50 focus:border-blue-500 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => setMostrar(m => !m)}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700"
            >
              {mostrar ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
          <input
            type={mostrar ? 'text' : 'password'}
            placeholder="Repetí la contraseña nueva"
            value={passwordConfirmacion}
            onChange={e => setPasswordConfirmacion(e.target.value)}
            required
            className="w-full p-3 rounded-lg border bg-slate-50 focus:border-blue-500 focus:ring-blue-500"
          />

          {error && <p className="text-red-500 text-sm text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-3 px-4 rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Guardando…' : 'Cambiar contraseña y continuar'}
          </button>
        </form>
      </div>
    </div>
  )
}