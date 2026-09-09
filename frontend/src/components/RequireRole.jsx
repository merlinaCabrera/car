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

/**
 * Roles EFECTIVOS del usuario — los mismos que honra require_roles() en el
 * backend (ver dependencies.py):
 *
 *   - el rol del catálogo tiene que estar activo (rol.es_activo)
 *   - la asignación no tiene que estar vencida (valido_hasta > ahora, o NULL)
 *
 * Antes acá se tomaba `roles_asignados` crudo, sin filtrar ninguna de las dos
 * cosas. Consecuencia (BUG-01 de la QA del 08-09): una cuenta con una
 * asignación vieja de admin —desactivada o vencida— caía en /admin después
 * del login y veía el shell del panel con todas las métricas en "error al
 * cargar", porque el backend sí filtraba y devolvía 403. Se veía inconsistente
 * entre cuentas justamente porque dependía de qué asignaciones viejas tuviera
 * cada una.
 */
export function rolesDeUsuario(user) {
  const asignados = user?.roles_asignados ?? []
  const ahora = Date.now()

  const efectivos = asignados
    .filter((ur) => {
      if (ur?.rol?.es_activo === false) return false
      if (!ur?.valido_hasta) return true
      const vence = new Date(ur.valido_hasta).getTime()
      return Number.isNaN(vence) ? true : vence > ahora
    })
    .map((ur) => ur?.rol?.nombre)
    .filter(Boolean)

  if (efectivos.length) return efectivos
  if (user?.roles?.length) return user.roles // string[] del token, fallback
  return []
}

export function homePorRol(roles) {
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
