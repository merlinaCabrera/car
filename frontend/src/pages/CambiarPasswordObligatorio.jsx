// frontend/src/pages/CambiarPasswordObligatorio.jsx
/**
 * Pantalla forzada de cambio de contraseña — para cuentas creadas
 * manualmente por un admin (con contraseña temporal) que todavía no la
 * cambiaron. El backend ya tenía toda la lógica (requiere_cambio_password +
 * PATCH /usuarios/me/password) desde hace tiempo, pero nunca se conectó a
 * nada en el frontend — RutaPrivada redirige acá cuando detecta el flag.
 */
import { textoError } from '../utils/errores';
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { homePorRol, rolesDeUsuario } from '../components/RequireRole'
import { CheckCircle2, Eye, EyeOff, KeyRound } from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export default function CambiarPasswordObligatorio() {
  const { token, user, confirmarCambioPassword } = useAuth()
  const navigate = useNavigate()

  const [passwordActual, setPasswordActual] = useState('')
  const [passwordNuevo, setPasswordNuevo] = useState('')
  const [passwordConfirmacion, setPasswordConfirmacion] = useState('')
  const [mostrar, setMostrar] = useState(false)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [exito, setExito] = useState(false)

  // Guarda contra doble submit: `loading` es state de React (asincrónico), así
  // que un doble clic rápido entra dos veces antes de que el `disabled` llegue
  // al DOM — el segundo intento fallaría con "la contraseña actual no es
  // correcta" (porque ya la cambió el primero) y taparía el éxito con un error.
  // Mismo patrón que el resto de los botones críticos (ver BUG-03).
  const enviando = useRef(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (enviando.current) return
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

    enviando.current = true
    setLoading(true)
    try {
      const res = await fetch(`${API}/usuarios/me/password`, {
        method: 'POST',
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
        throw new Error(textoError(data?.detail, 'No se pudo cambiar la contraseña.'))
      }

      // El backend invalida los tokens emitidos ANTES del cambio y devuelve uno
      // nuevo en esta misma respuesta. Hay que adoptarlo: si siguiéramos con el
      // token viejo, el refresh del perfil daría 401 y la sesión se caería justo
      // acá (el socio quedaba pateado al login en su primer ingreso).
      const data = await res.json().catch(() => ({}))

      // Este 200 YA es la confirmación de que la contraseña cambió y de que el
      // backend puso requiere_cambio_password=false. No hace falta —ni conviene—
      // esperar un /usuarios/me para navegar: confirmarCambioPassword() adopta el
      // token nuevo y baja el flag en memoria de forma sincrónica, así
      // RutaPrivada deja pasar en el mismo tick.
      //
      // El intento anterior de arreglo (ronda 1) sí esperaba ese /usuarios/me, y
      // por eso el bug sobrevivió: si esa request fallaba o volvía tarde, el
      // `user` en memoria seguía con el flag en true, RutaPrivada rebotaba de
      // vuelta a esta pantalla y el submit parecía no hacer nada.
      const perfil = confirmarCambioPassword(data.access_token)

      // Confirmación visible antes de salir. Sin esto, si el redirect vuelve a
      // fallar por cualquier motivo, el síntoma es de nuevo "no pasó nada" y no
      // se puede distinguir "no se guardó" de "se guardó pero no navegó".
      setExito(true)

      const destino = homePorRol(rolesDeUsuario(perfil ?? user))
      navigate(destino, { replace: true })
    } catch (err) {
      // `err.message` puede venir vacío (un TypeError sin texto, por ejemplo).
      // Si se pasara vacío, el <p> de error no renderiza nada y la pantalla
      // vuelve a "no hace nada" sin explicación.
      setError(err?.message || 'No se pudo completar el cambio de contraseña. Probá de nuevo.')
    } finally {
      enviando.current = false
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 shadow-lg p-8 space-y-6">
        <div className="text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mb-3">
            <KeyRound size={22} className="text-blue-600" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">Cambiá tu contraseña</h1>
          <p className="text-gray-500 mt-2 text-sm">
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
            className="w-full p-3 rounded-xl border border-gray-300 bg-white text-gray-900 placeholder-gray-400 transition-colors focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/25"
          />
          <div className="relative">
            <input
              type={mostrar ? 'text' : 'password'}
              placeholder="Contraseña nueva"
              value={passwordNuevo}
              onChange={e => setPasswordNuevo(e.target.value)}
              required
              className="w-full p-3 pr-11 rounded-xl border border-gray-300 bg-white text-gray-900 placeholder-gray-400 transition-colors focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/25"
            />
            <button
              type="button"
              onClick={() => setMostrar(m => !m)}
              className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-gray-400 hover:text-blue-600 transition-colors"
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
            className="w-full p-3 rounded-xl border border-gray-300 bg-white text-gray-900 placeholder-gray-400 transition-colors focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/25"
          />

          {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-center">{error}</p>}

          {exito && (
            <p className="text-green-600 text-sm text-center flex items-center justify-center gap-1.5">
              <CheckCircle2 size={16} />
              Contraseña actualizada. Entrando…
            </p>
          )}

          <button
            type="submit"
            disabled={loading || exito}
            className="w-full flex justify-center py-3.5 px-4 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
          >
            {exito ? 'Listo' : loading ? 'Guardando…' : 'Cambiar contraseña y continuar'}
          </button>
        </form>
      </div>
    </div>
  )
}