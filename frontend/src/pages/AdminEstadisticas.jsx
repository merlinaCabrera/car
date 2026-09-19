// frontend/src/pages/AdminEstadisticas.jsx
/**
 * Panel de Estadísticas — ruta `/admin/estadisticas`.
 *
 * Complemento del Panel de Control (`/admin`): mientras ese es un "to-do"
 * (qué necesita tu atención hoy), este es retrospectivo (cómo venimos este
 * mes/año). Se mantienen separados a propósito — ver la conversación en la
 * que se decidió esto para más contexto.
 *
 * Estructura en pestañas (SOCIOS / COMPRAS / EVENTOS): cada pestaña pide
 * solo los endpoints que necesita, así que cambiar de pestaña no dispara
 * fetches de las otras dos. Evita mezclar en una sola pantalla métricas de
 * naturaleza distinta (padrón, plata, actividad deportiva) — cada una tiene
 * su propio ritmo y su propia audiencia dentro del club.
 *
 * No se agregó ninguna librería de gráficos nueva al proyecto (no había
 * ninguna instalada): los gráficos son SVG a mano, livianos y sin
 * dependencias, en línea con el resto del proyecto.
 *
 * Backend consumido:
 *   GET /admin/dashboard/estadisticas         → (pestaña Compras) ingresos por
 *     mes desglosados en cuotas/compras/alquileres, variación % vs. mes
 *     anterior, y top 5 productos más vendidos (30 días).
 *   GET /admin/dashboard/estadisticas-socios  → (pestaña Socios) composición
 *     del padrón: altas/bajas de los últimos 30 días, becados, adherentes,
 *     desglose por rol.
 *   GET /admin/dashboard/estadisticas-eventos → (pestaña Eventos) actividad
 *     deportiva/institucional: eventos por tipo, asistencia promedio,
 *     convocatorias sin responder.
 *   GET /admin/pagos/estadisticas             → (pestaña Socios) socios al
 *     día vs. morosos, deuda total estimada (mismo endpoint que ya se usaba
 *     antes en el Panel de Control, antes de que este resumen financiero se
 *     mudara acá).
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  LayoutDashboard,
  TrendingUp,
  TrendingDown,
  Minus,
  Wallet,
  CheckCircle2,
  AlertTriangle,
  Package,
  RefreshCw,
  Users,
  ShoppingBag,
  CalendarDays,
  UserPlus,
  UserMinus,
  GraduationCap,
  Trophy,
  ClipboardList,
} from 'lucide-react'
import { useAdminResource } from '../hooks/useAdminResource'

const formatoARS = (monto) =>
  Number(monto ?? 0).toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })

const COLOR_CUOTAS = '#183F7C'     // Azul Roberts — mismo espíritu que la card "Cuotas"
const COLOR_COMPRAS = '#26348C'    // Azul Camotí  — mismo espíritu que la card "Órdenes"
const COLOR_ALQUILERES = '#6B7BA0' // Azul Francia claro — card "Alquileres"

const ROL_LABEL = {
  admin_general: 'Admin general',
  personal_administrativo: 'Personal administrativo',
  personal_tecnico: 'Personal técnico',
  jugador: 'Jugador',
  admin_temporal: 'Escáner general',
  invitado: 'Invitado',
  socio: 'Socio',
}

const TIPO_EVENTO_LABEL = {
  partido: 'Partidos',
  torneo: 'Torneos',
  entrenamiento: 'Entrenamientos',
  institucional: 'Institucionales',
  otro: 'Otros',
}

const TABS = [
  { key: 'socios', label: 'Socios', icon: Users },
  { key: 'compras', label: 'Compras', icon: ShoppingBag },
  { key: 'eventos', label: 'Eventos', icon: CalendarDays },
]

export default function AdminEstadisticas() {
  const [tab, setTab] = useState('socios')

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <TrendingUp size={22} className="text-gray-700 flex-shrink-0" />
            Estadísticas
          </h1>
        </div>
        <p className="text-sm text-gray-500 mt-1">Cómo viene el club, separado por área.</p>
        <Link to="/admin" className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1 mt-1">
          <LayoutDashboard size={13} /> Volver al Panel de Control
        </Link>
      </div>

      {/* Filtro de vistas */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 w-full sm:w-fit overflow-x-auto">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
              tab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'socios' && <VistaSocios />}
      {tab === 'compras' && <VistaCompras />}
      {tab === 'eventos' && <VistaEventos />}
    </div>
  )
}

