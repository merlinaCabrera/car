// frontend/src/components/ChatbotFlotante.jsx
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MessageCircle,
  X,
  Send,
  Loader2,
  Sparkles,
  RotateCcw,
  ExternalLink,
  ChevronDown,
  ArrowRight,
  Shield,
  HelpCircle,
} from 'lucide-react'
import camotiAzul from '../assets/camoti-azul.PNG'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const STORAGE_KEY = 'car_chatbot_historial'
const STORAGE_OPEN_KEY = 'car_chatbot_abierto'

export default function ChatbotFlotante() {
  const navigate = useNavigate()
  const [abierto, setAbierto] = useState(() => {
    return sessionStorage.getItem(STORAGE_OPEN_KEY) === 'true'
  })
  const [mensajes, setMensajes] = useState(() => {
    try {
      const guardado = sessionStorage.getItem(STORAGE_KEY)
      return guardado ? JSON.parse(guardado) : []
    } catch {
      return []
    }
  })
  const [inputTexto, setInputTexto] = useState('')
  const [cargando, setCargando] = useState(false)
  const [infoInicial, setInfoInicial] = useState(null)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  // Guardar en sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(mensajes))
    } catch (e) {
      console.error(e)
    }
  }, [mensajes])

  useEffect(() => {
    sessionStorage.setItem(STORAGE_OPEN_KEY, abierto ? 'true' : 'false')
    if (abierto) {
      setTimeout(() => {
        inputRef.current?.focus()
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    }
  }, [abierto])

  // Cargar info inicial del backend
  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const res = await fetch(`${API}/chatbot/info-inicial`)
        if (res.ok) {
          const data = await res.json()
          setInfoInicial(data)
          // Si no hay mensajes previos, iniciar con el saludo oficial
          setMensajes((prev) => {
            if (prev.length === 0) {
              return [
                {
                  id: 'saludo_inicial',
                  rol: 'bot',
                  texto: data.saludo_inicial,
                  sugerencias: data.sugerencias,
                  whatsapp_url: data.whatsapp_url,
                  hora: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
                },
              ]
            }
            return prev
          })
        }
      } catch (err) {
        console.error('Error cargando info inicial de chatbot:', err)
      }
    }
    fetchInfo()
  }, [])

  // Auto-scroll al final en cada mensaje nuevo
  useEffect(() => {
    if (abierto) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [mensajes, cargando, abierto])

  const enviarMensaje = async (textoAEnviar) => {
    const textoLimpio = (textoAEnviar || inputTexto).trim()
    if (!textoLimpio || cargando) return

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
      // Armar historial simplificado para Gemini
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
        }),
      })

      if (!res.ok) {
        throw new Error('No se pudo obtener respuesta del asistente.')
      }

      const data = await res.json()
      const mensajeBot = {
        id: (Date.now() + 1).toString(),
        rol: 'bot',
        texto: data.respuesta,
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

  const reiniciarChat = () => {
    if (window.confirm('¿Deseás reiniciar la conversación?')) {
      const saludo = infoInicial?.saludo_inicial || 'Hola. ¿En qué te puedo ayudar hoy?'
      setMensajes([
        {
          id: Date.now().toString(),
          rol: 'bot',
          texto: saludo,
          sugerencias: infoInicial?.sugerencias,
          whatsapp_url: infoInicial?.whatsapp_url,
          hora: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
        },
      ])
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      enviarMensaje()
    }
  }

  // Limpiador estricto de emojis
  const limpiarEmojis = (str) => {
    if (!str) return ''
    return str.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{1F1E0}-\u{1F1FF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{2300}-\u{23FF}\u{2B50}\u{2B55}\u{FE0F}]/gu, '')
  }

  // Mapa de nombres amigables para rutas del sistema (para nunca mostrar rutas técnicas)
  const NOMBRES_RUTAS = {
    '/en-vivo': 'Ver transmisión en vivo',
    '/socio/cuotas': 'Consultar cuotas y pagos',
    '/socio/reservas': 'Reservar instalaciones',
    '/socio/cancha': 'Reservar cancha',
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
    if (label && !label.startsWith('/')) return limpiarEmojis(label)
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

    // 1. Quitar emojis
    let texto = limpiarEmojis(textoOriginal)

    // 2. Normalizar patrones crudos como "(/en-vivo)" o "(/socio/reservas)" que el modelo pudiera escribir sueltos
    texto = texto.replace(/\((\/[a-zA-Z0-9_-]+(\/[a-zA-Z0-9_-]+)*)\)/g, (match, path) => {
      const nombre = NOMBRES_RUTAS[path] || 'Abrir sección'
      return `[${nombre}](${path})`
    })

    // 3. Detectar [etiqueta](url)
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
        // Botón interactivo amigable con estilo de píldora
        partes.push(
          <button
            key={`link-${match.index}`}
            type="button"
            onClick={() => {
              navigate(url)
              // En móvil cerramos el chat para ver la página; en desktop lo mantenemos
              if (window.innerWidth < 640) setAbierto(false)
            }}
            className="inline-flex items-center gap-1.5 font-semibold text-roberts-700 bg-roberts-50 hover:bg-roberts-100 hover:text-roberts-900 border border-roberts-200/90 px-2.5 py-1 rounded-lg text-xs transition-colors my-1 mx-0.5 shadow-2xs cursor-pointer"
          >
            <span>{label}</span>
            <ArrowRight size={11} className="text-roberts-500" />
          </button>
        )
      } else {
        // Link externo
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
        {/* Tooltip visible cuando el chat está cerrado */}
        {!abierto && (
          <button
            onClick={() => setAbierto(true)}
            className="hidden sm:inline-flex items-center px-3 py-1.5 rounded-full bg-gray-900 text-white text-xs font-semibold shadow-lg hover:bg-gray-800 transition-all"
          >
            <span>Consultas con Camote</span>
          </button>
        )}

        <button
          onClick={() => setAbierto((prev) => !prev)}
          title={abierto ? 'Cerrar asistente' : 'Abrir asistente virtual del CAR'}
          className={`relative w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 border-2 border-white focus:outline-none focus:ring-4 focus:ring-roberts-300 ${
            abierto
              ? 'bg-gray-900 text-white rotate-90 scale-95'
              : 'bg-gradient-to-tr from-roberts-700 to-roberts-500 text-white hover:scale-105 active:scale-95'
          }`}
        >
          {abierto ? (
            <X size={24} />
          ) : (
            <>
              <MessageCircle size={28} className="drop-shadow-xs" />
              {/* Punto indicador de en línea */}
              <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white shadow-xs">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              </span>
            </>
          )}
        </button>
      </div>

      {/* ── VENTANA DE CHAT EXPANDIDA ─────────────────────────────────── */}
      {abierto && (
        <div
          className="fixed z-50 flex flex-col bg-white shadow-2xl border border-gray-200 overflow-hidden transition-all duration-200
            inset-x-3 bottom-3 top-16 sm:inset-auto sm:bottom-[88px] sm:right-5 sm:w-[380px] sm:h-[580px] sm:max-h-[calc(100vh-7.5rem)] sm:rounded-2xl rounded-2xl"
        >
          {/* Encabezado */}
          <div className="bg-gradient-to-r from-roberts-700 via-roberts-600 to-roberts-700 text-white px-4 py-3.5 flex items-center justify-between shadow-md">
            <div className="flex items-center gap-2.5">
              <div className="relative w-9 h-9 rounded-full bg-white flex items-center justify-center p-1 border border-white/40 shadow-xs overflow-hidden">
                <img src={camotiAzul} alt="Camote" className="w-full h-full object-contain" />
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-white"></span>
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-bold text-sm tracking-tight uppercase">Camote</h3>
                  <span className="text-2xs bg-white/20 px-1.5 py-0.2 rounded text-white/90 font-medium">
                    Asistente CAR
                  </span>
                </div>
                <p className="text-2xs text-white/80 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  En línea • Respuestas al instante
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={reiniciarChat}
                title="Reiniciar conversación"
                className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              >
                <RotateCcw size={15} />
              </button>
              <button
                onClick={() => setAbierto(false)}
                title="Cerrar"
                className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
          </div>

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

                    {/* Botón de WhatsApp destacado si el mensaje lo incluye */}
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

                  {/* Sugerencias de 1 toque si es el mensaje de bienvenida */}
                  {msg.sugerencias && msg.sugerencias.length > 0 && (
                    <div className="pt-2 w-full space-y-1.5">
                      <span className="text-2xs font-bold uppercase tracking-wider text-gray-400 px-1">
                        Consultas frecuentes de un toque:
                      </span>
                      <div className="flex flex-col gap-1.5">
                        {msg.sugerencias.map((sug) => (
                          <button
                            key={sug.id}
                            onClick={() => enviarMensaje(sug.prompt)}
                            disabled={cargando}
                            className="w-full text-left px-3 py-2 rounded-xl bg-white border border-gray-200 hover:border-roberts-300 hover:bg-roberts-50/40 text-xs font-semibold text-gray-700 hover:text-roberts-700 transition-all flex items-center justify-between shadow-2xs group cursor-pointer"
                          >
                            <span>{limpiarEmojis(sug.label)}</span>
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

            {/* Indicador de escribiendo */}
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
                className="p-2.5 rounded-xl bg-roberts-600 text-white hover:bg-roberts-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-xs flex-shrink-0"
              >
                {cargando ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              </button>
            </form>
            <p className="text-3xs text-center text-gray-400 mt-1.5">
              Club Atlético Roberts • Asistente Oficial
            </p>
          </div>
        </div>
      )}
    </>
  )
}
