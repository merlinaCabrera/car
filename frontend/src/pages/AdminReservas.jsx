// frontend/src/pages/AdminReservas.jsx
/**
 * Agenda de Reservas — panel del admin.
 *
 * Vistas: Lista ↔ Calendario (toggle en el header, mismo patrón que TecnicoEventos).
 * Tabs de tipo: Canchas (cancha_1, cancha_2) | Quincho
 *
 * Desde el calendario se puede hacer clic en una reserva para abrir
 * directamente el modal de configuración de reparto QR.
 *
 * Backend consumido:
 *   GET   /admin/reservas                        → lista filtrable
 *   PATCH /admin/reservas/{id}/reparto           → configurar reintegro QR
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import CalendarioMensual from '../components/CalendarioMensual'
import {
  Calendar,
  Filter,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  Users,
  DollarSign,
  X,
  Check,
  Loader2,
  MapPin,
  Clock,
  List,
  LayoutGrid,
  Tent,
  Volleyball,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

// ─── Configuración de instalaciones ──────────────────────────────────────────
// Fuente única de verdad — misma lógica que SocioCancha.jsx.
// Si el club agrega una cancha nueva, solo se edita acá.

const GRUPOS = [
  {
    key:    'canchas',
    label:  'Canchas',
    icon:   Volleyball,
    instalaciones: ['cancha_1', 'cancha_2'],
    color:  'blue',
  },
  {
    key:    'quincho',
    label:  'Quincho',
    icon:   Tent,
    instalaciones: ['quincho'],
    color:  'amber',
  },
]

// Todas las instalaciones del grupo activo
const instalacionesDe = (grupoKey) =>
  GRUPOS.find(g => g.key === grupoKey)?.instalaciones ?? []

// Label legible de una instalación
const labelInstalacion = (key) =>
  key === 'quincho' ? 'Quincho' : key.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())

// ─── Estado / colores ─────────────────────────────────────────────────────────

const ESTADOS = [
  { value: '',           label: 'Todos'      },
  { value: 'bloqueada',  label: 'Bloqueada'  },
  { value: 'confirmada', label: 'Confirmada' },
  { value: 'liberada',   label: 'Liberada'   },
  { value: 'expirada',   label: 'Expirada'   },
]

const ESTADO_BADGE = {
  bloqueada:  'bg-amber-100 text-amber-700',
  confirmada: 'bg-green-100 text-green-700',
  liberada:   'bg-gray-100 text-gray-500',
  expirada:   'bg-red-100 text-red-700',
}

// Color del chip en el calendario por estado
const CHIP_ESTADO = {
  bloqueada:  'bg-amber-400 text-amber-900',
  confirmada: 'bg-green-500 text-white',
  liberada:   'bg-gray-300 text-gray-600',
  expirada:   'bg-red-400 text-white',
}

// Reservas que necesitan configuración de reparto (alerta naranja)
// Solo las canchas tienen reintegro QR — el quincho no usa ese sistema.
const INSTALACIONES_CON_REINTEGRO = ['cancha_1', 'cancha_2']

function esSinReparto(r) {
  return (
    INSTALACIONES_CON_REINTEGRO.includes(r.instalacion) &&
    (r.estado === 'bloqueada' || r.estado === 'confirmada') &&
    (r.num_socios_esperados === null || r.num_socios_esperados === undefined) &&
    new Date(r.fecha_fin) >= new Date()
  )
}

// ─── Helpers de formato ───────────────────────────────────────────────────────

const formatoFechaHora = (iso) =>
  new Date(iso).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

const formatoHora = (iso) =>
  new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

// ─── Toggle Lista / Calendario ────────────────────────────────────────────────

function VistaToggle({ vista, onChange }) {
  return (
    <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-1">
      {[
        { key: 'lista',      icon: List,       label: 'Lista'      },
        { key: 'calendario', icon: LayoutGrid,  label: 'Calendario' },
      ].map(({ key, icon: Icon, label }) => (
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

// ─── Modal de configuración de reparto ───────────────────────────────────────

function ModalReparto({ reserva, onClose, onGuardado }) {
  const { token } = useAuth()
  const [numSocios,    setNumSocios]    = useState(reserva.num_socios_esperados ?? '')
  const [monto,        setMonto]        = useState(reserva.monto_reintegro_unitario ?? '')
  const [autoCalcular, setAutoCalcular] = useState(reserva.monto_reintegro_unitario == null)
  const [guardando,    setGuardando]    = useState(false)
  const [error,        setError]        = useState(null)

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
          num_socios_esperados:     Number(numSocios),
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
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Configurar reintegro QR</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-0.5">
          <p className="font-semibold text-gray-800">{labelInstalacion(reserva.instalacion)}</p>
          <p className="text-sm text-gray-500">{formatoFechaHora(reserva.fecha_inicio)}</p>
          {reserva.notas && (
            <p className="text-xs text-gray-400 italic">{reserva.notas}</p>
          )}
        </div>

        <form onSubmit={handleGuardar} className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1">
              Socios esperados
            </label>
            <input
              type="number" min={1}
              value={numSocios}
              onChange={e => setNumSocios(e.target.value)}
              className="form-input w-full"
              placeholder="Ej: 10"
              autoFocus
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={autoCalcular}
              onChange={e => setAutoCalcular(e.target.checked)}
              className="rounded"
            />
            Calcular automáticamente (20% del precio ÷ socios esperados)
          </label>

          {!autoCalcular && (
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-1">
                Reintegro por socio ($)
              </label>
              <input
                type="number" min={0} step="0.01"
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
              type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit" disabled={guardando}
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

// ─── Componente principal ─────────────────────────────────────────────────────

export default function AdminReservas() {
  const { token } = useAuth()

  const [reservas,  setReservas]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)

  // Grupo activo: 'canchas' | 'quincho'
  const [grupoActivo, setGrupoActivo] = useState('canchas')

  // Vista: 'lista' | 'calendario'
  const [vista, setVista]   = useState('lista')
  const [mes,   setMes]     = useState(new Date())

  // Filtros (solo visibles en vista lista)
  const [filtroInstalacion, setFiltroInstalacion] = useState('')
  const [filtroEstado,      setFiltroEstado]      = useState('')
  const [filtroDesde,       setFiltroDesde]       = useState('')
  const [filtroHasta,       setFiltroHasta]       = useState('')
  const [soloSinReparto,    setSoloSinReparto]    = useState(false)

  const [reservaEditando, setReservaEditando] = useState(null)

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchReservas = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()

      // En vista calendario traemos todo el mes y filtramos en cliente.
      // El backend solo acepta un estado a la vez, y no vale la pena
      // hacer dos fetches — el volumen de reservas por mes es bajo.
      if (vista === 'calendario') {
        const desde = new Date(mes.getFullYear(), mes.getMonth(), 1)
        const hasta  = new Date(mes.getFullYear(), mes.getMonth() + 1, 0)
        params.set('desde', desde.toISOString().slice(0, 10))
        params.set('hasta', hasta.toISOString().slice(0, 10))
      } else {
        if (filtroInstalacion) params.set('instalacion', filtroInstalacion)
        if (filtroEstado)      params.set('estado',      filtroEstado)
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
  }, [token, vista, mes, filtroInstalacion, filtroEstado, filtroDesde, filtroHasta])

  useEffect(() => { fetchReservas() }, [fetchReservas])

  // Cuando cambia el grupo, limpiar el filtro de instalación específica
  const handleGrupoChange = (key) => {
    setGrupoActivo(key)
    setFiltroInstalacion('')
    setSoloSinReparto(false)
  }

  // ── Guardar reparto ───────────────────────────────────────────────────────
  const handleGuardadoReparto = (reservaActualizada) => {
    setReservas(prev => prev.map(r =>
      r.id_reserva === reservaActualizada.id_reserva
        ? { ...r, ...reservaActualizada }
        : r
    ))
    setReservaEditando(null)
  }

  // ── Filtrar por grupo activo ──────────────────────────────────────────────
  const instDelGrupo = instalacionesDe(grupoActivo)

  const reservasFiltradas = useMemo(() => {
    let lista = reservas.filter(r => instDelGrupo.includes(r.instalacion))
    if (vista === 'calendario') {
      // En el calendario solo mostramos lo que tiene valor de acción:
      // bloqueada (pendiente de pago) y confirmada (reserva firme).
      // Liberadas y expiradas son historia y solo ensuciaban la grilla.
      lista = lista.filter(r => r.estado === 'bloqueada' || r.estado === 'confirmada')
    } else {
      if (filtroInstalacion) lista = lista.filter(r => r.instalacion === filtroInstalacion)
      if (soloSinReparto)    lista = lista.filter(esSinReparto)
    }
    return lista
  }, [reservas, instDelGrupo, vista, filtroInstalacion, soloSinReparto])

  const reservasSinReparto = useMemo(
    () => reservasFiltradas.filter(esSinReparto),
    [reservasFiltradas]
  )

  // ── Render chip del calendario ────────────────────────────────────────────
  const renderReservaCalendario = useCallback((reserva) => {
    const chipClass = CHIP_ESTADO[reserva.estado] ?? 'bg-gray-300 text-gray-700'
    const sinConfig = esSinReparto(reserva)
    return (
      <button
        onClick={() => setReservaEditando(reserva)}
        title={`${labelInstalacion(reserva.instalacion)} — ${reserva.estado}${sinConfig ? ' ⚠️ sin reparto' : ''}`}
        className={`w-full text-left px-1.5 py-0.5 rounded text-[10px] font-semibold truncate transition-opacity hover:opacity-80 ${chipClass} ${sinConfig ? 'ring-1 ring-red-400 ring-offset-0' : ''}`}
      >
        {formatoHora(reserva.fecha_inicio)} {labelInstalacion(reserva.instalacion)}
      </button>
    )
  }, [])

  // ── UI ────────────────────────────────────────────────────────────────────
  const grupoInfo = GRUPOS.find(g => g.key === grupoActivo)

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">

      {reservaEditando && (
        <ModalReparto
          reserva={reservaEditando}
          onClose={() => setReservaEditando(null)}
          onGuardado={handleGuardadoReparto}
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
            Instalaciones, alquileres y reintegros QR.
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

      {/* Tabs de grupo: Canchas / Quincho */}
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

      {/* Alerta: sin reparto (solo en lista) */}
      {vista === 'lista' && !loading && reservasSinReparto.length > 0 && (
        <button
          type="button"
          onClick={() => setSoloSinReparto(v => !v)}
          className={`w-full flex items-center gap-3 p-4 rounded-2xl border text-left transition-colors ${
            soloSinReparto
              ? 'bg-red-100 border-red-300'
              : 'bg-red-50 border-red-200 hover:bg-red-100'
          }`}
        >
          <AlertTriangle size={20} className="text-red-600 flex-shrink-0" />
          <span className="flex-1 text-sm text-red-800">
            <strong>{reservasSinReparto.length}</strong> turno{reservasSinReparto.length !== 1 ? 's' : ''} sin reintegro QR configurado — el escáner los va a rechazar.
          </span>
          <span className="text-xs font-semibold text-red-700 flex-shrink-0">
            {soloSinReparto ? 'Ver todas' : 'Ver solo estas'}
          </span>
        </button>
      )}

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
              {/* Si hay más de una instalación en el grupo, un calendario por cada una */}
              {instDelGrupo.map(inst => {
                const reservasDeEsta = reservasFiltradas.filter(r => r.instalacion === inst)
                return (
                  <div key={inst}>
                    {instDelGrupo.length > 1 && (
                      <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wider mb-2 px-1">
                        {labelInstalacion(inst)}
                      </h2>
                    )}
                    <CalendarioMensual
                      eventos={reservasDeEsta.map(r => ({
                        ...r,
                        // CalendarioMensual espera "fecha_inicio" — ya viene así ✅
                        id_evento: r.id_reserva, // alias para la key interna del componente
                      }))}
                      mes={mes}
                      onMesChange={setMes}
                      renderEvento={renderReservaCalendario}
                    />
                  </div>
                )
              })}

              {/* Leyenda de estados — solo los que aparecen en el calendario */}
              <div className="flex flex-wrap items-center gap-3 px-1">
                {[
                  { estado: 'bloqueada',  cls: CHIP_ESTADO.bloqueada,  label: 'Bloqueada'  },
                  { estado: 'confirmada', cls: CHIP_ESTADO.confirmada, label: 'Confirmada' },
                ].map(({ cls, label }) => (
                  <span key={label} className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className={`w-2.5 h-2.5 rounded-sm ${cls.split(' ')[0]}`} />
                    {label}
                  </span>
                ))}
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span className="w-2.5 h-2.5 rounded-sm bg-gray-300 ring-1 ring-red-400" />
                  Sin reparto QR
                </span>
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
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-500 pr-2">
              <Filter size={15} /> Filtros
            </div>

            {/* Sub-filtro de instalación dentro del grupo */}
            {instDelGrupo.length > 1 && (
              <select
                value={filtroInstalacion}
                onChange={e => setFiltroInstalacion(e.target.value)}
                className="form-input text-sm w-40"
              >
                <option value="">Todas las {grupoInfo?.label}</option>
                {instDelGrupo.map(inst => (
                  <option key={inst} value={inst}>{labelInstalacion(inst)}</option>
                ))}
              </select>
            )}

            <select
              value={filtroEstado}
              onChange={e => setFiltroEstado(e.target.value)}
              className="form-input text-sm w-40"
            >
              {ESTADOS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>

            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-400">Desde</label>
              <input
                type="date" value={filtroDesde}
                onChange={e => setFiltroDesde(e.target.value)}
                className="form-input text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-400">Hasta</label>
              <input
                type="date" value={filtroHasta}
                onChange={e => setFiltroHasta(e.target.value)}
                className="form-input text-sm"
              />
            </div>
          </div>

          {/* Skeleton */}
          {loading && [...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 h-24 animate-pulse" />
          ))}

          {/* Cards de reservas */}
          {!loading && reservasFiltradas.map(r => (
            <div
              key={r.id_reserva}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center justify-between gap-4 flex-wrap"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-gray-900">{labelInstalacion(r.instalacion)}</p>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${ESTADO_BADGE[r.estado] ?? 'bg-gray-100 text-gray-500'}`}>
                    {r.estado}
                  </span>
                  {esSinReparto(r) && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 flex items-center gap-1">
                      <AlertTriangle size={11} /> Sin reparto QR
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-1.5 text-sm text-gray-500 flex-wrap">
                  <span className="flex items-center gap-1.5">
                    <Clock size={13} />
                    {formatoFechaHora(r.fecha_inicio)}
                    {r.fecha_fin && ` → ${formatoHora(r.fecha_fin)}`}
                  </span>
                  {r.nombre_responsable && (
                    <span className="flex items-center gap-1.5">
                      <MapPin size={13} /> {r.nombre_responsable}
                    </span>
                  )}
                  {r.num_socios_esperados != null && (
                    <span className="flex items-center gap-1.5">
                      <Users size={13} />
                      {r.escaneos_realizados ?? 0}/{r.num_socios_esperados} escanearon
                    </span>
                  )}
                  {r.monto_reintegro_unitario != null && (
                    <span className="flex items-center gap-1.5">
                      <DollarSign size={13} /> ${Number(r.monto_reintegro_unitario).toLocaleString('es-AR')} c/u
                    </span>
                  )}
                </div>
                {r.notas && (
                  <p className="text-xs text-gray-400 mt-1 truncate italic">{r.notas}</p>
                )}
              </div>

              {(r.estado === 'bloqueada' || r.estado === 'confirmada') && (
                <button
                  onClick={() => setReservaEditando(r)}
                  className={`flex-shrink-0 text-xs font-semibold px-3 py-2 rounded-xl transition-colors ${
                    esSinReparto(r)
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {r.num_socios_esperados != null ? 'Editar reparto' : 'Configurar reintegro'}
                </button>
              )}
            </div>
          ))}

          {!loading && !error && reservasFiltradas.length === 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-gray-500">
              {soloSinReparto
                ? '🎉 No hay reservas sin reparto configurado.'
                : `No hay reservas de ${grupoInfo?.label.toLowerCase()} con esos filtros.`}
            </div>
          )}
        </div>
      )}
    </div>
  )
}