// frontend/src/pages/AdminScannerCancha.jsx
/**
 * Escáner de Canchas — control de puerta + reintegro QR del alquiler.
 *
 * Flujo (mismo patrón general que AdminScannerEvento.jsx):
 *   1. El operador ve las "Reservas activas ahora" (GET /reservas/activas)
 *      y elige a cuál está controlando la puerta. Se filtra por ventana
 *      horaria real: solo aparecen reservas 'confirmada' cuya fecha_inicio/
 *      fecha_fin contienen el momento actual (con 15min de margen antes).
 *   2. Se abre la cámara con @yudiel/react-qr-scanner. Si el QR no lee,
 *      hay fallback manual por DNI (POST /reservas/{id}/escanear-qr acepta
 *      {qr_token} o {dni}).
 *   3. POST /reservas/{id}/escanear-qr resuelve todo en un solo paso
 *      (existe, no está de baja, no había escaneado ya) y devuelve
 *      `ya_registrado: true/false` — la fuente de verdad sobre duplicados
 *      es la constraint uq_reintegro_reserva_usuario del lado del backend,
 *      no un estado en memoria del navegador (aguanta recargar la página,
 *      dos dispositivos escaneando a la vez, etc.).
 *   4. INMEDIATAMENTE después de un escaneo válido y nuevo (no duplicado),
 *      se abre un modal preguntándole al admin_temporal cómo se resolvió
 *      el reintegro — YA, en el momento, sin que nadie tenga que volver
 *      a esto después desde otra pantalla. El modal es OBLIGATORIO: no
 *      tiene botón para cerrarlo sin elegir, justamente para que no queden
 *      reintegros en 'pendiente' sin que haya dónde retomarlos después
 *      (no existe today una pantalla de "pendientes" fuera de este escáner).
 *        - Efectivo / Transferencia → ya se le entregó la plata.
 *        - Ya descontado → el monto ya venía restado del precio cobrado.
 *        - Cupón (saldo a favor) → se acredita en su billetera interna.
 *      Dispara PATCH /admin/reintegros/{id}/forma?forma=... con el mismo
 *      rol de puerta (admin_temporal no necesita ser admin_general para
 *      esto — ver _ROLES_ESCANEO en admin_reservas.py).
 *   5. Red de contención por si igual queda algo en 'pendiente' (ej: datos
 *      cargados antes de este cambio, o un reintegro tocado a mano desde
 *      la API): si el socio vuelve a escanear y su reintegro sigue
 *      'pendiente', se le ofrece "Definir forma ahora" para resolverlo en
 *      ese momento en vez de dejarlo así. Si ya estaba resuelto, se
 *      muestra informativo nomás, sin volver a tocar el saldo.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Scanner } from '@yudiel/react-qr-scanner'
import { useAuth } from '../context/AuthContext'
import {
  ScanLine,
  ArrowLeft,
  Clock,
  MapPin,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  Users,
  Search,
  Banknote,
  Landmark,
  Receipt,
  Ticket,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const formatoHora = (fecha) =>
  fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

const FORMA_LABEL = {
  pendiente: 'Pendiente de definir',
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  ya_descontado: 'Ya descontado al cobrar',
  saldo_a_favor: 'Cupón (saldo a favor)',
}

// ─── Selector de reserva activa ─────────────────────────────────────────────

function SelectorReserva({ onSeleccionar }) {
  const { token } = useAuth()
  const navigate = useNavigate()

  const [reservas, setReservas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchReservasActivas = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/admin/reservas/activas`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`Error ${res.status}: No se pudieron cargar las reservas activas.`)
      setReservas(await res.json())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    fetchReservasActivas()
    const t = setInterval(fetchReservasActivas, 60000)
    return () => clearInterval(t)
  }, [fetchReservasActivas])

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <ScanLine size={24} className="text-gray-500" />
            Escáner de Canchas
          </h1>
          <p className="text-sm text-gray-500 mt-1">Elegí el turno que estás controlando en la puerta.</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle size={18} className="flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={fetchReservasActivas} className="underline underline-offset-2 font-medium hover:text-red-900">
            Reintentar
          </button>
        </div>
      )}

      <div className="space-y-3">
        {loading && [...Array(2)].map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 h-20 animate-pulse" />
        ))}

        {!loading && reservas.map(reserva => (
          <button
            key={reserva.id_reserva}
            onClick={() => onSeleccionar(reserva)}
            className="w-full text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md hover:border-emerald-200 transition-all flex items-center justify-between gap-4"
          >
            <div className="min-w-0">
              <p className="font-bold text-gray-900 capitalize">{reserva.instalacion.replace(/_/g, ' ')}</p>
              <div className="flex items-center gap-4 mt-1 text-sm text-gray-500 flex-wrap">
                <span className="flex items-center gap-1.5">
                  <Clock size={13} />
                  {formatoHora(new Date(reserva.fecha_inicio))}–{formatoHora(new Date(reserva.fecha_fin))}
                </span>
                {reserva.nombre_responsable && (
                  <span className="flex items-center gap-1.5">
                    <MapPin size={13} /> {reserva.nombre_responsable}
                  </span>
                )}
                {reserva.num_socios_esperados != null && (
                  <span className="flex items-center gap-1.5">
                    <Users size={13} /> {reserva.escaneos_realizados}/{reserva.num_socios_esperados}
                  </span>
                )}
              </div>
              {reserva.notas && (
                <p className="text-xs text-gray-400 mt-1 truncate">{reserva.notas}</p>
              )}
            </div>
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-3 py-1.5 rounded-full flex-shrink-0">
              Escanear
            </span>
          </button>
        ))}

        {!loading && !error && reservas.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-gray-500">
            No hay turnos de cancha activos en este momento.
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Modal: ¿cómo se resolvió el reintegro? ─────────────────────────────────

function ModalFormaReintegro({ reintegro, onResuelto }) {
  const { token } = useAuth()
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)

  const opciones = [
    { forma: 'efectivo', label: 'Efectivo', sub: 'Ya se le entregó en mano', Icon: Banknote },
    { forma: 'transferencia', label: 'Transferencia', sub: 'Ya se le transfirió', Icon: Landmark },
    { forma: 'ya_descontado', label: 'Ya descontado', sub: 'Vino restado del precio cobrado', Icon: Receipt },
    { forma: 'saldo_a_favor', label: 'Cupón', sub: 'Se acredita como saldo a favor', Icon: Ticket },
  ]

  const elegir = async (forma) => {
    setEnviando(true)
    setError(null)
    try {
      const params = new URLSearchParams({ forma })
      const res = await fetch(`${API}/admin/reintegros/${reintegro.id_reintegro}/forma?${params}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail ?? 'No se pudo registrar la forma del reintegro.')
      onResuelto(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4">
        <div>
          <p className="text-lg font-bold text-gray-900">{reintegro.nombreSocio}</p>
          <p className="text-sm text-gray-500">
            ¿Cómo se resolvió el reintegro de <span className="font-semibold">${reintegro.monto}</span>?
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            <AlertCircle size={14} className="flex-shrink-0" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {opciones.map(({ forma, label, sub, Icon }) => (
            <button
              key={forma}
              disabled={enviando}
              onClick={() => elegir(forma)}
              className="flex flex-col items-center gap-1.5 p-4 rounded-xl border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50 disabled:opacity-40 transition-colors text-center"
            >
              <Icon size={22} className="text-gray-600" />
              <span className="text-sm font-semibold text-gray-800">{label}</span>
              <span className="text-[11px] text-gray-400 leading-tight">{sub}</span>
            </button>
          ))}
        </div>

        {enviando && (
          <p className="text-xs text-gray-400 flex items-center justify-center gap-2">
            <Loader2 size={12} className="animate-spin" /> Guardando…
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Feedback tras un escaneo ────────────────────────────────────────────────

function FeedbackEscaneo({ resultado, onDefinirForma }) {
  if (!resultado) return null

  const config = {
    ok: { classes: 'bg-green-50 border-green-300 text-green-800', Icon: CheckCircle2, label: 'REINTEGRO REGISTRADO' },
    duplicado_resuelto: { classes: 'bg-blue-50 border-blue-300 text-blue-800', Icon: AlertTriangle, label: 'YA HABÍA ESCANEADO' },
    duplicado_pendiente: { classes: 'bg-amber-50 border-amber-300 text-amber-800', Icon: AlertTriangle, label: 'YA HABÍA ESCANEADO' },
    error: { classes: 'bg-red-50 border-red-300 text-red-800', Icon: XCircle, label: 'ERROR' },
  }[resultado.tipo]

  const { classes, Icon, label } = config

  return (
    <div className={`rounded-2xl border-2 p-6 text-center space-y-2 ${classes}`}>
      <Icon size={48} className="mx-auto" />
      <p className="text-2xl font-black tracking-wide">{label}</p>
      {resultado.nombreSocio && <p className="text-lg font-semibold">{resultado.nombreSocio}</p>}
      {resultado.monto != null && (
        <p className="text-sm font-mono opacity-75">Reintegro: ${resultado.monto}</p>
      )}
      {resultado.forma && (
        <p className="text-sm">Forma: {FORMA_LABEL[resultado.forma] ?? resultado.forma}</p>
      )}
      {resultado.mensaje && <p className="text-sm">{resultado.mensaje}</p>}

      {resultado.tipo === 'duplicado_pendiente' && (
        <button
          onClick={onDefinirForma}
          className="mt-2 px-4 py-2 rounded-lg bg-amber-600 text-white font-semibold text-sm hover:bg-amber-700 transition-colors"
        >
          Definir forma ahora
        </button>
      )}
    </div>
  )
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function AdminScannerCancha() {
  const { token } = useAuth()

  const [reservaActiva, setReservaActiva] = useState(null)
  const [escaneando, setEscaneando] = useState(true)
  const [procesando, setProcesando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [modoManual, setModoManual] = useState(false)
  const [dniManual, setDniManual] = useState('')
  const [reintegroPendienteModal, setReintegroPendienteModal] = useState(null)

  const ultimoTokenRef = useRef(null)
  const bloqueadoRef = useRef(false)

  const escanear = async (body) => {
    const res = await fetch(`${API}/admin/reservas/${reservaActiva.id_reserva}/escanear-qr`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.detail ?? 'No se pudo registrar el escaneo.')
    return data
  }

  const procesarReintegro = (reintegro) => {
    if (!reintegro.ya_registrado) {
      // Escaneo nuevo — abrir el modal de una para definir la forma YA,
      // sin dejarlo pendiente para que alguien lo resuelva después.
      setResultado({
        tipo: 'ok',
        id_reintegro: reintegro.id_reintegro,
        nombreSocio: reintegro.nombre_socio,
        monto: reintegro.monto,
      })
      setReintegroPendienteModal({
        id_reintegro: reintegro.id_reintegro,
        nombreSocio: reintegro.nombre_socio,
        monto: reintegro.monto,
      })
      return
    }

    // Ya había un reintegro para este socio en esta reserva.
    if (reintegro.forma === 'pendiente') {
      // Quedó sin resolver de un escaneo anterior (ej: se cortó la conexión
      // justo antes de elegir en el modal) — lo ofrecemos resolver ahora
      // en vez de dejarlo pendiente para siempre.
      setResultado({
        tipo: 'duplicado_pendiente',
        id_reintegro: reintegro.id_reintegro,
        nombreSocio: reintegro.nombre_socio,
        monto: reintegro.monto,
        mensaje: 'Quedó sin definir la última vez.',
      })
    } else {
      setResultado({
        tipo: 'duplicado_resuelto',
        nombreSocio: reintegro.nombre_socio,
        monto: reintegro.monto,
        forma: reintegro.forma,
      })
    }
  }

  const handleScan = async (detectedCodes) => {
    if (bloqueadoRef.current) return
    const qrToken = detectedCodes?.[0]?.rawValue
    if (!qrToken || qrToken === ultimoTokenRef.current) return

    ultimoTokenRef.current = qrToken
    bloqueadoRef.current = true
    setProcesando(true)
    setEscaneando(false)

    try {
      procesarReintegro(await escanear({ qr_token: qrToken }))
    } catch (err) {
      setResultado({ tipo: 'error', mensaje: err.message })
    } finally {
      setProcesando(false)
    }
  }

  const handleBuscarPorDni = async (e) => {
    e.preventDefault()
    if (!dniManual.trim()) return
    setProcesando(true)
    setEscaneando(false)
    try {
      procesarReintegro(await escanear({ dni: dniManual.trim() }))
    } catch (err) {
      setResultado({ tipo: 'error', mensaje: err.message })
    } finally {
      setProcesando(false)
      setDniManual('')
    }
  }

  const handleModalResuelto = (reintegroActualizado) => {
    setReintegroPendienteModal(null)
    setResultado(prev => (prev ? { ...prev, forma: reintegroActualizado.forma, tipo: 'ok' } : prev))
  }

  const volverAEscanear = () => {
    setResultado(null)
    setReintegroPendienteModal(null)
    ultimoTokenRef.current = null
    bloqueadoRef.current = false
    setModoManual(false)
    setEscaneando(true)
  }

  if (!reservaActiva) {
    return <SelectorReserva onSeleccionar={setReservaActiva} />
  }

  return (
    <div className="p-6 max-w-md mx-auto space-y-5">

      {reintegroPendienteModal && (
        <ModalFormaReintegro
          reintegro={reintegroPendienteModal}
          onResuelto={handleModalResuelto}
        />
      )}

      {/* Header con la reserva activa */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setReservaActiva(null)}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors flex-shrink-0"
          title="Cambiar de turno"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <p className="font-bold text-gray-900 truncate capitalize">
            {reservaActiva.instalacion.replace(/_/g, ' ')}
          </p>
          <p className="text-xs text-gray-500">Registrando reintegros QR</p>
        </div>
      </div>

      {/* Cámara */}
      {escaneando && !modoManual && (
        <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-sm aspect-square bg-black">
          <Scanner
            onScan={handleScan}
            onError={() => setResultado({ tipo: 'error', mensaje: 'No se pudo acceder a la cámara.' })}
            constraints={{ facingMode: 'environment' }}
          />
        </div>
      )}

      {procesando && (
        <div className="rounded-2xl border border-gray-200 shadow-sm p-8 text-center space-y-2">
          <Loader2 size={32} className="mx-auto animate-spin text-gray-400" />
          <p className="text-sm text-gray-500">Registrando…</p>
        </div>
      )}

      {!procesando && resultado && !reintegroPendienteModal && (
        <>
          <FeedbackEscaneo
            resultado={resultado}
            onDefinirForma={() => setReintegroPendienteModal({
              id_reintegro: resultado.id_reintegro,
              nombreSocio: resultado.nombreSocio,
              monto: resultado.monto,
            })}
          />
          <button
            onClick={volverAEscanear}
            className="w-full py-3 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800 transition-colors"
          >
            Escanear siguiente
          </button>
        </>
      )}

      {/* Fallback manual por DNI */}
      {escaneando && (
        <div className="pt-2">
          {!modoManual ? (
            <button
              onClick={() => setModoManual(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
            >
              <Search size={14} /> El QR no lee — buscar por DNI
            </button>
          ) : (
            <form onSubmit={handleBuscarPorDni} className="flex gap-2">
              <input
                value={dniManual}
                onChange={e => setDniManual(e.target.value)}
                placeholder="DNI del socio"
                className="form-input flex-1"
                autoFocus
              />
              <button type="submit" disabled={procesando} className="px-4 py-2 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800 disabled:opacity-50 transition-colors flex-shrink-0">
                Buscar
              </button>
              <button type="button" onClick={() => setModoManual(false)} className="px-3 py-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors flex-shrink-0">
                <ArrowLeft size={16} />
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}