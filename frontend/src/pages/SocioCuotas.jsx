// frontend/src/pages/SocioCuotas.jsx
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  Wallet,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  Loader2,
  X,
  CalendarClock,
  UploadCloud,
  CheckCircle,
  Info,
  ExternalLink,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const formatoMoneda = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

const formatoFecha = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
})

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function proximoMesLabel(mesCubiertoHasta) {
  if (!mesCubiertoHasta) return null
  const [y, m] = mesCubiertoHasta.split('-').map(Number)
  if (!y || !m) return null
  const d = new Date(y, m - 1, 1)
  d.setMonth(d.getMonth() + 1)
  return `${MESES[d.getMonth()]} ${d.getFullYear()}`
}

// ─── Modal para subir comprobante ─────────────────────────────────────────────
function OrdenGeneradaModal({ orden, onClose, token }) {
  const [file, setFile] = useState(null)
  const [isUploading, setIsUploading] = useState(false)
  const [apiError, setApiError] = useState(null)
  const [success, setSuccess] = useState(false)

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0]
    if (selectedFile) {
      setFile(selectedFile)
      setApiError(null)
    }
  }

  const handleUpload = async () => {
    if (!file) {
      setApiError('Por favor, seleccioná un archivo.')
      return
    }
    setIsUploading(true)
    setApiError(null)
    setSuccess(false)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch(`${API}/socio/cuotas/ordenes/${orden.id_orden}/comprobante`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? 'Error al subir el comprobante.')
      }
      setSuccess(true)
      setTimeout(() => onClose(), 2000)
    } catch (err) {
      setApiError(err.message)
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center items-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[92dvh]">
        <div className="p-6 border-b flex-shrink-0 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Transferencia Bancaria</h2>
            <p className="text-sm text-gray-500 mt-1">Orden #{orden.id_orden}</p>
          </div>
          <button onClick={onClose} disabled={isUploading} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {apiError && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
              <span>{apiError}</span>
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm font-medium">
              <CheckCircle size={15} />
              <span>¡Comprobante subido con éxito!</span>
            </div>
          )}

          <div className="text-center p-4 rounded-xl bg-blue-50 border border-blue-200">
            <p className="text-sm font-semibold text-blue-900">Total a Pagar</p>
            <p className="text-3xl font-bold text-blue-900 mt-1">{formatoMoneda.format(orden.monto_total)}</p>
          </div>

          <p className="text-sm text-gray-600 text-center">
            Transferí al alias <strong>CLUB.ROBERTS</strong> y subí el comprobante para que podamos verificar tu pago.
          </p>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Adjuntar comprobante
            </label>
            <div className="mt-1.5">
              <label className={`relative flex justify-center w-full px-6 py-8 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${file ? 'border-green-300 bg-green-50' : 'border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50'}`}>
                <div className="text-center">
                  <UploadCloud className={`mx-auto h-10 w-10 ${file ? 'text-green-500' : 'text-gray-400'}`} />
                  <span className={`mt-2 block text-sm font-semibold ${file ? 'text-green-800' : 'text-gray-600'}`}>
                    {file ? file.name : 'Seleccionar archivo'}
                  </span>
                  <span className="mt-1 block text-xs text-gray-500">PNG, JPG, PDF (Máx. 10MB)</span>
                </div>
                <input type="file" className="sr-only" accept="image/*,.pdf" onChange={handleFileChange} disabled={isUploading || success} />
              </label>
            </div>
          </div>
        </div>

        <div className="p-4 bg-gray-50 rounded-b-2xl border-t flex justify-end gap-3 flex-shrink-0">
          <button type="button" onClick={onClose} disabled={isUploading} className="px-4 py-2 rounded-lg text-gray-600 bg-gray-200 hover:bg-gray-300 font-semibold transition-colors">
            Cerrar
          </button>
          <button type="button" onClick={handleUpload} disabled={!file || isUploading || success} className="px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700 font-semibold disabled:opacity-50 transition-colors flex items-center gap-2">
            {isUploading && <Loader2 size={14} className="animate-spin" />}
            {isUploading ? 'Subiendo…' : 'Subir Comprobante'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function SocioCuotas() {
  const { token } = useAuth()

  const [estado, setEstado] = useState(null)
  const [historial, setHistorial] = useState([])
  const [ordenPendiente, setOrdenPendiente] = useState(null)
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  const [submittingMeses, setSubmittingMeses] = useState(null)
  const [isCanceling, setIsCanceling] = useState(false)
  const [mostrarModal, setMostrarModal] = useState(false)

  const fetchData = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const [estRes, histRes, pendRes] = await Promise.all([
        fetch(`${API}/socio/cuotas/estado`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/socio/cuotas/historial`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/socio/cuotas/orden-pendiente`, { headers: { Authorization: `Bearer ${token}` } })
      ])
      
      if (!estRes.ok || !histRes.ok || !pendRes.ok) {
        throw new Error('No se pudo cargar la información de cuotas.')
      }

      setEstado(await estRes.json())
      setHistorial(await histRes.json())
      setOrdenPendiente(await pendRes.json())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handlePagar = async (meses) => {
    setSubmittingMeses(meses)
    try {
      const res = await fetch(`${API}/socio/cuotas/generar-orden`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ meses_a_pagar: meses }),
      })
      if (!res.ok) throw new Error('Error al generar la orden.')
      
      await fetchData() // Refresca para obtener la ordenPendiente
      setMostrarModal(true) // Abre el modal directo para subir foto
    } catch (err) {
      alert(err.message)
    } finally {
      setSubmittingMeses(null)
    }
  }

  const handleCancelarOrden = async () => {
    if (!window.confirm('¿Seguro que querés cancelar esta orden de pago?')) return
    setIsCanceling(true)
    try {
      const res = await fetch(`${API}/socio/cuotas/ordenes/${ordenPendiente.id_orden}/cancelar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Error al cancelar la orden.')
      await fetchData() // Refresca todo, desaparece la orden pendiente
    } catch (err) {
      alert(err.message)
    } finally {
      setIsCanceling(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto text-center">
        <Loader2 className="animate-spin inline-block text-gray-400 mt-10" size={32} />
      </div>
    )
  }

  const tieneDeuda = estado?.deuda_historica_meses > 0
  const esGrave = estado?.deuda_historica_meses >= 2

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      {/* Modal Upload */}
      {mostrarModal && ordenPendiente && (
        <OrdenGeneradaModal 
          orden={ordenPendiente} 
          token={token} 
          onClose={() => { setMostrarModal(false); fetchData(); }} 
        />
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
          <Wallet size={24} className="text-gray-500" />
          Gestión de Cuotas
        </h1>
        <p className="text-sm text-gray-500 mt-1">Mantené tu cuenta al día para acceder al club.</p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-xl">{error}</div>
      )}

      {/* Banner de Orden Pendiente */}
      {ordenPendiente && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm">
          <div className="flex items-center gap-4 w-full">
            <div className="p-3 rounded-xl bg-blue-100 text-blue-700 hidden sm:block">
              <Info size={28} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-blue-900">Tenés un pago en proceso</h3>
              <p className="text-sm text-blue-800 mt-0.5">
                Orden #{ordenPendiente.id_orden} — Total a transferir: <span className="font-bold">{formatoMoneda.format(ordenPendiente.monto_total)}</span>
              </p>
              <p className="text-sm font-medium mt-1.5">
                Estado: {ordenPendiente.comprobante_url 
                  ? <span className="text-emerald-600 flex items-center gap-1"><CheckCircle size={14}/> Comprobante en revisión</span> 
                  : <span className="text-amber-600 flex items-center gap-1"><AlertTriangle size={14}/> Falta subir comprobante</span>}
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto shrink-0">
            <button
              onClick={() => setMostrarModal(true)}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors text-sm text-center"
            >
              {ordenPendiente.comprobante_url ? 'Cambiar Comprobante' : 'Subir Comprobante'}
            </button>
            <button
              onClick={handleCancelarOrden}
              disabled={isCanceling}
              className="px-4 py-2.5 bg-white border border-red-200 text-red-600 hover:bg-red-50 rounded-xl font-bold transition-colors text-sm text-center"
            >
              {isCanceling ? 'Cancelando...' : 'Cancelar Trámite'}
            </button>
          </div>
        </div>
      )}

      {/* Estado de Cuenta Actual */}
      <div className={`rounded-2xl shadow-sm border p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${tieneDeuda ? (esGrave ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200') : 'bg-white border-gray-100'}`}>
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-xl flex-shrink-0 ${tieneDeuda ? (esGrave ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700') : 'bg-green-100 text-green-700'}`}>
            {tieneDeuda ? <AlertTriangle size={22} /> : <CheckCircle2 size={22} />}
          </div>
          <div>
            <p className={`text-xs font-semibold uppercase tracking-wide ${tieneDeuda ? (esGrave ? 'text-red-700' : 'text-amber-700') : 'text-gray-500'}`}>
              Estado de Cuenta
            </p>
            <p className={`text-xl font-bold mt-0.5 ${tieneDeuda ? (esGrave ? 'text-red-900' : 'text-amber-900') : 'text-gray-900'}`}>
              {tieneDeuda ? `${estado.deuda_historica_meses} mes(es) adeudado(s)` : 'Estás al día'}
            </p>
            <p className={`text-sm mt-1 ${tieneDeuda ? (esGrave ? 'text-red-700' : 'text-amber-700') : 'text-gray-500 flex items-center gap-1.5'}`}>
              {tieneDeuda ? `Total: ${formatoMoneda.format(estado.deuda_total_pesos)}` : <><CalendarClock size={14} /> Próxima cuota: {proximoMesLabel(estado.mes_cubierto_hasta)}</>}
            </p>
          </div>
        </div>
        {/* Ocultamos el botón "Saldar Deuda" si ya hay una orden en proceso */}
        {tieneDeuda && !ordenPendiente && (
          <button onClick={() => handlePagar(estado.deuda_historica_meses)} disabled={submittingMeses === estado.deuda_historica_meses} className={`w-full sm:w-auto px-5 py-3 rounded-xl font-bold text-white transition-colors ${esGrave ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'}`}>
             {submittingMeses === estado.deuda_historica_meses ? <Loader2 size={16} className="animate-spin inline" /> : 'Saldar Deuda'}
          </button>
        )}
      </div>

      {/* Adelantar pagos (Oculto si hay orden pendiente) */}
      {!ordenPendiente && (
        <div>
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Adelantar Pagos / Meses Sueltos</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[1, 2, 6].map(meses => (
              <div key={meses} className="bg-white rounded-2xl shadow-sm border border-blue-100 p-5 flex flex-col items-center text-center gap-3">
                <p className="text-sm font-bold text-blue-900 uppercase tracking-wide">x{meses} Mes{meses > 1 ? 'es' : ''}</p>
                <p className="text-lg font-bold text-gray-900">{formatoMoneda.format((estado?.precio_cuota_actual ?? 0) * meses)}</p>
                <button onClick={() => handlePagar(meses)} disabled={submittingMeses === meses} className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors">
                  {submittingMeses === meses ? <Loader2 size={16} className="animate-spin inline mx-auto" /> : 'Pagar'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Historial de pagos */}
      <div>
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Historial de Pagos</h2>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-50">
          {historial.map(pago => (
            <div key={pago.id_orden} className="p-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gray-100 text-gray-500 flex-shrink-0">
                  <Receipt size={16} />
                </div>
                <div>
                  <p className="font-medium text-gray-900">{formatoFecha.format(new Date(pago.fecha_pago))}</p>
                  <p className="text-xs text-gray-500">{pago.cantidad_meses} mes(es) — {formatoMoneda.format(pago.monto_pagado)}</p>
                </div>
              </div>
              {pago.comprobante_url && (
                <a
                  href={`${API}${pago.comprobante_url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-600 hover:bg-blue-50 transition-colors"
                >
                  <ExternalLink size={14} />
                  <span>Ver comprobante</span>
                </a>
              )}
            </div>
          ))}
          {historial.length === 0 && (
            <div className="text-center py-12 text-gray-500 text-sm">Todavía no registrás pagos completados.</div>
          )}
        </div>
      </div>
    </div>
  )
}