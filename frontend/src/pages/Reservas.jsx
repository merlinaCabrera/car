// frontend/src/pages/Reservas.jsx
/**
 * Página del Módulo de Reservas — ruta `/socio/reservas`.
 *
 * Unifica lo que antes eran dos páginas separadas (Reserva de Canchas en
 * `/socio/cancha` y Reserva de Salón/Quincho acá mismo) en una sola pantalla
 * con dos desplegables grandes: Canchas primero, Salón después. `/socio/cancha`
 * quedó como redirect a esta ruta (ver App.jsx).
 *
 * Las dos páginas originales no compartían componente de calendario (cada una
 * definía el suyo) ni podían pegarse tal cual en el mismo scope: usaban los
 * mismos nombres de estado (`seleccion`, `confirmando`, `agregado`, etc). Por
 * eso cada una quedó como su propio subcomponente autónomo
 * (`ReservaCanchaAccordion` / `ReservaSalonAccordion`, cada uno con sus
 * propios hooks) y la página solo controla qué acordeón está abierto.
 */

import { textoError } from '../utils/errores';
import {
  TURNOS_QUINCHO,
  NOMBRES_MES,
  NOMBRES_DIA_SEMANA,
  fechaLocal,
  isoDeFechaLocal,
  diasEnMes,
  indiceDiaSemana,
  rangoTurnoQuincho,
  turnoOcupado,
  CANCHAS,
  DIAS_VISIBLES_SOCIO,
  horaLabel,
  rangoTurnoCancha,
  turnosDeCancha,
} from '../utils/reservas'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../context/useAuth'
import { useCart } from '../context/useCart'
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Sun,
  Moon,
  Loader2,
  Lock,
  CheckCircle2,
  ShoppingCart,
  AlertTriangle,
  Trophy,
  Calendar,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const formatoMoneda = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

/* ════════════════════════════════════════════════════════════════════════
   RESERVA DE CANCHAS
   ════════════════════════════════════════════════════════════════════════ */

const rangoTurnoCanchaFn = rangoTurnoCancha
const TURNOS_DEL_DIA_CANCHA = turnosDeCancha()

// ─── Selector de fecha (DIAS_VISIBLES_SOCIO días desde hoy) ────────────────

