// frontend/src/components/RutaPrivada.jsx
/**
 * Guard de sesión para las rutas privadas (Outlet de MainLayout).
 *
 * Antes de esto, visitar un link tipo /admin/solicitudes sin ninguna sesión
 * abierta en el navegador (ej: clickeando el link "Revisar Solicitudes" del
 * mail al club, desde un navegador donde nadie está logueado) rendereaba la
 * página protegida igual, con `user` en null — resultado: un menú roto que
 * obligaba a cerrar sesión manualmente e ir al inicio para poder loguearse.
 *
 * Ahora: si no hay token, redirige directo a /login, guardando a dónde
 * quería ir en el query param `next` — así, apenas loguea, Login.jsx la
 * manda ahí en vez de al home genérico por rol.
 */
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function RutaPrivada() {
  const { token, user } = useAuth()
  const location = useLocation()

  if (!token) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }

  // Cuenta creada manualmente con contraseña temporal: no la dejamos
  // navegar a nada hasta que la cambie (salvo que ya esté en esa pantalla).
  if (user?.requiere_cambio_password && location.pathname !== '/cambiar-password-obligatorio') {
    return <Navigate to="/cambiar-password-obligatorio" replace />
  }

  return <Outlet />
}