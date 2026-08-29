// frontend/src/pages/Ayuda.jsx
/**
 * Página de Ayuda — pública y privada a la vez, mismo componente.
 * GET /faq ya devuelve distinto set de preguntas según haya o no token
 * (ver dependencies.get_current_user_optional en el backend), así que
 * esta página no necesita ninguna lógica propia de "qué mostrar":
 * simplemente pide y renderiza lo que el backend le da.
 *
 * Accesible sin login (enlazada desde el footer de la Landing) y también
 * desde el menú del portal privado — en ambos casos, misma URL /ayuda.
 */
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  HelpCircle, ChevronDown, ChevronUp, Mail, Send,
  CheckCircle2, AlertCircle, Loader2, ArrowLeft,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

function PreguntaItem({ entry }) {
  const [abierta, setAbierta] = useState(false)
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        onClick={() => setAbierta(a => !a)}
        className="w-full flex items-center justify-between gap-3 py-3.5 text-left"
      >
        <span className="font-medium text-gray-800">{entry.pregunta}</span>
        {abierta ? <ChevronUp size={16} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />}
      </button>
      {abierta && (
        <p className="text-sm text-gray-600 pb-4 whitespace-pre-wrap leading-relaxed">{entry.respuesta}</p>
      )}
    </div>
  )
}

function FormularioContacto() {
  const [email, setEmail] = useState('')
  const [nombre, setNombre] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      const res = await fetch(`${API}/contacto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, nombre: nombre || undefined, mensaje }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? 'No se pudo enviar el mensaje.')
      }
      setEnviado(true)
      setEmail(''); setNombre(''); setMensaje('')
    } catch (err) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  if (enviado) {
    return (
      <div className="flex items-center gap-3 p-5 rounded-2xl bg-green-50 border border-green-200 text-green-800">
        <CheckCircle2 size={22} className="flex-shrink-0" />
        <div>
          <p className="font-semibold">¡Mensaje enviado!</p>
          <p className="text-sm">Te vamos a responder a la brevedad al mail que dejaste.</p>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle size={14} className="flex-shrink-0" /> {error}
        </div>
      )}
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Tu nombre (opcional)</label>
        <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} className="form-input" maxLength={150} />
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Tu email</label>
        <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="form-input" />
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Mensaje</label>
        <textarea required rows={4} value={mensaje} onChange={e => setMensaje(e.target.value)} maxLength={2000} className="form-input resize-none" />
      </div>
      <button
        type="submit"
        disabled={enviando}
        className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {enviando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        {enviando ? 'Enviando…' : 'Enviar mensaje'}
      </button>
    </form>
  )
}

export default function Ayuda() {
  const navigate = useNavigate()
  const { token, isAuthenticated } = useAuth()
  const [faq, setFaq] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchFaq = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/faq`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error('No se pudieron cargar las preguntas frecuentes.')
      setFaq(await res.json())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { fetchFaq() }, [fetchFaq])

  const porCategoria = new Map()
  for (const e of faq) {
    if (!porCategoria.has(e.categoria)) porCategoria.set(e.categoria, [])
    porCategoria.get(e.categoria).push(e)
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(isAuthenticated ? -1 : '/')} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2 sm:gap-3">
            <HelpCircle size={22} className="text-gray-500" />
            Ayuda
          </h1>
          <p className="text-sm text-gray-500 mt-1">Preguntas frecuentes y contacto con el club.</p>
        </div>
      </div>

      {loading && <div className="text-center py-8 text-gray-400 text-sm">Cargando…</div>}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle size={18} className="flex-shrink-0" /> {error}
        </div>
      )}

      {!loading && [...porCategoria.entries()].map(([categoria, items]) => (
        <div key={categoria} className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5">
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider pt-4 pb-1">{categoria}</h2>
          {items.map(e => <PreguntaItem key={e.id_faq} entry={e} />)}
        </div>
      ))}

      <div>
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-3">
          <Mail size={18} className="text-gray-500" /> Contactanos
        </h2>
        <FormularioContacto />
      </div>
    </div>
  )
}