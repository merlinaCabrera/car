// frontend/src/pages/AdminInicio.jsx
/**
 * Panel de Control del administrador general — ruta `/admin`.
 *
 * Reescrito para cubrir TODO lo que un admin general gestiona (antes solo
 * mostraba solicitudes/pagos/tienda) y para dejar de repetir el patrón
 * fetch+loading+error a mano en cada página: ahora usa `useAdminResource`
 * (src/hooks/useAdminResource.js) y `MetricCard` (src/components/admin/
 * MetricCard.jsx), reutilizables desde cualquier otra pantalla de admin.
 *
 * Fuentes de datos (5 llamadas en paralelo, cada una con su propio
 * loading/error independiente — si una falla, el resto del panel sigue
 * usable):
 *   - GET /admin/usuarios/pendientes                        → solicitudes de alta (card "Socios")
 *   - GET /admin/ordenes/pendientes/count?tipo=cuota         → cuotas pendientes de aprobar
 *   - GET /admin/ordenes/pendientes/count?tipo=compra        → indumentaria/otros pendientes de aprobar
 *   - GET /admin/ordenes/pendientes/count?tipo=alquiler      → alquileres pendientes de aprobar
 *   - GET /admin/dashboard/resumen                           → comercios/catálogo
 *     activos y próximos eventos (ver routers/admin_dashboard.py)
 *
 * Deliberadamente NO incluye "Ingresos del Mes" ni desglose de socios al
 * día/morosos — se sacaron de este panel (quedaba mezclado con las tareas
 * accionables de arriba). Si en el futuro se arma una pantalla de reportes
 * tipo BI, ese es el lugar natural para esos números.
 *
 * "Reservas sin Reparto" (turnos confirmados sin reintegro QR configurado)
 * ya NO vive acá: es un riesgo operativo, no una tarea de aprobación de
 * pago, así que se integró directo en /admin/reservas (AdminReservas.jsx),
 * que es donde se configura el reparto.
 */

import { useAuth } from '../context/AuthContext'
import { useAdminResource } from '../hooks/useAdminResource'
import MetricCard from '../components/admin/MetricCard'
import {
  LayoutDashboard,
  UserPlus,
  CreditCard,
  ShoppingBag,
  Home,
  Store,
  Package,
  CalendarDays,
} from 'lucide-react'

export default function AdminInicio() {
  const { user } = useAuth()

  // ── Tareas pendientes (mismo criterio que antes) ─────────────────────────
  const solicitudes = useAdminResource('/admin/usuarios/pendientes', {
    transform: (data) => (Array.isArray(data) ? data.length : data?.total ?? 0),
  })
  const cuotasPendientes = useAdminResource('/admin/ordenes/pendientes/count?tipo=cuota')
  const ordenesPendientes = useAdminResource('/admin/ordenes/pendientes/count?tipo=compra')
  const alquileresPendientes = useAdminResource('/admin/ordenes/pendientes/count?tipo=alquiler')

  // ── Resumen agregado: catálogo, comercios, eventos ────────────────────────
  const resumen = useAdminResource('/admin/dashboard/resumen')

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
          <LayoutDashboard size={24} className="text-gray-500" />
          Panel de Control
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Hola, {user?.nombre || 'Admin'} — esto es lo que necesita tu atención hoy.
        </p>
      </div>

      {/* ── Tareas pendientes de revisión ──────────────────────────────────── */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Pendientes de revisión
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            icon={UserPlus}
            iconColor="bg-amber-100 text-amber-700"
            titulo="Socios"
            descripcion={
              !solicitudes.loading && !solicitudes.error && solicitudes.data === 0
                ? 'No hay solicitudes pendientes.'
                : 'Altas nuevas esperando revisión.'
            }
            valor={solicitudes.data ?? 0}
            loading={solicitudes.loading}
            error={solicitudes.error}
            ctaLabel={solicitudes.data > 0 ? 'Revisar solicitudes' : 'Ver socios'}
            ctaPath="/admin/socios"
          />

          <MetricCard
            icon={CreditCard}
            iconColor="bg-orange-100 text-orange-700"
            titulo="Cuotas"
            descripcion={
              !cuotasPendientes.loading && !cuotasPendientes.error && cuotasPendientes.data === 0
                ? 'No hay pagos de cuota pendientes.'
                : 'Pagos de cuota social esperando aprobación.'
            }
            valor={cuotasPendientes.data ?? 0}
            loading={cuotasPendientes.loading}
            error={cuotasPendientes.error}
            ctaLabel="Ir a Cuotas"
            ctaPath="/admin/pagos"
          />

          <MetricCard
            icon={ShoppingBag}
            iconColor="bg-blue-100 text-blue-700"
            titulo="Órdenes"
            descripcion={
              !ordenesPendientes.loading && !ordenesPendientes.error && ordenesPendientes.data === 0
                ? 'No hay pedidos pendientes.'
                : 'Indumentaria y otros esperando aprobación.'
            }
            valor={ordenesPendientes.data ?? 0}
            loading={ordenesPendientes.loading}
            error={ordenesPendientes.error}
            ctaLabel="Ir a Órdenes"
            ctaPath="/admin/tienda"
          />

          <MetricCard
            icon={Home}
            iconColor="bg-violet-100 text-violet-700"
            titulo="Alquileres"
            descripcion={
              !alquileresPendientes.loading && !alquileresPendientes.error && alquileresPendientes.data === 0
                ? 'No hay pagos de alquiler pendientes.'
                : 'Alquileres de quincho y cancha esperando aprobación.'
            }
            valor={alquileresPendientes.data ?? 0}
            loading={alquileresPendientes.loading}
            error={alquileresPendientes.error}
            ctaLabel="Ir a Alquileres"
            ctaPath="/admin/alquileres"
          />
        </div>
      </div>

      {/* ── Gestión operativa (sin título de sección: sigue directo abajo) ──── */}
      <div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard
            icon={Store}
            iconColor="bg-purple-100 text-purple-700"
            titulo="Comercios Adheridos"
            descripcion={
              resumen.data
                ? `${resumen.data.comercios_activos} activos de ${resumen.data.comercios_total} en total.`
                : 'Beneficios para socios.'
            }
            valor={resumen.data?.comercios_activos ?? 0}
            loading={resumen.loading}
            error={resumen.error}
            ctaLabel="Ver comercios"
            ctaPath="/admin/comercios"
          />

          <MetricCard
            icon={Package}
            iconColor="bg-teal-100 text-teal-700"
            titulo="Catálogo de Productos"
            descripcion={
              resumen.data
                ? `${resumen.data.productos_activos} activos de ${resumen.data.productos_total} en total.`
                : 'Cuotas, alquileres e indumentaria.'
            }
            valor={resumen.data?.productos_activos ?? 0}
            loading={resumen.loading}
            error={resumen.error}
            ctaLabel="Ver catálogo"
            ctaPath="/admin/productos"
          />

          <MetricCard
            icon={CalendarDays}
            iconColor="bg-indigo-100 text-indigo-700"
            titulo="Eventos"
            descripcion={
              resumen.data?.proximos_eventos?.length
                ? `${resumen.data.proximos_eventos.length} próximo${resumen.data.proximos_eventos.length !== 1 ? 's' : ''} programado${resumen.data.proximos_eventos.length !== 1 ? 's' : ''}.`
                : 'Convocatorias y eventos institucionales.'
            }
            valor={resumen.data?.proximos_eventos?.length ?? 0}
            loading={resumen.loading}
            error={resumen.error}
            ctaLabel="Ver eventos"
            ctaPath="/gestion-eventos"
          />
        </div>
      </div>

    </div>
  )
}