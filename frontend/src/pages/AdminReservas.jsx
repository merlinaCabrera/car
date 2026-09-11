// frontend/src/pages/AdminReservas.jsx
/**
 * Agenda de Reservas — panel del admin.
 *
 * Rediseño de la ronda 5 de QA. Antes esto era una lista de filas (más una
 * vista calendario secundaria) que mezclaba quincho y canchas: para saber si
 * un turno estaba libre había que leer la tabla entera y hacer la cuenta a
 * mano. Ahora el admin ve LA MISMA GRILLA QUE VE EL SOCIO, con dos
 * diferencias, que son justamente las que necesita el club:
 *
 *   1. Cada turno ocupado dice DE QUIÉN es — nombre y DNI del socio, o el
 *      motivo si es un bloqueo del club (mantenimiento, reunión de comisión).
 *   2. No hay tope de fechas. El socio solo ve de hoy en adelante (y las
 *      canchas, dos semanas); el admin navega a cualquier mes, pasado o futuro.
 *
 * Quincho  → grilla mensual con las dos franjas fijas (Día / Noche).
 * Canchas  → grilla mensual para elegir día; los turnos horarios de ese día se
 *            despliegan DEBAJO del calendario, con su estado uno por uno.
 *
 * Los turnos (qué horarios existen, cuánto duran) NO se definen acá: vienen de
 * `utils/reservas.js`, el mismo módulo que usan `Reservas.jsx` y
 * `SocioCancha.jsx`. Si esta pantalla tuviera su propia copia, podría mostrar
 * libre un turno que el socio no puede pedir.
 */

