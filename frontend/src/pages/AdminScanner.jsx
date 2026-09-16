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
 *
 * ── Modo offline ─────────────────────────────────────────────────────────────
 * La puerta del club tiene mala señal. `useEscanerCache` mantiene una copia del
 * padrón activo en localStorage (refresco cada 15 min) y este componente la usa
 * como plan B:
 *
 *   validación por DNI → intenta /qr/validar-dni con 3 s de timeout
 *                      → si no hay red, resuelve contra la caché
 *   validación por QR  → NO tiene plan B. El `qr_token` rota en cada apertura
 *                        de la pantalla del socio, así que una copia cacheada
 *                        estaría vencida casi siempre; además sería guardar
 *                        credenciales de 300 socios en el teléfono del portero.
 *                        Sin conexión, el escáner manda a usar el DNI manual.
 *
 * El banner de conexión está siempre arriba, y un resultado servido desde la
 * caché lleva el chip "OFFLINE · datos de hace X". El color del resultado
 * (verde/ámbar/rojo) NUNCA cambia por la fuente del dato: lo decide el estado
 * del socio y nada más.
 */

import { textoError } from '../utils/errores';
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
  Sparkles,
  Baby,
  Wifi,
  WifiOff,
  CloudOff,
  RefreshCw,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import {
  useEscanerCache,
  fetchConTimeout,
  formatearAntiguedad,
} from '../hooks/useEscanerCache'

// ─── Constantes ───────────────────────────────────────────────────────────────

const API            = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const AUTO_RESET_SEC = 8   // segundos antes de volver al escáner automáticamente

/**
 * Timeout de la validación en vivo antes de caer a la caché.
 *
 * 3 s es el techo de lo que el portero puede esperar con alguien parado
 * enfrente. Contrapartida asumida: si Render está dormido (free tier, cold
 * start de 40-60 s) el primer escaneo del día cae a la caché aunque haya
 * señal. Sale igual una respuesta correcta, marcada como OFFLINE, y el
 * refresco de caché — que tiene 60 s de timeout — despierta el server para
 * los escaneos siguientes. UptimeRobot sobre /health elimina el caso.
 */
const TIMEOUT_VALIDACION_MS = 3000

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

function TarjetaResultado({ resultado, onSiguiente, fuente = 'online', edadDato = null }) {
  const [cuenta,  setCuenta]  = useState(AUTO_RESET_SEC)
  const variante              = resolverVariante(resultado)
  const { bg, badge, Icon, iconCls } = VARIANTES[variante]
  const esDeCache             = fuente === 'cache'

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

      {/* Chip de origen del dato. Deliberadamente discreto y en blanco/negro:
          marca que el dato viene de la copia local, SIN tocar el color de la
          tarjeta — el verde/ámbar/rojo lo decide el estado del socio. */}
      {esDeCache && (
        <div className="absolute top-4 left-4 flex items-center gap-1.5
                        bg-black/30 rounded-full px-3 py-1.5 text-[11px] font-bold
                        uppercase tracking-wide ring-1 ring-white/30">
          <CloudOff size={12} />
          Offline · datos de hace {formatearAntiguedad(edadDato)}
        </div>
      )}

      {/* Bloque superior: ícono + mensaje_display */}
      <div className="flex-1 flex flex-col items-center justify-center gap-5 text-center pt-6">
        <div className="rounded-full bg-white/15 p-5 ring-4 ring-white/30">
          <Icon size={72} className={`${iconCls} drop-shadow-lg`} strokeWidth={1.5} />
        </div>

        <h2 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight uppercase leading-tight
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

        {/* Avisos operativos: mes de ingreso (BUG-16) y menor de edad (BUG-17).
            Los dos son informativos — no cambian si el socio entra o no. */}
        {(resultado.en_mes_ingreso || resultado.es_menor) && (
          <div className="flex flex-wrap gap-2">
            {resultado.en_mes_ingreso && (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5
                               rounded-full bg-white/25 ring-1 ring-white/40">
                <Sparkles size={13} />
                Mes de ingreso — 1ª cuota pendiente
              </span>
            )}
            {resultado.es_menor && (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5
                               rounded-full bg-white/25 ring-1 ring-white/40">
                <Baby size={13} />
                Menor de edad{resultado.edad != null ? ` — ${resultado.edad} años` : ''}
              </span>
            )}
          </div>
        )}

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
              ? (resultado.en_mes_ingreso ? 'Al día — mes de ingreso' : 'Al día ✓')
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
                      bg-gradient-to-r from-transparent via-blue-300 to-transparent
                      animate-[scan_2s_ease-in-out_infinite]" />
    </div>
  )
}

// ─── Sub-componente: banner de estado de conexión ─────────────────────────────

