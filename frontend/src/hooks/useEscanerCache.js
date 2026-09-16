// frontend/src/hooks/useEscanerCache.js
/**
 * Caché local del padrón para que el escáner de la puerta siga funcionando
 * cuando se corta la señal.
 *
 * ── Por qué existe ───────────────────────────────────────────────────────────
 * El escáner lo usa el portero parado en la puerta del club, donde la señal es
 * mala. Hasta ahora, sin red el escáner no validaba nada. Con esto, mientras
 * haya conexión se baja el padrón activo cada 15 minutos y se guarda en
 * localStorage; cuando la red se cae, la validación por DNI se resuelve contra
 * esa copia.
 *
 * ── Qué se cachea ────────────────────────────────────────────────────────────
 * Lo que devuelve GET /admin/escaner/cache: una fila por socio activo con el
 * estado de puerta YA RESUELTO por el backend (`es_valido`, `mensaje_display`,
 * `estado_financiero`, `en_mes_ingreso`, `es_menor`, …). Es exactamente la
 * misma forma que la respuesta de /qr/validar-dni, así que la tarjeta de
 * resultado se dibuja igual online que offline y la regla de morosidad NO se
 * reimplementa en JavaScript.
 *
 * ── Qué NO se puede hacer offline ────────────────────────────────────────────
 * Validar un QR. El `qr_token` no se cachea (rota cada vez que el socio abre su
 * pantalla de QR, y guardarlo sería dejar 300 credenciales en el teléfono del
 * portero). Sin conexión, el camino es el DNI manual.
 *
 * ── Por qué setInterval y no un Service Worker ───────────────────────────────
 * Decisión explícita: un SW es más difícil de debuggear y de actualizar, y acá
 * no hace falta interceptar requests — alcanza con un JSON en localStorage.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../context/useAuth'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

// ─── Constantes ───────────────────────────────────────────────────────────────

export const CLAVE_CACHE = 'escaner_cache'

/** Cada cuánto se refresca la caché mientras hay conexión. */
const INTERVALO_REFRESCO_MS = 15 * 60 * 1000

/** A partir de acá la caché se considera "vieja" y el banner pasa a rojo. */
export const UMBRAL_CACHE_VIEJA_MS = 2 * 60 * 60 * 1000

/**
 * Timeout del refresco de caché. Es mucho más generoso que el de la validación
 * (3 s) a propósito: Render free tier hace spin-down por inactividad y el
 * primer request después de una siesta tarda 40-60 s. Ese cold start no tiene
 * que hacernos creer que estamos sin red.
 */
const TIMEOUT_CACHE_MS = 60 * 1000

/** Cada cuánto se re-renderiza el banner para que "hace X min" avance solo. */
const TICK_BANNER_MS = 30 * 1000

// ─── Helpers exportados (usados también por el componente del escáner) ────────

/**
 * fetch con timeout duro vía AbortController.
 *
 * Se usa AbortController y no el Promise.race() del enunciado porque race()
 * deja el request colgado en vuelo: si el server tarda 30 s, la respuesta
 * llega igual y el navegador la sigue manteniendo abierta. Con abort, el
 * request se cancela de verdad y no se encola una fila de requests zombis
 * cuando el portero escanea cinco socios seguidos sin señal.
 *
 * Rechaza con Error('timeout') si se pasa del tiempo.
 */
export async function fetchConTimeout(url, opciones = {}, ms = 3000) {
  const controlador = new AbortController()
  const t = setTimeout(() => controlador.abort(), ms)
  try {
    return await fetch(url, { ...opciones, signal: controlador.signal })
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error('timeout')
    throw err
  } finally {
    clearTimeout(t)
  }
}

/**
 * Antigüedad legible para el portero. Nada de "hace 127 minutos": el cartel se
 * mira de reojo con alguien esperando del otro lado.
 */
