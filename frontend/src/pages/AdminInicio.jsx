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
 * Las 3 llamadas de "pendientes de aprobar" se siguen pidiendo por
 * separado (son baratas y ya existían), pero se muestran fusionadas en
 * UNA sola card "Verificaciones" con el desglose como subtexto — antes
 * eran 3 cards que apuntaban cada una a su propia página
 * (AdminPagos/AdminTienda/AdminAlquileres); ahora las 3 quedaron
 * unificadas en /admin/verificaciones, así que tres cards separadas ya
 * no tenían sentido.
 *
 * Deliberadamente NO incluye "Ingresos del Mes" ni desglose de socios al
 * día/morosos — viven en /admin/estadisticas (AdminEstadisticas.jsx),
 * accesible con el link "Ver reportes" del header. Ese panel es
 * retrospectivo (cómo venimos este mes/año); este es un to-do (qué
 * necesita tu atención hoy) — se mantienen separados a propósito.
 *
 * ── Aviso de cuota por mail ──────────────────────────────────────────────
 * El único botón de esta pantalla que ESCRIBE algo (todo lo demás son
 * contadores con un link). Dispara POST /admin/cuotas/aviso-mail-masivo, que
 * le manda el recordatorio a cada socio moroso usando la plantilla editable
 * de /admin/productos. Va acá y no en /admin/socios porque es una acción
 * sobre el padrón entero, no sobre una fila — y porque el panel es
 * justamente el lugar donde el admin decide qué hacer hoy.
 *
 * "Reservas sin Reparto" (turnos confirmados sin reintegro QR configurado)
 * ya NO vive acá: es un riesgo operativo, no una tarea de aprobación de
 * pago, así que se integró directo en /admin/reservas (AdminReservas.jsx),
 * que es donde se configura el reparto.
 *
 * ── Layout mobile (cambio de esta iteración) ─────────────────────────────
 * Antes ambos grids arrancaban en 1 columna y recién abrían a 2/3 desde
 * `sm:`/`md:` — en el celular (que es el uso real del admin_temporal/
 * personal_administrativo en el club) quedaba una sola columna larga.
 * Ahora:
 *   - Bloque "Pendientes de revisión": 2 columnas siempre (incluso en
 *     mobile chico), porque son solo 2 cards y entran bien lado a lado.
 *   - Bloque "Gestión operativa": 2 columnas en mobile, 3 desde `sm:`
 *     (~640px) — no se espera a `md:` (~768px) porque un mobile en
 *     horizontal o un tablet chico ya tiene lugar de sobra para 3.
 * Si en la práctica 2 columnas quedan muy apretadas para el contenido de
 * MetricCard (texto largo, números grandes), lo más simple es agregar
 * `compact` a MetricCard para esos breakpoints angostos — no lo hice acá
 * porque no tengo ese archivo en este chat; avisame si hace falta y lo
 * ajustamos juntos.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useAdminResource } from '../hooks/useAdminResource'