/**
 * Semáforo permanente arriba del escáner. El portero lo mira de reojo, así que
 * la información tiene que entrar de un vistazo: color, ícono y una línea.
 *
 * Los cuatro estados (según el enunciado de la funcionalidad):
 *   🟢 verde   → en línea, datos en tiempo real
 *   🟡 ámbar   → sin conexión, caché de menos de 2 h
 *   🔴 rojo    → sin conexión, caché de más de 2 h
 *   ⚫ gris    → sin conexión y sin caché: el escáner no puede decidir nada
 */
function BannerConexion({
  conexion,
  reconectando,
  cacheDisponible,
  cacheVieja,
  edadCache,
  totalCacheado,
  actualizando,
  onActualizar,
}) {
  const online = conexion === 'online'

  let estilo, Icono, titulo, detalle

  if (reconectando) {
    estilo  = 'bg-green-600 text-white'
    Icono   = RefreshCw
    titulo  = 'Conexión restaurada — actualizando…'
    detalle = null
  } else if (online) {
    estilo  = 'bg-green-600 text-white'
    Icono   = Wifi
    titulo  = 'En línea'
    detalle = 'Datos en tiempo real'
  } else if (!cacheDisponible) {
    estilo  = 'bg-gray-700 text-gray-100'
    Icono   = CloudOff
    titulo  = 'Sin conexión — sin caché disponible'
    detalle = 'No se puede validar. Verificá manualmente.'
  } else if (cacheVieja) {
    estilo  = 'bg-red-600 text-white'
    Icono   = WifiOff
    titulo  = `Sin conexión — datos desactualizados (hace ${formatearAntiguedad(edadCache)})`
    detalle = `${totalCacheado} socios en la copia local`
  } else {
    estilo  = 'bg-amber-500 text-white'
    Icono   = WifiOff
    titulo  = `Sin conexión — usando datos de hace ${formatearAntiguedad(edadCache)}`
    detalle = `${totalCacheado} socios en la copia local`
  }

  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 ${estilo}`}>
      <Icono
        size={20}
        className={`flex-shrink-0 ${(reconectando || actualizando) ? 'animate-spin' : ''}`}
      />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="text-sm font-bold truncate">{titulo}</p>
        {detalle && <p className="text-[11px] opacity-80 truncate">{detalle}</p>}
      </div>

      {/* Reintento manual: el portero puede caminar dos metros y recuperar
          señal, y no tiene por qué esperar los 15 minutos del refresco. */}
      {!online && !reconectando && (
        <button
          onClick={onActualizar}
          disabled={actualizando}
          className="flex-shrink-0 flex items-center gap-1.5 rounded-lg bg-black/25
                     px-3 py-1.5 text-xs font-bold disabled:opacity-50"
        >
          <RefreshCw size={13} className={actualizando ? 'animate-spin' : ''} />
          Reintentar
        </button>
      )}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function AdminScanner() {
  const { token } = useAuth()

  // `resultado` envuelve la respuesta junto con su procedencia:
  //   { data: UsuarioQRValidacionResponse, fuente: 'online'|'cache', edadDato }
  const [resultado,  setResultado]  = useState(null)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState(null)
  const [manualDni,  setManualDni]  = useState('')
  const [modoDNI,    setModoDNI]    = useState(false)  // toggle entre cámara e input

  const {
    conexion, reconectando, cacheDisponible, cacheVieja, edadCache,
    cacheTimestamp, totalCacheado, actualizando, actualizarCache,
    buscarEnCache, reportarExito, reportarFallo,
  } = useEscanerCache()

  // Ref para evitar doble-disparo del scanner mientras ya hay resultado/loading
  const procesandoRef = useRef(false)

  // ── Plan B cuando la red no contesta ─────────────────────────────────────
  // Solo aplica al camino por DNI: el QR no se puede resolver sin conexión
  // (ver el encabezado del archivo).
  const resolverDesdeCache = useCallback((dni) => {
    reportarFallo()

    if (!dni) {
      setError('Sin conexión — el QR no se puede validar offline. Pasá a "DNI Manual".')
      return
    }

    const socio = buscarEnCache(dni)
    if (socio) {
      setResultado({
        data:     socio,
        fuente:   'cache',
        edadDato: cacheTimestamp ? Date.now() - cacheTimestamp : null,
      })
      return
    }

    setError(
      cacheDisponible
        ? 'Sin conexión — socio no encontrado en caché. Verificar manualmente.'
        : 'Sin conexión y sin copia local del padrón. Verificar manualmente.',
    )
  }, [buscarEnCache, cacheDisponible, cacheTimestamp, reportarFallo])

  // ── Función central de validación ────────────────────────────────────────
  // `dniFallback` es el DNI con el que buscar en la caché si el request no
  // llega a destino. Va en null para el camino del QR.
  const validar = useCallback(async (endpoint, body, dniFallback = null) => {
    if (procesandoRef.current) return
    procesandoRef.current = true
    setLoading(true)
    setError(null)

    // El try/catch va partido en dos a propósito: solo el primero es un fallo
    // de RED (timeout o fetch que no sale). Un 400 del backend ("formato de QR
    // inválido") es una respuesta legítima y no tiene que disparar el modo
    // offline — si no, un QR de Google nos dejaría el banner en ámbar.
    let res
    try {
      res = await fetchConTimeout(
        `${API}${endpoint}`,
        {
          method: 'POST',
          headers: {
            Authorization:  `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
        TIMEOUT_VALIDACION_MS,
      )
    } catch {
      resolverDesdeCache(dniFallback)
      // El aviso de offline dura más que un error común: el portero tiene que
      // alcanzar a leer que el dato no vino del servidor.
      setTimeout(() => setError(null), 6000)
      setLoading(false)
      procesandoRef.current = false
      return
    }

    // Hubo respuesta del servidor: la red está viva, pase lo que pase abajo.
    reportarExito()

    try {
      const data = await res.json()

      if (!res.ok) {
        // 4xx/5xx del backend (token mal formado, etc.)
        throw new Error(textoError(data?.detail, `Error ${res.status}`))
      }

      // UsuarioQRValidacionResponse — siempre viene en 2xx
      setResultado({ data, fuente: 'online', edadDato: null })

    } catch (err) {
      setError(err.message)
      // Autolimpia el error a los 4s sin perder el visor
      setTimeout(() => setError(null), 4000)
    } finally {
      setLoading(false)
      procesandoRef.current = false
    }
  }, [token, resolverDesdeCache, reportarExito])

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
    validar('/qr/validar-dni', { dni }, dni)
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
    return (
      <TarjetaResultado
        resultado={resultado.data}
        fuente={resultado.fuente}
        edadDato={resultado.edadDato}
        onSiguiente={resetScanner}
      />
    )
  }

  // ── Render: visor ─────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-[calc(100dvh-4rem)] bg-gray-950">

      {/* Semáforo de conexión — arriba de todo y siempre visible */}
      <BannerConexion
        conexion={conexion}
        reconectando={reconectando}
        cacheDisponible={cacheDisponible}
        cacheVieja={cacheVieja}
        edadCache={edadCache}
        totalCacheado={totalCacheado}
        actualizando={actualizando}
        onActualizar={actualizarCache}
      />

      {/* Header compacto */}
      <div className="anim-entrada px-5 pt-5 pb-3 text-center">
        <h1 className="text-xl font-bold text-white tracking-tight">Control de Acceso</h1>
        <p className="text-gray-400 text-xs mt-0.5">
          {modoDNI
            ? 'Ingresá el DNI del socio manualmente.'
            : 'Apuntá la cámara al QR del socio.'}
        </p>
      </div>

      {/* Toggle cámara / DNI */}
      <div className="anim-entrada anim-d1 flex mx-5 mb-4 rounded-xl overflow-hidden border border-gray-700 text-sm font-semibold">
        {[
          { label: '📷  Cámara QR', value: false },
          { label: '⌨️  DNI Manual', value: true  },
        ].map(({ label, value }) => (
          <button
            key={label}
            onClick={() => setModoDNI(value)}
            className={`flex-1 py-2.5 transition-colors ${
              modoDNI === value
                ? 'bg-camoti-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Bloque principal: visor o input ────────────────────────────── */}
      <div className="anim-entrada anim-d2 flex-1 flex flex-col px-5 gap-4">

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
                           focus:outline-none focus:border-camoti-500 focus:ring-2 focus:ring-camoti-500/40
                           disabled:opacity-50 transition-all"
              />
              <button
                type="submit"
                disabled={loading || manualDni.length < 7}
                className="w-full py-4 rounded-xl font-bold text-lg
                           bg-camoti-600 hover:bg-camoti-500 active:scale-95
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
                          aspect-square max-h-[65dvh] shadow-xl border border-gray-800">

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

        {/* Instrucción contextual.
            Sin conexión avisamos ANTES de que escanee: el QR no se puede
            resolver offline y esperar los 3 s del timeout para enterarse, con
            gente haciendo cola, es exactamente lo que hay que evitar. */}
        {!modoDNI && !loading && !error && (
          conexion === 'offline' ? (
            <button
              onClick={() => setModoDNI(true)}
              className="mx-auto mb-2 flex items-center gap-2 rounded-xl border border-amber-700
                         bg-amber-900/40 px-4 py-2.5 text-xs font-semibold text-amber-200"
            >
              <Keyboard size={14} />
              Sin conexión: el QR no se puede validar. Tocá acá para usar DNI manual.
            </button>
          ) : (
            <p className="text-center text-gray-500 text-xs pb-2">
              El escáner reconoce el código automáticamente.
            </p>
          )
        )}
      </div>
    </div>
  )
}
