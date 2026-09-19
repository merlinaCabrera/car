// frontend/src/components/admin/PlantillasMailBlock.jsx
// ─── Editor de las plantillas de mail transaccional ────────────────────────
//
// Lista los eventos de mailer/registry.py y deja editar el asunto y, cuando
// el backend lo permite (`editable_cuerpo`), también el cuerpo. Los mails con
// listas o condiciones adentro (compra confirmada, avisos con estilos
// calculados) traen `editable_cuerpo: false` y acá solo se les muestra el
// asunto — el cuerpo se arma en el servidor.
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/useAuth'
import { textoError } from '../../utils/errores'
import {
  Mail, ChevronDown, ChevronUp, Loader2, Save, RotateCcw, Lock, Pencil,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const ETIQUETA_DESTINO = {
  socio: { label: 'Al socio', clase: 'bg-blue-50 text-blue-700' },
  club:  { label: 'Al club',  clase: 'bg-gray-100 text-gray-600' },
}

function EditorPlantilla({ clave, onGuardado }) {
  const { token } = useAuth()
  const [detalle,      setDetalle]      = useState(null)
  const [asuntoDraft,  setAsuntoDraft]  = useState('')
  const [cuerpoDraft,  setCuerpoDraft]  = useState('')
  const [isLoading,    setIsLoading]    = useState(true)
  const [isSaving,     setIsSaving]     = useState(false)
  const [error,        setError]        = useState(null)
  const [success,      setSuccess]      = useState(null)

  const cargar = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/admin/mensajeria/plantillas/${clave}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('No se pudo cargar la plantilla.')
      const data = await res.json()
      setDetalle(data)
      setAsuntoDraft(data.asunto ?? '')
      setCuerpoDraft(data.cuerpo ?? '')
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [clave, token])

  useEffect(() => { cargar() }, [cargar])

  const guardar = async (asunto, cuerpo) => {
    setIsSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const payload = { asunto }
      if (detalle?.editable_cuerpo) payload.cuerpo = cuerpo
      const res = await fetch(`${API}/admin/mensajeria/plantillas/${clave}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(textoError(data?.detail, 'No se pudo guardar.'))
      setDetalle(data)
      setAsuntoDraft(data.asunto ?? '')
      setCuerpoDraft(data.cuerpo ?? '')
      setSuccess(data.personalizado ? 'Mensaje actualizado.' : 'Se restauró el texto original.')
      setTimeout(() => setSuccess(null), 4000)
      onGuardado?.(clave, data.personalizado)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) return <div className="h-32 bg-gray-100 rounded-xl animate-pulse" />
  if (!detalle) return <p className="text-xs text-red-700 font-medium">{error}</p>

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">Asunto</label>
        <input
          type="text"
          value={asuntoDraft}
          onChange={e => setAsuntoDraft(e.target.value)}
          maxLength={200}
          className="form-input text-sm px-3 py-2 w-full"
        />
        {detalle.vista_previa_asunto && (
          <p className="text-[11px] text-gray-500 mt-1">
            Le llega como: <span className="text-gray-700">{detalle.vista_previa_asunto}</span>
          </p>
        )}
      </div>

      {detalle.editable_cuerpo ? (
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Cuerpo del mail</label>
          <textarea
            value={cuerpoDraft}
            onChange={e => setCuerpoDraft(e.target.value)}
            rows={10}
            className="form-input text-xs px-3 py-2 w-full font-mono leading-relaxed"
          />
          <p className="text-[11px] text-gray-500 mt-1">
            Es HTML: los `&lt;p&gt;`, colores y botones ya vienen escritos. El
            encabezado y el pie del mail se agregan solos.
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-600">
          <Lock size={14} className="flex-shrink-0 mt-px text-gray-400" />
          <span>
            El cuerpo de este mail se arma en el servidor (tiene listas o textos
            que cambian según el caso), así que no se edita desde acá. El asunto sí.
          </span>
        </div>
      )}

      <p className="text-[11px] text-gray-500">
        Variables disponibles:{' '}
        {detalle.variables_disponibles.map((v, i) => (
          <span key={v}>
            {i > 0 && ' · '}
            <code className="font-mono text-gray-700">{`{${v}}`}</code>
          </span>
        ))}
      </p>

      {error   && <p className="text-xs text-red-700 font-medium">{error}</p>}
      {success && <p className="text-xs text-green-700 font-medium">{success}</p>}

      <div className="flex items-center gap-2">
        <button
          onClick={() => guardar(asuntoDraft, cuerpoDraft)}
          disabled={isSaving}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          Guardar
        </button>
        <button
          onClick={() => guardar('', '')}
          disabled={isSaving || !detalle.personalizado}
          title="Vuelve al texto original del sistema"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 transition-colors"
        >
          <RotateCcw size={15} />
          Restaurar
        </button>
      </div>
    </div>
  )
}

export default function PlantillasMailBlock() {
  const { token } = useAuth()
  const [plantillas, setPlantillas] = useState([])
  const [isLoading,  setIsLoading]  = useState(true)
  const [error,      setError]      = useState(null)
  const [abierto,    setAbierto]    = useState(false)
  const [expandida,  setExpandida]  = useState(null)

  useEffect(() => {
    if (!token) return
    let vigente = true
    ;(async () => {
      try {
        const res = await fetch(`${API}/admin/mensajeria/plantillas`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) throw new Error('No se pudieron cargar los mails.')
        const data = await res.json()
        if (vigente) setPlantillas(data)
      } catch (err) {
        if (vigente) setError(err.message)
      } finally {
        if (vigente) setIsLoading(false)
      }
    })()
    return () => { vigente = false }
  }, [token])

  const marcarPersonalizada = (clave, personalizado) =>
    setPlantillas(prev => prev.map(p => (p.clave === clave ? { ...p, personalizado } : p)))

  const editados = plantillas.filter(p => p.personalizado).length

  return (
    <div className="bg-white border border-gray-200 rounded-xl sm:rounded-2xl shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setAbierto(v => !v)}
        className="w-full flex items-center gap-3 px-3 sm:px-5 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
          <Mail size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xs sm:text-sm font-bold text-gray-900">Mails automáticos</h2>
          <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5">
            {plantillas.length} mails que el sistema manda solo
            {editados > 0 && ` · ${editados} con texto propio`}
          </p>
        </div>
        {abierto
          ? <ChevronUp size={18} className="text-gray-400 flex-shrink-0" />
          : <ChevronDown size={18} className="text-gray-400 flex-shrink-0" />}
      </button>

      {abierto && (
        <div className="border-t border-gray-100">
          {isLoading && <div className="m-3 h-24 bg-gray-100 rounded-xl animate-pulse" />}
          {error && <p className="px-3 sm:px-5 py-4 text-xs text-red-700 font-medium">{error}</p>}

          <ul className="divide-y divide-gray-100">
            {plantillas.map(p => {
              const destino = ETIQUETA_DESTINO[p.destino] ?? ETIQUETA_DESTINO.club
              const activa = expandida === p.clave
              return (
                <li key={p.clave}>
                  <button
                    type="button"
                    onClick={() => setExpandida(activa ? null : p.clave)}
                    className="w-full flex items-center gap-2 px-3 sm:px-5 py-3 text-left hover:bg-gray-50 transition-colors"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-gray-800 truncate">
                        {p.etiqueta}
                      </span>
                      <span className="flex items-center gap-1.5 mt-1">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${destino.clase}`}>
                          {destino.label}
                        </span>
                        {p.personalizado && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-50 text-green-700">
                            <Pencil size={9} /> Editado
                          </span>
                        )}
                        {!p.editable_cuerpo && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-50 text-gray-500">
                            <Lock size={9} /> Solo asunto
                          </span>
                        )}
                      </span>
                    </span>
                    {activa
                      ? <ChevronUp size={16} className="text-gray-400 flex-shrink-0" />
                      : <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />}
                  </button>

                  {activa && (
                    <div className="px-3 sm:px-5 pb-4 pt-1 bg-gray-50/50">
                      <EditorPlantilla clave={p.clave} onGuardado={marcarPersonalizada} />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
