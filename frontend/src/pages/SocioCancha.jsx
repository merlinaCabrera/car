// frontend/src/pages/SocioCancha.jsx
/**
 * Página del Módulo de Reservas — ruta `/socio/cancha`.
 *
 * Hermana de Reservas.jsx (que es solo para el Quincho, franjas Día/Noche).
 * Acá la cancha se reserva por turno horario (bloques de 1.5 hs, configurable
 * más abajo en `DURACION_TURNO_HORAS`), y se agrega la calculadora visual del
 * "reintegro QR": el grupo paga el turno completo por transferencia (dividido
 * entre ellos como quieran), y cada socio que se presenta con su QR en la
 * puerta de la cancha recibe un 20% de reintegro sobre SU parte individual.
 *
 * IMPORTANTE: `numSocios` es solo una calculadora visual para que el socio
 * vea cuánto le tocaría y cuánto reintegro le corresponde. Hoy el backend
 * (`ReservaInstalacionCreate`) no recibe ese número al crear la pre-reserva:
 * el admin es quien carga `num_socios_esperados` después, desde el panel de
 * Agenda de Reservas. Si más adelante querés que el socio lo cargue en el
 * momento de reservar, hay que sumar el campo al schema del backend y acá
 * mandarlo en el body del POST (ver `handleConfirmar`).
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Lock,
  CheckCircle2,
  ShoppingCart,
  AlertTriangle,
  Percent,
  Users,
  QrCode,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const formatoMoneda = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

// ─── Configuración de canchas ──────────────────────────────────────────────
// `nombreProducto` tiene que matchear EXACTO el `nombre` del ProductoServicio
// (categoria='alquiler') dado de alta en el backend para esa cancha.
// Si el club tiene una sola cancha, dejá un solo elemento en el array.
const CANCHAS = [
  { key: 'cancha_1', label: 'Cancha 1', nombreProducto: 'Cancha 1' },
  { key: 'cancha_2', label: 'Cancha 2', nombreProducto: 'Cancha 2' },
]

// ─── Configuración de turnos horarios ──────────────────────────────────────
const HORA_INICIO = 9   // primer turno arranca 9:00
const HORA_FIN = 23      // último turno posible arranca a más tardar 21:30 (con duración 1.5)
const DURACION_TURNO_HORAS = 1.5
const PORCENTAJE_REINTEGRO = 0.20 // 20%, matchea el default sugerido en el backend

const NOMBRES_MES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

// ─── Helpers de fecha (sin desfase UTC) ───────────────────────────────────

function isoDeFechaLocal(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function generarTurnosDelDia() {
  const turnos = []
  for (let h = HORA_INICIO; h + DURACION_TURNO_HORAS <= HORA_FIN + 0.001; h += DURACION_TURNO_HORAS) {
    turnos.push(h)
  }
  return turnos
}

function horaLabel(horaDecimal) {
  const h = Math.floor(horaDecimal)
  const m = Math.round((horaDecimal - h) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function rangoTurno(fechaBase, horaInicioDecimal) {
  const inicio = new Date(fechaBase)
  const hIni = Math.floor(horaInicioDecimal)
  const mIni = Math.round((horaInicioDecimal - hIni) * 60)
  inicio.setHours(hIni, mIni, 0, 0)

  const fin = new Date(inicio)
  fin.setMinutes(fin.getMinutes() + DURACION_TURNO_HORAS * 60)

  return { inicio, fin }
}

function turnoOcupado(reservas, inicio, fin) {
  return reservas.some(r => {
    const rInicio = new Date(r.fecha_inicio)
    const rFin = new Date(r.fecha_fin)
    return rInicio < fin && rFin > inicio
  })
}

const TURNOS_DEL_DIA = generarTurnosDelDia()

// ─── Componente: selector de fecha (7 días desde hoy + navegación) ────────

function SelectorFecha({ fecha, onCambiarFecha }) {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

  const dias = useMemo(() => {
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(hoy)
      d.setDate(d.getDate() + i)
      return d
    })
  }, [hoy])

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
      {dias.map((d) => {
        const iso = isoDeFechaLocal(d)
        const seleccionado = iso === isoDeFechaLocal(fecha)
        const esHoy = iso === isoDeFechaLocal(hoy)
        return (
          <button
            key={iso}
            type="button"
            onClick={() => onCambiarFecha(d)}
            className={`flex-shrink-0 flex flex-col items-center justify-center w-14 h-16 rounded-xl border text-xs font-semibold transition-colors ${
              seleccionado
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <span className="uppercase text-[10px] opacity-80">
              {d.toLocaleDateString('es-AR', { weekday: 'short' })}
            </span>
            <span className="text-base">{d.getDate()}</span>
            {esHoy && <span className="text-[9px] opacity-70">Hoy</span>}
          </button>
        )
      })}
    </div>
  )
}

// ─── Componente: grilla de turnos horarios para el día/cancha elegidos ────

function GrillaTurnos({ reservas, fecha, seleccion, onSeleccionar }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
      {TURNOS_DEL_DIA.map((horaInicio) => {
        const { inicio, fin } = rangoTurno(fecha, horaInicio)
        const esPasado = fin.getTime() <= Date.now()
        const ocupado = turnoOcupado(reservas, inicio, fin)
        const disabled = ocupado || esPasado
        const estaSeleccionado = seleccion?.horaInicio === horaInicio &&
          isoDeFechaLocal(seleccion?.fecha) === isoDeFechaLocal(fecha)

        const clases = estaSeleccionado
          ? 'bg-blue-600 border-blue-600 text-white'
          : disabled
            ? ocupado
              ? 'bg-red-50 border-red-200 text-red-400 cursor-not-allowed'
              : 'bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed'
            : 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100 cursor-pointer'

        return (
          <button
            key={horaInicio}
            type="button"
            disabled={disabled}
            onClick={() => onSeleccionar({ fecha, horaInicio, inicio, fin })}
            className={`rounded-xl border py-3 text-sm font-bold transition-colors flex flex-col items-center gap-0.5 ${clases}`}
          >
            <span>{horaLabel(horaInicio)}</span>
            <span className="text-[10px] font-medium opacity-80">
              {ocupado ? 'Ocupado' : esPasado ? 'Vencido' : 'Libre'}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ─── Tarjeta: calculadora de reparto + reintegro QR ───────────────────────

function CalculadoraReintegro({ precioTotal, numSocios, onCambiarNumSocios }) {
  const parte = precioTotal / numSocios
  const reintegro = parte * PORCENTAJE_REINTEGRO

  return (
    <div className="bg-emerald-900/40 border border-emerald-500/50 rounded-2xl p-5 relative overflow-hidden">
      <div className="absolute top-0 right-0 bg-emerald-600 text-xs font-bold px-3 py-1 rounded-bl-xl text-white tracking-wider flex items-center gap-1">
        <QrCode size={12} /> BENEFICIO QR
      </div>

      <h3 className="font-bold text-emerald-300 text-lg mb-1 flex items-center gap-2">
        <Percent size={18} /> Reintegro por escaneo QR
      </h3>
      <p className="text-sm text-slate-300 leading-relaxed mb-4">
        La reserva se paga completa por transferencia y se reparte entre el grupo.
        Cada socio que se presenta con su QR en la cancha recibe un <strong className="text-white">20% de reintegro sobre su parte</strong>.
      </p>

      <div className="flex items-center gap-3 mb-4">
        <Users size={16} className="text-emerald-300 flex-shrink-0" />
        <label className="text-sm text-slate-300 flex-1">¿Cuántos socios van a jugar?</label>
        <input
          type="number"
          min={1}
          max={30}
          value={numSocios}
          onChange={(e) => onCambiarNumSocios(Math.max(1, Number(e.target.value) || 1))}
          className="w-16 p-2 text-center bg-slate-900 border border-slate-700 rounded-lg text-white font-bold"
        />
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-slate-900/60 rounded-xl p-3">
          <p className="text-[10px] text-slate-400 uppercase mb-1">Total cancha</p>
          <p className="font-bold text-white text-sm">{formatoMoneda.format(precioTotal || 0)}</p>
        </div>
        <div className="bg-slate-900/60 rounded-xl p-3">
          <p className="text-[10px] text-slate-400 uppercase mb-1">Parte c/u</p>
          <p className="font-bold text-white text-sm">{formatoMoneda.format(parte || 0)}</p>
        </div>
        <div className="bg-emerald-950/60 border border-emerald-500/30 rounded-xl p-3">
          <p className="text-[10px] text-emerald-300 uppercase mb-1">Reintegro c/u</p>
          <p className="font-bold text-emerald-300 text-sm">{formatoMoneda.format(reintegro || 0)}</p>
        </div>
      </div>

      <p className="text-[11px] text-slate-400 mt-3">
        El reintegro se acredita al momento de escanear el QR en la puerta: en efectivo, transferencia instantánea o cupón para la tienda del club.
      </p>
    </div>
  )
}

// ─── Página principal ──────────────────────────────────────────────────────

export default function SocioCancha() {
  const { token } = useAuth()
  const { addToCart } = useCart()

  const [canchaKey, setCanchaKey] = useState(CANCHAS[0].key)
  const cancha = CANCHAS.find(c => c.key === canchaKey)

  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const [fecha, setFecha] = useState(hoy)

  const [reservas, setReservas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [producto, setProducto] = useState(null)
  const [productoError, setProductoError] = useState(null)

  const [numSocios, setNumSocios] = useState(10)

  const [seleccion, setSeleccion] = useState(null) // { fecha, horaInicio, inicio, fin }
  const [confirmando, setConfirmando] = useState(false)
  const [confirmError, setConfirmError] = useState(null)
  const [agregado, setAgregado] = useState(false)

  const [refreshKey, setRefreshKey] = useState(0)

  // Trae el precio de la cancha elegida (categoría 'alquiler')
  useEffect(() => {
    if (!token) return
    let cancelado = false
    ;(async () => {
      setProductoError(null)
      try {
        const res = await fetch(`${API}/socio/carrito/productos?categoria=alquiler`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) throw new Error('No se pudieron cargar los precios de la cancha.')
        const data = await res.json()
        const encontrado = data.find(p => p.nombre === cancha.nombreProducto) ?? null
        if (!cancelado) setProducto(encontrado)
        if (!cancelado && !encontrado) setProductoError(`No hay un precio configurado para "${cancha.nombreProducto}". Avisá al club.`)
      } catch (err) {
        if (!cancelado) setProductoError(err.message)
      }
    })()
    return () => { cancelado = true }
  }, [token, canchaKey])

  // Trae la disponibilidad (reservas existentes) de esa cancha
  const fetchDisponibilidad = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ instalacion: canchaKey })
      const res = await fetch(`${API}/socio/reservas/?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('No se pudo cargar la disponibilidad.')
      const data = await res.json()
      setReservas(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token, canchaKey])

  useEffect(() => { fetchDisponibilidad() }, [fetchDisponibilidad, refreshKey])

  const handleSeleccionar = (nuevaSeleccion) => {
    setConfirmError(null)
    setAgregado(false)
    setSeleccion(nuevaSeleccion)
  }

  const handleConfirmar = async () => {
    if (!seleccion || !producto) return
    setConfirmando(true)
    setConfirmError(null)
    try {
      const res = await fetch(`${API}/socio/reservas/pre-reserva`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id_producto: producto.id_producto,
          instalacion: canchaKey,
          fecha_inicio: seleccion.inicio.toISOString(),
          fecha_fin: seleccion.fin.toISOString(),
          notas: `Grupo de ${numSocios} socios (aprox.)`,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? 'No se pudo reservar ese turno.')
      }
      const reserva = await res.json()

      addToCart({
        id: reserva.id_reserva,
        name: `${cancha.label} — ${horaLabel(seleccion.horaInicio)} — ${isoDeFechaLocal(seleccion.fecha)}`,
        price: Number(producto.precio_actual),
        qty: 1,
        categoria: 'alquiler',
        id_producto: producto.id_producto,
        id_reserva: reserva.id_reserva,
      })

      setAgregado(true)
      setSeleccion(null)
      setRefreshKey(k => k + 1)
    } catch (err) {
      setConfirmError(err.message)
    } finally {
      setConfirmando(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 p-4 pb-20 text-slate-100 space-y-6">

      <div className="mb-2">
        <h2 className="text-2xl font-bold text-white tracking-wide flex items-center gap-2">
          <CalendarClock size={22} className="text-slate-400" />
          Reserva de Cancha
        </h2>
        <p className="text-slate-400 text-sm mt-1">
          Elegí cancha, día y horario. El costo se reparte entre el grupo y cada socio con QR recibe su reintegro.
        </p>
      </div>

      {/* Selector de cancha */}
      {CANCHAS.length > 1 && (
        <div className="flex gap-2">
          {CANCHAS.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => { setCanchaKey(c.key); setSeleccion(null) }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-colors ${
                canchaKey === c.key
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {productoError && (
        <div className="flex items-center gap-2 p-4 bg-red-900/30 border border-red-500/40 text-red-300 rounded-xl text-sm">
          <AlertTriangle size={16} className="flex-shrink-0" />
          {productoError}
        </div>
      )}

      {/* Calendario / disponibilidad */}
      <div className="bg-slate-800 rounded-3xl shadow-xl p-5 border border-slate-700/50 space-y-4">
        <SelectorFecha fecha={fecha} onCambiarFecha={(d) => { setFecha(d); setSeleccion(null) }} />

        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-white">
            {fecha.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          {producto && (
            <p className="text-sm font-bold text-blue-400">{formatoMoneda.format(producto.precio_actual)} / turno</p>
          )}
        </div>

        {loading && (
          <div className="flex justify-center py-10">
            <Loader2 className="animate-spin text-slate-500" size={26} />
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-900/30 border border-red-500/40 text-red-300 rounded-xl text-sm text-center">
            {error}
          </div>
        )}

        {!loading && !error && (
          <GrillaTurnos
            reservas={reservas}
            fecha={fecha}
            seleccion={seleccion}
            onSeleccionar={handleSeleccionar}
          />
        )}

        {/* Leyenda */}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1">
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
            <span className="w-2 h-2 rounded-full inline-block bg-green-500" /> Libre
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
            <span className="w-2 h-2 rounded-full inline-block bg-red-500" /> Ocupado
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
            <span className="w-2 h-2 rounded-full inline-block bg-blue-600" /> Seleccionado
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <Lock size={10} /> Turno vencido
          </span>
        </div>
      </div>

      {/* Calculadora de reparto + reintegro */}
      {producto && (
        <CalculadoraReintegro
          precioTotal={Number(producto.precio_actual)}
          numSocios={numSocios}
          onCambiarNumSocios={setNumSocios}
        />
      )}

      {agregado && !seleccion && (
        <div className="flex items-center gap-2 p-4 bg-green-900/30 border border-green-500/40 text-green-300 rounded-2xl text-sm font-medium">
          <CheckCircle2 size={16} className="flex-shrink-0" />
          ¡Turno agregado al carrito! Podés elegir otro o ir a pagar cuando quieras.
        </div>
      )}

      {seleccion && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-3 px-4 sm:px-5 bg-blue-900/30 border border-blue-500/40 rounded-2xl">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-sm text-blue-200">
              <CheckCircle2 size={16} className="text-blue-400 flex-shrink-0" />
              <span>
                {cancha.label} — <strong>{horaLabel(seleccion.horaInicio)}</strong> del <strong>{isoDeFechaLocal(seleccion.fecha)}</strong>
                {producto && (
                  <> — <strong>{formatoMoneda.format(producto.precio_actual)}</strong></>
                )}
              </span>
            </div>
            {confirmError && (
              <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                <AlertTriangle size={12} /> {confirmError}
              </p>
            )}
          </div>
          <button
            onClick={handleConfirmar}
            disabled={confirmando}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-colors flex-shrink-0 disabled:opacity-50"
          >
            {confirmando ? <Loader2 size={16} className="animate-spin" /> : <ShoppingCart size={16} />}
            {confirmando ? 'Reservando…' : 'Agregar al carrito'}
          </button>
        </div>
      )}
    </div>
  )
}