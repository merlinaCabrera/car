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

/**
 * Roles que pueden entrar a las pantallas de socio (/socio y derivadas).
 * EXPORTADO a propósito: App.jsx monta ese grupo de rutas con esta misma
 * lista, así el guard de la ruta y homePorRol() no pueden discrepar. Si
 * discreparan, homePorRol mandaría a alguien a una ruta que RequireRole
 * rechaza, y RequireRole lo volvería a mandar ahí → loop infinito de redirects.
 */
export const ROLES_AREA_SOCIO = [
  'socio', 'jugador', 'admin_general', 'personal_administrativo', 'personal_tecnico',
]

/** Roles que pueden entrar a los escáneres de QR (/admin/escaner y derivadas). */
export const ROLES_AREA_ESCANER = [
  'admin_general', 'personal_administrativo', 'admin_temporal', 'invitado', 'personal_tecnico',
]

/**
 * Destino por defecto después del login (y a donde se rebota a quien entra a
 * una ruta que no le corresponde).
 *
 * REGLA DE NEGOCIO (definida en la ronda 2 de QA, BUG-01): el ÚNICO rol que
 * aterriza en /admin es `admin_general`. Todos los demás caen en /socio por
 * defecto, sin importar cuántos roles más tengan — sus herramientas
 * específicas (verificaciones, planteles, escáneres) se abren desde el menú,
 * no como landing automático.
 *
 * Antes bastaba con tener `personal_administrativo` para aterrizar en /admin,
 * y `personal_tecnico` iba a /gestion-planteles. Eso hacía que una cuenta que
 * era socio Y tenía algún rol de staff nunca viera su propia home de socio.
 * Por eso el síntoma se veía "inconsistente entre cuentas con el mismo rol":
 * dependía de los OTROS roles que arrastrara cada DNI.
 */
export function homePorRol(roles) {
  if (roles.includes('admin_general')) return '/admin'

  // El resto va a /socio, salvo que su rol no tenga acceso a esa área (un
  // portero `admin_temporal` puro, o un `invitado` de comercio): a esos
  // mandarlos a /socio sería mandarlos a una pantalla que el guard rechaza.
  if (roles.some((r) => ROLES_AREA_SOCIO.includes(r))) return '/socio'
  if (roles.some((r) => ROLES_AREA_ESCANER.includes(r))) return '/admin/escaner'

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
