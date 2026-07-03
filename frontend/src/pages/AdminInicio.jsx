// frontend/src/pages/AdminInicio.jsx
/**
 * Panel de Control del administrador — ruta `/admin`.
 *
 * Reescrito con la misma paleta clara / tarjetas blancas que AdminSocios.jsx
 * (en vez del tema oscuro que tenía antes) para mantener consistencia visual
 * en toda la sección de administración.
 *
 * Tres tarjetas de tareas pendientes, todas con datos reales:
 *   - "Solicitudes de Socios"  → GET /admin/usuarios/pendientes
 *   - "Pagos por Verificar"    → GET /admin/ordenes/pendientes/count
 *   - "Órdenes de Tienda"      → GET /admin/ordenes/pendientes-tienda/count
 *
 * Todas comparten loading skeleton mientras cargan y banner de error con
 * reintento si falla el fetch correspondiente.
 */

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  ScanLine,
  UserPlus,
  CreditCard,
  ShoppingBag,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  Clock,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

// ─── Sub-componente: tarjeta de tarea pendiente ──────────────────────────────

function TareaCard({
  icon: Icon,
  iconColor,
  titulo,
  descripcion,
  valor,
  loading,
  error,
  onRetry,
  ctaLabel,
  ctaPath,
  proximamente = false,
}) {
  const navigate = useNavigate()

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div className={`p-2.5 rounded-xl ${iconColor}`}>
          <Icon size={20} />
        </div>
        {proximamente && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700">
            <Clock size={11} /> Próximamente
          </span>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">{titulo}</h3>

        {/* Estado: cargando */}
        {loading && (
          <div className="h-9 w-16 bg-gray-200 rounded-md animate-pulse mt-2" />
        )}

        {/* Estado: error */}
        {!loading && error && (
          <div className="mt-2 flex items-center justify-between gap-2 text-red-600">
            <div className="flex items-center gap-1.5 text-xs">
              <AlertCircle size={14} className="flex-shrink-0" />
              <span>Error al cargar</span>
            </div>
            <p className="text-3xl font-bold text-gray-900 mt-1">0</p>
          </div>
        )}

        {/* Estado: valor cargado */}
        {!loading && !error && (
          <p className={`text-3xl font-bold mt-1 ${valor > 0 ? 'text-blue-600' : 'text-gray-900'}`}>{valor}</p>
        )}

        <p className="text-sm text-gray-400 mt-1">{descripcion}</p>
      </div>

      {ctaPath && (
        <button
          onClick={() => navigate(ctaPath)}
          className="mt-auto inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors disabled:opacity-50"
          disabled={loading}
        >
          {ctaLabel}
          <ArrowRight size={14} />
        </button>
      )}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function AdminInicio() {
  const { user, token } = useAuth()
  const navigate = useNavigate()

  // ── Solicitudes de Socios (altas nuevas) ─────────────────────────────────────
  const [solicitudesCount, setSolicitudesCount] = useState(0)
  const [loadingSolicitudes, setLoadingSolicitudes] = useState(true)
  const [errorSolicitudes, setErrorSolicitudes] = useState(null)

  // ── Pagos por Verificar (transferencias de cuota) ────────────────────────────
  const [pagosCount, setPagosCount] = useState(0)
  const [loadingPagos, setLoadingPagos] = useState(true)
  const [errorPagos, setErrorPagos] = useState(null)

  // ── Órdenes de Tienda (indumentaria / alquileres) ────────────────────────────
  const [ordenesTiendaCount, setOrdenesTiendaCount] = useState(0)
  const [loadingOrdenesTienda, setLoadingOrdenesTienda] = useState(true)
  const [errorOrdenesTienda, setErrorOrdenesTienda] = useState(null)

  const fetchSolicitudesPendientes = useCallback(async () => {
    if (!token) return
    setLoadingSolicitudes(true)
    setErrorSolicitudes(null)
    try {
      const res = await fetch(`${API}/admin/usuarios/pendientes`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`Error ${res.status}: No se pudieron cargar las solicitudes pendientes.`)
      const data = await res.json()
      // Soporta tanto un array de solicitudes como { total: N }
      const count = Array.isArray(data) ? data.length : (data?.total ?? 0)
      setSolicitudesCount(count)
    } catch (err) {
      setErrorSolicitudes(err.message)
    } finally {
      setLoadingSolicitudes(false)
    }
  }, [token])

  const fetchPagosPendientes = useCallback(async () => {
    if (!token) return
    setLoadingPagos(true)
    setErrorPagos(null)
    try {
      const res = await fetch(`${API}/admin/ordenes/pendientes/count`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`Error ${res.status}: No se pudo obtener el contador de pagos.`)
      const count = await res.json()
      setPagosCount(count)
    } catch (err) {
      setErrorPagos(err.message)
    } finally {
      setLoadingPagos(false)
    }
  }, [token])

  const fetchOrdenesTiendaPendientes = useCallback(async () => {
    if (!token) return
    setLoadingOrdenesTienda(true)
    setErrorOrdenesTienda(null)
    try {
      const res = await fetch(`${API}/admin/ordenes/pendientes-tienda/count`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`Error ${res.status}: No se pudo obtener el contador de tienda.`)
      const count = await res.json()
      setOrdenesTiendaCount(count)
    } catch (err) {
      setErrorOrdenesTienda(err.message)
    } finally {
      setLoadingOrdenesTienda(false)
    }
  }, [token])

  useEffect(() => {
    fetchSolicitudesPendientes()
    fetchPagosPendientes()
    fetchOrdenesTiendaPendientes()
  }, [fetchSolicitudesPendientes, fetchPagosPendientes, fetchOrdenesTiendaPendientes])

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
          <LayoutDashboard size={24} className="text-gray-500" />
          Panel de Control
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Hola, {user?.nombre || 'Admin'} — esto es lo que necesita tu atención hoy.
        </p>
      </div>

      {/* CTA principal: Lector de QR */}
      <button
        onClick={() => navigate('/admin/escaner')}
        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-6 px-4 rounded-2xl shadow-md transition-all active:scale-[0.99] text-base md:text-lg flex items-center justify-center gap-3"
      >
        <ScanLine size={22} />
        Lector de QR — Control de Acceso
      </button>

      {/* Grilla de tareas pendientes */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <TareaCard
          icon={UserPlus}
          iconColor="bg-amber-100 text-amber-700"
          titulo="Solicitudes de Socios"
          descripcion={
            !loadingSolicitudes && !errorSolicitudes && solicitudesCount === 0
              ? 'No hay solicitudes pendientes.'
              : 'Altas nuevas esperando revisión.'
          }
          valor={solicitudesCount}
          loading={loadingSolicitudes}
          error={errorSolicitudes}
          onRetry={fetchSolicitudesPendientes}
          ctaLabel={solicitudesCount > 0 ? 'Revisar solicitudes' : 'Ver socios'}
          ctaPath="/admin/socios"
        />

        <TareaCard
          icon={CreditCard}
          iconColor="bg-orange-100 text-orange-700"
          titulo="Pagos por Verificar"
          descripcion={
            !loadingPagos && !errorPagos && pagosCount === 0
              ? 'No hay pagos pendientes.'
              : 'Transferencias esperando aprobación.'
          }
          valor={pagosCount}
          loading={loadingPagos}
          error={errorPagos}
          onRetry={fetchPagosPendientes}
          ctaLabel="Ir a Pagos"
          ctaPath="/admin/pagos"
        />

        <TareaCard
          icon={ShoppingBag}
          iconColor="bg-blue-100 text-blue-700"
          titulo="Órdenes de Tienda"
          descripcion={
            !loadingOrdenesTienda && !errorOrdenesTienda && ordenesTiendaCount === 0
              ? 'No hay pedidos pendientes.'
              : 'Pedidos de indumentaria y alquileres esperando aprobación.'
          }
          valor={ordenesTiendaCount}
          loading={loadingOrdenesTienda}
          error={errorOrdenesTienda}
          onRetry={fetchOrdenesTiendaPendientes}
          ctaLabel="Ir a Tienda"
          ctaPath="/admin/tienda"
        />
      </div>
    </div>
  )
}