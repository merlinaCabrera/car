// frontend/src/pages/AdminReservas.jsx
/**
 * Agenda de Reservas — panel del admin.
 *
 * Lista todas las reservas de instalaciones (GET /admin/reservas, con
 * filtros opcionales de instalación/estado/rango de fechas) y permite
 * configurar, por cada reserva, cuántos socios se esperan y el monto de
 * reintegro QR unitario (PATCH /admin/reservas/{id}/reparto) — sin esto
 * configurado, el Escáner de Canchas rechaza el escaneo aunque la reserva
 * ya esté confirmada y visible en /admin/reservas/activas.
 *
 * No incluye paginación: se asume un volumen manejable de reservas por
 * filtro (instalación + rango de fechas acotan bastante). Si en producción
 * esto crece mucho, es el primer lugar para agregar server-side paging.
 */

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  Calendar,
  Filter,
  RefreshCw,
  AlertCircle,
  Users,
  DollarSign,
  X,
  Check,
  Loader2,
  MapPin,
  Clock,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const ESTADOS = [
  { value: '', label: 'Todos los estados' },
  { value: 'bloqueada', label: 'Bloqueada' },
  { value: 'confirmada', label: 'Confirmada' },
  { value: 'liberada', label: 'Liberada' },
  { value: 'expirada', label: 'Expirada' },
]

const ESTADO_BADGE = {
  bloqueada: 'bg-amber-100 text-amber-700',
  confirmada: 'bg-green-100 text-green-700',
  liberada: 'bg-gray-100 text-gray-500',
  expirada: 'bg-red-100 text-red-700',
}