import { textoError } from '../utils/errores';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import ConfirmDialog from '../components/ConfirmDialog'
import {
  CANCHAS,
  DURACION_TURNO_CANCHA_HORAS,
  NOMBRES_MES,
  NOMBRES_DIA_SEMANA,
  TURNOS_QUINCHO,
  diasEnMes,
  esBloqueoManual,
  fechaLocal,
  horaLabel,
  indiceDiaSemana,
  isoDeFechaLocal,
  rangoTurnoCancha,
  rangoTurnoQuincho,
  reservaQueOcupa,
  turnosDeCancha,
} from '../utils/reservas'
import {
  AlertCircle,
  Ban,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Lock,
  Moon,
  PlusCircle,
  RefreshCw,
  Search,
  Sun,
  Tent,
  User,
  Users,
  Volleyball,
  Wallet,
  X,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

// ─── Instalaciones ────────────────────────────────────────────────────────────

const GRUPOS = [
  { key: 'canchas', label: 'Canchas', icon: Volleyball },
  { key: 'quincho', label: 'Quincho', icon: Tent },
]

const labelInstalacion = (key) =>
  key === 'quincho'
    ? 'Quincho'
    : (CANCHAS.find(c => c.key === key)?.label ?? key.replace('_', ' '))

const ICONOS_TURNO_QUINCHO = { dia: Sun, noche: Moon }

// Estados de la reserva que efectivamente ocupan la agenda. Mismo criterio que
// `_ESTADOS_OCUPA_AGENDA` en el backend: una reserva 'liberada' o 'expirada'
// sigue existiendo como fila pero su turno vuelve a estar disponible, así que
// pintarla ocuparía un turno que el socio ve libre.
const ESTADOS_OCUPA_AGENDA = ['bloqueada', 'confirmada']

// ─── Estado de pago → colores ─────────────────────────────────────────────────
//
// Ojo con el verde: en esta pantalla está reservado para LIBRE, que es la
// pregunta que el admin viene a responder ("¿puedo darle este turno a
// alguien?"). Un turno pagado es azul, no verde.

const COLOR_ORDEN = {
  pendiente_verificacion: {
    celda: 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100',
    badge: 'bg-amber-100 text-amber-800',
    label: 'Pago pendiente',
  },
  aprobada: {
    celda: 'bg-blue-50 border-blue-300 text-blue-900 hover:bg-blue-100',
    badge: 'bg-blue-100 text-blue-800',
    label: 'Pagada',
  },
  rechazada:       { celda: 'bg-gray-100 border-gray-300 text-gray-500', badge: 'bg-gray-100 text-gray-500', label: 'Rechazada' },
  cancelada_socio: { celda: 'bg-gray-100 border-gray-300 text-gray-500', badge: 'bg-gray-100 text-gray-500', label: 'Cancelada' },
  expirada:        { celda: 'bg-gray-100 border-gray-300 text-gray-500', badge: 'bg-gray-100 text-gray-500', label: 'Expirada' },
}

// Reserva manual del admin con cobro en ventanilla: hay socio, pero no pasó por
// el circuito de comprobantes.
const COLOR_SIN_ORDEN = {
  celda: 'bg-indigo-50 border-indigo-300 text-indigo-900 hover:bg-indigo-100',
  badge: 'bg-indigo-100 text-indigo-700',
  label: 'Carga manual',
}

const COLOR_BLOQUEO = {
  celda: 'bg-red-50 border-red-300 text-red-900 hover:bg-red-100',
  badge: 'bg-red-100 text-red-700',
  label: 'Inhabilitado',
}

const colorDeReserva = (r) => {
  if (esBloqueoManual(r)) return COLOR_BLOQUEO
  return COLOR_ORDEN[r.estado_orden] ?? COLOR_SIN_ORDEN
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatoFechaHora = (iso) =>
  new Date(iso).toLocaleString('es-AR', {
    weekday: 'short', day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })

const formatoHora = (iso) =>
  new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

/**
 * Qué pasa con un turno: libre, reservado por alguien, o bloqueado por el club.
 * Es LA función de esta pantalla — todo lo demás es cómo se dibuja.
 */
function estadoDeTurno(reservasQueOcupan, inicio, fin) {
  const reserva = reservaQueOcupa(reservasQueOcupan, inicio, fin)
  if (!reserva) return { tipo: 'libre', reserva: null }
  return { tipo: esBloqueoManual(reserva) ? 'bloqueo' : 'reserva', reserva }
}

/** Texto corto para meter dentro de una celda chica. */
function etiquetaCorta(estado) {
  if (estado.tipo === 'libre') return 'Libre'
  if (estado.tipo === 'bloqueo') return estado.reserva.notas || 'Inhabilitado'
  return estado.reserva.nombre_responsable || estado.reserva.notas || 'Reservado'
}

// ─── Modal: bloquear / inhabilitar un turno ───────────────────────────────────

function ModalBloquearTurno({ turno, onClose, onBloqueado }) {
  const { token } = useAuth()
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  const enviandoRef = useRef(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (motivo.trim().length < 3) {
      setError('Escribí un motivo — es lo que vas a leer cuando abras la agenda en tres semanas.')
      return
    }
    if (enviandoRef.current) return
    enviandoRef.current = true
    setGuardando(true)
    setError(null)
    try {
      const res = await fetch(`${API}/admin/reservas/bloqueo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instalacion:  turno.instalacion,
          fecha_inicio: turno.inicio.toISOString(),
          fecha_fin:    turno.fin.toISOString(),
          motivo:       motivo.trim(),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(textoError(data?.detail, 'No se pudo bloquear el turno.'))
      onBloqueado(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
      enviandoRef.current = false
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Inhabilitar turno</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {labelInstalacion(turno.instalacion)} · {turno.etiqueta}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 flex-shrink-0">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
            Motivo
          </label>
          <input
            autoFocus
            value={motivo}
            onChange={e => { setMotivo(e.target.value); setError(null) }}
            placeholder="Mantenimiento de la cancha, reunión de comisión…"
            maxLength={300}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
          />
          <p className="text-[11px] text-gray-400 mt-1.5">
            El turno deja de ofrecerse a los socios. No hay cobro ni socio asociado:
            para cargar un alquiler cobrado en ventanilla usá «Nueva reserva manual».
          </p>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={guardando || motivo.trim().length < 3}
            className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {guardando && <Loader2 size={14} className="animate-spin" />}
            {guardando ? 'Bloqueando…' : 'Inhabilitar turno'}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={guardando}
            className="px-4 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold text-gray-600 hover:bg-gray-50"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Modal: detalle de un turno ocupado ───────────────────────────────────────

function ModalDetalleReserva({ reserva, onClose, onRechazar, onSuspender, onQuitarBloqueo }) {
  const color   = colorDeReserva(reserva)
  const bloqueo = esBloqueoManual(reserva)
  const ahora   = new Date()
  const vencida = reserva.estado_orden === 'pendiente_verificacion' &&
                  new Date(reserva.fecha_fin) < ahora

  const [rechazando, setRechazando] = useState(false)
  const [suspendiendo, setSuspendiendo] = useState(false)
  const [quitando, setQuitando] = useState(false)
  const [motivoSusp, setMotivoSusp] = useState('')
  const [mostrarSusp, setMostrarSusp] = useState(false)
  const [confirmarQuitar, setConfirmarQuitar] = useState(false)

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4 max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">{labelInstalacion(reserva.instalacion)}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

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

          {bloqueo ? (
            <div className="flex items-start gap-2">
              <Ban size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
              <span>
                <span className="font-semibold text-gray-800">Bloqueo del club</span>
                {reserva.notas && <> — <span className="italic">{reserva.notas}</span></>}
              </span>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-2">
                <User size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
                <span>
                  <span className="font-semibold text-gray-800">
                    {reserva.nombre_responsable ?? 'Sin responsable registrado'}
                  </span>
                  {reserva.dni_responsable && (
                    <span className="text-gray-400"> · DNI {reserva.dni_responsable}</span>
                  )}
                </span>
              </div>
              {reserva.notas && (
                <div className="flex items-start gap-2">
                  <CalendarClock size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
                  <span className="italic text-gray-500">{reserva.notas}</span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {bloqueo ? 'Tipo' : 'Estado del pago'}
          </span>
          <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${color.badge}`}>
            {color.label}
          </span>
        </div>

        {/* ── Bloqueo del club: se quita y listo, no hay a quién avisar ── */}
        {bloqueo && (
          <button
            onClick={() => setConfirmarQuitar(true)}
            disabled={quitando}
            className="w-full py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {quitando && <Loader2 size={14} className="animate-spin" />}
            {quitando ? 'Quitando…' : 'Quitar bloqueo y liberar el turno'}
          </button>
        )}

        {/* ── Reserva de un socio: rechazar la orden ── */}
        {!bloqueo && reserva.estado_orden === 'pendiente_verificacion' && (
          <button
            onClick={async () => {
              setRechazando(true)
              await onRechazar(reserva)
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

        {/* ── Suspender por lluvia: libera el turno y acredita saldo ── */}
        {!bloqueo && reserva.estado === 'confirmada' && (
          mostrarSusp ? (
            <div className="space-y-2 pt-1">
              <input
                autoFocus
                value={motivoSusp}
                onChange={e => setMotivoSusp(e.target.value)}
                placeholder="Motivo (ej: Lluvia)"
                maxLength={300}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500">
                Se libera el turno y se le acredita el importe al socio como saldo a favor.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    if (motivoSusp.trim().length < 3) return
                    setSuspendiendo(true)
                    await onSuspender(reserva, motivoSusp.trim())
                    setSuspendiendo(false)
                    onClose()
                  }}
                  disabled={suspendiendo || motivoSusp.trim().length < 3}
                  className="flex-1 py-2.5 rounded-xl bg-amber-600 text-white text-sm font-bold hover:bg-amber-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {suspendiendo && <Loader2 size={14} className="animate-spin" />}
                  {suspendiendo ? 'Suspendiendo…' : 'Confirmar suspensión'}
                </button>
                <button
                  onClick={() => { setMostrarSusp(false); setMotivoSusp('') }}
                  disabled={suspendiendo}
                  className="px-4 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold text-gray-600 hover:bg-gray-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setMostrarSusp(true)}
              className="w-full py-2.5 rounded-xl border-2 border-amber-500 text-amber-700 text-sm font-bold hover:bg-amber-50 transition-colors"
            >
              Suspender por lluvia / mantenimiento
            </button>
          )
        )}

        {confirmarQuitar && (
          <ConfirmDialog
            titulo="Quitar el bloqueo"
            mensaje={`El turno vuelve a estar disponible para los socios${reserva.notas ? ` (motivo actual: "${reserva.notas}")` : ''}.`}
            confirmLabel="Sí, liberar el turno"
            cancelLabel="No, dejarlo bloqueado"
            cargando={quitando}
            onConfirm={async () => {
              setQuitando(true)
              await onQuitarBloqueo(reserva)
              setQuitando(false)
              setConfirmarQuitar(false)
              onClose()
            }}
            onCancel={() => setConfirmarQuitar(false)}
          />
        )}
      </div>
    </div>
  )
}

// ─── Modal: Nueva Reserva Manual (con cobro opcional) ────────────────────────

function ModalNuevaReserva({ onClose, onGuardado, inicial }) {
  const { token } = useAuth()
  const [form, setForm] = useState({
    instalacion:        inicial?.instalacion ?? 'cancha_1',
    fecha_inicio:       inicial?.fecha_inicio ?? '',
    fecha_fin:          inicial?.fecha_fin ?? '',
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
    fetch(`${API}/admin/usuarios/`, { headers: { Authorization: `Bearer ${token}` } })
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
      if (!res.ok) throw new Error(textoError(data?.detail, 'No se pudo obtener la cuenta Invitado.'))
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
      if (!res.ok) throw new Error(textoError(data?.detail, 'No se pudo crear la reserva.'))
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
              {CANCHAS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
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

// ─── Navegación de mes (compartida por las dos agendas) ───────────────────────
//
// Sin tope hacia atrás ni hacia adelante: el admin tiene que poder mirar meses
// pasados. El socio sí tiene tope, y lo maneja su propia pantalla.

function NavegadorMes({ anio, mes, onCambiar, children }) {
  const hoy = new Date()
  const esMesActual = anio === hoy.getFullYear() && mes === hoy.getMonth() + 1

  const cambiar = (delta) => {
    let m = mes + delta
    let a = anio
    if (m < 1) { m = 12; a -= 1 }
    if (m > 12) { m = 1; a += 1 }
    onCambiar(a, m)
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="min-w-0">{children}</div>
      <div className="flex items-center justify-between sm:justify-end gap-1 flex-shrink-0">
        <button
          onClick={() => cambiar(-1)}
          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          aria-label="Mes anterior"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm sm:text-base font-bold text-gray-900 w-28 sm:w-32 text-center">
          {NOMBRES_MES[mes - 1]} {anio}
        </span>
        <button
          onClick={() => cambiar(1)}
          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          aria-label="Mes siguiente"
        >
          <ChevronRight size={16} />
        </button>
        {!esMesActual && (
          <button
            onClick={() => onCambiar(hoy.getFullYear(), hoy.getMonth() + 1)}
            className="ml-1 text-xs font-semibold text-blue-600 hover:underline underline-offset-2"
          >
            Hoy
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Leyenda ──────────────────────────────────────────────────────────────────

function Leyenda() {
  const items = [
    { color: 'bg-green-500',  texto: 'Libre' },
    { color: 'bg-blue-500',   texto: 'Reservado y pagado' },
    { color: 'bg-amber-500',  texto: 'Reservado, pago pendiente' },
    { color: 'bg-indigo-500', texto: 'Carga manual del admin' },
    { color: 'bg-red-500',    texto: 'Inhabilitado por el club' },
  ]
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {items.map(({ color, texto }) => (
        <span key={texto} className="inline-flex items-center gap-1.5 text-xs text-gray-500">
          <span className={`w-2 h-2 rounded-full inline-block ${color}`} />
          {texto}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
        <Lock size={10} />
        Fecha pasada
      </span>
    </div>
  )
}

// ─── Agenda del quincho ───────────────────────────────────────────────────────

function AgendaQuincho({ reservas, anio, mes, onCambiarMes, onAbrirTurno, onBloquearTurno }) {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

  const dias = useMemo(() => {
    const total = diasEnMes(anio, mes)
    return Array.from({ length: total }, (_, i) => {
      const dia = i + 1
      const fecha = fechaLocal(anio, mes, dia)
      return {
        dia,
        nombreDiaSemana: NOMBRES_DIA_SEMANA[indiceDiaSemana(fecha)],
        esHoy: fecha.getTime() === hoy.getTime(),
        esPasado: fecha.getTime() < hoy.getTime(),
      }
    })
  }, [anio, mes, hoy])

  const resumen = useMemo(() => {
    let libres = 0, ocupados = 0, bloqueados = 0
    dias.forEach(({ dia }) => {
      Object.keys(TURNOS_QUINCHO).forEach(key => {
        const { inicio, fin } = rangoTurnoQuincho(anio, mes, dia, key)
        const estado = estadoDeTurno(reservas, inicio, fin)
        if (estado.tipo === 'libre') libres++
        else if (estado.tipo === 'bloqueo') bloqueados++
        else ocupados++
      })
    })
    return { libres, ocupados, bloqueados }
  }, [dias, reservas, anio, mes])

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 sm:px-5 pt-4 sm:pt-5 pb-4 border-b border-gray-100">
        <NavegadorMes anio={anio} mes={mes} onCambiar={onCambiarMes}>
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Tent size={17} className="text-gray-400 flex-shrink-0" />
            Quincho
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Turno <strong className="text-gray-600">Día</strong> ({TURNOS_QUINCHO.dia.horaInicio}:00–{TURNOS_QUINCHO.dia.horaFin}:00) ·{' '}
            Turno <strong className="text-gray-600">Noche</strong> ({TURNOS_QUINCHO.noche.horaInicio}:00–00:00)
          </p>
        </NavegadorMes>

        <div className="flex flex-wrap gap-2 sm:gap-3 mt-3">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            {resumen.libres} libre{resumen.libres !== 1 ? 's' : ''}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700">
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
            {resumen.ocupados} reservado{resumen.ocupados !== 1 ? 's' : ''}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600">
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
            {resumen.bloqueados} inhabilitado{resumen.bloqueados !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <div className="p-3 sm:p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
          {dias.map(({ dia, nombreDiaSemana, esHoy, esPasado }) => (
            <div
              key={dia}
              className={`rounded-xl border p-2 flex flex-col gap-1.5 ${
                esHoy ? 'ring-2 ring-blue-400 ring-offset-1 border-gray-200' : 'border-gray-200'
              } ${esPasado ? 'bg-gray-50' : 'bg-white'}`}
            >
              <div className="flex items-baseline justify-between px-0.5">
                <span className={`text-sm font-bold ${esPasado ? 'text-gray-400' : 'text-gray-800'}`}>{dia}</span>
                <span className="text-[10px] text-gray-400 uppercase">{nombreDiaSemana}</span>
              </div>

              <div className="flex flex-col gap-1">
                {Object.keys(TURNOS_QUINCHO).map(key => {
                  const { inicio, fin } = rangoTurnoQuincho(anio, mes, dia, key)
                  const estado = estadoDeTurno(reservas, inicio, fin)
                  const Icon = ICONOS_TURNO_QUINCHO[key]
                  const libre = estado.tipo === 'libre'
                  // Un turno que ya pasó y quedó libre no tiene nada que
                  // hacerse: inhabilitarlo hacia atrás no cambia nada.
                  const inerte = libre && esPasado
                  const clases = libre
                    ? esPasado
                      ? 'bg-gray-50 border-gray-200 text-gray-300 cursor-default'
                      : 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                    : colorDeReserva(estado.reserva).celda

                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={inerte}
                      onClick={() => libre
                        ? onBloquearTurno({
                            instalacion: 'quincho', inicio, fin,
                            etiqueta: `${dia}/${mes} · Turno ${TURNOS_QUINCHO[key].label}`,
                          })
                        : onAbrirTurno(estado.reserva)}
                      title={libre
                        ? esPasado
                          ? `${TURNOS_QUINCHO[key].label} — pasó libre`
                          : `${TURNOS_QUINCHO[key].label} — libre. Click para inhabilitarlo.`
                        : `${TURNOS_QUINCHO[key].label} — ${etiquetaCorta(estado)}`}
                      className={`w-full rounded-lg border px-1.5 py-1 text-left transition-colors ${clases}`}
                    >
                      <span className="flex items-center gap-1 text-[11px] font-bold">
                        <Icon size={10} className="flex-shrink-0" />
                        {TURNOS_QUINCHO[key].label}
                      </span>
                      <span className="block text-[10px] leading-tight truncate opacity-90">
                        {etiquetaCorta(estado)}
                      </span>
                      {estado.tipo === 'reserva' && estado.reserva.dni_responsable && (
                        <span className="block text-[9px] leading-tight truncate opacity-70">
                          DNI {estado.reserva.dni_responsable}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 sm:px-5 pb-4">
        <Leyenda />
        <p className="text-[11px] text-gray-400 mt-2">
          Tocá un turno libre para inhabilitarlo, o uno ocupado para ver el detalle.
        </p>
      </div>
    </div>
  )
}

// ─── Agenda de canchas ────────────────────────────────────────────────────────

function AgendaCanchas({
  reservas, anio, mes, onCambiarMes,
  canchaKey, onCambiarCancha,
  diaSeleccionado, onSeleccionarDia,
  onAbrirTurno, onBloquearTurno,
}) {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

  const turnosDelDia = useMemo(() => turnosDeCancha(), [])

  // Celdas del mes con relleno, para que el día caiga bajo su día de semana.
  const celdas = useMemo(() => {
    const total = diasEnMes(anio, mes)
    const primerDia = fechaLocal(anio, mes, 1)
    const relleno = indiceDiaSemana(primerDia) // lunes primero
    return [
      ...Array.from({ length: relleno }, () => null),
      ...Array.from({ length: total }, (_, i) => i + 1),
    ]
  }, [anio, mes])

  // Ocupación por día, para el puntito del calendario.
  const ocupacionPorDia = useMemo(() => {
    const mapa = new Map()
    const total = diasEnMes(anio, mes)
    for (let dia = 1; dia <= total; dia++) {
      const base = fechaLocal(anio, mes, dia)
      let ocupados = 0, bloqueados = 0
      for (const hora of turnosDelDia) {
        const { inicio, fin } = rangoTurnoCancha(base, hora)
        const estado = estadoDeTurno(reservas, inicio, fin)
        if (estado.tipo === 'bloqueo') bloqueados++
        else if (estado.tipo === 'reserva') ocupados++
      }
      mapa.set(dia, { ocupados, bloqueados, libres: turnosDelDia.length - ocupados - bloqueados })
    }
    return mapa
  }, [reservas, anio, mes, turnosDelDia])

  const fechaDia = diaSeleccionado ? fechaLocal(anio, mes, diaSeleccionado) : null

  return (
    <div className="space-y-4">
      {/* Selector de cancha */}
      <div className="flex gap-2">
        {CANCHAS.map(c => (
          <button
            key={c.key}
            onClick={() => onCambiarCancha(c.key)}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-sm font-bold border transition-colors ${
              canchaKey === c.key
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Calendario mensual: elegir día */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 sm:px-5 pt-4 sm:pt-5 pb-4 border-b border-gray-100">
          <NavegadorMes anio={anio} mes={mes} onCambiar={onCambiarMes}>
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Volleyball size={17} className="text-gray-400 flex-shrink-0" />
              {labelInstalacion(canchaKey)}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Elegí un día para ver sus {turnosDelDia.length} turnos.
            </p>
          </NavegadorMes>
        </div>

        <div className="grid grid-cols-7 border-b border-gray-100">
          {NOMBRES_DIA_SEMANA.map(d => (
            <div key={d} className="py-1.5 text-center text-[9px] sm:text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-px bg-gray-50 p-px">
          {celdas.map((dia, idx) => {
            if (dia === null) return <div key={`v-${idx}`} className="bg-white min-h-[52px]" />
            const fecha = fechaLocal(anio, mes, dia)
            const esHoy = fecha.getTime() === hoy.getTime()
            const esPasado = fecha.getTime() < hoy.getTime()
            const oc = ocupacionPorDia.get(dia)
            const seleccionado = dia === diaSeleccionado

            return (
              <button
                key={dia}
                onClick={() => onSeleccionarDia(dia)}
                className={`bg-white min-h-[52px] sm:min-h-[62px] p-1 flex flex-col items-center justify-start gap-1 transition-colors ${
                  seleccionado ? 'ring-2 ring-inset ring-slate-900 bg-slate-50' : 'hover:bg-gray-50'
                }`}
              >
                <span className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full ${
                  esHoy ? 'bg-blue-600 text-white' : esPasado ? 'text-gray-400' : 'text-gray-700'
                }`}>
                  {dia}
                </span>
                <span className="flex items-center gap-0.5">
                  {oc.ocupados > 0 && (
                    <span className="text-[9px] font-bold text-blue-600">{oc.ocupados}</span>
                  )}
                  {oc.bloqueados > 0 && (
                    <span className="text-[9px] font-bold text-red-500">·{oc.bloqueados}</span>
                  )}
                  {oc.ocupados === 0 && oc.bloqueados === 0 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                  )}
                </span>
              </button>
            )
          })}
        </div>

        <div className="px-4 sm:px-5 py-3">
          <Leyenda />
        </div>
      </div>

      {/* Turnos del día elegido */}
      {fechaDia && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 sm:px-5 py-3.5 border-b border-gray-100 flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-gray-900 capitalize">
              {fechaDia.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h3>
            <span className="text-xs text-gray-400 flex-shrink-0">{labelInstalacion(canchaKey)}</span>
          </div>

          <ul className="divide-y divide-gray-50">
            {turnosDelDia.map(hora => {
              const { inicio, fin } = rangoTurnoCancha(fechaDia, hora)
              const estado = estadoDeTurno(reservas, inicio, fin)
              const esPasado = fin.getTime() <= Date.now()
              const color = estado.tipo === 'libre' ? null : colorDeReserva(estado.reserva)

              return (
                <li key={hora} className="flex items-center gap-3 px-4 sm:px-5 py-3">
                  <span className={`font-mono text-sm font-bold flex-shrink-0 w-[105px] ${esPasado ? 'text-gray-300' : 'text-gray-700'}`}>
                    {horaLabel(hora)}–{horaLabel(hora + DURACION_TURNO_CANCHA_HORAS)}
                  </span>

                  {estado.tipo === 'libre' ? (
                    <>
                      <span className={`flex-1 flex items-center gap-2 text-sm font-semibold min-w-0 ${
                        esPasado ? 'text-gray-300' : 'text-green-700'
                      }`}>
                        <span className={`w-2 h-2 rounded-full inline-block flex-shrink-0 ${
                          esPasado ? 'bg-gray-200' : 'bg-green-500'
                        }`} />
                        Libre
                      </span>
                      {!esPasado && (
                        <button
                          onClick={() => onBloquearTurno({
                            instalacion: canchaKey, inicio, fin,
                            etiqueta: `${fechaDia.toLocaleDateString('es-AR')} · ${horaLabel(hora)}`,
                          })}
                          className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-red-50 hover:border-red-200 hover:text-red-700 transition-colors"
                        >
                          <Ban size={13} />
                          Inhabilitar
                        </button>
                      )}
                    </>
                  ) : (
                    <button
                      onClick={() => onAbrirTurno(estado.reserva)}
                      className="flex-1 flex items-center gap-2 min-w-0 text-left group"
                    >
                      {estado.tipo === 'bloqueo'
                        ? <Ban size={14} className="text-red-500 flex-shrink-0" />
                        : <User size={14} className="text-blue-500 flex-shrink-0" />}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-gray-800 truncate group-hover:underline">
                          {etiquetaCorta(estado)}
                        </span>
                        {estado.tipo === 'reserva' && estado.reserva.dni_responsable && (
                          <span className="block text-xs text-gray-400">DNI {estado.reserva.dni_responsable}</span>
                        )}
                      </span>
                      <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-1 rounded-full ${color.badge}`}>
                        {color.label}
                      </span>
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function AdminReservas() {
  const { token } = useAuth()
  const hoy = useMemo(() => new Date(), [])

  const [reservas, setReservas] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const [aviso,    setAviso]    = useState(null)

  const [grupoActivo, setGrupoActivo] = useState('canchas')
  const [canchaKey,   setCanchaKey]   = useState(CANCHAS[0].key)
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [mes,  setMes]  = useState(hoy.getMonth() + 1)
  const [diaSeleccionado, setDiaSeleccionado] = useState(hoy.getDate())

  const [reservaDetalle,    setReservaDetalle]    = useState(null)
  const [turnoABloquear,    setTurnoABloquear]    = useState(null)
  const [modalNuevaAbierto, setModalNuevaAbierto] = useState(false)

  // ── Fetch del mes visible ─────────────────────────────────────────────────
  // Se trae el mes entero de TODAS las instalaciones y se filtra en memoria:
  // son decenas de filas, y así cambiar de pestaña o de cancha no dispara otro
  // request. El rango se arma con fechas locales (no toISOString sobre el
  // Date, que se corre un día en UTC-3).
  const fetchReservas = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      // `hasta` va al DÍA SIGUIENTE al último del mes, no al último.
      // El backend filtra `fecha_inicio <= hasta` contra un `date`, que
      // Postgres castea a medianoche: mandando el 30 de septiembre, una
      // reserva del 30 a las 19:00 queda afuera y el turno Noche del último
      // día del mes nunca aparecía en la agenda.
      const finDeMes = fechaLocal(anio, mes, diasEnMes(anio, mes))
      finDeMes.setDate(finDeMes.getDate() + 1)
      const desde = isoDeFechaLocal(fechaLocal(anio, mes, 1))
      const hasta = isoDeFechaLocal(finDeMes)
      const params = new URLSearchParams({ desde, hasta })

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
  }, [token, anio, mes])

  useEffect(() => { fetchReservas() }, [fetchReservas])

  const cambiarMes = (a, m) => {
    setAnio(a)
    setMes(m)
    setDiaSeleccionado(
      a === hoy.getFullYear() && m === hoy.getMonth() + 1 ? hoy.getDate() : 1
    )
  }

  // Solo las franjas que efectivamente ocupan la agenda, de la instalación
  // que se está mirando.
  const instalacionActiva = grupoActivo === 'quincho' ? 'quincho' : canchaKey

  const reservasVisibles = useMemo(
    () => reservas.filter(r =>
      r.instalacion === instalacionActiva && ESTADOS_OCUPA_AGENDA.includes(r.estado)
    ),
    [reservas, instalacionActiva]
  )

  // ── Acciones ──────────────────────────────────────────────────────────────

  const rechazandoRef = useRef(false)

  // Rechazar un turno pendiente = rechazar la ORDEN que lo respalda. El
  // endpoint real es POST /admin/ordenes/{id_orden}/rechazar, que libera la
  // reserva, avisa al socio y deja registro en audit_log.
  const handleRechazar = async (reserva) => {
    if (rechazandoRef.current) return
    if (!reserva?.id_orden) {
      setError('Este turno no tiene una orden de pago asociada; no hay nada que rechazar.')
      return
    }
    rechazandoRef.current = true
    try {
      const res = await fetch(`${API}/admin/ordenes/${reserva.id_orden}/rechazar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          motivo_rechazo: 'Turno liberado por el administrador desde la agenda de reservas.',
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(textoError(body?.detail, 'No se pudo rechazar la reserva.'))
      }
      setReservas(prev => prev.filter(r => r.id_reserva !== reserva.id_reserva))
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      rechazandoRef.current = false
    }
  }

  const suspendiendoRef = useRef(false)

  const handleSuspender = async (reserva, motivo) => {
    if (suspendiendoRef.current) return
    suspendiendoRef.current = true
    try {
      const res = await fetch(`${API}/admin/reservas/${reserva.id_reserva}/suspender`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(textoError(body?.detail, 'No se pudo suspender la reserva.'))
      setReservas(prev => prev.map(r =>
        r.id_reserva === reserva.id_reserva ? { ...r, estado: 'liberada' } : r
      ))
      setError(null)
      setAviso(
        `Turno suspendido. Se le acreditaron $${body.monto_acreditado} de saldo a favor al socio ` +
        `(nuevo saldo: $${body.nuevo_saldo}).`
      )
    } catch (err) {
      setError(err.message)
    } finally {
      suspendiendoRef.current = false
    }
  }

  const quitandoRef = useRef(false)

  const handleQuitarBloqueo = async (reserva) => {
    if (quitandoRef.current) return
    quitandoRef.current = true
    try {
      const res = await fetch(`${API}/admin/reservas/bloqueo/${reserva.id_reserva}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(textoError(body?.detail, 'No se pudo quitar el bloqueo.'))
      setReservas(prev => prev.map(r =>
        r.id_reserva === reserva.id_reserva ? { ...r, estado: 'liberada' } : r
      ))
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      quitandoRef.current = false
    }
  }

  const handleBloqueado = (nuevo) => {
    setReservas(prev => [nuevo, ...prev])
    setTurnoABloquear(null)
  }

  const handleNuevaReservaGuardada = (nueva) => {
    setReservas(prev => [nueva, ...prev])
    setModalNuevaAbierto(false)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2 sm:gap-3">
            <CalendarClock size={22} className="text-gray-500 flex-shrink-0" />
            Agenda de Reservas
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            La misma grilla que ve el socio, pero con el nombre de quien tiene cada turno.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={fetchReservas}
            disabled={loading}
            className="p-2.5 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            title="Refrescar"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setModalNuevaAbierto(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 transition-colors"
          >
            <PlusCircle size={16} />
            <span className="hidden sm:inline">Nueva reserva manual</span>
            <span className="sm:hidden">Nueva</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {GRUPOS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setGrupoActivo(key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border transition-colors ${
              grupoActivo === key
                ? 'bg-white text-gray-900 border-gray-300 shadow-sm'
                : 'bg-transparent text-gray-500 border-transparent hover:bg-white/60'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="flex-shrink-0 text-red-400 hover:text-red-600">
            <X size={15} />
          </button>
        </div>
      )}

      {aviso && (
        <div className="flex items-start gap-2 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
          <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" />
          <span className="flex-1">{aviso}</span>
          <button onClick={() => setAviso(null)} className="flex-shrink-0 text-emerald-500 hover:text-emerald-700">
            <X size={15} />
          </button>
        </div>
      )}

      {loading && reservas.length === 0 ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-gray-400" size={28} />
        </div>
      ) : grupoActivo === 'quincho' ? (
        <AgendaQuincho
          reservas={reservasVisibles}
          anio={anio}
          mes={mes}
          onCambiarMes={cambiarMes}
          onAbrirTurno={setReservaDetalle}
          onBloquearTurno={setTurnoABloquear}
        />
      ) : (
        <AgendaCanchas
          reservas={reservasVisibles}
          anio={anio}
          mes={mes}
          onCambiarMes={cambiarMes}
          canchaKey={canchaKey}
          onCambiarCancha={setCanchaKey}
          diaSeleccionado={diaSeleccionado}
          onSeleccionarDia={setDiaSeleccionado}
          onAbrirTurno={setReservaDetalle}
          onBloquearTurno={setTurnoABloquear}
        />
      )}

      {reservaDetalle && (
        <ModalDetalleReserva
          reserva={reservaDetalle}
          onClose={() => setReservaDetalle(null)}
          onRechazar={handleRechazar}
          onSuspender={handleSuspender}
          onQuitarBloqueo={handleQuitarBloqueo}
        />
      )}

      {turnoABloquear && (
        <ModalBloquearTurno
          turno={turnoABloquear}
          onClose={() => setTurnoABloquear(null)}
          onBloqueado={handleBloqueado}
        />
      )}

      {modalNuevaAbierto && (
        <ModalNuevaReserva
          onClose={() => setModalNuevaAbierto(false)}
          onGuardado={handleNuevaReservaGuardada}
          inicial={{ instalacion: instalacionActiva }}
        />
      )}
    </div>
  )
}
