// frontend/src/pages/AdminScanner.jsx
/**
 * Panel de control de acceso para porteros / admin_temporal.
 *
 * ── Flujo principal ───────────────────────────────────────────────────────────
 * 1. El Scanner captura el UUID del QR y llama a POST /qr/validar-token.
 * 2. La tarjeta de resultado reemplaza el visor durante AUTO_RESET_SEC segundos.
 * 3. Fallback manual: input de DNI → POST /qr/validar-dni (misma respuesta).
 * 4. "Escanear siguiente" o el auto-reset devuelven el visor activo.
 *
 * ── Correcciones respecto al archivo anterior ─────────────────────────────────
 * - onDecode (API v1) → onScan(results[]) con results[0].rawValue  (API v2/v3)
 * - Endpoint /qr/validar  → /qr/validar-token
 * - Campos de respuesta: nombre_completo, roles_activos[], mensaje_display, etc.
 *   (schema UsuarioQRValidacionResponse del backend)
 *
 * ── Props de Scanner (@yudiel/react-qr-scanner v2) ───────────────────────────
 * onScan(codes: IDetectedBarcode[])  → codes[0].rawValue es el UUID
 * paused={bool}                      → pausa/activa sin desmontar el componente
 * components={{ audio: false }}      → evita el beep del scanner
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { Scanner } from '@yudiel/react-qr-scanner'
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  UserCircle2,
  Keyboard,
  ScanLine,
  ChevronRight,
  Clock,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

// ─── Constantes ───────────────────────────────────────────────────────────────

const API            = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const AUTO_RESET_SEC = 8   // segundos antes de volver al escáner automáticamente

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Determina la variante visual según el estado del socio.
 * Basado en UsuarioQRValidacionResponse:
 *   estado_financiero: 'al_dia' | 'moroso' | 'inactivo' | 'desconocido'
 *   es_valido: boolean
 */
function resolverVariante(resultado) {
  if (!resultado.es_valido) return 'denegado'
  if (resultado.estado_financiero === 'al_dia') return 'habilitado'
  if (resultado.estado_financiero === 'moroso')  return 'moroso'
  return 'denegado'
}

const VARIANTES = {
  habilitado: {
    bg:       'bg-green-500',
    ring:     'ring-green-400',
    badge:    'bg-green-900/40 text-green-100',
    Icon:     CheckCircle,
    iconCls:  'text-white',
  },
  moroso: {
    bg:       'bg-amber-500',
    ring:     'ring-amber-400',
    badge:    'bg-amber-900/40 text-amber-100',
    Icon:     AlertTriangle,
    iconCls:  'text-white',
  },
  denegado: {
    bg:       'bg-red-600',
    ring:     'ring-red-400',
    badge:    'bg-red-900/40 text-red-100',
    Icon:     XCircle,
    iconCls:  'text-white',
  },
}

// ─── Sub-componente: Tarjeta de resultado ─────────────────────────────────────