const formatoFechaHora = (iso) => {
  const d = new Date(iso)
  return d.toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ─── Modal de configuración de reparto ──────────────────────────────────────

function ModalReparto({ reserva, onClose, onGuardado }) {
  const { token } = useAuth()
  const [numSocios, setNumSocios] = useState(reserva.num_socios_esperados ?? '')
  const [monto, setMonto] = useState(reserva.monto_reintegro_unitario ?? '')
  const [autoCalcular, setAutoCalcular] = useState(reserva.monto_reintegro_unitario == null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  const handleGuardar = async (e) => {
    e.preventDefault()
    if (!numSocios || Number(numSocios) <= 0) {
      setError('Ingresá una cantidad de socios esperados mayor a 0.')
      return
    }
    setGuardando(true)
    setError(null)
    try {
      const res = await fetch(`${API}/admin/reservas/${reserva.id_reserva}/reparto`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          num_socios_esperados: Number(numSocios),
          monto_reintegro_unitario: autoCalcular ? null : Number(monto),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail ?? 'No se pudo guardar el reparto.')
      onGuardado(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Configurar reintegro QR</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-gray-500 capitalize">
          {reserva.instalacion.replace(/_/g, ' ')} — {formatoFechaHora(reserva.fecha_inicio)}
        </p>

        <form onSubmit={handleGuardar} className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1">
              Socios esperados
            </label>
            <input
              type="number"
              min={1}
              value={numSocios}
              onChange={e => setNumSocios(e.target.value)}
              className="form-input w-full"
              placeholder="Ej: 10"
              autoFocus
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={autoCalcular}
              onChange={e => setAutoCalcular(e.target.checked)}
              className="rounded"
            />
            Calcular automáticamente (20% del precio de la reserva ÷ socios esperados)
          </label>

          {!autoCalcular && (
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-1">
                Monto de reintegro por socio ($)
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={monto}
                onChange={e => setMonto(e.target.value)}
                className="form-input w-full"
                placeholder="Ej: 500"
              />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle size={14} className="flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {guardando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function AdminReservas() {
  const { token } = useAuth()

  const [reservas, setReservas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [filtroInstalacion, setFiltroInstalacion] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroDesde, setFiltroDesde] = useState('')
  const [filtroHasta, setFiltroHasta] = useState('')

  const [reservaEditando, setReservaEditando] = useState(null)

  const fetchReservas = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (filtroInstalacion) params.set('instalacion', filtroInstalacion)
      if (filtroEstado) params.set('estado', filtroEstado)
      if (filtroDesde) params.set('desde', filtroDesde)
      if (filtroHasta) params.set('hasta', filtroHasta)

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
  }, [token, filtroInstalacion, filtroEstado, filtroDesde, filtroHasta])

  useEffect(() => { fetchReservas() }, [fetchReservas])

  const handleGuardadoReparto = (reservaActualizada) => {
    setReservas(prev => prev.map(r =>
      r.id_reserva === reservaActualizada.id_reserva
        ? {
            ...r,
            num_socios_esperados: reservaActualizada.num_socios_esperados,
            monto_reintegro_unitario: reservaActualizada.monto_reintegro_unitario,
          }
        : r
    ))
    setReservaEditando(null)
  }

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
            <Calendar size={28} className="text-slate-500" />
            Agenda de Reservas
          </h1>
          <p className="mt-1 text-slate-500">Instalaciones, alquileres y reintegros QR.</p>
        </div>
        <button
          onClick={fetchReservas}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 text-slate-600 font-semibold hover:bg-slate-200 transition-colors"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-3 items-end">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-500 pr-2">
          <Filter size={15} /> Filtros
        </div>

        <input
          type="text"
          placeholder="Instalación (ej: cancha_1)"
          value={filtroInstalacion}
          onChange={e => setFiltroInstalacion(e.target.value)}
          className="form-input text-sm w-48"
        />

        <select
          value={filtroEstado}
          onChange={e => setFiltroEstado(e.target.value)}
          className="form-input text-sm w-40"
        >
          {ESTADOS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle size={18} className="flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Listado */}
      <div className="space-y-3">
        {loading && [...Array(3)].map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 h-24 animate-pulse" />
        ))}

        {!loading && reservas.map(r => (
          <div
            key={r.id_reserva}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center justify-between gap-4 flex-wrap"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-bold text-gray-900 capitalize">{r.instalacion.replace(/_/g, ' ')}</p>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${ESTADO_BADGE[r.estado] ?? 'bg-gray-100 text-gray-500'}`}>
                  {r.estado}
                </span>
              </div>
              <div className="flex items-center gap-4 mt-1.5 text-sm text-gray-500 flex-wrap">
                <span className="flex items-center gap-1.5">
                  <Clock size={13} />
                  {formatoFechaHora(r.fecha_inicio)}
                </span>
                {r.nombre_responsable && (
                  <span className="flex items-center gap-1.5">
                    <MapPin size={13} /> {r.nombre_responsable}
                  </span>
                )}
                {r.num_socios_esperados != null && (
                  <span className="flex items-center gap-1.5">
                    <Users size={13} /> {r.escaneos_realizados}/{r.num_socios_esperados}
                  </span>
                )}
                {r.monto_reintegro_unitario != null && (
                  <span className="flex items-center gap-1.5">
                    <DollarSign size={13} /> ${r.monto_reintegro_unitario} c/u
                  </span>
                )}
              </div>
              {r.notas && <p className="text-xs text-gray-400 mt-1 truncate">{r.notas}</p>}
            </div>

            {(r.estado === 'bloqueada' || r.estado === 'confirmada') && (
              <button
                onClick={() => setReservaEditando(r)}
                className="flex-shrink-0 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-xl transition-colors"
              >
                {r.num_socios_esperados != null ? 'Editar reparto' : 'Configurar reintegro'}
              </button>
            )}
          </div>
        ))}

        {!loading && !error && reservas.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-gray-500">
            No hay reservas que coincidan con los filtros.
          </div>
        )}
      </div>

      {reservaEditando && (
        <ModalReparto
          reserva={reservaEditando}
          onClose={() => setReservaEditando(null)}
          onGuardado={handleGuardadoReparto}
        />
      )}
    </div>
  )
}