// frontend/src/components/ChatbotFlotante.jsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MessageCircle,
  X,
  Send,
  Loader2,
  RotateCcw,
  ExternalLink,
  ArrowRight,
} from 'lucide-react'
import { useAuth } from '../context/useAuth'
import camotiAzul from '../assets/camoti-azul.PNG'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const STORAGE_KEY_PREFIX = 'car_chatbot_historial_v3'
const STORAGE_OPEN_KEY = 'car_chatbot_abierto'

// Limpiador estricto de emojis
const limpiarEmojis = (str) => {
  if (!str) return ''
  return str.replace(
    /[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{1F1E0}-\u{1F1FF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{2300}-\u{23FF}\u{2B50}\u{2B55}\u{FE0F}]/gu,
    ''
  )
}

// Sanitizar nombre para que sea siempre estrictamente CAMOTE
const sanitizarNombreCamote = (str) => {
  if (!str) return ''
  return limpiarEmojis(str).replace(/\bCamotero\b/gi, 'Camote')
}

export default function ChatbotFlotante() {
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuth()

  // Clave de sesión en storage diferenciada por usuario para no mezclar historial entre invitado y socio
  const userSessionKey = isAuthenticated && user?.id_usuario ? `socio_${user.id_usuario}` : 'anonimo'
  const currentStorageKey = `${STORAGE_KEY_PREFIX}_${userSessionKey}`

  const [abierto, setAbierto] = useState(() => {
    return sessionStorage.getItem(STORAGE_OPEN_KEY) === 'true'
  })

  const [mensajes, setMensajes] = useState([])
  const [inputTexto, setInputTexto] = useState('')
  const [cargando, setCargando] = useState(false)
  const [infoInicial, setInfoInicial] = useState(null)
  const [confirmandoReinicio, setConfirmandoReinicio] = useState(false)

  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const ultimoUserKeyRef = useRef(userSessionKey)

  // Limpiar cachés antiguas con el nombre anterior para evitar persistencia de 'Camotero'
  useEffect(() => {
    try {
      sessionStorage.removeItem('car_chatbot_historial')
      sessionStorage.removeItem('car_chatbot_historial_v2')
    } catch {
      // Ignorar restricciones de storage
    }
  }, [])

  // Persistir estado de apertura
  useEffect(() => {
    sessionStorage.setItem(STORAGE_OPEN_KEY, abierto ? 'true' : 'false')
    if (abierto) {
      setTimeout(() => {
        inputRef.current?.focus()
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    }
  }, [abierto])

  // Persistir mensajes del usuario activo en su clave correspondiente
  useEffect(() => {
    if (mensajes.length > 0) {
      try {
        sessionStorage.setItem(currentStorageKey, JSON.stringify(mensajes))
      } catch (e) {
        console.error('Error guardando historial de chatbot:', e)
      }
    }
  }, [mensajes, currentStorageKey])

  // Cargar estado inicial o restaurar historial al iniciar o cuando cambia el usuario (login/registro/logout)
  const inicializarChatParaUsuario = useCallback(async (sesionKey, usuarioActual, estaAutenticado) => {
    try {
      const guardado = sessionStorage.getItem(`${STORAGE_KEY_PREFIX}_${sesionKey}`)
      if (guardado) {
        const parseado = JSON.parse(guardado)
        if (Array.isArray(parseado) && parseado.length > 0) {
          // Sanitizar cualquier remanente
          const limpio = parseado.map((m) => ({
            ...m,
            texto: sanitizarNombreCamote(m.texto),
          }))
          setMensajes(limpio)
          return
        }
      }
    } catch {
      // Continuar cargando info fresca
    }

    // Si no hay historial guardado para esta sesión, consultar info inicial al backend
    try {
      const params = new URLSearchParams({
        rol: usuarioActual?.rol || 'anonimo',
        autenticado: estaAutenticado ? 'true' : 'false',
        nombre: usuarioActual?.nombre || '',
      })
      const res = await fetch(`${API}/chatbot/info-inicial?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setInfoInicial(data)
        const saludoLimpio = sanitizarNombreCamote(data.saludo_inicial)
        setMensajes([
          {
            id: `saludo_${Date.now()}`,
            rol: 'bot',
            texto: saludoLimpio,
            sugerencias: data.sugerencias,
            whatsapp_url: data.whatsapp_url,
            hora: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
          },
        ])
      }
    } catch (err) {
      console.error('Error cargando bienvenida de chatbot:', err)
      const saludoFallback = estaAutenticado && usuarioActual?.nombre
        ? `Hola ${usuarioActual.nombre}. Soy Camote, el asistente virtual del Club Atlético Roberts. ¿En qué te puedo ayudar hoy?`
        : 'Hola. Soy Camote, el asistente virtual del Club Atlético Roberts. ¿En qué te puedo ayudar hoy?'
      setMensajes([
        {
          id: `saludo_${Date.now()}`,
          rol: 'bot',
          texto: saludoFallback,
          hora: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
        },
      ])
    }
  }, [])

  // Detectar cambios de sesión (ej: abrió como anónimo, consultó, se registró/logueó o cerró sesión)
  useEffect(() => {
    if (ultimoUserKeyRef.current !== userSessionKey || mensajes.length === 0) {
      ultimoUserKeyRef.current = userSessionKey
      setConfirmandoReinicio(false)
      inicializarChatParaUsuario(userSessionKey, user, isAuthenticated)
    }
  }, [userSessionKey, user, isAuthenticated, inicializarChatParaUsuario, mensajes.length])

  // Auto-scroll al final al recibir o enviar mensajes
  useEffect(() => {
    if (abierto) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [mensajes, cargando, abierto])

  // Enviar mensaje al backend
  const enviarMensaje = async (textoAEnviar) => {
    const textoLimpio = sanitizarNombreCamote(textoAEnviar || inputTexto).trim()
    if (!textoLimpio || cargando) return

    setConfirmandoReinicio(false)

    const mensajeUsuario = {
      id: Date.now().toString(),
      rol: 'user',
      texto: textoLimpio,
      hora: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
    }

    setMensajes((prev) => [...prev, mensajeUsuario])
    setInputTexto('')
    setCargando(true)

    try {
      // Historial acotado para mantener contexto sin exceder cuotas
      const historialPayload = mensajes.slice(-6).map((m) => ({
        rol: m.rol === 'user' ? 'user' : 'model',
        texto: m.texto,
      }))

      const res = await fetch(`${API}/chatbot/mensaje`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensaje: textoLimpio,
          historial: historialPayload,
          autenticado: isAuthenticated,
          rol: user?.rol || 'anonimo',
          nombre_usuario: user?.nombre || '',
        }),
      })

      if (!res.ok) {
        throw new Error('No se pudo obtener respuesta del asistente.')
      }

      const data = await res.json()
      const mensajeBot = {
        id: (Date.now() + 1).toString(),
        rol: 'bot',
        texto: sanitizarNombreCamote(data.respuesta),
        whatsapp_url: data.whatsapp_url,
        hora: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
      }

      setMensajes((prev) => [...prev, mensajeBot])
    } catch (err) {
      console.error(err)
      const mensajeError = {
        id: (Date.now() + 1).toString(),
        rol: 'bot',
        texto:
          'Hubo un problema de conexión temporario. Podés consultar directamente a la Secretaría por WhatsApp.',
        whatsapp_url: infoInicial?.whatsapp_url,
        hora: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
      }
      setMensajes((prev) => [...prev, mensajeError])
    } finally {
      setCargando(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  // Reinicio in-app (sin window.confirm de navegador)
  const ejecutarReinicioInApp = () => {
    setConfirmandoReinicio(false)
    try {
      sessionStorage.removeItem(currentStorageKey)
    } catch {
      // ignorar
    }
    inicializarChatParaUsuario(userSessionKey, user, isAuthenticated)
  }

  // Navegación segura con protección de roles y estado de autenticación
  const navegarRutaSegura = (url) => {
    if (!url) return

    // Rutas exclusivas de administración
    if (url.startsWith('/admin')) {
      const esAdmin = isAuthenticated && ['admin', 'tesorero', 'profesor'].includes(user?.rol)
      if (!esAdmin) {
        navigate(isAuthenticated ? '/socio' : `/login?redirect=${encodeURIComponent(url)}`)
        if (window.innerWidth < 640) setAbierto(false)
        return
      }
    }

    // Rutas exclusivas de socios
    if (url.startsWith('/socio')) {
      if (!isAuthenticated) {
        navigate(`/login?redirect=${encodeURIComponent(url)}`)
        if (window.innerWidth < 640) setAbierto(false)
        return
      }
    }

    // Ruta autorizada
    navigate(url)
    if (window.innerWidth < 640) setAbierto(false)
  }

  // Mapa de nombres amigables para rutas del sistema (para nunca mostrar rutas técnicas)
  const NOMBRES_RUTAS = {
    '/en-vivo': 'Ver transmisión en vivo',
    '/socio/cuotas': 'Consultar cuotas y pagos',
    '/socio/reservas': 'Reservar instalaciones',
    '/socio/cancha': 'Reservar cancha',
    '/socio/perfil': 'Mi perfil de socio',
    '/registro': 'Completar solicitud de socio',
    '/shopping': 'Tienda oficial',
    '/ayuda': 'Preguntas frecuentes',
    '/login': 'Iniciar sesión',
    '/recuperar-password': 'Recuperar contraseña',
    '/admin/socios': 'Administración de socios',
    '/admin/verificaciones': 'Verificaciones de pagos',
    '/admin/eventos': 'Gestión de eventos',
    '/admin/escaner': 'Escáner de acceso',
  }

  const obtenerNombreAmigable = (label, url) => {
    if (NOMBRES_RUTAS[url]) return NOMBRES_RUTAS[url]
    if (NOMBRES_RUTAS[label]) return NOMBRES_RUTAS[label]
    if (label && !label.startsWith('/')) return sanitizarNombreCamote(label)
    const limpia = (url || label || '').replace(/^\//, '').replace(/-/g, ' ')
    return limpia ? limpia.charAt(0).toUpperCase() + limpia.slice(1) : 'Abrir sección'
  }

  // Helper para renderizar negritas (**texto**) y código (`texto`) dentro de fragmentos
  const renderizarFormatoInline = (textoPlano, prefijoKey) => {
    if (!textoPlano) return null
    const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g
    const elementos = []
    let ultimoIndex = 0
    let match

    while ((match = regex.exec(textoPlano)) !== null) {
      if (match.index > ultimoIndex) {
        elementos.push(textoPlano.substring(ultimoIndex, match.index))
      }
      const token = match[1]
      if (token.startsWith('**') && token.endsWith('**')) {
        elementos.push(
          <strong key={`${prefijoKey}-b-${match.index}`} className="font-bold text-gray-900">
            {token.slice(2, -2)}
          </strong>
        )
      } else if (token.startsWith('`') && token.endsWith('`')) {
        elementos.push(
          <code
            key={`${prefijoKey}-c-${match.index}`}
            className="bg-gray-100 text-roberts-700 font-mono text-xs px-1.5 py-0.5 rounded border border-gray-200"
          >
            {token.slice(1, -1)}
          </code>
        )
      }
      ultimoIndex = regex.lastIndex
    }

    if (ultimoIndex < textoPlano.length) {
      elementos.push(textoPlano.substring(ultimoIndex))
    }

    return elementos
  }

  // Helper para renderizar texto con links formateados en botones amigables, negritas y código
  const renderizarTextoConLinks = (textoOriginal) => {
    if (!textoOriginal) return null

    let texto = sanitizarNombreCamote(textoOriginal)

    // Normalizar patrones crudos como "(/en-vivo)" o "(/socio/reservas)" que el modelo pudiera escribir sueltos
    texto = texto.replace(/\((\/[a-zA-Z0-9_-]+(\/[a-zA-Z0-9_-]+)*)\)/g, (match, path) => {
      const nombre = NOMBRES_RUTAS[path] || 'Abrir sección'
      return `[${nombre}](${path})`
    })

    const partes = []
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g
    let lastIndex = 0
    let match

    while ((match = linkRegex.exec(texto)) !== null) {
      if (match.index > lastIndex) {
        const chunk = texto.substring(lastIndex, match.index)
        partes.push(...renderizarFormatoInline(chunk, `pre-${lastIndex}`))
      }
      const rawLabel = match[1]
      const url = match[2]
      const label = obtenerNombreAmigable(rawLabel, url)

      if (url.startsWith('/')) {
        partes.push(
          <button
            key={`link-${match.index}`}
            type="button"
            onClick={() => navegarRutaSegura(url)}
            className="inline-flex items-center gap-1.5 font-semibold text-roberts-700 bg-roberts-50 hover:bg-roberts-100 hover:text-roberts-900 border border-roberts-200/90 px-2.5 py-1 rounded-lg text-xs transition-colors my-1 mx-0.5 shadow-2xs cursor-pointer"
          >
            <span>{label}</span>
            <ArrowRight size={11} className="text-roberts-500" />
          </button>
        )
      } else {
        partes.push(
          <a
            key={`link-${match.index}`}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg text-xs transition-colors my-1 mx-0.5 shadow-2xs"
          >
            <span>{label}</span>
            <ExternalLink size={11} className="text-emerald-600" />
          </a>
        )
      }
      lastIndex = linkRegex.lastIndex
    }

    if (lastIndex < texto.length) {
      const chunk = texto.substring(lastIndex)
      partes.push(...renderizarFormatoInline(chunk, `post-${lastIndex}`))
    }

    return (
      <div className="whitespace-pre-line text-sm leading-relaxed text-gray-800">
        {partes}
      </div>
    )
  }

  return (
    <>
      {/* ── BOTÓN DISPARADOR FLOTANTE ──────────────────────────────────── */}
      <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2 select-none">
        {!abierto && (
          <button
            onClick={() => setAbierto(true)}
            className="hidden sm:inline-flex items-center px-3 py-1.5 rounded-full bg-gray-900 text-white text-xs font-semibold shadow-lg hover:bg-gray-800 transition-all cursor-pointer"
          >
            <span>Consultas con CAMOTE</span>
          </button>
        )}

        <button
          onClick={() => setAbierto((prev) => !prev)}
          title={abierto ? 'Cerrar asistente' : 'Abrir asistente virtual CAMOTE'}
          className={`relative w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 border-2 border-white focus:outline-none focus:ring-4 focus:ring-roberts-300 cursor-pointer ${
            abierto
              ? 'bg-gray-900 text-white rotate-90 scale-95'
              : 'bg-gradient-to-tr from-roberts-700 to-roberts-500 text-white hover:scale-105 active:scale-95'
          }`}
        >
          {abierto ? (
            <X size={24} />
          ) : (
            <MessageCircle size={28} className="drop-shadow-xs" />
          )}
        </button>
      </div>

      {/* ── VENTANA DE CHAT EXPANDIDA ─────────────────────────────────── */}
      {abierto && (
        <div
          className="fixed z-50 flex flex-col bg-white shadow-2xl border border-gray-200 overflow-hidden transition-all duration-200
            inset-x-3 bottom-3 top-16 sm:inset-auto sm:bottom-[88px] sm:right-5 sm:w-[380px] sm:h-[580px] sm:max-h-[calc(100vh-7.5rem)] sm:rounded-2xl rounded-2xl"
        >
          {/* Encabezado: estrictamente el logo del Camotí y CAMOTE */}
          <div className="bg-gradient-to-r from-roberts-700 via-roberts-600 to-roberts-700 text-white px-4 py-3 flex items-center justify-between shadow-md">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center p-0.5 border border-white/40 shadow-xs overflow-hidden flex-shrink-0">
                <img src={camotiAzul} alt="CAMOTE" className="w-full h-full object-contain" />
              </div>
              <h3 className="font-bold text-base tracking-wider uppercase text-white">CAMOTE</h3>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setConfirmandoReinicio((prev) => !prev)}
                title="Reiniciar conversación"
                className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <RotateCcw size={16} />
              </button>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                title="Cerrar"
                className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Banner de confirmación in-app para reiniciar conversación */}
          {confirmandoReinicio && (
            <div className="bg-amber-50 border-b border-amber-200 px-3.5 py-2 flex items-center justify-between text-xs text-amber-900 animate-in fade-in duration-200">
              <span className="font-medium">¿Reiniciar la conversación?</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={ejecutarReinicioInApp}
                  className="px-2.5 py-1 bg-roberts-600 hover:bg-roberts-700 text-white rounded-md font-semibold text-2xs transition-colors cursor-pointer"
                >
                  Sí, reiniciar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmandoReinicio(false)}
                  className="px-2 py-1 bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 rounded-md font-medium text-2xs transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Cuerpo de mensajes con scroll */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/60">
            {mensajes.map((msg) => {
              const esUsuario = msg.rol === 'user'

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${esUsuario ? 'items-end' : 'items-start'} space-y-1`}
                >
                  <div
                    className={`p-3.5 text-sm shadow-2xs max-w-[86%] ${
                      esUsuario
                        ? 'bg-roberts-600 text-white rounded-2xl rounded-tr-xs'
                        : 'bg-white text-gray-800 border border-gray-200/80 rounded-2xl rounded-tl-xs'
                    }`}
                  >
                    {esUsuario ? (
                      <p className="whitespace-pre-line leading-relaxed">{msg.texto}</p>
                    ) : (
                      renderizarTextoConLinks(msg.texto)
                    )}

                    {/* Botón de WhatsApp oficial si el mensaje lo incluye */}
                    {msg.whatsapp_url && (
                      <div className="mt-2.5 pt-2 border-t border-gray-100">
                        <a
                          href={msg.whatsapp_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors shadow-xs"
                        >
                          <span>Escribir a Secretaría por WhatsApp</span>
                          <ExternalLink size={11} />
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Sugerencias si es el mensaje de bienvenida */}
                  {msg.sugerencias && msg.sugerencias.length > 0 && (
                    <div className="pt-2 w-full space-y-1.5">
                      <span className="text-2xs font-bold uppercase tracking-wider text-gray-500 px-1">
                        Consultas frecuentes:
                      </span>
                      <div className="flex flex-col gap-1.5">
                        {msg.sugerencias.map((sug) => (
                          <button
                            key={sug.id}
                            type="button"
                            onClick={() => enviarMensaje(sug.prompt)}
                            disabled={cargando}
                            className="w-full text-left px-3 py-2 rounded-xl bg-white border border-gray-200 hover:border-roberts-300 hover:bg-roberts-50/40 text-xs font-semibold text-gray-700 hover:text-roberts-700 transition-all flex items-center justify-between shadow-2xs group cursor-pointer"
                          >
                            <span>{sanitizarNombreCamote(sug.label)}</span>
                            <ArrowRight
                              size={12}
                              className="text-gray-400 group-hover:text-roberts-600 group-hover:translate-x-0.5 transition-transform"
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <span className="text-3xs text-gray-400 px-1">{msg.hora}</span>
                </div>
              )
            })}

            {/* Indicador de pensamiento */}
            {cargando && (
              <div className="flex items-center gap-2 p-3 bg-white border border-gray-200 rounded-2xl rounded-tl-xs w-28 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-roberts-500 animate-ping"></span>
                <span className="text-xs text-gray-500 font-medium">Pensando…</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Barra de entrada inferior */}
          <div className="p-3 bg-white border-t border-gray-200">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                enviarMensaje()
              }}
              className="flex items-center gap-2"
            >
              <input
                ref={inputRef}
                type="text"
                value={inputTexto}
                onChange={(e) => setInputTexto(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Escribí tu consulta acá…"
                disabled={cargando}
                className="flex-1 px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-roberts-600 focus:border-roberts-600 disabled:opacity-60 bg-gray-50/50"
              />
              <button
                type="submit"
                disabled={!inputTexto.trim() || cargando}
                className="p-2.5 rounded-xl bg-roberts-600 text-white hover:bg-roberts-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-xs flex-shrink-0 cursor-pointer"
              >
                {cargando ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              </button>
            </form>
            <p className="text-3xs text-center text-gray-400 mt-1.5">
              Club Atlético Roberts • Asistente Oficial CAMOTE
            </p>
          </div>
        </div>
      )}
    </>
  )
}
