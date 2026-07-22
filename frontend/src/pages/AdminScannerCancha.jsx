// frontend/src/pages/AdminScannerCancha.jsx
/**
 * Escáner de Canchas — control de puerta para el reintegro QR del alquiler.
 *
 * Flujo (mismo patrón que AdminScannerEvento.jsx):
 *   1. El operador ve las "Reservas activas ahora" (GET /reservas/activas)
 *      y elige a cuál está controlando la puerta. A diferencia de eventos
 *      (que duran 3-10hs y se filtran por día), acá se filtra por ventana
 *      horaria real: solo aparecen reservas 'confirmada' cuya fecha_inicio/
 *      fecha_fin contienen el momento actual (con 15min de margen antes).
 *   2. Se abre la cámara con @yudiel/react-qr-scanner.
 *   3. Cada QR leído es el qr_token crudo del socio — a diferencia del
 *      escáner de eventos, ACÁ NO se resuelve primero contra /qr/validar-token:
 *      POST /reservas/{id}/escanear-qr ya recibe el qr_token directo y
 *      resuelve todo en un solo paso (existe, no está de baja, no escaneó
 *      dos veces) porque este escáner no necesita el estado financiero del
 *      socio, solo registrar su asistencia al turno para el reintegro.
 *   4. Feedback grande en pantalla (verde = reintegro registrado, ámbar =
 *      ya había escaneado, rojo = error) y vuelta automática a la cámara.
 *   5. Sin fallback por DNI: el reintegro es un beneficio ligado al QR real
 *      del socio (evita que alguien reclame el reintegro de otro por DNI
 *      tipeado a mano). Si el QR no lee, el portero soluciona en secretaría.
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
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const formatoHora = (fecha) =>
  fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

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
    // Refresco cada 60s: turnos empiezan/terminan en vivo mientras el
    // portero tiene esta pantalla abierta.
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

// ─── Feedback tras un escaneo ────────────────────────────────────────────────

function FeedbackEscaneo({ resultado }) {
  if (!resultado) return null

  const config = {
    ok: { classes: 'bg-green-50 border-green-300 text-green-800', Icon: CheckCircle2, label: 'REINTEGRO REGISTRADO' },
    ya_escaneo: { classes: 'bg-amber-50 border-amber-300 text-amber-800', Icon: AlertTriangle, label: 'YA HABÍA ESCANEADO' },
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
      {resultado.mensaje && <p className="text-sm">{resultado.mensaje}</p>}
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

  const ultimoTokenRef = useRef(null)
  const bloqueadoRef = useRef(false)

  const escanearQR = async (qrToken) => {
    const res = await fetch(`${API}/admin/reservas/${reservaActiva.id_reserva}/escanear-qr`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ qr_token: qrToken }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const err = new Error(data.detail ?? 'No se pudo registrar el escaneo.')
      err.status = res.status
      throw err
    }
    return data
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
      const reintegro = await escanearQR(qrToken)
      setResultado({
        tipo: 'ok',
        nombreSocio: reintegro.nombre_socio,
        monto: reintegro.monto,
      })
    } catch (err) {
      // 409 = ya había escaneado en esta reserva (conflicto esperado, no un error grave)
      if (err.status === 409) {
        setResultado({ tipo: 'ya_escaneo', mensaje: err.message })
      } else {
        setResultado({ tipo: 'error', mensaje: err.message })
      }
    } finally {
      setProcesando(false)
    }
  }

  const volverAEscanear = () => {
    setResultado(null)
    ultimoTokenRef.current = null
    bloqueadoRef.current = false
    setEscaneando(true)
  }

  if (!reservaActiva) {
    return <SelectorReserva onSeleccionar={setReservaActiva} />
  }

  return (
    <div className="p-6 max-w-md mx-auto space-y-5">

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
      {escaneando && (
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

      {!procesando && resultado && (
        <>
          <FeedbackEscaneo resultado={resultado} />
          <button
            onClick={volverAEscanear}
            className="w-full py-3 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800 transition-colors"
          >
            Escanear siguiente
          </button>
        </>
      )}
    </div>
  )
}