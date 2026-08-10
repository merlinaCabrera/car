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
import { useNavigate } from 'react-router-dom'
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
  Search,
  ChevronDown,
  ChevronUp,
  Wallet,
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
          className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
            vista === key
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Icon size={15} />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  )
}

// ─── Modal detalle de reserva ─────────────────────────────────────────────────

function ModalDetalleReserva({ reserva, onClose }) {
  const navigate = useNavigate()
  const color   = colorDeReserva(reserva)
  const ahora   = new Date()
  const vencida = reserva.estado_orden === 'pendiente_verificacion' &&
                  new Date(reserva.fecha_fin) < ahora

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
                El turno ya pasó y la orden nunca fue aprobada. Andá a Verificaciones para
                resolverla (aprobarla si el socio pagó, o rechazarla para liberar el registro).
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
              <span>
                {reserva.nombre_responsable}
                {reserva.dni_responsable && ` · DNI ${reserva.dni_responsable}`}
              </span>
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

        {/* Esta página es solo de visualización — aprobar/rechazar se hace
            desde Verificaciones, donde está el comprobante y el resto de
            las órdenes del mismo pago. */}
        {reserva.estado_orden === 'pendiente_verificacion' && (
          <button
            onClick={() => navigate('/admin/verificaciones')}
            className="w-full py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
          >
            Ir a Verificaciones para aprobar
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

  // ── Cobro opcional ─────────────────────────────────────────────────────────
  const [cobroActivo, setCobroActivo] = useState(false)
  const [usuarios, setUsuarios] = useState([])
  const [cargandoUsuarios, setCargandoUsuarios] = useState(false)
  const [busquedaSocio, setBusquedaSocio] = useState('')
  const [persona, setPersona] = useState(null)  // usuario seleccionado (socio o invitado)
  const [cargandoInvitado, setCargandoInvitado] = useState(false)
  const [productos, setProductos] = useState([])
  const [cargandoProductos, setCargandoProductos] = useState(false)
  const [idProducto, setIdProducto] = useState('')
  const [cantidad, setCantidad] = useState(1)

  // Trae la lista de usuarios (para buscar socio) y el catálogo de alquileres
  // recién cuando el admin activa "Registrar cobro" — no antes, para no pagar
  // ese costo si nunca lo va a usar.
  useEffect(() => {
    if (!cobroActivo || usuarios.length > 0) return
    setCargandoUsuarios(true)
    fetch(`${API}/admin/usuarios`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => setUsuarios(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setCargandoUsuarios(false))

    setCargandoProductos(true)
    fetch(`${API}/admin/productos`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => setProductos(Array.isArray(data) ? data.filter(p => p.categoria === 'alquiler' && p.es_activo) : []))
      .catch(() => {})
      .finally(() => setCargandoProductos(false))
  }, [cobroActivo, token, usuarios.length])

  const usuariosFiltrados = useMemo(() => {
    const q = busquedaSocio.trim().toLowerCase()
    if (!q) return []
    return usuarios
      .filter(u =>
        `${u.nombre} ${u.apellido}`.toLowerCase().includes(q) ||
        u.dni?.includes(q)
      )
      .slice(0, 6)
  }, [busquedaSocio, usuarios])

  const usarCuentaInvitado = async () => {
    setCargandoInvitado(true)
    setError(null)
    try {
      const res = await fetch(`${API}/admin/usuarios/cuenta-invitado`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail ?? 'No se pudo obtener la cuenta Invitado.')
      setPersona(data)
      setBusquedaSocio('')
    } catch (err) {
      setError(err.message)
    } finally {
      setCargandoInvitado(false)
    }
  }

  const productoSeleccionado = productos.find(p => String(p.id_producto) === String(idProducto))
  const montoEstimado = productoSeleccionado ? Number(productoSeleccionado.precio_actual) * cantidad : 0

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
    if (cobroActivo && (!persona || !idProducto)) {
      setError('Para registrar el cobro elegí a quién se le imputa y qué producto se está cobrando.')
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
          ...(cobroActivo ? {
            id_usuario_pago: persona.id_usuario,
            id_producto:     Number(idProducto),
            cantidad,
          } : {}),
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
              Para socios sin app o no-socios. El cobro es opcional.
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
            <p className="text-[11px] text-gray-400 mt-1">
              Queda anotado acá aunque el cobro (si lo registrás abajo) quede a
              nombre de la cuenta Invitado — así sabés después quién fue.
            </p>
          </div>

          <div>
            <label className={L}>Notas <span className="font-normal normal-case text-gray-400">(opcional)</span></label>
            <input
              type="text" name="notas_extra"
              value={form.notas_extra} onChange={handleChange}
              placeholder="Grupo, evento, referencia..."
              className="form-input w-full"
            />
          </div>

          {/* ── Cobro opcional ────────────────────────────────────────────── */}
          <div className="border-t pt-4">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={cobroActivo}
                onChange={(e) => setCobroActivo(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-slate-900 focus:ring-slate-900"
              />
              <span className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                <Wallet size={15} className="text-gray-500" />
                Registrar cobro (efectivo)
              </span>
            </label>
            <p className="text-[11px] text-gray-400 mt-1 ml-6">
              Si lo dejás sin marcar, la reserva queda solo como bloqueo de
              agenda, sin que se registre ningún ingreso.
            </p>

            {cobroActivo && (
              <div className="mt-3 space-y-3 bg-gray-50 rounded-xl p-3 border border-gray-100">
                {/* A quién se le imputa */}
                <div>
                  <label className={L}>¿A quién se le cobra?</label>
                  {persona ? (
                    <div className="flex items-center justify-between gap-2 bg-white rounded-lg border border-gray-200 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">
                          {persona.nombre} {persona.apellido}
                        </p>
                        <p className="text-xs text-gray-400">DNI {persona.dni}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPersona(null)}
                        className="text-xs font-semibold text-gray-400 hover:text-gray-600 flex-shrink-0"
                      >
                        Cambiar
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="relative">
                        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        <input
                          type="text"
                          value={busquedaSocio}
                          onChange={(e) => setBusquedaSocio(e.target.value)}
                          placeholder={cargandoUsuarios ? 'Cargando socios…' : 'Buscar socio por nombre o DNI...'}
                          disabled={cargandoUsuarios}
                          className="form-input w-full pl-7 text-sm"
                        />
                      </div>
                      {usuariosFiltrados.length > 0 && (
                        <div className="mt-1 border border-gray-200 rounded-lg overflow-hidden bg-white max-h-36 overflow-y-auto">
                          {usuariosFiltrados.map(u => (
                            <button
                              key={u.id_usuario}
                              type="button"
                              onClick={() => { setPersona(u); setBusquedaSocio('') }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b last:border-b-0 border-gray-100"
                            >
                              <span className="font-medium text-gray-800">{u.nombre} {u.apellido}</span>
                              <span className="text-gray-400 ml-2">DNI {u.dni}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={usarCuentaInvitado}
                        disabled={cargandoInvitado}
                        className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-dashed border-gray-300 text-xs font-semibold text-gray-500 hover:bg-white hover:border-gray-400 transition-colors disabled:opacity-50"
                      >
                        {cargandoInvitado ? <Loader2 size={13} className="animate-spin" /> : <Users size={13} />}
                        No es socio — usar cuenta Invitado
                      </button>
                    </>
                  )}
                </div>

                {/* Qué se cobra */}
                <div>
                  <label className={L}>Producto</label>
                  <select
                    value={idProducto}
                    onChange={(e) => setIdProducto(e.target.value)}
                    disabled={cargandoProductos}
                    className="form-input w-full text-sm"
                  >
                    <option value="">{cargandoProductos ? 'Cargando…' : 'Elegí un producto de alquiler'}</option>
                    {productos.map(p => (
                      <option key={p.id_producto} value={p.id_producto}>
                        {p.nombre} — ${Number(p.precio_actual).toLocaleString('es-AR')}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={L}>Cantidad</label>
                    <input
                      type="number" min={1} value={cantidad}
                      onChange={(e) => setCantidad(Math.max(1, Number(e.target.value) || 1))}
                      className="form-input w-full text-sm"
                    />
                  </div>
                  <div>
                    <label className={L}>Total</label>
                    <div className="form-input w-full text-sm bg-gray-100 text-gray-600 flex items-center font-semibold">
                      ${montoEstimado.toLocaleString('es-AR')}
                    </div>
                  </div>
                </div>
              </div>
            )}
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

// ─── Tarjeta de Reserva — vista Lista ──────────────────────────────────────
// Colapsada por defecto: solo cancha/quincho, horario, socio y estado del
// pago quedan visibles. El resto (notas, DNI) se despliega al tocar la
// tarjeta. Esta página es solo de visualización — no se aprueba ni se
// rechaza nada acá, para eso está /admin/verificaciones (el botón "Ver más"
// abre el modal que ya redirige para allá si la orden está pendiente).
function TarjetaReservaLista({ reserva, onVerDetalle }) {
  const [expandido, setExpandido] = useState(false)
  const color = colorDeReserva(reserva)

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setExpandido(e => !e)}
        className="w-full text-left p-4 flex items-center gap-3 hover:bg-gray-50 transition-colors"
      >
        {/* Franja de color por estado */}
        <div className={`w-1.5 self-stretch rounded-full flex-shrink-0 ${color.chip.split(' ')[0]}`} />

        <div className="min-w-0 flex-1">
          <p className="font-medium text-gray-900">{labelInstalacion(reserva.instalacion)}</p>
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {formatoFechaHora(reserva.fecha_inicio)}
            {reserva.fecha_fin && ` → ${formatoHora(reserva.fecha_fin)}`}
            {reserva.nombre_responsable && ` · ${reserva.nombre_responsable}`}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${color.badge}`}>
            {color.label}
          </span>
          {expandido ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </div>
      </button>

      {expandido && (
        <div className="px-4 pb-4 space-y-2 border-t border-gray-50 pt-3">
          {reserva.dni_responsable && (
            <p className="text-xs text-gray-500">DNI {reserva.dni_responsable}</p>
          )}
          {reserva.notas && (
            <p className="text-xs text-gray-400 italic">{reserva.notas}</p>
          )}

          {reserva.estado_orden === 'pendiente_verificacion' && (
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-gray-50 mt-2">
              <p className="text-xs text-amber-700">Pago pendiente — se aprueba desde Verificaciones.</p>
              <button
                onClick={(e) => { e.stopPropagation(); onVerDetalle(reserva) }}
                className="flex-shrink-0 text-xs font-semibold text-blue-600 hover:text-blue-700"
              >
                Ver más →
              </button>
            </div>
          )}
          {reserva.estado_orden !== 'pendiente_verificacion' && (
            <button
              onClick={(e) => { e.stopPropagation(); onVerDetalle(reserva) }}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700"
            >
              Ver más →
            </button>
          )}
        </div>
      )}
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
  const [busqueda,           setBusqueda]           = useState('') // nombre o DNI del socio

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
  }, [token, vista, mes, filtroInstalacion])

  useEffect(() => { fetchReservas() }, [fetchReservas])

  const handleGrupoChange = (key) => {
    setGrupoActivo(key)
    setFiltroInstalacion('')
  }

  // Nota: /admin/reservas es solo de visualización. El rechazo/aprobación de
  // una reserva pendiente se hace desde /admin/verificaciones (el modal de
  // detalle redirige para allá), así que no hay handler de rechazo acá.

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
    const busquedaNorm = busqueda.trim().toLowerCase()
    if (busquedaNorm) {
      lista = lista.filter(r =>
        r.nombre_responsable?.toLowerCase().includes(busquedaNorm) ||
        r.dni_responsable?.toLowerCase().includes(busquedaNorm)
      )
    }
    return lista
  }, [reservas, instDelGrupo, vista, filtroInstalacion, filtroEstadoOrden, filtroCalendario, busqueda])

  // Para la vista Lista: pendientes de pago siempre arriba (sort estable,
  // conserva el orden que ya traía dentro de cada bloque). Si el admin ya
  // filtró por un estado puntual no tiene sentido reordenar — es un solo tipo.
  const reservasOrdenadasParaLista = useMemo(() => {
    if (filtroEstadoOrden) return reservasFiltradas
    const copia = [...reservasFiltradas]
    copia.sort((a, b) => {
      const aPend = a.estado_orden === 'pendiente_verificacion' ? 0 : 1
      const bPend = b.estado_orden === 'pendiente_verificacion' ? 0 : 1
      return aPend - bPend
    })
    return copia
  }, [reservasFiltradas, filtroEstadoOrden])

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
        />
      )}

      {modalNuevaAbierto && (
        <ModalNuevaReserva
          onClose={() => setModalNuevaAbierto(false)}
          onGuardado={handleNuevaReservaGuardada}
        />
      )}

      {/* Header */}
      <div className="space-y-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Calendar size={22} className="text-gray-500 flex-shrink-0" />
            Agenda de Reservas
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Quincho y canchas — estado de pagos y ocupación.
          </p>
        </div>

        {/* Tabs: Canchas / Quincho — base, arriba de todo */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit mx-auto">
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

        {/* Barra de filtros — mismo patrón que Gestión de Eventos */}
        <div className="flex flex-nowrap items-center gap-1.5 sm:gap-3 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 sm:overflow-visible">
          {instDelGrupo.length > 1 && (
            <div className="relative flex-shrink-0">
              <Filter size={13} className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none z-10" />
              <select
                value={filtroInstalacion}
                onChange={e => setFiltroInstalacion(e.target.value)}
                className="form-input pl-7 pr-5 sm:pl-8 sm:pr-7 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold text-gray-600 w-auto"
                title="Filtrar por cancha"
              >
                <option value="">Canchas</option>
                {instDelGrupo.map(inst => (
                  <option key={inst} value={inst}>{labelInstalacion(inst)}</option>
                ))}
              </select>
            </div>
          )}

          <div className="relative flex-shrink-0">
            <Filter size={13} className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none z-10" />
            <select
              value={vista === 'calendario' ? filtroCalendario : filtroEstadoOrden}
              onChange={e =>
                vista === 'calendario'
                  ? setFiltroCalendario(e.target.value)
                  : setFiltroEstadoOrden(e.target.value)
              }
              className="form-input pl-7 pr-5 sm:pl-8 sm:pr-7 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold text-gray-600 w-auto"
              title="Filtrar por estado"
            >
              <option value="">Estados</option>
              <option value="pendiente_verificacion">Pendiente</option>
              <option value="aprobada">Aprobada</option>
              {vista === 'lista' && (
                <>
                  <option value="rechazada">Rechazada</option>
                  <option value="cancelada_socio">Cancelada</option>
                  <option value="expirada">Expirada</option>
                </>
              )}
            </select>
          </div>

          <div className="flex-shrink-0">
            <VistaToggle vista={vista} onChange={setVista} />
          </div>

          <button
            onClick={() => setModalNuevaAbierto(true)}
            className="flex-shrink-0 inline-flex items-center gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-green-600 text-white font-semibold hover:bg-green-700 transition-colors shadow-sm text-sm"
            title="Nueva Reserva"
          >
            <PlusCircle size={16} />
            <span className="hidden sm:inline">Nueva Reserva</span>
          </button>

          <button
            onClick={fetchReservas}
            disabled={loading}
            className="flex-shrink-0 p-1.5 sm:p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 transition-colors"
            title="Actualizar"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Buscador por socio: nombre o DNI de quien alquiló */}
        <div className="relative">
          <Search size={13} className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por socio o DNI..."
            className="form-input pl-7 sm:pl-8 py-1.5 sm:py-2 text-xs sm:text-sm w-full"
          />
        </div>
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
          {/* Skeleton */}
          {loading && [...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm h-20 animate-pulse" />
          ))}

          {/* Cards — pendientes de pago siempre arriba, mismo criterio que
              en Verificaciones, así no hay que ir a buscarlas entre las
              ya resueltas. */}
          {!loading && reservasOrdenadasParaLista.map((r, i, arr) => {
            const esPendiente = r.estado_orden === 'pendiente_verificacion'
            const anterior = arr[i - 1]
            const mostrarDivisorPendientes = i === 0 && esPendiente
            const mostrarDivisorResto = i > 0 && anterior?.estado_orden === 'pendiente_verificacion' && !esPendiente
            return (
              <div key={r.id_reserva}>
                {mostrarDivisorPendientes && (
                  <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <Clock size={12} /> Pendientes de pago
                  </p>
                )}
                {mostrarDivisorResto && (
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 mt-1">Resto</p>
                )}
                <TarjetaReservaLista reserva={r} onVerDetalle={setReservaDetalle} />
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