// frontend/src/components/RequireRole.jsx
/**
 * Guard de ROL para grupos de rutas privadas. Va anidado dentro de <RutaPrivada>
 * (que ya resolvió "hay sesión" y "no debe cambiar la contraseña").
 *
 * Defensa en profundidad: el backend YA rechaza los datos si el rol no
 * corresponde (todos los endpoints admin usan require_roles). Esto es para que
 * un socio que escribe /admin/socios en la barra no vea una pantalla rota con
 * errores 403 por todos lados — lo mandamos a su home y listo.
 *
 * `any`: lista de roles; con tener UNO alcanza.
 */
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function rolesDeUsuario(user) {
  const fromApi = user?.roles_asignados?.map((r) => r?.rol?.nombre).filter(Boolean)
  if (fromApi?.length) return fromApi
  if (user?.roles?.length) return user.roles // string[] del token, fallback
  return []
}

function homePorRol(roles) {
  if (roles.includes('admin_general') || roles.includes('personal_administrativo')) return '/admin'
  if (roles.includes('personal_tecnico')) return '/gestion-planteles'
  if (roles.includes('socio') || roles.includes('jugador')) return '/socio'
  if (roles.includes('admin_temporal') || roles.includes('invitado')) return '/admin/escaner'
  return '/socio'
}

export default function RequireRole({ any = [] }) {
  const { user } = useAuth()
  const roles = rolesDeUsuario(user)

  const permitido = any.length === 0 || roles.some((r) => any.includes(r))
  if (!permitido) {
    return <Navigate to={homePorRol(roles)} replace />
  }
  return <Outlet />
}
