// frontend/src/pages/AdminScannerEvento.jsx
/**
 * Escáner de Eventos — control de puerta para el Admin Temporal.
 *
 * Flujo:
 *   1. El operador ve los "Eventos de hoy" (GET /deportivo/eventos/hoy) y
 *      elige a cuál está controlando la puerta.
 *   2. Se abre la cámara con @yudiel/react-qr-scanner (ya usado en el resto
 *      de la app para el escáner de comercios/socios).
 *   3. Cada QR leído se resuelve primero contra POST /qr/validar-token para
 *      obtener el Usuario real detrás del token (mismo endpoint que ya usa
 *      el escáner de comercios) y recién con ese id_usuario resuelto se
 *      llama a POST /deportivo/eventos/{id}/asistencias.
 *   4. Feedback grande en pantalla (verde = al día, ámbar = moroso, rojo =
 *      error) y vuelta automática a la cámara — pensado para una fila de
 *      gente entrando, sin pantallas intermedias que frenen el flujo.
 *   5. Fallback manual por DNI vía POST /qr/validar-dni, para cuando el QR
 *      no lee (celular roto, pantalla rayada, etc.).
 *
 * ── Supuesto que hice sobre /qr/validar-token y /qr/validar-dni ──────────
 * No tenía el archivo qr_auth.py en este chat para confirmar el shape
 * exacto de la respuesta. Asumí:
 *   POST /qr/validar-token  { qr_token }  → { id_usuario, nombre, apellido,
 *                                              dni, estado_financiero }
 *   POST /qr/validar-dni    { dni }       → misma forma de respuesta
 * Si el shape real es distinto, el único lugar que hay que tocar es
 * `resolverUsuarioPorToken` / `resolverUsuarioPorDni` de este archivo.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Scanner } from '@yudiel/react-qr-scanner'
import { useAuth } from '../context/AuthContext'
import {
  ScanLine,
  ArrowLeft,
  CalendarDays,
  MapPin,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Search,
  Loader2,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const formatoHora = (fecha) =>
  fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

// ─── Selector de evento ────────────────────────────────────────────────────────

function SelectorEvento({ onSeleccionar }) {
  const { token } = useAuth()
  const navigate = useNavigate()

  const [eventos, setEventos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchEventosHoy = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/deportivo/eventos/hoy`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`Error ${res.status}: No se pudieron cargar los eventos de hoy.`)
      setEventos(await res.json())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { fetchEventosHoy() }, [fetchEventosHoy])

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <ScanLine size={24} className="text-gray-500" />
            Control de Acceso
          </h1>
          <p className="text-sm text-gray-500 mt-1">Elegí el evento que estás controlando en la puerta.</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle size={18} className="flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={fetchEventosHoy} className="underline underline-offset-2 font-medium hover:text-red-900">
            Reintentar
          </button>
        </div>
      )}

      <div className="space-y-3">
        {loading && [...Array(2)].map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 h-20 animate-pulse" />
        ))}

        {!loading && eventos.map(evento => (
          <button
            key={evento.id_evento}
            onClick={() => onSeleccionar(evento)}
            className="w-full text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md hover:border-emerald-200 transition-all flex items-center justify-between gap-4"
          >
            <div>
              <p className="font-bold text-gray-900">{evento.titulo}</p>
              <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                <span className="flex items-center gap-1.5">
                  <CalendarDays size={13} /> {formatoHora(new Date(evento.fecha_inicio))}
                </span>
                {evento.ubicacion && (
                  <span className="flex items-center gap-1.5">
                    <MapPin size={13} /> {evento.ubicacion}
                  </span>
                )}
              </div>
            </div>
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-3 py-1.5 rounded-full flex-shrink-0">
              Controlar
            </span>
          </button>
        ))}

        {!loading && !error && eventos.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-gray-500">
            No hay eventos programados para hoy.
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Feedback tras un escaneo ──────────────────────────────────────────────────

function FeedbackEscaneo({ resultado }) {
  if (!resultado) return null

  const config = {
    al_dia: { classes: 'bg-green-50 border-green-300 text-green-800', Icon: CheckCircle2, label: 'AL DÍA' },
    moroso: { classes: 'bg-amber-50 border-amber-300 text-amber-800', Icon: AlertTriangle, label: 'MOROSO' },
    error:  { classes: 'bg-red-50 border-red-300 text-red-800',       Icon: XCircle,        label: 'ERROR' },
  }[resultado.tipo]

  const { classes, Icon, label } = config

  return (
    <div className={`rounded-2xl border-2 p-6 text-center space-y-2 ${classes}`}>
      <Icon size={48} className="mx-auto" />
      <p className="text-2xl font-black tracking-wide">{label}</p>
      {resultado.nombreCompleto && <p className="text-lg font-semibold">{resultado.nombreCompleto}</p>}
      {resultado.dni && <p className="text-sm font-mono opacity-75">DNI {resultado.dni}</p>}
      {resultado.mensaje && <p className="text-sm">{resultado.mensaje}</p>}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function AdminScannerEvento() {
  const { token } = useAuth()

  const [eventoActivo, setEventoActivo] = useState(null)
  const [escaneando, setEscaneando] = useState(true)
  const [procesando, setProcesando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [modoManual, setModoManual] = useState(false)
  const [dniManual, setDniManual] = useState('')

  // Evita procesar el mismo QR varias veces mientras la cámara sigue leyendo
  // el mismo frame (el lector puede disparar onScan varias veces por segundo).
  const ultimoTokenRef = useRef(null)
  const bloqueadoRef = useRef(false)

  const resolverUsuarioPorToken = async (qrToken) => {
    const res = await fetch(`${API}/qr/validar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ qr_token: qrToken }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail ?? 'QR inválido o no reconocido.')
    }
    return res.json()
  }

  const resolverUsuarioPorDni = async (dni) => {
    const res = await fetch(`${API}/qr/validar-dni`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ dni }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail ?? 'No se encontró un socio con ese DNI.')
    }
    return res.json()
  }

  const registrarAsistencia = async (usuarioResuelto, metodo) => {
    const res = await fetch(`${API}/deportivo/eventos/${eventoActivo.id_evento}/asistencias`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id_evento: eventoActivo.id_evento,
        id_usuario: usuarioResuelto.id_usuario,
        metodo,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail ?? 'No se pudo registrar la asistencia.')
    }
    return res.json()
  }

  const procesarUsuarioResuelto = async (usuarioResuelto, metodo) => {
    const nombreCompleto = `${usuarioResuelto.nombre ?? ''} ${usuarioResuelto.apellido ?? ''}`.trim()
    try {
      const asistencia = await registrarAsistencia(usuarioResuelto, metodo)
      const esMoroso = asistencia.estado_financiero_snapshot === 'moroso'
      setResultado({
        tipo: esMoroso ? 'moroso' : 'al_dia',
        nombreCompleto,
        dni: usuarioResuelto.dni,
        mensaje: esMoroso ? 'Ingreso registrado — avisar en secretaría.' : 'Ingreso registrado.',
      })
    } catch (err) {
      setResultado({ tipo: 'error', nombreCompleto, dni: usuarioResuelto.dni, mensaje: err.message })
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
      const usuarioResuelto = await resolverUsuarioPorToken(qrToken)
      await procesarUsuarioResuelto(usuarioResuelto, 'QR')
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
      const usuarioResuelto = await resolverUsuarioPorDni(dniManual.trim())
      await procesarUsuarioResuelto(usuarioResuelto, 'DNI')
    } catch (err) {
      setResultado({ tipo: 'error', mensaje: err.message })
    } finally {
      setProcesando(false)
      setDniManual('')
    }
  }

  const volverAEscanear = () => {
    setResultado(null)
    ultimoTokenRef.current = null
    bloqueadoRef.current = false
    setModoManual(false)
    setEscaneando(true)
  }

  if (!eventoActivo) {
    return <SelectorEvento onSeleccionar={setEventoActivo} />
  }

  return (
    <div className="p-6 max-w-md mx-auto space-y-5">

      {/* Header con el evento activo */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setEventoActivo(null)}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors flex-shrink-0"
          title="Cambiar de evento"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <p className="font-bold text-gray-900 truncate">{eventoActivo.titulo}</p>
          <p className="text-xs text-gray-500">Controlando el acceso</p>
        </div>
      </div>

      {/* Cámara / feedback */}
      {escaneando && !modoManual && (
        <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-sm aspect-square bg-black">
          <Scanner
            onScan={handleScan}
            onError={(err) => setResultado({ tipo: 'error', mensaje: 'No se pudo acceder a la cámara.' })}
            constraints={{ facingMode: 'environment' }}
          />
        </div>
      )}

      {procesando && (
        <div className="rounded-2xl border border-gray-200 shadow-sm p-8 text-center space-y-2">
          <Loader2 size={32} className="mx-auto animate-spin text-gray-400" />
          <p className="text-sm text-gray-500">Verificando…</p>
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