import MetricCard from '../components/admin/MetricCard'
import ConfirmDialog from '../components/ConfirmDialog'
import { textoError } from '../utils/errores'
import {
  LayoutDashboard,
  UserPlus,
  CreditCard,
  Store,
  Package,
  CalendarDays,
  TrendingUp,
  CalendarCheck,
  Mail,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Settings2,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'


// ─── Aviso de cuota por mail a todos los morosos ───────────────────────────
//
// Pide confirmación antes de mandar: no hay "deshacer" para 50 mails ya
// salidos, y el precio de un clic de más lo paga el club en credibilidad.
// El backend además limita a 3 disparos por hora y por IP.
function AvisoCuotaMasivo() {
  const { token } = useAuth()
  const [confirmando, setConfirmando] = useState(false)
  const [enviando,    setEnviando]    = useState(false)
  const [resultado,   setResultado]   = useState(null)
  const [error,       setError]       = useState(null)

  const enviar = async () => {
    setEnviando(true)
    setError(null)
    setResultado(null)
    try {
      const res = await fetch(`${API}/admin/cuotas/aviso-mail-masivo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(textoError(data?.detail, 'No se pudo enviar el aviso.'))
      setResultado(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setEnviando(false)
      setConfirmando(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center flex-shrink-0">
          <Mail size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-gray-900">Aviso de cuota por mail</h3>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
            Le manda el recordatorio a todos los socios morosos de una vez. Se saltean
            los que no tienen email y los que ya subieron el comprobante y esperan
            aprobación.
          </p>

          <div className="flex flex-wrap items-center gap-2 mt-3">
            <button
              onClick={() => setConfirmando(true)}
              disabled={enviando}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-60 transition-colors"
            >
              {enviando ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
              {enviando ? 'Enviando…' : 'Enviar aviso a todos'}
            </button>
            <Link
              to="/admin/productos"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 hover:underline"
            >
              <Settings2 size={14} /> Editar el mensaje
            </Link>
          </div>

          {resultado && (
            <div className="mt-3 flex items-start gap-2 p-3 rounded-xl bg-green-50 border border-green-200 text-green-800 text-xs">
              <CheckCircle2 size={15} className="flex-shrink-0 mt-px" />
              <div>
                <p className="font-semibold">{resultado.detalle}</p>
                <p className="text-green-700 mt-0.5">
                  {resultado.total_morosos} moroso{resultado.total_morosos === 1 ? '' : 's'} en total.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-3 flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
              <AlertCircle size={15} className="flex-shrink-0 mt-px" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>

      {confirmando && (
        <ConfirmDialog
          titulo="Enviar el aviso de cuota"
          mensaje={
            'Se le va a mandar un mail a cada socio moroso con email cargado. ' +
            'No se puede deshacer. ¿Seguimos?'
          }
          confirmLabel="Enviar"
          cargando={enviando}
          onConfirm={enviar}
          onCancel={() => setConfirmando(false)}
        />
      )}
    </div>
  )
}

export default function AdminInicio() {
  const { user } = useAuth()

  // ── Tareas pendientes (mismo criterio que antes) ─────────────────────────
  const solicitudes = useAdminResource('/admin/usuarios/pendientes', {
    transform: (data) => (Array.isArray(data) ? data.length : data?.total ?? 0),
  })
  // Un solo contador para las 3 bandejas que ahora viven juntas en
  // /admin/verificaciones (cuota + alquiler + compra) — antes eran 3
  // llamadas y 3 cards separadas, una por cada página vieja.
  const cuotasPendientes = useAdminResource('/admin/ordenes/pendientes/count?tipo=cuota')
  const ordenesPendientes = useAdminResource('/admin/ordenes/pendientes/count?tipo=compra')
  const alquileresPendientes = useAdminResource('/admin/ordenes/pendientes/count?tipo=alquiler')

  const verificacionesLoading = cuotasPendientes.loading || ordenesPendientes.loading || alquileresPendientes.loading
  const verificacionesError = cuotasPendientes.error || ordenesPendientes.error || alquileresPendientes.error
  const verificacionesTotal = (cuotasPendientes.data ?? 0) + (ordenesPendientes.data ?? 0) + (alquileresPendientes.data ?? 0)

  // ── Resumen agregado: catálogo, comercios, eventos ────────────────────────
  const resumen = useAdminResource('/admin/dashboard/resumen')

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-3">
            <LayoutDashboard size={24} className="text-gray-500 flex-shrink-0" />
            Panel de Control
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Hola, {user?.nombre || 'Admin'} — esto es lo que necesita tu atención hoy.
          </p>
        </div>
        <Link
          to="/admin/estadisticas"
          className="flex-shrink-0 flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700 hover:underline mt-1"
        >
          <TrendingUp size={15} /> <span className="hidden sm:inline">Ver reportes</span>
        </Link>
      </div>

      {/* ── Tareas pendientes de revisión ──────────────────────────────────── */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Pendientes de revisión
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <MetricCard
            icon={UserPlus}
            iconColor="bg-amber-50 text-amber-700"
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
            iconColor="bg-amber-50 text-amber-700"
            titulo="Verificaciones"
            descripcion={
              !verificacionesLoading && !verificacionesError && verificacionesTotal === 0
                ? 'No hay comprobantes pendientes.'
                : `${cuotasPendientes.data ?? 0} cuota${cuotasPendientes.data === 1 ? '' : 's'} · ${alquileresPendientes.data ?? 0} alquiler${alquileresPendientes.data === 1 ? '' : 'es'} · ${ordenesPendientes.data ?? 0} compra${ordenesPendientes.data === 1 ? '' : 's'}`
            }
            valor={verificacionesTotal}
            loading={verificacionesLoading}
            error={verificacionesError}
            ctaLabel="Ir a Verificaciones"
            ctaPath="/admin/verificaciones"
          />
        </div>
      </div>

      {/* ── Acción masiva sobre cuotas ─────────────────────────────────────── */}
      <AvisoCuotaMasivo />

      {/* ── Gestión operativa (sin título de sección: sigue directo abajo) ──── */}
      <div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <MetricCard
            icon={CalendarCheck}
            iconColor="bg-roberts-50 text-roberts-600"
            titulo="Alquileres"
            descripcion={
              resumen.data?.reservas_semana != null
                ? resumen.data.reservas_semana === 0
                  ? 'Sin reservas esta semana.'
                  : `${resumen.data.reservas_semana} reserva${resumen.data.reservas_semana !== 1 ? 's' : ''} programada${resumen.data.reservas_semana !== 1 ? 's' : ''} esta semana.`
                : 'Canchas y quincho — agenda de reservas.'
            }
            valor={resumen.data?.reservas_semana ?? '—'}
            valorColor="text-gray-700"
            loading={resumen.loading}
            error={resumen.error}
            ctaLabel="Ver agenda"
            ctaPath="/admin/reservas"
          />

          <MetricCard
            icon={CalendarDays}
            iconColor="bg-roberts-50 text-roberts-600"
            titulo="Eventos"
            descripcion={
              resumen.data?.proximos_eventos?.length
                ? `${resumen.data.proximos_eventos.length} próximo${resumen.data.proximos_eventos.length !== 1 ? 's' : ''} programado${resumen.data.proximos_eventos.length !== 1 ? 's' : ''}.`
                : 'Convocatorias y eventos institucionales.'
            }
            valor={resumen.data?.proximos_eventos?.length ?? 0}
            valorColor="text-gray-700"
            loading={resumen.loading}
            error={resumen.error}
            ctaLabel="Ver eventos"
            ctaPath="/gestion-eventos"
          />

          <MetricCard
            icon={Package}
            iconColor="bg-roberts-50 text-roberts-600"
            titulo="Catálogo de Productos"
            descripcion={
              resumen.data
                ? `${resumen.data.productos_activos} activos de ${resumen.data.productos_total} en total.`
                : 'Cuotas, alquileres e indumentaria.'
            }
            valor={resumen.data?.productos_activos ?? 0}
            valorColor="text-gray-700"
            loading={resumen.loading}
            error={resumen.error}
            ctaLabel="Ver catálogo"
            ctaPath="/admin/productos"
          />

          <MetricCard
            icon={Store}
            iconColor="bg-roberts-50 text-roberts-600"
            titulo="Comercios Adheridos"
            descripcion={
              resumen.data
                ? `${resumen.data.comercios_activos} activos de ${resumen.data.comercios_total} en total.`
                : 'Beneficios para socios.'
            }
            valor={resumen.data?.comercios_activos ?? 0}
            valorColor="text-gray-700"
            loading={resumen.loading}
            error={resumen.error}
            ctaLabel="Ver comercios"
            ctaPath="/admin/comercios"
          />
        </div>
      </div>

    </div>
  )
}