// ─── Piezas compartidas ─────────────────────────────────────────────────────

function EncabezadoVista({ texto, onActualizar }) {
  return (
    <div className="flex items-center justify-between -mb-1">
      <p className="text-sm text-gray-400">{texto}</p>
      <button
        onClick={onActualizar}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <RefreshCw size={13} /> Actualizar
      </button>
    </div>
  )
}

function KpiCard({ icon: Icon, iconColor, titulo, loading, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${iconColor}`}>
        <Icon size={17} />
      </div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{titulo}</p>
      {loading ? <div className="h-8 w-24 bg-gray-100 rounded animate-pulse" /> : children}
    </div>
  )
}

function EstadoVacio({ texto }) {
  return (
    <div className="h-40 flex items-center justify-center text-sm text-gray-400 text-center px-6">
      {texto}
    </div>
  )
}

function ErrorAviso() {
  return (
    <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-2xl p-4">
      No se pudieron cargar las estadísticas. Probá actualizar la página.
    </div>
  )
}

// ─── SOCIOS ─────────────────────────────────────────────────────────────────

function VistaSocios() {
  const socios = useAdminResource('/admin/dashboard/estadisticas-socios')
  const pagos = useAdminResource('/admin/pagos/estadisticas')

  const loading = socios.loading || pagos.loading
  const error = socios.error || pagos.error

  const alDia = pagos.data?.total_socios_al_dia ?? 0
  const morosos = pagos.data?.total_socios_morosos ?? 0

  return (
    <div className="space-y-4">
      <EncabezadoVista
        texto="Composición y estado financiero del padrón."
        onActualizar={() => { socios.refetch(); pagos.refetch() }}
      />
      {error && <ErrorAviso />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard icon={Users} iconColor="bg-francia-100 text-francia-700" titulo="Socios activos" loading={loading}>
          <p className="text-2xl font-bold text-gray-900">{socios.data?.total_activos ?? 0}</p>
          <p className="text-sm text-gray-400 mt-1">{socios.data?.adherentes ?? 0} adherentes.</p>
        </KpiCard>

        <KpiCard icon={UserPlus} iconColor="bg-green-100 text-green-700" titulo="Altas (30 días)" loading={loading}>
          <p className="text-2xl font-bold text-gray-900">{socios.data?.altas_30_dias ?? 0}</p>
          <p className="text-sm text-gray-400 mt-1 flex items-center gap-1">
            <UserMinus size={12} /> {socios.data?.bajas_30_dias ?? 0} bajas
          </p>
        </KpiCard>

        <KpiCard icon={AlertTriangle} iconColor="bg-red-100 text-red-700" titulo="Deuda estimada" loading={loading}>
          <p className="text-2xl font-bold text-gray-900">{formatoARS(pagos.data?.deuda_total_estimada)}</p>
          <p className="text-sm text-gray-400 mt-1">{morosos} en mora.</p>
        </KpiCard>

        <KpiCard icon={GraduationCap} iconColor="bg-amber-100 text-amber-700" titulo="Becados activos" loading={loading}>
          <p className="text-2xl font-bold text-gray-900">{socios.data?.becados_activos ?? 0}</p>
        </KpiCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5">
          <h2 className="font-bold text-gray-900 mb-1 flex items-center gap-2">
            <CheckCircle2 size={17} /> Estado de cuota
          </h2>
          <p className="text-sm text-gray-400 mb-3">Al día vs. en mora, sobre socios activos.</p>
          {loading ? (
            <div className="h-40 animate-pulse bg-gray-100 rounded-xl" />
          ) : alDia + morosos === 0 ? (
            <EstadoVacio texto="No hay socios activos para mostrar." />
          ) : (
            <DonutSocios alDia={alDia} morosos={morosos} />
          )}
        </div>

        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5">
          <h2 className="font-bold text-gray-900 mb-1">Socios por rol</h2>
          <p className="text-sm text-gray-400 mb-3">
            Roles activos entre los {socios.data?.total_activos ?? 0} socios del padrón. Un socio puede tener varios.
          </p>
          {loading ? (
            <div className="h-40 animate-pulse bg-gray-100 rounded-xl" />
          ) : (socios.data?.por_rol?.length ?? 0) === 0 ? (
            <EstadoVacio texto="No hay roles asignados todavía." />
          ) : (
            <BarrasRoles roles={socios.data.por_rol} />
          )}
        </div>
      </div>
    </div>
  )
}

function BarrasRoles({ roles }) {
  const max = Math.max(...roles.map((r) => r.cantidad), 1)
  return (
    <div className="space-y-3">
      {roles.map((r) => (
        <div key={r.rol}>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="font-medium text-gray-700">{ROL_LABEL[r.rol] ?? r.rol}</span>
            <span className="text-gray-400 flex-shrink-0">{r.cantidad}</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-francia-600"
              style={{ width: `${(r.cantidad / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function DonutSocios({ alDia, morosos }) {
  const total = alDia + morosos
  const RADIO = 60
  const GROSOR = 18
  const CIRCUNFERENCIA = 2 * Math.PI * RADIO
  const fraccionAlDia = alDia / total
  const largoAlDia = fraccionAlDia * CIRCUNFERENCIA

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
      <svg
        viewBox="0 0 150 150"
        className="w-32 h-32 sm:w-36 sm:h-36 flex-shrink-0"
        role="img"
        aria-label="Socios al día vs. morosos"
      >
        <g transform="translate(75, 75) rotate(-90)">
          <circle r={RADIO} fill="none" stroke="#E2E5E9" strokeWidth={GROSOR} />
          <circle
            r={RADIO}
            fill="none"
            stroke="#2F6B4F"
            strokeWidth={GROSOR}
            strokeDasharray={`${largoAlDia} ${CIRCUNFERENCIA - largoAlDia}`}
            strokeLinecap={fraccionAlDia > 0 && fraccionAlDia < 1 ? 'butt' : 'round'}
          />
        </g>
        <text x="75" y="70" textAnchor="middle" fontSize="22" fontWeight="700" fill="#1C1F2D">
          {Math.round(fraccionAlDia * 100)}%
        </text>
        <text x="75" y="88" textAnchor="middle" fontSize="10" fill="#98A0AE">al día</text>
      </svg>
      <div className="space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
          <span className="font-semibold text-gray-800">{alDia}</span>
          <span className="text-gray-400">al día</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-red-200" />
          <span className="font-semibold text-gray-800">{morosos}</span>
          <span className="text-gray-400">morosos</span>
        </div>
      </div>
    </div>
  )
}

// ─── COMPRAS ────────────────────────────────────────────────────────────────

function VistaCompras() {
  const [rangoMeses, setRangoMeses] = useState(6)
  const [ocultas, setOcultas] = useState(() => new Set())

  const estadisticas = useAdminResource(`/admin/dashboard/estadisticas?meses=${rangoMeses}`)

  const toggleCategoria = (key) => {
    setOcultas((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const loading = estadisticas.loading
  const error = estadisticas.error
  const meses = estadisticas.data?.ingresos_por_mes ?? []
  const mesActual = meses[meses.length - 1]
  const variacion = estadisticas.data?.variacion_mes_pct

  return (
    <div className="space-y-4">
      <EncabezadoVista
        texto={`Ingresos y ventas, últimos ${meses.length || rangoMeses} meses.`}
        onActualizar={estadisticas.refetch}
      />
      {error && <ErrorAviso />}

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <KpiCard icon={Wallet} iconColor="bg-green-100 text-green-700" titulo="Ingresos de este mes" loading={loading}>
          <p className="text-2xl font-bold text-gray-900">{formatoARS(mesActual?.total)}</p>
          <VariacionBadge variacion={variacion} />
        </KpiCard>

        <KpiCard icon={Package} iconColor="bg-francia-100 text-francia-700" titulo="Producto más vendido" loading={loading}>
          <p className="text-lg font-bold text-gray-900 truncate">
            {estadisticas.data?.productos_mas_vendidos?.[0]?.nombre ?? '—'}
          </p>
          <p className="text-sm text-gray-400 mt-1">
            {estadisticas.data?.productos_mas_vendidos?.[0]?.unidades ?? 0} unidades (30 días).
          </p>
        </KpiCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5">
          <div className="flex flex-col gap-2 mb-1">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <h2 className="font-bold text-gray-900">Ingresos por mes</h2>
              <SelectorRango valor={rangoMeses} onCambiar={setRangoMeses} />
            </div>
            <Leyenda ocultas={ocultas} onToggle={toggleCategoria} />
          </div>
          <p className="text-sm text-gray-400 mb-3">
            Órdenes aprobadas, últimos {meses.length || rangoMeses} meses. Tocá una categoría para ocultarla.
          </p>
          {loading ? (
            <div className="h-52 animate-pulse bg-gray-100 rounded-xl" />
          ) : meses.length === 0 ? (
            <EstadoVacio texto="Todavía no hay órdenes aprobadas para graficar." />
          ) : (
            <GraficoBarrasApiladas meses={meses} ocultas={ocultas} />
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5">
          <h2 className="font-bold text-gray-900 mb-1 flex items-center gap-2">
            <Package size={17} /> Más vendidos
          </h2>
          <p className="text-sm text-gray-400 mb-3">Últimos 30 días.</p>
          {loading ? (
            <div className="h-52 animate-pulse bg-gray-100 rounded-xl" />
          ) : (estadisticas.data?.productos_mas_vendidos?.length ?? 0) === 0 ? (
            <EstadoVacio texto="No hubo ventas en los últimos 30 días." />
          ) : (
            <TopProductos productos={estadisticas.data.productos_mas_vendidos} />
          )}
        </div>
      </div>
    </div>
  )
}

function VariacionBadge({ variacion }) {
  if (variacion === null || variacion === undefined) {
    return <p className="text-sm text-gray-400 mt-1">Sin datos del mes anterior para comparar.</p>
  }
  const subio = Number(variacion) > 0
  const igual = Number(variacion) === 0
  const Icono = igual ? Minus : subio ? TrendingUp : TrendingDown
  const color = igual ? 'text-gray-400' : subio ? 'text-green-600' : 'text-red-600'
  return (
    <p className={`text-sm font-semibold mt-1 flex items-center gap-1 ${color}`}>
      <Icono size={14} />
      {subio ? '+' : ''}{variacion}% vs. mes anterior
    </p>
  )
}

function SelectorRango({ valor, onCambiar }) {
  const opciones = [
    { meses: 3, label: '3M' },
    { meses: 6, label: '6M' },
    { meses: 12, label: '12M' },
  ]
  return (
    <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5 self-start">
      {opciones.map((op) => (
        <button
          key={op.meses}
          onClick={() => onCambiar(op.meses)}
          className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
            valor === op.meses ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {op.label}
        </button>
      ))}
    </div>
  )
}

function Leyenda({ ocultas, onToggle }) {
  const items = [
    { key: 'cuotas', color: COLOR_CUOTAS, label: 'Cuotas' },
    { key: 'compras', color: COLOR_COMPRAS, label: 'Compras' },
    { key: 'alquileres', color: COLOR_ALQUILERES, label: 'Alquileres' },
  ]
  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
      {items.map((it) => {
        const oculta = ocultas.has(it.key)
        return (
          <button
            key={it.key}
            onClick={() => onToggle(it.key)}
            className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-lg transition-colors ${
              oculta ? 'text-gray-300 hover:bg-gray-50' : 'text-gray-500 hover:bg-gray-100'
            }`}
            title={oculta ? `Mostrar ${it.label}` : `Ocultar ${it.label}`}
          >
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: oculta ? '#E2E5E9' : it.color }}
            />
            <span className={oculta ? 'line-through decoration-gray-300' : ''}>{it.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ─── Gráfico de barras apiladas (ingresos por mes) ─────────────────────────
// SVG a mano: cada mes es una barra con 3 segmentos apilados (cuotas /
// compras / alquileres). Sin dependencias externas.

function GraficoBarrasApiladas({ meses, ocultas }) {
  const ANCHO = 700
  const ALTO = 210
  const PAD_IZQ = 46
  const PAD_INF = 26
  const PAD_SUP = 10
  const anchoUtil = ANCHO - PAD_IZQ - 12
  const altoUtil = ALTO - PAD_INF - PAD_SUP

  const totalVisible = (m) =>
    (ocultas.has('cuotas') ? 0 : Number(m.cuotas)) +
    (ocultas.has('compras') ? 0 : Number(m.compras)) +
    (ocultas.has('alquileres') ? 0 : Number(m.alquileres))

  const maxTotal = Math.max(...meses.map(totalVisible), 1)
  const techo = techoLindo(maxTotal)

  const anchoBarra = (anchoUtil / meses.length) * 0.55
  const paso = anchoUtil / meses.length

  const escalaY = (valor) => (Number(valor) / techo) * altoUtil

  const marcasY = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(techo * f))

  return (
    <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} className="w-full h-52" role="img" aria-label="Ingresos por mes">
      {marcasY.map((valor) => {
        const y = PAD_SUP + altoUtil - escalaY(valor)
        return (
          <g key={valor}>
            <line x1={PAD_IZQ} y1={y} x2={ANCHO - 8} y2={y} stroke="#EFF1F3" strokeWidth="1" />
            <text x={PAD_IZQ - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#98A0AE">
              {valor >= 1000 ? `${Math.round(valor / 1000)}k` : valor}
            </text>
          </g>
        )
      })}

      {meses.map((m, i) => {
        const x = PAD_IZQ + i * paso + (paso - anchoBarra) / 2
        const segmentos = [
          { key: 'cuotas', valor: Number(m.cuotas), color: COLOR_CUOTAS },
          { key: 'compras', valor: Number(m.compras), color: COLOR_COMPRAS },
          { key: 'alquileres', valor: Number(m.alquileres), color: COLOR_ALQUILERES },
        ].filter((seg) => !ocultas.has(seg.key))
        let yAcumulado = PAD_SUP + altoUtil
        return (
          <g key={m.mes_label + i}>
            {segmentos.map((seg, j) => {
              if (seg.valor <= 0) return null
              const alto = escalaY(seg.valor)
              yAcumulado -= alto
              return (
                <rect key={j} x={x} y={yAcumulado} width={anchoBarra} height={alto} fill={seg.color} rx="2">
                  <title>{`${m.mes_label}: ${formatoARS(seg.valor)}`}</title>
                </rect>
              )
            })}
            <text x={x + anchoBarra / 2} y={ALTO - 8} textAnchor="middle" fontSize="11" fontWeight="600" fill="#6E7787">
              {m.mes_label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function techoLindo(valor) {
  if (valor <= 0) return 1
  const magnitud = 10 ** Math.floor(Math.log10(valor))
  const normalizado = valor / magnitud
  let paso
  if (normalizado <= 1) paso = 1
  else if (normalizado <= 2) paso = 2
  else if (normalizado <= 2.5) paso = 2.5
  else if (normalizado <= 5) paso = 5
  else paso = 10
  return paso * magnitud
}

const COLOR_POR_CATEGORIA = {
  indumentaria: COLOR_COMPRAS,
  otro: COLOR_COMPRAS,
  alquiler: COLOR_ALQUILERES,
}

function TopProductos({ productos }) {
  const maxUnidades = Math.max(...productos.map((p) => p.unidades), 1)
  return (
    <div className="space-y-3">
      {productos.map((p, i) => (
        <div key={p.nombre + i}>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="font-medium text-gray-700 truncate pr-2">{p.nombre}</span>
            <span className="text-gray-400 flex-shrink-0">{p.unidades} un.</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(p.unidades / maxUnidades) * 100}%`,
                backgroundColor: COLOR_POR_CATEGORIA[p.categoria] ?? COLOR_COMPRAS,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── EVENTOS ────────────────────────────────────────────────────────────────

function VistaEventos() {
  const eventos = useAdminResource('/admin/dashboard/estadisticas-eventos?dias=30')

  const loading = eventos.loading
  const error = eventos.error
  const data = eventos.data

  return (
    <div className="space-y-4">
      <EncabezadoVista texto="Actividad deportiva e institucional, últimos 30 días." onActualizar={eventos.refetch} />
      {error && <ErrorAviso />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard icon={CalendarDays} iconColor="bg-francia-100 text-francia-700" titulo="Eventos (30 días)" loading={loading}>
          <p className="text-2xl font-bold text-gray-900">{data?.eventos_periodo ?? 0}</p>
          <p className="text-sm text-gray-400 mt-1">{data?.eventos_finalizados_periodo ?? 0} finalizados.</p>
        </KpiCard>

        <KpiCard icon={CalendarDays} iconColor="bg-blue-100 text-blue-700" titulo="Próximos 7 días" loading={loading}>
          <p className="text-2xl font-bold text-gray-900">{data?.proximos_7_dias ?? 0}</p>
        </KpiCard>

        <KpiCard icon={Trophy} iconColor="bg-green-100 text-green-700" titulo="Asistencia promedio" loading={loading}>
          <p className="text-2xl font-bold text-gray-900">
            {data?.asistencia_promedio !== null && data?.asistencia_promedio !== undefined
              ? data.asistencia_promedio
              : '—'}
          </p>
          <p className="text-sm text-gray-400 mt-1">por evento finalizado.</p>
        </KpiCard>

        <KpiCard icon={ClipboardList} iconColor="bg-amber-100 text-amber-700" titulo="Convocatorias sin responder" loading={loading}>
          <p className="text-2xl font-bold text-gray-900">{data?.convocatorias_sin_responder ?? 0}</p>
          <p className="text-sm text-gray-400 mt-1">a eventos futuros.</p>
        </KpiCard>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5">
        <h2 className="font-bold text-gray-900 mb-1">Eventos por tipo</h2>
        <p className="text-sm text-gray-400 mb-3">Últimos 30 días.</p>
        {loading ? (
          <div className="h-40 animate-pulse bg-gray-100 rounded-xl" />
        ) : (data?.eventos_por_tipo?.length ?? 0) === 0 ? (
          <EstadoVacio texto="No hubo eventos en los últimos 30 días." />
        ) : (
          <BarrasTiposEvento tipos={data.eventos_por_tipo} />
        )}
      </div>
    </div>
  )
}

function BarrasTiposEvento({ tipos }) {
  const max = Math.max(...tipos.map((t) => t.cantidad), 1)
  return (
    <div className="space-y-3">
      {tipos.map((t) => (
        <div key={t.tipo}>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="font-medium text-gray-700">{TIPO_EVENTO_LABEL[t.tipo] ?? t.tipo}</span>
            <span className="text-gray-400 flex-shrink-0">{t.cantidad}</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-francia-600"
              style={{ width: `${(t.cantidad / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
