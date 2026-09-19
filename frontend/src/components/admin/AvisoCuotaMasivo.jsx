// frontend/src/components/admin/AvisoCuotaMasivo.jsx
// ─── Aviso de cuota por mail a todos los morosos ───────────────────────────
//
// Pide confirmación antes de mandar: no hay "deshacer" para 50 mails ya
// salidos, y el precio de un clic de más lo paga el club en credibilidad.
// El backend además limita a 3 disparos por hora y por IP.
//
// Vive en /admin/socios (arriba del todo, antes del filtro) porque es una
// acción sobre el padrón de socios morosos — antes vivía en /admin (panel
// ejecutivo) y quedaba descolgado del resto de la gestión de socios.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/useAuth'
import ConfirmDialog from '../ConfirmDialog'
import { textoError } from '../../utils/errores'
import { Mail, Loader2, AlertCircle, CheckCircle2, Settings2 } from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export default function AvisoCuotaMasivo() {
  const { token } = useAuth()
  const [confirmando, setConfirmando] = useState(false)
  const [enviando,    setEnviando]    = useState(false)
  const [resultado,   setResultado]   = useState(null)
  const [error,       setError]       = useState(null)

  const enviar = async () => {
    setEnviando(true)
    setError(null)
    setResultado(null)
    try {
      const res = await fetch(`${API}/admin/cuotas/aviso-mail-masivo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(textoError(data?.detail, 'No se pudo enviar el aviso.'))
      setResultado(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setEnviando(false)
      setConfirmando(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center flex-shrink-0">
          <Mail size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-gray-900">Aviso de cuota por mail</h3>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
            Le manda el recordatorio a todos los socios morosos de una vez. Se saltean
            los que no tienen email y los que ya subieron el comprobante y esperan
            aprobación.
          </p>

          <div className="flex flex-wrap items-center gap-2 mt-3">
            <button
              onClick={() => setConfirmando(true)}
              disabled={enviando}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-60 transition-colors"
            >
              {enviando ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
              {enviando ? 'Enviando…' : 'Enviar aviso a todos'}
            </button>
            <Link
              to="/admin/productos"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 hover:underline"
            >
              <Settings2 size={14} /> Editar el mensaje
            </Link>
          </div>

          {resultado && (
            <div className="mt-3 flex items-start gap-2 p-3 rounded-xl bg-green-50 border border-green-200 text-green-800 text-xs">
              <CheckCircle2 size={15} className="flex-shrink-0 mt-px" />
              <div>
                <p className="font-semibold">{resultado.detalle}</p>
                <p className="text-green-700 mt-0.5">
                  {resultado.total_morosos} moroso{resultado.total_morosos === 1 ? '' : 's'} en total.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-3 flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
              <AlertCircle size={15} className="flex-shrink-0 mt-px" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>

      {confirmando && (
        <ConfirmDialog
          titulo="Enviar el aviso de cuota"
          mensaje={
            'Se le va a mandar un mail a cada socio moroso con email cargado. ' +
            'No se puede deshacer. ¿Seguimos?'
          }
          confirmLabel="Enviar"
          cargando={enviando}
          onConfirm={enviar}
          onCancel={() => setConfirmando(false)}
        />
      )}
    </div>
  )
}
