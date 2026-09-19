// frontend/src/components/admin/RecordatorioCuota.jsx
// ─── Avisos de cuota al socio moroso ────────────────────────────────────────
//
// Vive en /admin/socios, colapsado por defecto (es configuración que se toca
// una vez cada tanto, y abierto se come media pantalla en mobile). Antes el
// mensaje se editaba en /admin/productos y el broadcast por mail vivía acá
// aparte (AvisoCuotaMasivo) — el broadcast se sacó del todo: Resend tiene un
// límite de 100 mails/día en el plan gratuito y un solo clic alcanzaba para
// agotarlo. El aviso al moroso ahora es individual, por WhatsApp, desde
// /admin/socios (cada fila tiene su propio botón).
import { useState, useEffect, useCallback, Fragment } from 'react'
import { useAuth } from '../../context/useAuth'
import { textoError } from '../../utils/errores'
import { MessageCircle, ChevronDown, ChevronUp, Loader2, Save, RotateCcw } from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export default function RecordatorioCuota() {
  const { token } = useAuth()

  const [recordatorio,   setRecordatorio]   = useState(null)
  const [plantillaDraft, setPlantillaDraft] = useState('')
  const [aliasDraft,     setAliasDraft]     = useState('')
  const [whatsappDraft,  setWhatsappDraft]  = useState('')
  const [isLoading,      setIsLoading]      = useState(true)
  const [isSaving,       setIsSaving]       = useState(false)
  const [error,          setError]          = useState(null)
  const [success,        setSuccess]        = useState(null)
  const [abierto,        setAbierto]        = useState(false)

  const fetchRecordatorio = useCallback(async () => {
    if (!token) return
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/admin/productos/configuracion/recordatorio`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('No se pudo cargar la plantilla del recordatorio.')
      const data = await res.json()
      setRecordatorio(data)
      setPlantillaDraft(data.plantilla ?? '')
      setAliasDraft(data.alias_transferencia ?? '')
      setWhatsappDraft(data.whatsapp_club ?? '')
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [token])

  useEffect(() => { fetchRecordatorio() }, [fetchRecordatorio])

  const guardar = async (plantilla, alias, whatsapp) => {
    setIsSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`${API}/admin/productos/configuracion/recordatorio`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          plantilla,
          alias_transferencia: alias,
          whatsapp_club: whatsapp,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(textoError(err?.detail, 'Error al guardar el recordatorio.'))
      }
      const data = await res.json()
      setRecordatorio(data)
      setPlantillaDraft(data.plantilla ?? '')
      setAliasDraft(data.alias_transferencia ?? '')
      setWhatsappDraft(data.whatsapp_club ?? '')
      setSuccess(
        data.es_default
          ? 'Se restauró la plantilla por defecto.'
          : 'Recordatorio actualizado.',
      )
      setTimeout(() => setSuccess(null), 4000)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl sm:rounded-2xl shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setAbierto(v => !v)}
        className="w-full flex items-center gap-3 px-3 sm:px-5 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-green-50 text-green-600 flex items-center justify-center flex-shrink-0">
          <MessageCircle size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xs sm:text-sm font-bold text-gray-900">Recordatorio de cuota</h2>
          <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5">
            El texto que se le manda al socio moroso por WhatsApp, y el alias del club.
          </p>
        </div>
        {abierto
          ? <ChevronUp size={18} className="text-gray-400 flex-shrink-0" />
          : <ChevronDown size={18} className="text-gray-400 flex-shrink-0" />}
      </button>

      {abierto && (
        <div className="px-3 sm:px-5 pb-4 sm:pb-5 pt-1 border-t border-gray-100 space-y-4">
          {isLoading ? (
            <div className="h-40 bg-gray-100 rounded-xl animate-pulse" />
          ) : (
            <Fragment>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Alias de transferencia del club
                </label>
                <input
                  type="text"
                  value={aliasDraft}
                  onChange={e => setAliasDraft(e.target.value)}
                  placeholder="club.atletico.roberts"
                  className="form-input text-sm px-3 py-2 w-full"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Es el valor que reemplaza a <code className="font-mono">{'{alias}'}</code> en el mensaje.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Número de WhatsApp del club
                </label>
                <input
                  type="text"
                  value={whatsappDraft}
                  onChange={e => setWhatsappDraft(e.target.value)}
                  placeholder="2355 12-3456"
                  className="form-input text-sm px-3 py-2 w-full"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  El mensaje se envía desde el WhatsApp que tengas abierto en tu
                  dispositivo. Este número es solo un recordatorio interno.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Mensaje
                </label>
                <textarea
                  value={plantillaDraft}
                  onChange={e => setPlantillaDraft(e.target.value)}
                  rows={5}
                  className="form-input text-sm px-3 py-2 w-full font-mono leading-relaxed"
                />
                <div className="flex items-center justify-between gap-2 mt-1">
                  <p className="text-[11px] text-gray-500">
                    Variables disponibles:{' '}
                    {(recordatorio?.variables_disponibles ?? []).map((v, i) => (
                      <Fragment key={v}>
                        {i > 0 && ' · '}
                        <code className="font-mono text-gray-700">{`{${v}}`}</code>
                      </Fragment>
                    ))}
                  </p>
                  <span className="text-[11px] text-gray-400 flex-shrink-0">
                    {plantillaDraft.length}/1000
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  <code className="font-mono">{'{mes}'}</code> es el período adeudado más viejo (sin el año) y{' '}
                  <code className="font-mono">{'{monto}'}</code> la deuda total: los dos son obligatorios.{' '}
                  <code className="font-mono">{'{meses}'}</code> es la cantidad de cuotas que debe — ojo con la{' '}
                  <span className="font-semibold">s</span>, son dos variables distintas.
                </p>
              </div>

              {recordatorio?.vista_previa && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-green-800 mb-1">
                    Así se ve (datos de ejemplo)
                  </p>
                  <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap break-words">
                    {recordatorio.vista_previa}
                  </p>
                  {recordatorio.es_default && (
                    <p className="text-[11px] text-green-700 mt-2">
                      Todavía nadie editó el mensaje: este es el texto por defecto.
                    </p>
                  )}
                </div>
              )}

              {error && (
                <p className="text-xs text-red-700 font-medium">{error}</p>
              )}
              {success && (
                <p className="text-xs text-green-700 font-medium">{success}</p>
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={() => guardar(plantillaDraft, aliasDraft, whatsappDraft)}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                  Guardar
                </button>
                <button
                  onClick={() => guardar('', aliasDraft, whatsappDraft)}
                  disabled={isSaving || recordatorio?.es_default}
                  title="Vuelve al texto original del sistema"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 transition-colors"
                >
                  <RotateCcw size={15} />
                  Restaurar
                </button>
              </div>
            </Fragment>
          )}
        </div>
      )}
    </div>
  )
}
