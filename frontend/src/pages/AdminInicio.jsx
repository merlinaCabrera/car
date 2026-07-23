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
 *   - GET /admin/usuarios/pendientes            → solicitudes de alta
 *   - GET /admin/ordenes/pendientes/count        → pagos por verificar
 *   - GET /admin/ordenes/pendientes-tienda/count → pedidos de tienda
 *   - GET /admin/pagos/estadisticas               → socios al día / morosos
 *   - GET /admin/dashboard/resumen                → ingresos del mes,
 *     comercios/catálogo activos, reservas sin reparto, próximos eventos
 *     (agregado nuevo, pensado específicamente para este panel — ver
 *     routers/admin_dashboard.py)
 */

import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { useAdminResource } from '../hooks/useAdminResource'
import MetricCard from '../components/admin/MetricCard'
import {
  LayoutDashboard,
  ScanLine,
  UserPlus,
  CreditCard,
  ShoppingBag,
  Store,
  Package,
  Calendar,
  Wallet,
  CalendarDays,
  MapPin,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'

const formatoARS = (monto) =>
  Number(monto ?? 0).toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })

const formatoFechaCorta = (iso) =>
  new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function AdminInicio() {
  const { user } = useAuth()
  const navigate = useNavigate()

  // ── Tareas pendientes (mismo criterio que antes) ─────────────────────────
  const solicitudes = useAdminResource('/admin/usuarios/pendientes', {
    transform: (data) => (Array.isArray(data) ? data.length : data?.total ?? 0),
  })
  const pagosPendientes = useAdminResource('/admin/ordenes/pendientes/count')
  const ordenesTienda = useAdminResource('/admin/ordenes/pendientes-tienda/count')

  // ── Estado financiero global ───────────────────────────────────────────────
  const estadisticasPagos = useAdminResource('/admin/pagos/estadisticas')

  // ── Resumen agregado: ingresos, catálogo, comercios, reservas, eventos ────
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

      {/* CTA principal: Lector de QR */}
      <button
        onClick={() => navigate('/admin/escaner')}
        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-6 px-4 rounded-2xl shadow-md transition-all active:scale-[0.99] text-base md:text-lg flex items-center justify-center gap-3"
      >
        <ScanLine size={22} />
        Lector de QR — Control de Acceso
      </button>

      {/* ── Tareas pendientes de revisión ──────────────────────────────────── */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Pendientes de revisión
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard
            icon={UserPlus}
            iconColor="bg-amber-100 text-amber-700"
            titulo="Solicitudes de Socios"
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
            titulo="Pagos por Verificar"
            descripcion={
              !pagosPendientes.loading && !pagosPendientes.error && pagosPendientes.data === 0
                ? 'No hay pagos pendientes.'
                : 'Transferencias esperando aprobación.'
            }
            valor={pagosPendientes.data ?? 0}
            loading={pagosPendientes.loading}
            error={pagosPendientes.error}
            ctaLabel="Ir a Pagos"
            ctaPath="/admin/pagos"
          />

          <MetricCard
            icon={ShoppingBag}
            iconColor="bg-blue-100 text-blue-700"
            titulo="Órdenes de Tienda"
            descripcion={
              !ordenesTienda.loading && !ordenesTienda.error && ordenesTienda.data === 0
                ? 'No hay pedidos pendientes.'
                : 'Indumentaria y alquileres esperando aprobación.'
            }
            valor={ordenesTienda.data ?? 0}
            loading={ordenesTienda.loading}
            error={ordenesTienda.error}
            ctaLabel="Ir a Tienda"
            ctaPath="/admin/tienda"
          />
        </div>
      </div>

      {/* ── Gestión operativa ───────────────────────────────────────────────── */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Gestión operativa
        </h2>
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
            icon={Calendar}
            iconColor={
              resumen.data?.reservas_sin_reparto > 0
                ? 'bg-red-100 text-red-700'
                : 'bg-emerald-100 text-emerald-700'
            }
            titulo="Reservas sin Reparto"
            descripcion={
              !resumen.loading && !resumen.error && resumen.data?.reservas_sin_reparto === 0
                ? 'Todas las reservas activas tienen reintegro configurado.'
                : 'Turnos confirmados sin reintegro QR configurado — el escáner de canchas los va a rechazar.'
            }
            valor={resumen.data?.reservas_sin_reparto ?? 0}
            loading={resumen.loading}
            error={resumen.error}
            ctaLabel="Ir a Reservas"
            ctaPath="/admin/reservas"
          />
        </div>
      </div>

      {/* ── Panorama general ────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Panorama general
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Ingresos del mes */}
          <MetricCard
            icon={Wallet}
            iconColor="bg-green-100 text-green-700"
            titulo="Ingresos del Mes"
            loading={resumen.loading}
            error={resumen.error}
            ctaLabel="Ir a Tesorería"
            ctaPath="/admin/pagos"
          >
            <p className="text-3xl font-bold text-gray-900">
              {formatoARS(resumen.data?.ingresos_mes)}
            </p>
            <p className="text-sm text-gray-400 mt-1 capitalize">
              Órdenes aprobadas en {resumen.data?.mes_label}.
            </p>

            {estadisticasPagos.data && !estadisticasPagos.loading && (
              <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                  <CheckCircle2 size={15} />
                  {estadisticasPagos.data.total_socios_al_dia} al día
                </span>
                <span className="flex items-center gap-1.5 text-sm font-semibold text-red-600">
                  <AlertTriangle size={15} />
                  {estadisticasPagos.data.total_socios_morosos} morosos
                </span>
              </div>
            )}
          </MetricCard>

          {/* Próximos eventos */}
          <MetricCard
            icon={CalendarDays}
            iconColor="bg-indigo-100 text-indigo-700"
            titulo="Próximos Eventos"
            loading={resumen.loading}
            error={resumen.error}
            ctaLabel="Ver agenda de eventos"
            ctaPath="/gestion-eventos"
          >
            {resumen.data?.proximos_eventos?.length > 0 ? (
              <ul className="space-y-2 mt-1">
                {resumen.data.proximos_eventos.map((ev) => (
                  <li key={ev.id_evento} className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-gray-800 truncate">{ev.titulo}</span>
                    <span className="flex items-center gap-3 text-gray-400 flex-shrink-0">
                      {ev.ubicacion && (
                        <span className="flex items-center gap-1">
                          <MapPin size={12} /> {ev.ubicacion}
                        </span>
                      )}
                      <span>{formatoFechaCorta(ev.fecha_inicio)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-400 mt-1">No hay eventos programados próximamente.</p>
            )}
          </MetricCard>
        </div>
      </div>
    </div>
  )
}