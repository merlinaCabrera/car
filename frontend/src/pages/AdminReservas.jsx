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
  PlusCircle,
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

function ModalDetalleReserva({ reserva, onClose, onRechazar }) {
  const color   = colorDeReserva(reserva)
  const ahora   = new Date()
  const vencida = reserva.estado_orden === 'pendiente_verificacion' &&
                  new Date(reserva.fecha_fin) < ahora
  const [rechazando, setRechazando] = useState(false)

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

        {/* Alerta de pendiente vencida */}
        {vencida && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Pago pendiente vencido</p>
              <p className="text-xs mt-0.5 text-red-600">
                El turno ya pasó y la orden nunca fue aprobada. Podés rechazarla para liberar el registro,
                o aprobarla si el socio pagó en efectivo.
              </p>
            </div>
          </div>
        )}

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

        {/* Botón rechazar — solo para pendientes */}
        {reserva.estado_orden === 'pendiente_verificacion' && (
          <button
            onClick={async () => {
              setRechazando(true)
              await onRechazar(reserva.id_reserva)
              setRechazando(false)
              onClose()
            }}
            disabled={rechazando}
            className="w-full py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {rechazando && <Loader2 size={14} className="animate-spin" />}
            {rechazando ? 'Rechazando…' : 'Rechazar / Liberar turno'}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Modal: Nueva Reserva Manual ─────────────────────────────────────────────

function ModalNuevaReserva({ onClose, onGuardado }) {
  const { token } = useAuth()
  const [form, setForm] = useState({
    instalacion:        'cancha_1',
    fecha_inicio:       '',
    fecha_fin:          '',
    nombre_responsable: '',
    notas_extra:        '',
  })
  const [guardando, setGuardando] = useState(false)
  const [error,     setError]     = useState(null)

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.fecha_inicio || !form.fecha_fin) {
      setError('Las fechas de inicio y fin son obligatorias.')
      return
    }
    if (new Date(form.fecha_fin) <= new Date(form.fecha_inicio)) {
      setError('La fecha de fin debe ser posterior a la de inicio.')
      return
    }
    if (!form.nombre_responsable.trim()) {
      setError('El nombre del responsable es obligatorio.')
      return
    }
    setGuardando(true)
    setError(null)
    try {
      const res = await fetch(`${API}/admin/reservas`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instalacion:        form.instalacion,
          fecha_inicio:       new Date(form.fecha_inicio).toISOString(),
          fecha_fin:          new Date(form.fecha_fin).toISOString(),
          nombre_responsable: form.nombre_responsable.trim(),
          notas_extra:        form.notas_extra.trim() || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail ?? 'No se pudo crear la reserva.')
      onGuardado(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  const L = "block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide"

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[90dvh]"
      >
        <div className="p-6 border-b flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Nueva Reserva Manual</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Para socios sin app o no-socios. Se crea como confirmada sin orden de pago.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
              <AlertCircle size={15} className="flex-shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label className={L}>Instalación</label>
            <select name="instalacion" value={form.instalacion} onChange={handleChange} className="form-input w-full">
              <option value="cancha_1">Cancha 1</option>
              <option value="cancha_2">Cancha 2</option>
              <option value="quincho">Quincho</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={L}>Inicio</label>
              <input
                type="datetime-local" name="fecha_inicio"
                value={form.fecha_inicio} onChange={handleChange}
                required className="form-input w-full"
              />
            </div>
            <div>
              <label className={L}>Fin</label>
              <input
                type="datetime-local" name="fecha_fin"
                value={form.fecha_fin} onChange={handleChange}
                required className="form-input w-full"
              />
            </div>
          </div>

          <div>
            <label className={L}>Responsable</label>
            <input
              type="text" name="nombre_responsable"
              value={form.nombre_responsable} onChange={handleChange}
              placeholder="Nombre y apellido del responsable"
              required className="form-input w-full"
            />
          </div>

          <div>
            <label className={L}>Notas <span className="font-normal normal-case text-gray-400">(opcional)</span></label>
            <input
              type="text" name="notas_extra"
              value={form.notas_extra} onChange={handleChange}
              placeholder="Grupo, evento, referencia de pago en efectivo..."
              className="form-input w-full"
            />
          </div>
        </div>

        <div className="p-4 bg-gray-50 rounded-b-2xl border-t flex justify-end gap-3 flex-shrink-0">
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-lg text-gray-600 bg-gray-200 hover:bg-gray-300 font-semibold transition-colors"
          >
            Cancelar
          </button>
          <button type="submit" disabled={guardando}
            className="px-4 py-2 rounded-lg text-white bg-slate-900 hover:bg-slate-800 font-semibold disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {guardando && <Loader2 size={14} className="animate-spin" />}
            Crear Reserva
          </button>
        </div>
      </form>
    </div>
  )
}

export default function AdminReservas() {
  const { token } = useAuth()

  const [reservas,    setReservas]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [grupoActivo, setGrupoActivo] = useState('canchas')
  const [vista,       setVista]       = useState('lista')
  const [mes,         setMes]         = useState(new Date())
  const [filtroCalendario, setFiltroCalendario] = useState('') // '' | 'pendiente_verificacion' | 'aprobada'

  // Filtros lista
  const [filtroInstalacion, setFiltroInstalacion] = useState('')
  const [filtroEstadoOrden, setFiltroEstadoOrden] = useState('')
  const [filtroDesde,       setFiltroDesde]       = useState('')
  const [filtroHasta,       setFiltroHasta]       = useState('')

  // Detalle abierto (calendario)
  const [reservaDetalle,    setReservaDetalle]    = useState(null)
  const [modalNuevaAbierto, setModalNuevaAbierto] = useState(false)

  const handleNuevaReservaGuardada = (nueva) => {
    setReservas(prev => [nueva, ...prev])
    setModalNuevaAbierto(false)
  }

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

  const handleRechazar = async (idReserva) => {
    try {
      const res = await fetch(`${API}/admin/reservas/${idReserva}/rechazar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail ?? 'No se pudo rechazar la reserva.')
      }
      // Quitar la reserva rechazada de la lista local sin refetch
      setReservas(prev => prev.filter(r => r.id_reserva !== idReserva))
    } catch (err) {
      setError(err.message)
    }
  }

  // ── Filtrado ──────────────────────────────────────────────────────────────
  const instDelGrupo = instalacionesDe(grupoActivo)

  const ahora = useMemo(() => new Date(), [])

  const reservasFiltradas = useMemo(() => {
    let lista = reservas.filter(r => instDelGrupo.includes(r.instalacion))
    if (vista === 'calendario') {
      // Calendario: solo pendientes y aprobadas
      lista = lista.filter(esActiva)
      // Filtro adicional por estado si el usuario lo eligió
      if (filtroCalendario) lista = lista.filter(r => r.estado_orden === filtroCalendario)
    } else {
      if (filtroInstalacion) lista = lista.filter(r => r.instalacion === filtroInstalacion)
      if (filtroEstadoOrden) lista = lista.filter(r => r.estado_orden === filtroEstadoOrden)
    }
    return lista
  }, [reservas, instDelGrupo, vista, filtroInstalacion, filtroEstadoOrden, filtroCalendario])

  // ── Chip para el calendario ───────────────────────────────────────────────
  const renderReservaCalendario = useCallback((reserva) => {
    const color    = colorDeReserva(reserva)
    const vencida  = reserva.estado_orden === 'pendiente_verificacion' &&
                     new Date(reserva.fecha_fin) < ahora
    return (
      <button
        onClick={() => setReservaDetalle(reserva)}
        title={`${labelInstalacion(reserva.instalacion)} — ${color.label}${vencida ? ' ⚠️ vencida sin pago' : ''}`}
        className={`w-full text-left px-1.5 py-0.5 rounded text-[10px] font-semibold truncate transition-opacity hover:opacity-80 ${color.chip} ${vencida ? 'ring-2 ring-red-500 ring-offset-0' : ''}`}
      >
        {vencida ? '⚠️ ' : ''}{formatoHora(reserva.fecha_inicio)} {labelInstalacion(reserva.instalacion)}
      </button>
    )
  }, [ahora])

  const grupoInfo = GRUPOS.find(g => g.key === grupoActivo)

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">

      {reservaDetalle && (
        <ModalDetalleReserva
          reserva={reservaDetalle}
          onClose={() => setReservaDetalle(null)}
          onRechazar={handleRechazar}
        />
      )}

      {modalNuevaAbierto && (
        <ModalNuevaReserva
          onClose={() => setModalNuevaAbierto(false)}
          onGuardado={handleNuevaReservaGuardada}
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
          <button
            onClick={() => setModalNuevaAbierto(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors shadow-sm"
          >
            <PlusCircle size={16} />
            Nueva Reserva
          </button>
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
              {/* Pills de filtro por estado */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Mostrar:</span>
                {[
                  { value: '',                       label: 'Todos'      },
                  { value: 'pendiente_verificacion', label: 'Pendientes' },
                  { value: 'aprobada',               label: 'Aprobadas'  },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setFiltroCalendario(opt.value)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                      filtroCalendario === opt.value
                        ? 'bg-slate-900 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Calendarios por instalación */}
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