export function formatearAntiguedad(ms) {
  if (ms == null || !Number.isFinite(ms)) return '—'
  const minutos = Math.floor(ms / 60000)
  if (minutos < 1) return 'recién'
  if (minutos < 60) return `${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 48) return `${horas} h`
  return `${Math.floor(horas / 24)} días`
}

// ─── Acceso a localStorage (siempre defensivo) ────────────────────────────────
// En modo incógnito, con el almacenamiento lleno o con cookies bloqueadas,
// localStorage TIRA EXCEPCIÓN en vez de devolver null. Si eso revienta acá, se
// lleva puesto el escáner entero — que es justamente la pantalla que no puede
// fallar. Por eso cada acceso va envuelto.

function leerCache() {
  try {
    const crudo = localStorage.getItem(CLAVE_CACHE)
    if (!crudo) return null
    const parsed = JSON.parse(crudo)
    if (!parsed || !Array.isArray(parsed.socios) || !parsed.timestamp) return null
    return parsed
  } catch {
    return null
  }
}

function escribirCache(payload) {
  try {
    localStorage.setItem(CLAVE_CACHE, JSON.stringify(payload))
    return true
  } catch {
    // Cuota excedida o storage bloqueado: seguimos en modo online puro.
    return false
  }
}

function borrarCache() {
  try {
    localStorage.removeItem(CLAVE_CACHE)
  } catch {
    /* no-op */
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * @returns {{
 *   conexion: 'online'|'offline',
 *   reconectando: boolean,
 *   cacheDisponible: boolean,
 *   cacheTimestamp: number|null,
 *   edadCache: number|null,
 *   cacheVieja: boolean,
 *   totalCacheado: number,
 *   actualizando: boolean,
 *   errorCache: string|null,
 *   actualizarCache: () => Promise<void>,
 *   buscarEnCache: (dni: string) => object|null,
 *   reportarExito: () => void,
 *   reportarFallo: () => void,
 * }}
 */
export function useEscanerCache() {
  const { token } = useAuth()

  const [cache, setCache] = useState(() => leerCache())
  const [actualizando, setActualizando] = useState(false)
  const [errorCache, setErrorCache] = useState(null)
  const [reconectando, setReconectando] = useState(false)

  // Estado de conexión: arranca por navigator.onLine, pero lo corrige el
  // resultado real de los requests. navigator.onLine solo sabe si hay una
  // interfaz de red levantada — en la puerta del club es habitual tener
  // "señal" de datos y que igual no viaje un byte, y ahí onLine miente.
  const [hayRed, setHayRed] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )
  const [falloReciente, setFalloReciente] = useState(false)

  // Fuerza un re-render periódico para que la antigüedad del banner avance
  // sola, sin depender de que el portero escanee a alguien.
  const [, setTick] = useState(0)

  // Evita refrescos superpuestos (el interval, el evento `online` y el montaje
  // pueden coincidir).
  const refrescandoRef = useRef(false)
  const tokenRef = useRef(token)
  tokenRef.current = token

  // ── Descarga del padrón ────────────────────────────────────────────────────
  const actualizarCache = useCallback(async () => {
    const authToken = tokenRef.current
    if (!authToken || refrescandoRef.current) return
    refrescandoRef.current = true
    setActualizando(true)

    try {
      const res = await fetchConTimeout(
        `${API}/admin/escaner/cache`,
        { headers: { Authorization: `Bearer ${authToken}` } },
        TIMEOUT_CACHE_MS,
      )

      if (res.status === 401 || res.status === 403) {
        // Token vencido o rol revocado: la copia del padrón deja de estar
        // autorizada, así que se borra en vez de quedar dando vueltas en el
        // teléfono. Al volver a loguearse se baja de nuevo.
        borrarCache()
        setCache(null)
        setErrorCache('Sesión vencida. Volvé a iniciar sesión para actualizar el padrón.')
        return
      }

      if (!res.ok) throw new Error(`Error ${res.status}`)

      const json = await res.json()
      const payload = {
        timestamp: Date.now(),          // reloj del dispositivo: el único que
        generado_at: json.generado_at,  // sigue andando sin conexión
        socios: Array.isArray(json.socios) ? json.socios : [],
      }

      escribirCache(payload)   // si el storage está bloqueado seguimos igual,
      setCache(payload)        // con la copia en memoria mientras dure la pestaña
      setErrorCache(null)
      setFalloReciente(false)
      setHayRed(true)
    } catch (err) {
      setErrorCache(err?.message === 'timeout' ? 'Sin respuesta del servidor.' : 'No se pudo actualizar el padrón.')
      setFalloReciente(true)
    } finally {
      refrescandoRef.current = false
      setActualizando(false)
      setReconectando(false)
    }
  }, [])

  // ── Primer refresco + refresco cada 15 min ─────────────────────────────────
  useEffect(() => {
    if (!token) return
    actualizarCache()
    const t = setInterval(actualizarCache, INTERVALO_REFRESCO_MS)
    return () => clearInterval(t)
  }, [token, actualizarCache])

  // ── Eventos de red del navegador ───────────────────────────────────────────
  useEffect(() => {
    const alVolver = () => {
      setHayRed(true)
      setFalloReciente(false)
      setReconectando(true)   // el banner muestra "Conexión restaurada…"
      actualizarCache()       // no esperamos los 15 min
    }
    const alCaer = () => {
      setHayRed(false)
      setReconectando(false)
    }
    window.addEventListener('online', alVolver)
    window.addEventListener('offline', alCaer)
    return () => {
      window.removeEventListener('online', alVolver)
      window.removeEventListener('offline', alCaer)
    }
  }, [actualizarCache])

  // ── Tick del banner ────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), TICK_BANNER_MS)
    return () => clearInterval(t)
  }, [])

  // ── Búsqueda offline ───────────────────────────────────────────────────────
  const buscarEnCache = useCallback((dni) => {
    const buscado = String(dni ?? '').replace(/\D/g, '')
    if (!buscado || !cache?.socios?.length) return null
    return cache.socios.find(s => String(s.dni) === buscado) ?? null
  }, [cache])

  // ── Semáforo de conexión, alimentado por el componente ─────────────────────
  const reportarExito = useCallback(() => {
    setFalloReciente(false)
    setHayRed(true)
  }, [])

  const reportarFallo = useCallback(() => {
    setFalloReciente(true)
  }, [])

  const cacheTimestamp = cache?.timestamp ?? null
  const edadCache = cacheTimestamp ? Date.now() - cacheTimestamp : null
  const conexion = hayRed && !falloReciente ? 'online' : 'offline'

  return {
    conexion,
    reconectando,
    cacheDisponible: !!cache?.socios?.length,
    // `cacheTimestamp` es estable entre refrescos; `edadCache` cambia en cada
    // render (lleva Date.now() adentro). Para el banner usá edadCache; dentro
    // de un callback memoizado usá cacheTimestamp, o el callback se recrea en
    // cada render y el <Scanner> queda re-suscribiéndose para siempre.
    cacheTimestamp,
    edadCache,
    cacheVieja: edadCache != null && edadCache > UMBRAL_CACHE_VIEJA_MS,
    totalCacheado: cache?.socios?.length ?? 0,
    actualizando,
    errorCache,
    actualizarCache,
    buscarEnCache,
    reportarExito,
    reportarFallo,
  }
}