function SelectorFechaCancha({ fecha, onCambiarFecha }) {
  const hoy = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const dias = useMemo(() => {
    return Array.from({ length: DIAS_VISIBLES_SOCIO }, (_, i) => {
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

// ─── Grilla de turnos horarios para el día/cancha elegidos ────────────────

function GrillaTurnosCancha({ reservas, fecha, seleccion, onSeleccionar }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
      {TURNOS_DEL_DIA_CANCHA.map((horaInicio) => {
        const { inicio, fin } = rangoTurnoCanchaFn(fecha, horaInicio)
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

// ─── Acordeón: Reserva de Canchas ──────────────────────────────────────────

function ReservaCanchaAccordion() {
  const { token } = useAuth()
  const { addToCart } = useCart()

  const [canchaKey, setCanchaKey] = useState(CANCHAS[0].key)
  const cancha = CANCHAS.find(c => c.key === canchaKey)

  const hoy = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])
  const [fecha, setFecha] = useState(hoy)

  const [reservas, setReservas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [producto, setProducto] = useState(null)
  const [productoError, setProductoError] = useState(null)

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
  }, [token, canchaKey, cancha.nombreProducto])

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
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(textoError(err?.detail, 'No se pudo reservar ese turno.'))
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
    <div className="space-y-4">
      <p className="text-xs sm:text-sm text-gray-500">
        Elegí cancha, día y horario. El costo se reparte entre el grupo y cada socio con QR recibe su reintegro.
      </p>

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
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {productoError && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
          <AlertTriangle size={16} className="flex-shrink-0" />
          {productoError}
        </div>
      )}

      {/* Calendario / disponibilidad */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 sm:p-5 space-y-4">
        <SelectorFechaCancha fecha={fecha} onCambiarFecha={(d) => { setFecha(d); setSeleccion(null) }} />

        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-900">
            {fecha.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          {producto && (
            <p className="text-sm font-bold text-blue-600">{formatoMoneda.format(producto.precio_actual)} / turno</p>
          )}
        </div>

        {loading && (
          <div className="flex justify-center py-10">
            <Loader2 className="animate-spin text-gray-400" size={26} />
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm text-center">
            {error}
          </div>
        )}

        {!loading && !error && (
          <GrillaTurnosCancha
            reservas={reservas}
            fecha={fecha}
            seleccion={seleccion}
            onSeleccionar={handleSeleccionar}
          />
        )}

        {/* Leyenda */}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1">
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-2 h-2 rounded-full inline-block bg-green-500" /> Libre
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-2 h-2 rounded-full inline-block bg-red-500" /> Ocupado
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-2 h-2 rounded-full inline-block bg-blue-600" /> Seleccionado
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
            <Lock size={10} /> Turno vencido
          </span>
        </div>
      </div>

      {agregado && !seleccion && (
        <div className="flex items-center gap-2 p-4 bg-green-50 border border-green-200 text-green-700 rounded-2xl text-sm font-medium">
          <CheckCircle2 size={16} className="flex-shrink-0" />
          ¡Turno agregado al carrito! Podés elegir otro o ir a pagar cuando quieras.
        </div>
      )}

      {seleccion && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-3 px-4 sm:px-5 bg-blue-50 border border-blue-200 rounded-2xl">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-sm text-blue-900">
              <CheckCircle2 size={16} className="text-blue-600 flex-shrink-0" />
              <span>
                {cancha.label} — <strong>{horaLabel(seleccion.horaInicio)}</strong> del <strong>{isoDeFechaLocal(seleccion.fecha)}</strong>
                {producto && (
                  <> — <strong>{formatoMoneda.format(producto.precio_actual)}</strong></>
                )}
              </span>
            </div>
            {confirmError && (
              <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                <AlertTriangle size={12} /> {confirmError}
              </p>
            )}
          </div>
          <button
            onClick={handleConfirmar}
            disabled={confirmando}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-colors flex-shrink-0 disabled:opacity-50"
          >
            {confirmando ? <Loader2 size={16} className="animate-spin" /> : <ShoppingCart size={16} />}
            {confirmando ? 'Reservando…' : 'Agregar al carrito'}
          </button>
        </div>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════
   RESERVA DE SALÓN / QUINCHO
   ════════════════════════════════════════════════════════════════════════ */

const ICONOS_TURNO = { dia: Sun, noche: Moon }

const TURNOS_SALON = Object.fromEntries(
  Object.entries(TURNOS_QUINCHO).map(([key, turno]) => [
    key,
    { ...turno, Icon: ICONOS_TURNO[key] },
  ])
)

const rangoTurnoSalon = rangoTurnoQuincho

// ─── Celda de turno (Día/Noche) dentro de un día ──────────────────────────

function CeldaTurnoSalon({ turnoKey, ocupado, esPasado, seleccionado, onClick }) {
  const { label, Icon } = TURNOS_SALON[turnoKey]

  const disabled = ocupado || esPasado

  const clases = seleccionado
    ? 'bg-blue-600 border-blue-600 text-white'
    : disabled
      ? ocupado
        ? 'bg-red-50 border-red-200 text-red-400 cursor-not-allowed'
        : 'bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed'
      : 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100 cursor-pointer'

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1 rounded-lg border py-2 sm:py-1.5 px-0.5 text-[11px] font-semibold transition-colors ${clases}`}
      title={ocupado ? `${label} — ocupado` : esPasado ? `${label} — no disponible` : `${label} — disponible`}
    >
      <Icon size={11} />
      {label}
    </button>
  )
}

// ─── Celda de día (contiene las dos franjas) ──────────────────────────────

function CeldaDiaSalon({ anio, mes1based, dia, nombreDiaSemana, reservas, esHoy, esPasado, seleccion, onSeleccionar }) {
  const estadosTurno = useMemo(() => {
    return Object.keys(TURNOS_SALON).reduce((acc, key) => {
      const { inicio, fin } = rangoTurnoSalon(anio, mes1based, dia, key)
      acc[key] = {
        ocupado: turnoOcupado(reservas, inicio, fin),
        inicio,
        fin,
      }
      return acc
    }, {})
  }, [anio, mes1based, dia, reservas])

  const fechaISO = isoDeFechaLocal(fechaLocal(anio, mes1based, dia))

  return (
    <div
      className={`
        rounded-xl border p-2 flex flex-col gap-1.5
        ${esHoy ? 'ring-2 ring-blue-400 ring-offset-1' : 'border-gray-200'}
        ${esPasado ? 'bg-gray-50 opacity-60' : 'bg-white'}
      `}
    >
      <div className="flex items-baseline justify-between px-0.5">
        <span className="text-sm font-bold text-gray-800">{dia}</span>
        <span className="text-[10px] text-gray-400 uppercase">{nombreDiaSemana}</span>
      </div>

      <div className="flex gap-1">
        {Object.keys(TURNOS_SALON).map(key => (
          <CeldaTurnoSalon
            key={key}
            turnoKey={key}
            ocupado={estadosTurno[key].ocupado}
            esPasado={esPasado}
            seleccionado={seleccion?.fecha === fechaISO && seleccion?.turno === key}
            onClick={() => onSeleccionar({
              fecha: fechaISO,
              turno: key,
              fecha_inicio: estadosTurno[key].inicio,
              fecha_fin: estadosTurno[key].fin,
            })}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Calendario mensual de disponibilidad del salón ───────────────────────

function CalendarioMensualSalon({ instalacion, token, seleccion, onSeleccionar }) {
  const hoy = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const [anioVisto, setAnioVisto] = useState(hoy.getFullYear())
  const [mesVisto, setMesVisto] = useState(hoy.getMonth() + 1) // 1-based

  const [reservas, setReservas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchDisponibilidad = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const inicioMes = fechaLocal(anioVisto, mesVisto, 1)
      const totalDias = diasEnMes(anioVisto, mesVisto)
      const finMes = fechaLocal(anioVisto, mesVisto, totalDias)

      // El endpoint filtra por día individual, así que pedimos todas las
      // reservas futuras de la instalación y filtramos el mes en el cliente
      // (más simple que N requests, uno por día).
      const params = new URLSearchParams({ instalacion })
      const res = await fetch(`${API}/socio/reservas/?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('No se pudo cargar la disponibilidad.')
      const data = await res.json()

      const finMesExclusivo = new Date(finMes)
      finMesExclusivo.setDate(finMesExclusivo.getDate() + 1)

      const delMes = data.filter(r => {
        const rInicio = new Date(r.fecha_inicio)
        const rFin = new Date(r.fecha_fin)
        return rInicio < finMesExclusivo && rFin > inicioMes
      })
      setReservas(delMes)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token, instalacion, anioVisto, mesVisto])

  useEffect(() => { fetchDisponibilidad() }, [fetchDisponibilidad])

  const cambiarMes = (delta) => {
    let m = mesVisto + delta
    let a = anioVisto
    if (m < 1) { m = 12; a -= 1 }
    if (m > 12) { m = 1; a += 1 }
    setMesVisto(m)
    setAnioVisto(a)
  }

  const noPuedeRetroceder = anioVisto === hoy.getFullYear() && mesVisto === hoy.getMonth() + 1

  const dias = useMemo(() => {
    const total = diasEnMes(anioVisto, mesVisto)
    return Array.from({ length: total }, (_, i) => {
      const dia = i + 1
      const fecha = fechaLocal(anioVisto, mesVisto, dia)
      const nombreDiaSemana = NOMBRES_DIA_SEMANA[indiceDiaSemana(fecha)]
      return {
        dia,
        nombreDiaSemana,
        esHoy: fecha.getTime() === hoy.getTime(),
        esPasado: fecha.getTime() < hoy.getTime(),
      }
    })
  }, [anioVisto, mesVisto, hoy])

  // Resumen de turnos libres en el mes visible
  const resumen = useMemo(() => {
    let libres = 0
    let ocupados = 0
    dias.forEach(({ dia, esPasado }) => {
      Object.keys(TURNOS_SALON).forEach(key => {
        if (esPasado) return
        const { inicio, fin } = rangoTurnoSalon(anioVisto, mesVisto, dia, key)
        if (turnoOcupado(reservas, inicio, fin)) ocupados++
        else libres++
      })
    })
    return { libres, ocupados }
  }, [dias, reservas, anioVisto, mesVisto])

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-5 pt-4 sm:pt-5 pb-4 border-b border-gray-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <CalendarClock size={17} className="text-gray-400 flex-shrink-0" />
              Disponibilidad — {instalacion}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Turno <strong className="text-gray-600">Día</strong> ({TURNOS_SALON.dia.horaInicio}:00–{TURNOS_SALON.dia.horaFin}:00) ·{' '}
              Turno <strong className="text-gray-600">Noche</strong> ({TURNOS_SALON.noche.horaInicio}:00–00:00)
            </p>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-1 flex-shrink-0">
            <button
              onClick={() => cambiarMes(-1)}
              disabled={noPuedeRetroceder}
              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition-colors flex-shrink-0"
              aria-label="Mes anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm sm:text-base font-bold text-gray-900 w-28 sm:w-32 text-center">
              {NOMBRES_MES[mesVisto - 1]} {anioVisto}
            </span>
            <button
              onClick={() => cambiarMes(1)}
              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors flex-shrink-0"
              aria-label="Mes siguiente"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {!loading && !error && (
          <div className="flex flex-wrap gap-2 sm:gap-3 mt-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700">
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
              {resumen.libres} turno{resumen.libres !== 1 ? 's' : ''} libre{resumen.libres !== 1 ? 's' : ''}
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600">
              <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
              {resumen.ocupados} ocupado{resumen.ocupados !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      {/* Cuerpo */}
      <div className="p-3 sm:p-4">
        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin text-gray-400" size={28} />
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm text-center">
            {error}
          </div>
        )}

        {!loading && !error && (
          <div className="grid grid-cols-2 min-[440px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
            {dias.map(({ dia, nombreDiaSemana, esHoy, esPasado }) => (
              <CeldaDiaSalon
                key={dia}
                anio={anioVisto}
                mes1based={mesVisto}
                dia={dia}
                nombreDiaSemana={nombreDiaSemana}
                reservas={reservas}
                esHoy={esHoy}
                esPasado={esPasado}
                seleccion={seleccion}
                onSeleccionar={onSeleccionar}
              />
            ))}
          </div>
        )}
      </div>

      {/* Leyenda */}
      <div className="px-4 sm:px-5 pb-4 flex flex-wrap gap-x-4 gap-y-1.5">
        <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-2 h-2 rounded-full inline-block bg-green-500" />
          Disponible
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-2 h-2 rounded-full inline-block bg-red-500" />
          Ocupado
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-2 h-2 rounded-full inline-block bg-blue-600" />
          Seleccionado
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
          <Lock size={10} />
          Fecha pasada
        </span>
      </div>
    </div>
  )
}

// ─── Acordeón: Reserva de Salón ────────────────────────────────────────────

function ReservaSalonAccordion() {
  const { token } = useAuth()
  const { addToCart } = useCart()
  const [instalacion] = useState('quincho') // TODO: selector cuando haya más de una instalación
  const [seleccion, setSeleccion] = useState(null) // { fecha, turno, fecha_inicio, fecha_fin }

  // Catálogo de productos 'alquiler' (trae precio + id_producto por turno).
  // Se resuelve por nombre exacto contra TURNOS_SALON[key].nombreProducto.
  const [productos, setProductos] = useState({}) // { dia: ProductoServicioResponse, noche: ... }
  const [productosError, setProductosError] = useState(null)

  const [confirmando, setConfirmando] = useState(false)
  const [confirmError, setConfirmError] = useState(null)
  const [agregado, setAgregado] = useState(false)

  // Fuerza al calendario a re-fetchear disponibilidad después de una
  // pre-reserva exitosa (el turno recién bloqueado tiene que pintarse ocupado).
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!token) return
    let cancelado = false
    ;(async () => {
      try {
        const res = await fetch(`${API}/socio/carrito/productos?categoria=alquiler`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) throw new Error('No se pudieron cargar los precios del alquiler.')
        const data = await res.json()
        const porTurno = {}
        for (const key of Object.keys(TURNOS_SALON)) {
          porTurno[key] = data.find(p => p.nombre === TURNOS_SALON[key].nombreProducto) ?? null
        }
        if (!cancelado) setProductos(porTurno)
      } catch (err) {
        if (!cancelado) setProductosError(err.message)
      }
    })()
    return () => { cancelado = true }
  }, [token])

  const productoSeleccion = seleccion ? productos[seleccion.turno] : null
  const faltaProducto = seleccion && productos[seleccion.turno] === null

  const handleSeleccionar = (nuevaSeleccion) => {
    setConfirmError(null)
    setAgregado(false)
    setSeleccion(nuevaSeleccion)
  }

  const handleConfirmar = async () => {
    if (!seleccion || !productoSeleccion) return
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
          id_producto: productoSeleccion.id_producto,
          instalacion,
          fecha_inicio: seleccion.fecha_inicio.toISOString(),
          fecha_fin: seleccion.fecha_fin.toISOString(),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(textoError(err?.detail, 'No se pudo reservar ese turno.'))
      }
      const reserva = await res.json() // ReservaInstalacionResponse → trae id_reserva

      addToCart({
        id: reserva.id_reserva, // único por turno reservado, nunca se suma qty entre turnos distintos
        name: `${instalacion} — ${TURNOS_SALON[seleccion.turno].label} — ${seleccion.fecha}`,
        price: Number(productoSeleccion.precio_actual),
        qty: 1,
        categoria: 'alquiler',
        id_producto: productoSeleccion.id_producto,
        id_reserva: reserva.id_reserva,
      })

      setAgregado(true)
      setSeleccion(null)
      setRefreshKey(k => k + 1) // repinta el calendario: ese turno ahora está ocupado
    } catch (err) {
      setConfirmError(err.message)
    } finally {
      setConfirmando(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs sm:text-sm text-gray-500">
        Elegí un turno disponible para el <strong>{instalacion}</strong> y agregalo a tu carrito.
      </p>

      {productosError && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
          <AlertTriangle size={16} className="flex-shrink-0" />
          {productosError}
        </div>
      )}

      <CalendarioMensualSalon
        key={refreshKey}
        instalacion={instalacion}
        token={token}
        seleccion={seleccion}
        onSeleccionar={handleSeleccionar}
      />

      {agregado && !seleccion && (
        <div className="flex items-center gap-2 p-4 bg-green-50 border border-green-200 text-green-700 rounded-2xl text-sm font-medium">
          <CheckCircle2 size={16} className="flex-shrink-0" />
          ¡Turno agregado al carrito! Podés elegir otro o ir a pagar cuando quieras.
        </div>
      )}

      {seleccion && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-3 px-4 sm:px-5 bg-blue-50 border border-blue-200 rounded-2xl">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-sm text-blue-900">
              <CheckCircle2 size={16} className="text-blue-600 flex-shrink-0" />
              <span>
                Turno <strong>{TURNOS_SALON[seleccion.turno].label}</strong> del <strong>{seleccion.fecha}</strong>
                {productoSeleccion && (
                  <> — <strong>{formatoMoneda.format(productoSeleccion.precio_actual)}</strong></>
                )}
              </span>
            </div>
            {confirmError && (
              <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                <AlertTriangle size={12} /> {confirmError}
              </p>
            )}
            {faltaProducto && (
              <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                <AlertTriangle size={12} /> No hay un precio configurado para el turno {TURNOS_SALON[seleccion.turno].label}. Avisá al club.
              </p>
            )}
          </div>
          <button
            onClick={handleConfirmar}
            disabled={confirmando || faltaProducto}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-colors flex-shrink-0 disabled:opacity-50"
          >
            {confirmando ? <Loader2 size={16} className="animate-spin" /> : <ShoppingCart size={16} />}
            {confirmando ? 'Reservando…' : 'Agregar al carrito'}
          </button>
        </div>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════
   PÁGINA: dos acordeones — Canchas primero, Salón después
   ════════════════════════════════════════════════════════════════════════ */

function AccordionSeccion({ titulo, subtitulo, Icon, abierto, onToggle, children }) {
  return (
    <div className="bg-gray-50 rounded-2xl border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-4 text-left hover:bg-gray-100/60 transition-colors"
      >
        <span className="flex items-center gap-2.5">
          <Icon size={19} className="text-gray-500 flex-shrink-0" />
          <span>
            <span className="block text-sm sm:text-base font-bold text-gray-900">{titulo}</span>
            <span className="block text-xs text-gray-500">{subtitulo}</span>
          </span>
        </span>
        <ChevronDown
          size={18}
          className={`text-gray-400 flex-shrink-0 transition-transform ${abierto ? 'rotate-180' : ''}`}
        />
      </button>
      {abierto && (
        <div className="px-4 sm:px-5 pb-5 pt-1">
          {children}
        </div>
      )}
    </div>
  )
}

export default function Reservas() {
  const [seccionAbierta, setSeccionAbierta] = useState('cancha')

  const toggle = (key) =>
    setSeccionAbierta(prev => (prev === key ? null : key))

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5 sm:space-y-6">
      <div className="anim-entrada">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2 sm:gap-3">
          <CalendarClock size={22} className="text-gray-500 flex-shrink-0" />
          Reservas
        </h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-1">
          Reservá cancha o salón y agregalo a tu carrito.
        </p>
      </div>

      <div className="anim-entrada anim-d1 space-y-3">
        <AccordionSeccion
          titulo="Reserva de Canchas"
          subtitulo="Turnos horarios de 1.5 hs"
          Icon={Trophy}
          abierto={seccionAbierta === 'cancha'}
          onToggle={() => toggle('cancha')}
        >
          <ReservaCanchaAccordion />
        </AccordionSeccion>

        <AccordionSeccion
          titulo="Reserva de Salón"
          subtitulo="Quincho — turnos Día y Noche"
          Icon={Calendar}
          abierto={seccionAbierta === 'salon'}
          onToggle={() => toggle('salon')}
        >
          <ReservaSalonAccordion />
        </AccordionSeccion>
      </div>
    </div>
  )
}
