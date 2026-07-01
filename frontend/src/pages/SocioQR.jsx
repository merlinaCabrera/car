// frontend/src/pages/SocioQR.jsx
/**
 * Pantalla del QR de acceso del socio.
 *
 * ── Flujo de datos ────────────────────────────────────────────────────────────
 * 1. RENDERIZADO INSTANTÁNEO: lee `user.qr_token` del AuthContext (ya disponible
 *    desde el login). El socio ve su QR sin ningún loading state inicial.
 *
 * 2. ROTACIÓN INMEDIATA: al montar, llama a `GET /qr/token` para emitir un token
 *    fresco y actualizar la BD. El QR ya visible se reemplaza silenciosamente.
 *
 * 3. AUTO-REFRESH: cada REFRESH_INTERVAL segundos repite el paso 2.
 *    El timer se reinicia si el usuario hace refresh manual.
 *
 * 4. REFRESH MANUAL: el botón "Actualizar código" fuerza la rotación de inmediato
 *    y reinicia el contador automático.
 *
 * ── Por qué `user.qr_token` del contexto como estado inicial ─────────────────
 * `AuthContext` ya tiene el token del usuario desde `/usuarios/me`. Usarlo como
 * valor inicial elimina el parpadeo de "Generando QR..." en cada visita a esta
 * página. No es un riesgo de seguridad porque el UUID se rota de inmediato.
 *
 * ── Sobre un archivo de servicios centralizado ────────────────────────────────
 * Hoy las llamadas viven en los componentes/contextos. Cuando el proyecto crezca,
 * recomiendo extraer a `src/services/api.js` con un fetch wrapper que inyecte
 * el header de Authorization automáticamente. Ejemplo mínimo al final del archivo.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { RefreshCw, ShieldCheck, AlertTriangle, Wifi, WifiOff } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

// ─── Constantes ───────────────────────────────────────────────────────────────

const API                    = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const REFRESH_INTERVAL_SEC   = 55   // Rotamos antes de que el token expire en el backend (60s)
const QR_SIZE                = 260  // px — se escala bien en móvil con max-w-xs del contenedor

// ─── Componente principal ─────────────────────────────────────────────────────

export default function SocioQR() {
  const { user, token } = useAuth()

  /**
   * Estado inicial = qr_token que ya viene del AuthContext.
   * Esto garantiza que el QR se renderice en el primer frame sin ningún fetch.
   */
  const [qrValue,    setQrValue]    = useState(user?.qr_token ?? null)
  const [countdown,  setCountdown]  = useState(REFRESH_INTERVAL_SEC)
  const [rotating,   setRotating]   = useState(false)   // solo durante el fetch de rotación
  const [error,      setError]      = useState(null)
  const [online,     setOnline]     = useState(navigator.onLine)

  // Refs para limpiar los intervals sin depender de closures obsoletas
  const fetchTimerRef     = useRef(null)
  const countdownTimerRef = useRef(null)

  // ── Indicador de conectividad ──────────────────────────────────────────────
  useEffect(() => {
    const handleOnline  = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online',  handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // ── Función de rotación de token ───────────────────────────────────────────
  const rotarToken = useCallback(async ({ silencioso = false } = {}) => {
    if (!token) return

    if (!silencioso) setRotating(true)
    setError(null)

    try {
      const res = await fetch(`${API}/qr/token`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail ?? `Error ${res.status} al generar el QR.`)
      }

      const data = await res.json()
      setQrValue(data.qr_token)
    } catch (err) {
      // En rotación silenciosa (auto-refresh), mostramos el error pero
      // conservamos el QR anterior en pantalla para no dejarlo sin nada.
      setError(err.message)
    } finally {
      if (!silencioso) setRotating(false)
    }
  }, [token])

  // ── Setup de intervals ─────────────────────────────────────────────────────
  const iniciarTimers = useCallback(() => {
    // Limpiar cualquier timer anterior
    clearInterval(fetchTimerRef.current)
    clearInterval(countdownTimerRef.current)

    setCountdown(REFRESH_INTERVAL_SEC)

    // Auto-refresh del token
    fetchTimerRef.current = setInterval(() => {
      rotarToken({ silencioso: true })
      setCountdown(REFRESH_INTERVAL_SEC)
    }, REFRESH_INTERVAL_SEC * 1000)

    // Countdown visual
    countdownTimerRef.current = setInterval(() => {
      setCountdown(prev => (prev > 0 ? prev - 1 : 0))
    }, 1000)
  }, [rotarToken])

  // Al montar: rotación inmediata + inicio de timers
  useEffect(() => {
    rotarToken({ silencioso: true })  // silencioso = no muestra el spinner, usa el qr del contexto
    iniciarTimers()

    return () => {
      clearInterval(fetchTimerRef.current)
      clearInterval(countdownTimerRef.current)
    }
  }, [rotarToken, iniciarTimers])

  // ── Handler del botón manual ───────────────────────────────────────────────
  const handleRefreshManual = async () => {
    await rotarToken({ silencioso: false })  // muestra el spinner en el botón
    iniciarTimers()                          // reinicia el countdown
  }

  // ── Datos del usuario ──────────────────────────────────────────────────────
  const esMoroso    = (user?.deuda_historica_meses ?? 0) > 0
  const nombreCorto = user?.nombre?.split(' ')[0] ?? 'Socio'

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-[calc(100dvh-4rem)] flex flex-col items-center justify-start
                    px-4 py-8 bg-gray-50">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="w-full max-w-sm text-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
          Mi código QR
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Mostralo en la entrada del club para ingresar.
        </p>
      </div>

      {/* ── Tarjeta principal ──────────────────────────────────────────────── */}
      <div className={`w-full max-w-sm rounded-3xl shadow-md border-2 overflow-hidden
                       transition-colors duration-300
                       ${esMoroso
                         ? 'border-red-200   bg-white'
                         : 'border-green-200 bg-white'
                       }`}>

        {/* Franja de estado */}
        <div className={`w-full py-2.5 px-4 flex items-center justify-between
                         text-sm font-semibold
                         ${esMoroso
                           ? 'bg-red-50 text-red-700'
                           : 'bg-green-50 text-green-700'
                         }`}>
          <span className="flex items-center gap-2">
            {esMoroso
              ? <AlertTriangle size={15} />
              : <ShieldCheck   size={15} />
            }
            {esMoroso ? 'CUENTA CON DEUDA' : 'HABILITADO ✓'}
          </span>
          <span className="font-normal text-xs opacity-70">
            {nombreCorto}
          </span>
        </div>

        {/* Cuerpo con el QR */}
        <div className="flex flex-col items-center p-8 gap-6">

          {/* Marco del QR */}
          <div className={`relative p-3 rounded-2xl transition-all duration-300
                           ${esMoroso
                             ? 'bg-red-50/60 ring-1 ring-red-200'
                             : 'bg-gray-50   ring-1 ring-gray-200'
                           }
                           ${rotating ? 'opacity-40 scale-95' : 'opacity-100 scale-100'}`}>

            {qrValue ? (
              <QRCodeSVG
                value={qrValue}
                size={QR_SIZE}
                level="H"                     // Alta corrección de errores
                includeMargin={false}          // El padding lo ponemos nosotros con p-3
                fgColor={esMoroso ? '#991b1b' : '#14532d'}  // Rojo oscuro / verde oscuro
                bgColor="transparent"
              />
            ) : (
              /* Placeholder mientras llega el primer token */
              <div
                style={{ width: QR_SIZE, height: QR_SIZE }}
                className="flex items-center justify-center"
              >
                <RefreshCw size={40} className="text-gray-300 animate-spin" />
              </div>
            )}

            {/* Overlay de carga sobre el QR existente */}
            {rotating && qrValue && (
              <div className="absolute inset-0 flex items-center justify-center rounded-2xl">
                <div className="bg-white/80 rounded-full p-3 shadow">
                  <RefreshCw size={24} className="text-gray-500 animate-spin" />
                </div>
              </div>
            )}
          </div>

          {/* Mensaje de error (sin ocultar el QR) */}
          {error && (
            <div className="w-full flex items-start gap-2 px-3 py-2.5 rounded-xl
                            bg-amber-50 border border-amber-200 text-amber-800 text-xs">
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              <span>{error} El código anterior sigue siendo válido.</span>
            </div>
          )}

          {/* Información del token */}
          <div className="w-full space-y-1 text-center">
            <p className="text-xs text-gray-400 font-mono truncate px-2">
              {qrValue
                ? `ID: ${qrValue.substring(0, 8)}…`
                : 'Generando…'
              }
            </p>
            <p className="text-xs text-gray-400">
              Este código es único y cambia automáticamente
            </p>
          </div>
        </div>

        {/* Footer de la tarjeta */}
        <div className="border-t border-gray-100 px-6 py-4 flex items-center justify-between gap-4">

          {/* Countdown */}
          <div className="flex items-center gap-2 text-xs text-gray-400 min-w-0">
            {online
              ? <Wifi size={13} className="flex-shrink-0 text-green-500" />
              : <WifiOff size={13} className="flex-shrink-0 text-red-400" />
            }
            <span className="truncate">
              {online
                ? countdown > 0
                  ? `Nuevo código en ${countdown}s`
                  : 'Actualizando…'
                : 'Sin conexión'
              }
            </span>
          </div>

          {/* Botón de refresh manual */}
          <button
            onClick={handleRefreshManual}
            disabled={rotating}
            className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl
                       text-xs font-semibold text-gray-700
                       bg-gray-100 hover:bg-gray-200
                       active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all duration-150 shadow-sm"
            aria-label="Forzar actualización del código QR"
          >
            <RefreshCw size={13} className={rotating ? 'animate-spin' : ''} />
            Actualizar
          </button>
        </div>
      </div>

      {/* ── Nota informativa ──────────────────────────────────────────────── */}
      <p className="mt-6 text-xs text-gray-400 text-center max-w-xs leading-relaxed px-2">
        Por seguridad, el código no contiene tus datos personales.
        Solo el personal autorizado del club puede validarlo.
      </p>
    </div>
  )
}


/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SUGERENCIA: src/services/api.js (extraer cuando el proyecto crezca)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Un wrapper centralizado elimina el boilerplate de Authorization en cada fetch
 * y facilita agregar manejo global de errores (ej: redirect a /login en 401).
 *
 * // src/services/api.js
 * const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
 *
 * export function apiClient(token) {
 *   const headers = {
 *     'Content-Type': 'application/json',
 *     ...(token ? { Authorization: `Bearer ${token}` } : {}),
 *   }
 *   return {
 *     get:    (path)         => fetch(`${BASE}${path}`, { headers }),
 *     post:   (path, body)   => fetch(`${BASE}${path}`, { method: 'POST',  headers, body: JSON.stringify(body) }),
 *     patch:  (path, body)   => fetch(`${BASE}${path}`, { method: 'PATCH', headers, body: JSON.stringify(body) }),
 *     delete: (path)         => fetch(`${BASE}${path}`, { method: 'DELETE', headers }),
 *   }
 * }
 *
 * // Uso en cualquier componente:
 * const { token } = useAuth()
 * const api = apiClient(token)
 * const res = await api.get('/qr/token')
 * ═══════════════════════════════════════════════════════════════════════════════
 */