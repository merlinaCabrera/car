// frontend/src/pages/AdminReservas.jsx
/**
 * Agenda de Reservas — panel del admin.
 *
 * Vistas: Lista ↔ Calendario (toggle en el header).
 * Tabs de tipo: Canchas | Quincho
 *
 * Coloreo por estado_orden (estado del pago de la orden):
 *   pendiente_verificacion → naranja  (esperando comprobante)
 *   aprobada               → verde    (pago confirmado)
 *   rechazada / cancelada_socio / expirada → gris (inactiva)
 *   sin orden (null)       → gris claro
 *
 * En el calendario solo se muestran reservas con orden pendiente o aprobada.
 * Las rechazadas/canceladas/expiradas aparecen solo en la vista Lista.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import CalendarioMensual from '../components/CalendarioMensual'
import {
  Calendar,
  Filter,
  RefreshCw,
  AlertCircle,
  Users,
  X,
  Loader2,
  Clock,
  List,
  LayoutGrid,
  Tent,
  Volleyball,
  MapPin,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

// ─── Instalaciones ────────────────────────────────────────────────────────────

const GRUPOS = [
  {
    key:           'canchas',
    label:         'Canchas',
    icon:          Volleyball,
    instalaciones: ['cancha_1', 'cancha_2'],
  },
  {
    key:           'quincho',
    label:         'Quincho',
    icon:          Tent,
    instalaciones: ['quincho'],
  },
]

const labelInstalacion = (key) =>
  key === 'quincho'
    ? 'Quincho'
    : key.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())

const instalacionesDe = (grupoKey) =>
  GRUPOS.find(g => g.key === grupoKey)?.instalaciones ?? []

// ─── Estado de orden → colores ────────────────────────────────────────────────
//
// El coloreo se basa en estado_orden (estado del pago), no en el estado
// interno de la reserva (bloqueada/confirmada/liberada/expirada).

const COLOR_ORDEN = {
  pendiente_verificacion: {
    chip:   'bg-orange-400 text-white',
    badge:  'bg-orange-100 text-orange-800',
    label:  'Pendiente',
  },
  aprobada: {
    chip:   'bg-green-500 text-white',
    badge:  'bg-green-100 text-green-800',
    label:  'Aprobada',
  },
  rechazada: {
    chip:   'bg-gray-300 text-gray-600',
    badge:  'bg-gray-100 text-gray-500',
    label:  'Rechazada',
  },
  cancelada_socio: {
    chip:   'bg-gray-300 text-gray-600',
    badge:  'bg-gray-100 text-gray-500',
    label:  'Cancelada',
  },
  expirada: {
    chip:   'bg-gray-300 text-gray-600',
    badge:  'bg-gray-100 text-gray-500',
    label:  'Expirada',
  },
}

const colorDeReserva = (r) =>
  COLOR_ORDEN[r.estado_orden] ?? { chip: 'bg-gray-200 text-gray-500', badge: 'bg-gray-100 text-gray-400', label: 'Sin orden' }

// Las reservas activas son las que tienen sentido mostrar en el calendario
const esActiva = (r) =>
  r.estado_orden === 'pendiente_verificacion' || r.estado_orden === 'aprobada'

// ─── Helpers de formato ───────────────────────────────────────────────────────

const formatoFechaHora = (iso) =>
  new Date(iso).toLocaleString('es-AR', {
    weekday: 'short', day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })

const formatoHora = (iso) =>
  new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

// ─── Toggle Vista ─────────────────────────────────────────────────────────────

function VistaToggle({ vista, onChange }) {
  return (
    <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-1">
      {[
        { key: 'lista',      Icon: List,       label: 'Lista'      },
        { key: 'calendario', Icon: LayoutGrid,  label: 'Calendario' },
      ].map(({ key, Icon, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
            vista === key
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Icon size={15} />
          {label}
        </button>
      ))}
    </div>
  )
}

// ─── Modal detalle de reserva ─────────────────────────────────────────────────

function ModalDetalleReserva({ reserva, onClose }) {
  const color = colorDeReserva(reserva)
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">{labelInstalacion(reserva.instalacion)}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-2 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-gray-400 flex-shrink-0" />
            <span>
              {formatoFechaHora(reserva.fecha_inicio)}
              {reserva.fecha_fin && ` → ${formatoHora(reserva.fecha_fin)}`}
            </span>
          </div>
          {reserva.nombre_responsable && (
            <div className="flex items-center gap-2">
              <Users size={14} className="text-gray-400 flex-shrink-0" />
              <span>{reserva.nombre_responsable}</span>
            </div>
          )}
          {reserva.notas && (
            <div className="flex items-start gap-2">
              <MapPin size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
              <span className="italic text-gray-500">{reserva.notas}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado del pago</span>
          <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${color.badge}`}>
            {color.label}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function AdminReservas() {
  const { token } = useAuth()

  const [reservas,    setReservas]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [grupoActivo, setGrupoActivo] = useState('canchas')
  const [vista,       setVista]       = useState('lista')
  const [mes,         setMes]         = useState(new Date())

  // Filtros lista
  const [filtroInstalacion, setFiltroInstalacion] = useState('')
  const [filtroEstadoOrden, setFiltroEstadoOrden] = useState('')
  const [filtroDesde,       setFiltroDesde]       = useState('')
  const [filtroHasta,       setFiltroHasta]       = useState('')

  // Detalle abierto (calendario)
  const [reservaDetalle, setReservaDetalle] = useState(null)

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchReservas = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()

      if (vista === 'calendario') {
        const desde = new Date(mes.getFullYear(), mes.getMonth(), 1)
        const hasta  = new Date(mes.getFullYear(), mes.getMonth() + 1, 0)
        params.set('desde', desde.toISOString().slice(0, 10))
        params.set('hasta', hasta.toISOString().slice(0, 10))
      } else {
        if (filtroInstalacion) params.set('instalacion', filtroInstalacion)
        if (filtroDesde)       params.set('desde',       filtroDesde)
        if (filtroHasta)       params.set('hasta',       filtroHasta)
      }

      const res = await fetch(`${API}/admin/reservas?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`Error ${res.status}: no se pudieron cargar las reservas.`)
      setReservas(await res.json())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token, vista, mes, filtroInstalacion, filtroDesde, filtroHasta])

  useEffect(() => { fetchReservas() }, [fetchReservas])

  const handleGrupoChange = (key) => {
    setGrupoActivo(key)
    setFiltroInstalacion('')
  }

  // ── Filtrado ──────────────────────────────────────────────────────────────
  const instDelGrupo = instalacionesDe(grupoActivo)

  const reservasFiltradas = useMemo(() => {
    let lista = reservas.filter(r => instDelGrupo.includes(r.instalacion))
    if (vista === 'calendario') {
      // Calendario: solo pendientes y aprobadas — las inactivas no aportan
      lista = lista.filter(esActiva)
    } else {
      if (filtroInstalacion) lista = lista.filter(r => r.instalacion === filtroInstalacion)
      if (filtroEstadoOrden) lista = lista.filter(r => r.estado_orden === filtroEstadoOrden)
    }
    return lista
  }, [reservas, instDelGrupo, vista, filtroInstalacion, filtroEstadoOrden])

  // ── Chip para el calendario ───────────────────────────────────────────────
  const renderReservaCalendario = useCallback((reserva) => {
    const color = colorDeReserva(reserva)
    return (
      <button
        onClick={() => setReservaDetalle(reserva)}
        title={`${labelInstalacion(reserva.instalacion)} — ${color.label}`}
        className={`w-full text-left px-1.5 py-0.5 rounded text-[10px] font-semibold truncate transition-opacity hover:opacity-80 ${color.chip}`}
      >
        {formatoHora(reserva.fecha_inicio)} {labelInstalacion(reserva.instalacion)}
      </button>
    )
  }, [])

  const grupoInfo = GRUPOS.find(g => g.key === grupoActivo)

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">

      {reservaDetalle && (
        <ModalDetalleReserva
          reserva={reservaDetalle}
          onClose={() => setReservaDetalle(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Calendar size={24} className="text-gray-500" />
            Agenda de Reservas
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Quincho y canchas — estado de pagos y ocupación.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap flex-shrink-0">
          <VistaToggle vista={vista} onChange={setVista} />
          <button
            onClick={fetchReservas}
            disabled={loading}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 transition-colors"
            title="Actualizar"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Tabs: Canchas / Quincho */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        {GRUPOS.map(grupo => {
          const Icon = grupo.icon
          return (
            <button
              key={grupo.key}
              onClick={() => handleGrupoChange(grupo.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                grupoActivo === grupo.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon size={15} />
              {grupo.label}
            </button>
          )
        })}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle size={18} className="flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={fetchReservas} className="underline underline-offset-2 font-medium">Reintentar</button>
        </div>
      )}

      {/* ── Vista Calendario ─────────────────────────────────────────────── */}
      {vista === 'calendario' && (
        <div className="space-y-3">
          {loading ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm h-96 animate-pulse" />
          ) : (
            <>
              {instDelGrupo.map(inst => {
                const reservasDeEsta = reservasFiltradas.filter(r => r.instalacion === inst)
                return (
                  <div key={inst}>
                    {instDelGrupo.length > 1 && (
                      <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2 px-1">
                        {labelInstalacion(inst)}
                      </h2>
                    )}
                    <CalendarioMensual
                      eventos={reservasDeEsta.map(r => ({
                        ...r,
                        id_evento: r.id_reserva,
                      }))}
                      mes={mes}
                      onMesChange={setMes}
                      renderEvento={renderReservaCalendario}
                    />
                  </div>
                )
              })}

              {/* Leyenda */}
              <div className="flex flex-wrap items-center gap-4 px-1">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Estado de pago:</span>
                {[
                  { key: 'pendiente_verificacion', label: 'Pendiente',  cls: 'bg-orange-400' },
                  { key: 'aprobada',               label: 'Aprobada',   cls: 'bg-green-500'  },
                ].map(({ key, label, cls }) => (
                  <span key={key} className="flex items-center gap-1.5 text-xs text-gray-600">
                    <span className={`w-2.5 h-2.5 rounded-sm ${cls}`} />
                    {label}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Vista Lista ──────────────────────────────────────────────────── */}
      {vista === 'lista' && (
        <div className="space-y-4">
          {/* Filtros */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-3 items-end">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-400 pr-1">
              <Filter size={14} /> Filtros
            </div>

            {instDelGrupo.length > 1 && (
              <select
                value={filtroInstalacion}
                onChange={e => setFiltroInstalacion(e.target.value)}
                className="form-input text-sm"
              >
                <option value="">Todas las canchas</option>
                {instDelGrupo.map(inst => (
                  <option key={inst} value={inst}>{labelInstalacion(inst)}</option>
                ))}
              </select>
            )}

            <select
              value={filtroEstadoOrden}
              onChange={e => setFiltroEstadoOrden(e.target.value)}
              className="form-input text-sm"
            >
              <option value="">Todos los estados</option>
              <option value="pendiente_verificacion">Pendiente</option>
              <option value="aprobada">Aprobada</option>
              <option value="rechazada">Rechazada</option>
              <option value="cancelada_socio">Cancelada</option>
              <option value="expirada">Expirada</option>
            </select>

            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-400">Desde</label>
              <input type="date" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)} className="form-input text-sm" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-400">Hasta</label>
              <input type="date" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)} className="form-input text-sm" />
            </div>
          </div>

          {/* Skeleton */}
          {loading && [...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 h-20 animate-pulse" />
          ))}

          {/* Cards */}
          {!loading && reservasFiltradas.map(r => {
            const color = colorDeReserva(r)
            return (
              <div
                key={r.id_reserva}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4 flex-wrap"
              >
                {/* Franja de color por estado */}
                <div className={`w-1.5 self-stretch rounded-full flex-shrink-0 ${color.chip.split(' ')[0]}`} />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-gray-900">{labelInstalacion(r.instalacion)}</p>
                    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${color.badge}`}>
                      {color.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-sm text-gray-500 flex-wrap">
                    <span className="flex items-center gap-1.5">
                      <Clock size={13} />
                      {formatoFechaHora(r.fecha_inicio)}
                      {r.fecha_fin && ` → ${formatoHora(r.fecha_fin)}`}
                    </span>
                    {r.nombre_responsable && (
                      <span className="flex items-center gap-1.5">
                        <Users size={13} /> {r.nombre_responsable}
                      </span>
                    )}
                  </div>
                  {r.notas && (
                    <p className="text-xs text-gray-400 mt-0.5 italic truncate">{r.notas}</p>
                  )}
                </div>
              </div>
            )
          })}

          {!loading && !error && reservasFiltradas.length === 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-gray-400 text-sm">
              No hay reservas de {grupoInfo?.label.toLowerCase()} con esos filtros.
            </div>
          )}
        </div>
      )}
    </div>
  )
}