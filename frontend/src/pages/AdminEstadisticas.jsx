// frontend/src/pages/AdminEstadisticas.jsx
/**
 * Panel de Estadísticas — ruta `/admin/estadisticas`.
 *
 * Complemento del Panel de Control (`/admin`): mientras ese es un "to-do"
 * (qué necesita tu atención hoy), este es retrospectivo (cómo venimos este
 * mes/año). Se mantienen separados a propósito — ver la conversación en la
 * que se decidió esto para más contexto.
 *
 * No se agregó ninguna librería de gráficos nueva al proyecto (no había
 * ninguna instalada): los gráficos son SVG a mano, livianos y sin
 * dependencias, en línea con el resto del proyecto.
 *
 * Backend consumido:
 *   GET /admin/dashboard/estadisticas → ingresos por mes (desglosados en
 *     cuotas/compras/alquileres), variación % vs. mes anterior, y top 5
 *     productos más vendidos (30 días).
 *   GET /admin/pagos/estadisticas     → socios al día vs. morosos, deuda
 *     total estimada (mismo endpoint que ya se usaba antes en el Panel de
 *     Control, antes de que ese resumen financiero se mudara acá).
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
} from 'lucide-react'
import { useAdminResource } from '../hooks/useAdminResource'

const formatoARS = (monto) =>
  Number(monto ?? 0).toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })

const COLOR_CUOTAS = '#f59e0b'     // amber-500  — mismo espíritu que la card "Cuotas"
const COLOR_COMPRAS = '#3b82f6'    // blue-500   — mismo espíritu que la card "Órdenes"
const COLOR_ALQUILERES = '#8b5cf6' // violet-500 — mismo espíritu que la card "Alquileres"

export default function AdminEstadisticas() {
  const [rangoMeses, setRangoMeses] = useState(6)
  const [ocultas, setOcultas] = useState(() => new Set())

  const estadisticas = useAdminResource(`/admin/dashboard/estadisticas?meses=${rangoMeses}`)
  const pagos = useAdminResource('/admin/pagos/estadisticas')

  const toggleCategoria = (key) => {
    setOcultas((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const loading = estadisticas.loading || pagos.loading
  const error = estadisticas.error || pagos.error

  const meses = estadisticas.data?.ingresos_por_mes ?? []
  const mesActual = meses[meses.length - 1]
  const variacion = estadisticas.data?.variacion_mes_pct

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <TrendingUp size={22} className="text-gray-700 flex-shrink-0" />
            Estadísticas
          </h1>
          <button
            onClick={() => { estadisticas.refetch(); pagos.refetch() }}
            className="self-start sm:self-auto flex items-center gap-2 px-3 py-2 -ml-3 sm:ml-0 text-sm font-semibold text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <RefreshCw size={15} /> Actualizar
          </button>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          Cómo viene el club este mes, y en los últimos {meses.length || 6}.
        </p>
        <Link to="/admin" className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1 mt-1">
          <LayoutDashboard size={13} /> Volver al Panel de Control
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-2xl p-4">
          No se pudieron cargar las estadísticas. Probá actualizar la página.
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard
          icon={Wallet}
          iconColor="bg-green-100 text-green-700"
          titulo="Ingresos de este mes"
          loading={loading}
        >
          <p className="text-2xl font-bold text-gray-900">{formatoARS(mesActual?.total)}</p>
          <VariacionBadge variacion={variacion} />
        </KpiCard>

        <KpiCard
          icon={CheckCircle2}
          iconColor="bg-emerald-100 text-emerald-700"
          titulo="Socios al día"
          loading={loading}
        >
          <p className="text-2xl font-bold text-gray-900">{pagos.data?.total_socios_al_dia ?? 0}</p>
          <p className="text-sm text-gray-400 mt-1">
            de {(pagos.data?.total_socios_al_dia ?? 0) + (pagos.data?.total_socios_morosos ?? 0)} activos.
          </p>
        </KpiCard>

        <KpiCard
          icon={AlertTriangle}
          iconColor="bg-red-100 text-red-700"
          titulo="Deuda estimada"
          loading={loading}
        >
          <p className="text-2xl font-bold text-gray-900">{formatoARS(pagos.data?.deuda_total_estimada)}</p>
          <p className="text-sm text-gray-400 mt-1">
            {pagos.data?.total_socios_morosos ?? 0} en mora.
          </p>
        </KpiCard>

        <KpiCard
          icon={CheckCircle2}
          iconColor="bg-teal-100 text-teal-700"
          titulo="Estado de socios"
          loading={loading}
        >
          <DonutSocios
            compacto
            alDia={pagos.data?.total_socios_al_dia ?? 0}
            morosos={pagos.data?.total_socios_morosos ?? 0}
          />
        </KpiCard>
      </div>

      {/* Ingresos por mes (2/3) + Más vendidos (1/3), lado a lado en desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
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

        {/* Top productos */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
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

