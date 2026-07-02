// frontend/src/pages/SocioCuotas.jsx
/**
 * Gestión de Cuotas — ruta `/cuotas`.
 *
 * Sigue el mismo patrón que AdminPagos.jsx:
 *   - Tarjetas de estado con loading skeleton y banner de error.
 *   - Acciones con fail-fast (isSubmitting por tarjeta).
 *   - Modal sobrepuesto para confirmar la orden generada.
 *
 * Backend consumido:
 *   GET  /socio/cuotas/estado
 *   GET  /socio/cuotas/historial
 *   POST /socio/cuotas/generar-orden
 */

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
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

// TODO: reemplazar por el link real del Formulario Google de comprobantes.
const GOOGLE_FORM_URL = 'https://forms.google.com/tu-formulario'

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

// Convierte "YYYY-MM" (mes_cubierto_hasta) al nombre del mes SIGUIENTE, ej. "Mayo 2026"
function proximoMesLabel(mesCubiertoHasta) {
  if (!mesCubiertoHasta) return null
  const [y, m] = mesCubiertoHasta.split('-').map(Number)
  if (!y || !m) return null
  const d = new Date(y, m - 1, 1)
  d.setMonth(d.getMonth() + 1)
  return `${MESES[d.getMonth()]} ${d.getFullYear()}`
}

// ─── Sub-componente: tarjeta de estado (deuda / al día) ──────────────────────

function EstadoCard({ estado, loading, error, onRetry, isSubmitting, onPagar }) {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 animate-pulse">
        <div className="h-5 w-40 bg-gray-200 rounded-md" />
        <div className="h-8 w-56 bg-gray-200 rounded-md mt-3" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
        <AlertTriangle size={18} className="flex-shrink-0" />
        <span className="flex-1">{error}</span>
        <button onClick={onRetry} className="underline underline-offset-2 font-medium hover:text-red-900">
          Reintentar
        </button>
      </div>
    )
  }

  const tieneDeuda = estado.deuda_historica_meses > 0
  const esGrave = estado.deuda_historica_meses >= 2

  if (!tieneDeuda) {
    const proximo = proximoMesLabel(estado.mes_cubierto_hasta)
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex items-center gap-4">
        <div className="p-3 rounded-xl flex-shrink-0 bg-green-100 text-green-700">
          <CheckCircle2 size={22} />
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado de Cuenta</p>
          <p className="text-xl font-bold text-gray-900 mt-0.5">Estás al día</p>
          {proximo && (
            <p className="text-sm text-gray-500 mt-1 flex items-center gap-1.5">
              <CalendarClock size={14} /> Próxima cuota: {proximo}
            </p>
          )}
        </div>
      </div>
    )
  }

  // Tarjeta cuando HAY deuda (Ahora con botón de pago)
  return (
    <div className={`rounded-2xl shadow-sm border p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
      esGrave ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
    }`}>
      <div className="flex items-center gap-4">
        <div className={`p-3 rounded-xl flex-shrink-0 ${
          esGrave ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
        }`}>
          <AlertTriangle size={22} />
        </div>
        <div>
          <p className={`text-xs font-semibold uppercase tracking-wide ${esGrave ? 'text-red-700' : 'text-amber-700'}`}>
            Cuenta con deuda
          </p>
          <p className={`text-xl font-bold mt-0.5 ${esGrave ? 'text-red-900' : 'text-amber-900'}`}>
            {estado.deuda_historica_meses} mes{estado.deuda_historica_meses !== 1 ? 'es' : ''} adeudado{estado.deuda_historica_meses !== 1 ? 's' : ''}
          </p>
          <p className={`text-sm mt-1 ${esGrave ? 'text-red-700' : 'text-amber-700'}`}>
            Total: {formatoMoneda.format(estado.deuda_total_pesos)}
          </p>
        </div>
      </div>
      
      {/* Nuevo botón para saldar la deuda exacta */}
      <button
        onClick={() => onPagar(estado.deuda_historica_meses)}
        disabled={isSubmitting}
        className={`w-full sm:w-auto flex justify-center items-center gap-2 px-5 py-3 rounded-xl font-bold text-white transition-colors disabled:opacity-50 ${
          esGrave ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'
        }`}
      >
        {isSubmitting && <Loader2 size={16} className="animate-spin" />}
        {isSubmitting ? 'Generando...' : 'Saldar Deuda'}
      </button>
    </div>
  )
}

// ─── Sub-componente: tarjeta de opción de pago ───────────────────────────────

function OpcionPagoCard({ meses, label, precioCuota, isSubmitting, onPagar }) {
  const monto = (precioCuota ?? 0) * meses
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-blue-100 p-5 flex flex-col items-center text-center gap-3">
      <p className="text-sm font-bold text-blue-900 uppercase tracking-wide">{label}</p>
      <p className="text-lg font-bold text-gray-900">{formatoMoneda.format(monto)}</p>
      <button
        onClick={() => onPagar(meses)}
        disabled={isSubmitting}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm disabled:opacity-50 transition-colors"
      >
        {isSubmitting && <Loader2 size={14} className="animate-spin" />}
        {isSubmitting ? 'Generando…' : 'Pagar'}
      </button>
    </div>
  )
}

// ─── Modal de orden generada ──────────────────────────────────────────────────