function TarjetaResultado({ resultado, onSiguiente }) {
  const [cuenta,  setCuenta]  = useState(AUTO_RESET_SEC)
  const variante              = resolverVariante(resultado)
  const { bg, badge, Icon, iconCls } = VARIANTES[variante]

  // Auto-reset countdown
  useEffect(() => {
    if (cuenta <= 0) { onSiguiente(); return }
    const t = setTimeout(() => setCuenta(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cuenta, onSiguiente])

  return (
    <div className={`
      relative flex flex-col items-center justify-between
      min-h-[calc(100dvh-4rem)] w-full px-5 py-8
      ${bg} text-white
      transition-colors duration-300
    `}>

      {/* Countdown en esquina */}
      <div className="absolute top-4 right-4 flex items-center gap-1.5
                      bg-black/20 rounded-full px-3 py-1.5 text-xs font-semibold">
        <Clock size={12} />
        {cuenta}s
      </div>

      {/* Bloque superior: ícono + mensaje_display */}
      <div className="flex-1 flex flex-col items-center justify-center gap-5 text-center pt-6">
        <div className="rounded-full bg-white/15 p-5 ring-4 ring-white/30">
          <Icon size={72} className={`${iconCls} drop-shadow-lg`} strokeWidth={1.5} />
        </div>

        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight uppercase leading-tight
                       drop-shadow-sm max-w-xs">
          {resultado.mensaje_display}
        </h2>
      </div>

      {/* Bloque medio: datos del socio */}
      <div className="w-full max-w-sm rounded-2xl bg-black/20 backdrop-blur-sm p-5 space-y-4">

        {/* Foto + nombre */}
        <div className="flex items-center gap-4">
          {resultado.foto_perfil_url ? (
            <img
              src={resultado.foto_perfil_url}
              alt="Foto de perfil"
              className="w-16 h-16 rounded-full object-cover ring-2 ring-white/40 flex-shrink-0"
              onError={e => { e.currentTarget.style.display = 'none' }}
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center
                            justify-center flex-shrink-0 ring-2 ring-white/30">
              <UserCircle2 size={36} className="text-white/70" />
            </div>
          )}

          <div className="min-w-0">
            <p className="font-bold text-lg leading-tight truncate">
              {resultado.nombre_completo ?? '—'}
            </p>
            {resultado.antiguedad_meses > 0 && (
              <p className="text-sm text-white/70 mt-0.5">
                {resultado.antiguedad_meses} {resultado.antiguedad_meses === 1 ? 'mes' : 'meses'} de antigüedad
              </p>
            )}
          </div>
        </div>

        {/* Roles activos */}
        {resultado.roles_activos?.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {resultado.roles_activos.map(rol => (
              <span
                key={rol}
                className={`text-xs font-semibold px-3 py-1 rounded-full capitalize ${badge}`}
              >
                {rol.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        )}

        {/* Estado financiero */}
        <div className="text-sm text-white/80 border-t border-white/10 pt-3">
          Estado financiero:&nbsp;
          <span className="font-semibold text-white capitalize">
            {resultado.estado_financiero === 'al_dia'
              ? 'Al día ✓'
              : resultado.estado_financiero === 'moroso'
              ? 'Moroso ✗'
              : resultado.estado_financiero}
          </span>
        </div>
      </div>

      {/* Botón: Escanear siguiente */}
      <button
        onClick={onSiguiente}
        className="mt-6 w-full max-w-sm flex items-center justify-center gap-3
                   py-4 px-6 rounded-2xl
                   bg-white/20 hover:bg-white/30 active:scale-95
                   font-bold text-lg text-white
                   transition-all duration-150 shadow-md"
      >
        <ScanLine size={22} />
        Escanear siguiente
        <ChevronRight size={18} className="opacity-70" />
      </button>
    </div>
  )
}

// ─── Sub-componente: overlay de carga sobre el visor ──────────────────────────

function OverlayCarga() {
  return (
    <div className="absolute inset-0 bg-black/60 flex flex-col items-center
                    justify-center gap-3 z-10 rounded-2xl">
      <Loader2 size={48} className="text-white animate-spin" />
      <p className="text-white font-semibold text-sm">Validando…</p>
    </div>
  )
}

// ─── Sub-componente: mira del escáner (decorativa) ────────────────────────────

function MiraEscaner() {
  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
      {/* Esquinas de la mira */}
      {[
        'top-[20%] left-[15%] border-t-4 border-l-4 rounded-tl-lg',
        'top-[20%] right-[15%] border-t-4 border-r-4 rounded-tr-lg',
        'bottom-[20%] left-[15%] border-b-4 border-l-4 rounded-bl-lg',
        'bottom-[20%] right-[15%] border-b-4 border-r-4 rounded-br-lg',
      ].map((cls, i) => (
        <div key={i} className={`absolute w-8 h-8 border-white/80 ${cls}`} />
      ))}
      {/* Línea de escaneo animada */}
      <div className="absolute top-[20%] left-[15%] right-[15%] h-0.5
                      bg-gradient-to-r from-transparent via-green-400 to-transparent
                      animate-[scan_2s_ease-in-out_infinite]" />
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function AdminScanner() {
  const { token } = useAuth()

  const [resultado,  setResultado]  = useState(null)   // UsuarioQRValidacionResponse
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState(null)
  const [manualDni,  setManualDni]  = useState('')
  const [modoDNI,    setModoDNI]    = useState(false)  // toggle entre cámara e input

  // Ref para evitar doble-disparo del scanner mientras ya hay resultado/loading
  const procesandoRef = useRef(false)

  // ── Función central de validación ────────────────────────────────────────
  const validar = useCallback(async (endpoint, body) => {
    if (procesandoRef.current) return
    procesandoRef.current = true
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`${API}${endpoint}`, {
        method: 'POST',
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      if (!res.ok) {
        // 4xx/5xx del backend (token mal formado, etc.)
        throw new Error(data.detail ?? `Error ${res.status}`)
      }

      setResultado(data)   // UsuarioQRValidacionResponse — siempre viene en 2xx

    } catch (err) {
      setError(err.message)
      // Autolimpia el error a los 4s sin perder el visor
      setTimeout(() => setError(null), 4000)
    } finally {
      setLoading(false)
      procesandoRef.current = false
    }
  }, [token])

  // ── Handler del Scanner ───────────────────────────────────────────────────
  // onScan recibe IDetectedBarcode[] → usamos [0].rawValue
  const handleScan = useCallback((codes) => {
    if (!codes?.length || procesandoRef.current || resultado) return
    const rawValue = codes[0]?.rawValue
    if (!rawValue) return
    validar('/qr/validar-token', { token: rawValue })
  }, [validar, resultado])

  // ── Handler del formulario DNI ────────────────────────────────────────────
  const handleManualSubmit = (e) => {
    e.preventDefault()
    const dni = manualDni.trim()
    if (!dni || procesandoRef.current) return
    validar('/qr/validar-dni', { dni })
    setManualDni('')
  }

  // ── Reset: vuelve al visor activo ─────────────────────────────────────────
  const resetScanner = useCallback(() => {
    setResultado(null)
    setError(null)
    setLoading(false)
    procesandoRef.current = false
  }, [])

  // ── Render: tarjeta de resultado (full-screen) ────────────────────────────
  if (resultado) {
    return <TarjetaResultado resultado={resultado} onSiguiente={resetScanner} />
  }

  // ── Render: visor ─────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-[calc(100dvh-4rem)] bg-gray-950">

      {/* Header compacto */}
      <div className="px-5 pt-5 pb-3 text-center">
        <h1 className="text-xl font-bold text-white tracking-tight">Control de Acceso</h1>
        <p className="text-gray-400 text-xs mt-0.5">
          {modoDNI
            ? 'Ingresá el DNI del socio manualmente.'
            : 'Apuntá la cámara al QR del socio.'}
        </p>
      </div>

      {/* Toggle cámara / DNI */}
      <div className="flex mx-5 mb-4 rounded-xl overflow-hidden border border-gray-700 text-sm font-semibold">
        {[
          { label: '📷  Cámara QR', value: false },
          { label: '⌨️  DNI Manual', value: true  },
        ].map(({ label, value }) => (
          <button
            key={label}
            onClick={() => setModoDNI(value)}
            className={`flex-1 py-2.5 transition-colors ${
              modoDNI === value
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Bloque principal: visor o input ────────────────────────────── */}
      <div className="flex-1 flex flex-col px-5 gap-4">

        {modoDNI ? (
          /* ── Modo DNI ──────────────────────────────────────────────── */
          <div className="flex-1 flex flex-col justify-center gap-4">
            <form onSubmit={handleManualSubmit} className="space-y-3">
              <label
                htmlFor="dni-manual"
                className="flex items-center gap-2 text-sm font-semibold text-gray-300"
              >
                <Keyboard size={15} />
                DNI sin puntos
              </label>
              <input
                id="dni-manual"
                type="text"
                inputMode="numeric"
                pattern="\d*"
                maxLength={10}
                value={manualDni}
                onChange={e => setManualDni(e.target.value.replace(/\D/g, ''))}
                placeholder="Ej: 44123456"
                autoFocus
                disabled={loading}
                className="w-full py-4 px-4 rounded-xl text-xl font-mono tracking-widest
                           text-center bg-gray-800 text-white border border-gray-600
                           focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/40
                           disabled:opacity-50 transition-all"
              />
              <button
                type="submit"
                disabled={loading || manualDni.length < 7}
                className="w-full py-4 rounded-xl font-bold text-lg
                           bg-indigo-600 hover:bg-indigo-500 active:scale-95
                           disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed
                           text-white transition-all shadow-lg"
              >
                {loading
                  ? <span className="flex items-center justify-center gap-2">
                      <Loader2 size={18} className="animate-spin" /> Validando…
                    </span>
                  : 'Validar DNI'
                }
              </button>
            </form>
          </div>

        ) : (
          /* ── Modo Cámara ───────────────────────────────────────────── */
          <div className="relative w-full rounded-2xl overflow-hidden bg-black
                          aspect-square max-h-[65dvh] shadow-2xl border border-gray-800">

            {/* Scanner — siempre montado; paused cuando loading o resultado */}
            <Scanner
              onScan={handleScan}
              onError={err => console.warn('[QR Scanner]', err?.message)}
              paused={loading}
              components={{ audio: false, torch: true }}
              styles={{
                container: { width: '100%', height: '100%' },
                video:     { width: '100%', height: '100%', objectFit: 'cover' },
              }}
            />

            {/* Mira decorativa */}
            {!loading && <MiraEscaner />}

            {/* Overlay de carga */}
            {loading && <OverlayCarga />}
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl
                          bg-red-900/60 border border-red-700 text-red-300 text-sm font-medium">
            <AlertTriangle size={16} className="flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Instrucción contextual */}
        {!modoDNI && !loading && !error && (
          <p className="text-center text-gray-500 text-xs pb-2">
            El escáner reconoce el código automáticamente.
          </p>
        )}
      </div>
    </div>
  )
}

/*
 * ─── CSS ADICIONAL para la línea de escaneo animada ────────────────────────
 *
 * Agregá esto en tu tailwind.config.js dentro de theme.extend.keyframes:
 *
 *   scan: {
 *     '0%, 100%': { top: '20%', opacity: '1' },
 *     '50%':      { top: '80%', opacity: '0.6' },
 *   }
 *
 * Si no querés tocar la config, borrá el div de la línea de escaneo en
 * <MiraEscaner> y la animación seguirá funcionando con solo las esquinas.
 */