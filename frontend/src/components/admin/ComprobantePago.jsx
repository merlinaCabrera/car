// frontend/src/components/admin/ComprobantePago.jsx
/**
 * Visor + reemplazo del comprobante de un Pago, para las pantallas de admin.
 *
 * Por qué existe (BUG-05, ronda 2 de la QA del 08-09): el backend ya devolvía
 * bien la Presigned URL del comprobante en `PagoResponse.comprobante_url`,
 * pero ninguna pantalla del admin la renderizaba fuera del modal de
 * verificación — y ese modal solo se abre para órdenes PENDIENTES. Resultado:
 * una vez aprobada o rechazada la orden, el comprobante quedaba inaccesible
 * para el club, tanto en /admin/verificaciones como en el historial de pagos
 * de /admin/socios. No era un link roto: no había ningún control.
 *
 * Se comparte entre las dos pantallas a propósito, para no volver a tener una
 * que muestre el comprobante y otra que no.
 *
 * El comprobante cuelga del PAGO, no de la Orden (patrón Split-Order): si un
 * Pago agrupa la cuota y la tienda, las dos órdenes comparten este archivo.
 */
import { useRef, useState } from 'react'
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  ImageIcon,
  Loader2,
  Upload,
} from 'lucide-react'
import { resolverUrlArchivo } from '../../utils/archivos'
import { textoError } from '../../utils/errores'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

/**
 * ¿Es un PDF? Ojo: `comprobante_url` llega como Presigned URL de S3, o sea con
 * query string (`?X-Amz-Signature=...`). Un `endsWith('.pdf')` sobre la URL
 * completa siempre da false y un PDF termina renderizado como <img> roto — hay
 * que cortar en el '?' antes de mirar la extensión.
 */
export function comprobanteEsPdf(url) {
  return (url ?? '').split('?')[0].toLowerCase().endsWith('.pdf')
}

export default function ComprobantePago({
  idPago,
  comprobanteUrl,
  metodoPago,
  token,
  onReemplazado,
  permitirReemplazo = true,
  // Arranca colapsado (solo el título + "Ver comprobante") en las pantallas
  // que listan VARIOS pagos seguidos: una foto vertical de transferencia mide
  // lo mismo que media pantalla de celular, y con 5 o 6 pagos en el historial
  // hay que hacer scroll eterno para llegar al siguiente (sugerencia 8.7 de la
  // QA del 11-09). Donde se mira un comprobante puntual —el modal de
  // verificación— sigue apareciendo abierto, que es para lo que se entra.
  colapsable = false,
}) {
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState(null)
  const [abierto, setAbierto] = useState(!colapsable)
  const inputRef = useRef(null)
  // `subiendo` es state (asincrónico): sin esta ref, dos cambios rápidos del
  // input disparan dos uploads. Mismo patrón que el resto de las acciones
  // críticas (ver BUG-03).
  const enviandoRef = useRef(false)

  const url = resolverUrlArchivo(comprobanteUrl)
  const esPdf = comprobanteEsPdf(comprobanteUrl)
  const esEfectivo = metodoPago === 'efectivo'

  const handleArchivo = async (e) => {
    const file = e.target.files?.[0]
    // Se limpia el input siempre: si no, elegir el MISMO archivo dos veces
    // seguidas (después de un error) no dispara el evento change.
    e.target.value = ''
    if (!file || enviandoRef.current) return

    enviandoRef.current = true
    setSubiendo(true)
    setError(null)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch(`${API}/admin/pagos/${idPago}/comprobante`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(textoError(data?.detail, 'No se pudo subir el comprobante.'))
      }
      const data = await res.json()
      onReemplazado?.(data.comprobante_url)
    } catch (err) {
      setError(err?.message || 'No se pudo subir el comprobante.')
    } finally {
      enviandoRef.current = false
      setSubiendo(false)
    }
  }

  const botonReemplazar = permitirReemplazo && (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={subiendo}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors disabled:opacity-50"
      >
        {subiendo ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
        {subiendo ? 'Subiendo…' : url ? 'Reemplazar' : 'Adjuntar'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.pdf"
        onChange={handleArchivo}
        className="hidden"
      />
    </>
  )

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {colapsable ? (
          <button
            type="button"
            onClick={() => setAbierto(a => !a)}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-700 transition-colors"
          >
            {abierto ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            Comprobante {idPago != null && <span className="normal-case font-normal">(Pago #{idPago})</span>}
          </button>
        ) : (
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Comprobante {idPago != null && <span className="normal-case font-normal">(Pago #{idPago})</span>}
          </h4>
        )}
        {abierto && botonReemplazar}
      </div>

      {!abierto ? null : url ? (
        <div className="border rounded-lg overflow-hidden">
          {esPdf ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <FileText className="h-7 w-7 text-red-500 flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-semibold text-gray-800 text-sm">Comprobante.pdf</p>
                <p className="text-xs text-blue-600 flex items-center gap-1">
                  Abrir en nueva pestaña <ExternalLink size={11} />
                </p>
              </div>
            </a>
          ) : (
            <>
              <img
                src={url}
                alt={`Comprobante del pago #${idPago}`}
                className="w-full h-auto max-h-80 object-contain bg-gray-100"
              />
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 p-2 bg-gray-50 hover:bg-gray-100 text-xs font-medium text-blue-600 border-t transition-colors"
              >
                Ver en tamaño completo <ExternalLink size={11} />
              </a>
            </>
          )}
        </div>
      ) : (
        <p className="text-sm text-gray-500 p-3 text-center bg-gray-50 rounded-lg flex items-center justify-center gap-2">
          <ImageIcon size={14} className="flex-shrink-0 text-gray-400" />
          {esEfectivo
            ? 'Pago en efectivo — se cobra en el club, no lleva comprobante.'
            : 'El socio todavía no subió un comprobante.'}
        </p>
      )}

      {abierto && error && (
        <p className="text-xs text-red-600 flex items-center gap-1.5">
          <AlertCircle size={12} className="flex-shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}