function OrdenGeneradaModal({ onClose }) {
  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center items-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-800">Orden Generada</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-gray-600 leading-relaxed">
          Transferí al alias <span className="font-bold text-gray-900">CLUB.ROBERTS</span> y subí
          el comprobante al siguiente formulario:
        </p>
        <a
          href={GOOGLE_FORM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="block mt-3 text-center px-4 py-2.5 rounded-xl bg-blue-50 text-blue-700 font-semibold text-sm hover:bg-blue-100 transition-colors"
        >
          Subir comprobante
        </a>
        <button
          onClick={onClose}
          className="w-full mt-4 px-4 py-2.5 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800 transition-colors"
        >
          Entendido
        </button>
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function SocioCuotas() {
  const { token } = useAuth()

  // ── Estado de cuenta ────────────────────────────────────────────────────────
  const [estado, setEstado] = useState(null)
  const [loadingEstado, setLoadingEstado] = useState(true)
  const [errorEstado, setErrorEstado] = useState(null)

  const fetchEstado = useCallback(async () => {
    if (!token) return
    setLoadingEstado(true)
    setErrorEstado(null)
    try {
      const res = await fetch(`${API}/socio/cuotas/estado`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`Error ${res.status}: No se pudo cargar el estado de cuenta.`)
      setEstado(await res.json())
    } catch (err) {
      setErrorEstado(err.message)
    } finally {
      setLoadingEstado(false)
    }
  }, [token])

  // ── Historial ────────────────────────────────────────────────────────────────
  const [historial, setHistorial] = useState([])
  const [loadingHistorial, setLoadingHistorial] = useState(true)
  const [errorHistorial, setErrorHistorial] = useState(null)

  const fetchHistorial = useCallback(async () => {
    if (!token) return
    setLoadingHistorial(true)
    setErrorHistorial(null)
    try {
      const res = await fetch(`${API}/socio/cuotas/historial`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`Error ${res.status}: No se pudo cargar el historial.`)
      setHistorial(await res.json())
    } catch (err) {
      setErrorHistorial(err.message)
    } finally {
      setLoadingHistorial(false)
    }
  }, [token])

  useEffect(() => {
    fetchEstado()
    fetchHistorial()
  }, [fetchEstado, fetchHistorial])

  // ── Generar orden de pago ───────────────────────────────────────────────────
  const [submittingMeses, setSubmittingMeses] = useState(null) // 1 | 2 | 6 | null
  const [mostrarModal, setMostrarModal] = useState(false)

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

      if (res.status === 201) {
        setMostrarModal(true)
      } else if (res.status === 400) {
        // Ya hay una orden pendiente: igual mostramos el modal con las
        // instrucciones para que el socio complete la transferencia.
        setMostrarModal(true)
      } else {
        throw new Error(`Error ${res.status}: No se pudo generar la orden.`)
      }
    } catch (err) {
      setErrorEstado(err.message)
    } finally {
      setSubmittingMeses(null)
    }
  }

  const handleCerrarModal = () => {
    setMostrarModal(false)
    fetchEstado()
    fetchHistorial()
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">

      {mostrarModal && <OrdenGeneradaModal onClose={handleCerrarModal} />}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
          <Wallet size={24} className="text-gray-500" />
          Gestión de Cuotas
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Mantené tu cuenta al día para acceder al club.
        </p>
      </div>

      {/* Estado de cuenta */}
      <EstadoCard
        estado={estado}
        loading={loadingEstado}
        error={errorEstado}
        onRetry={fetchEstado}
        isSubmitting={submittingMeses === estado?.deuda_historica_meses}
        onPagar={handlePagar}
      />

      {/* Adelantar pagos */}
      <div>
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">
          Adelantar Pagos
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <OpcionPagoCard
            meses={1}
            label="x1 Mes"
            precioCuota={estado?.precio_cuota_actual}
            isSubmitting={submittingMeses === 1}
            onPagar={handlePagar}
          />
          <OpcionPagoCard
            meses={2}
            label="x2 Meses"
            precioCuota={estado?.precio_cuota_actual}
            isSubmitting={submittingMeses === 2}
            onPagar={handlePagar}
          />
          <OpcionPagoCard
            meses={6}
            label="x6 Meses"
            precioCuota={estado?.precio_cuota_actual}
            isSubmitting={submittingMeses === 6}
            onPagar={handlePagar}
          />
        </div>
      </div>

      {/* Historial de pagos */}
      <div>
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">
          Historial de Pagos
        </h2>

        {errorHistorial && !loadingHistorial && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm mb-3">
            <AlertTriangle size={18} className="flex-shrink-0" />
            <span className="flex-1">{errorHistorial}</span>
            <button onClick={fetchHistorial} className="underline underline-offset-2 font-medium hover:text-red-900">
              Reintentar
            </button>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-50">
          {loadingHistorial && [...Array(3)].map((_, i) => (
            <div key={i} className="p-5 animate-pulse">
              <div className="h-4 w-40 bg-gray-200 rounded-md" />
            </div>
          ))}

          {!loadingHistorial && historial.map(pago => (
            <div key={pago.id_orden} className="p-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gray-100 text-gray-500 flex-shrink-0">
                  <Receipt size={16} />
                </div>
                <div>
                  <p className="font-medium text-gray-900">
                    {formatoFecha.format(new Date(pago.fecha_pago))}
                  </p>
                  <p className="text-xs text-gray-500">
                    {pago.cantidad_meses} mes{pago.cantidad_meses !== 1 ? 'es' : ''} — {formatoMoneda.format(pago.monto_pagado)}
                  </p>
                </div>
              </div>
            </div>
          ))}

          {!loadingHistorial && !errorHistorial && historial.length === 0 && (
            <div className="text-center py-12 text-gray-500 text-sm">
              Todavía no registrás pagos.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}