// ─── KPI card ──────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, iconColor, titulo, loading, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${iconColor}`}>
        <Icon size={17} />
      </div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{titulo}</p>
      {loading ? (
        <div className="h-8 w-24 bg-gray-100 rounded animate-pulse" />
      ) : (
        children
      )}
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
  const color = igual ? 'text-gray-400' : subio ? 'text-emerald-600' : 'text-red-600'
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
            valor === op.meses
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {op.label}
        </button>
      ))}
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
              style={{ backgroundColor: oculta ? '#e5e7eb' : it.color }}
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

  // El total de cada mes se recalcula solo con las categorías visibles, así
  // el eje Y se reescala automáticamente al ocultar/mostrar una categoría
  // (en vez de dejar un hueco vacío arriba con la escala vieja).
  const totalVisible = (m) =>
    (ocultas.has('cuotas') ? 0 : Number(m.cuotas)) +
    (ocultas.has('compras') ? 0 : Number(m.compras)) +
    (ocultas.has('alquileres') ? 0 : Number(m.alquileres))

  const maxTotal = Math.max(...meses.map(totalVisible), 1)
  // Redondea el techo del eje a un número "lindo" (1, 2, 2.5, 5, 10 × 10^n)
  const techo = techoLindo(maxTotal)

  const anchoBarra = (anchoUtil / meses.length) * 0.55
  const paso = anchoUtil / meses.length

  const escalaY = (valor) => (Number(valor) / techo) * altoUtil

  const marcasY = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(techo * f))

  return (
    <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} className="w-full h-52" role="img" aria-label="Ingresos por mes">
      {/* Grilla + eje Y */}
      {marcasY.map((valor) => {
        const y = PAD_SUP + altoUtil - escalaY(valor)
        return (
          <g key={valor}>
            <line x1={PAD_IZQ} y1={y} x2={ANCHO - 8} y2={y} stroke="#f1f5f9" strokeWidth="1" />
            <text x={PAD_IZQ - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#94a3b8">
              {valor >= 1000 ? `${Math.round(valor / 1000)}k` : valor}
            </text>
          </g>
        )
      })}

      {/* Barras */}
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
                <rect
                  key={j}
                  x={x}
                  y={yAcumulado}
                  width={anchoBarra}
                  height={alto}
                  fill={seg.color}
                  rx="2"
                >
                  <title>{`${m.mes_label}: ${formatoARS(seg.valor)}`}</title>
                </rect>
              )
            })}
            <text
              x={x + anchoBarra / 2}
              y={ALTO - 8}
              textAnchor="middle"
              fontSize="11"
              fontWeight="600"
              fill="#64748b"
            >
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

// ─── Donut: socios al día vs. morosos ──────────────────────────────────────

function DonutSocios({ alDia, morosos, compacto = false }) {
  const total = alDia + morosos
  if (total === 0) {
    return compacto
      ? <p className="text-sm text-gray-400">Sin socios activos.</p>
      : <EstadoVacio texto="No hay socios activos para mostrar." />
  }

  const RADIO = 60
  const GROSOR = 18
  const CIRCUNFERENCIA = 2 * Math.PI * RADIO
  const fraccionAlDia = alDia / total
  const largoAlDia = fraccionAlDia * CIRCUNFERENCIA

  const svg = (
    <svg
      viewBox="0 0 150 150"
      className={compacto ? 'w-14 h-14 flex-shrink-0' : 'w-32 h-32 sm:w-36 sm:h-36 flex-shrink-0'}
      role="img"
      aria-label="Socios al día vs. morosos"
    >
      <g transform="translate(75, 75) rotate(-90)">
        <circle r={RADIO} fill="none" stroke="#fee2e2" strokeWidth={GROSOR} />
        <circle
          r={RADIO}
          fill="none"
          stroke="#10b981"
          strokeWidth={GROSOR}
          strokeDasharray={`${largoAlDia} ${CIRCUNFERENCIA - largoAlDia}`}
          strokeLinecap={fraccionAlDia > 0 && fraccionAlDia < 1 ? 'butt' : 'round'}
        />
      </g>
      {!compacto && (
        <>
          <text x="75" y="70" textAnchor="middle" fontSize="22" fontWeight="700" fill="#111827">
            {Math.round(fraccionAlDia * 100)}%
          </text>
          <text x="75" y="88" textAnchor="middle" fontSize="10" fill="#94a3b8">al día</text>
        </>
      )}
    </svg>
  )

  if (compacto) {
    return (
      <div className="flex items-center gap-3">
        {svg}
        <div>
          <p className="text-2xl font-bold text-gray-900">{Math.round(fraccionAlDia * 100)}%</p>
          <p className="text-xs text-gray-400">{alDia} al día · {morosos} en mora</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
      {svg}
      <div className="space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
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

// ─── Top productos (barras horizontales simples) ───────────────────────────

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