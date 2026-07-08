// frontend/src/pages/Reservas.jsx
/**
 * Página del Módulo de Reservas — ruta `/reservas`.
 *
 * Muestra la disponibilidad del quincho como una grilla mensual (similar al
 * Calendario de Cuotas): un mes completo, con cada día partido en dos
 * franjas fijas — Día y Noche — en vez de una grilla hora por hora. Esto se
 * ajusta al modelo real de uso de la instalación (se alquila por turno, no
 * por hora suelta).
 *
 * El selector de instalación queda para cuando haya más de una (por ahora
 * fija en 'quincho', igual que antes). El botón de confirmar pre-reserva
 * (POST /socio/reservas/pre-reserva) también queda pendiente — acá se deja
 * el turno elegido en estado (`seleccion`), listo para que ese POST lo use.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Loader2,
  Lock,
  CheckCircle2,
  ShoppingCart,
  AlertTriangle,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const formatoMoneda = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

// ─── Configuración de turnos ──────────────────────────────────────────────
// TODO: si en algún momento esto se vuelve configurable por instalación,
// mover a un endpoint / prop en vez de constante fija.
//
// `nombreProducto` tiene que matchear EXACTO el `nombre` del ProductoServicio
// correspondiente (categoria='alquiler') dado de alta en el backend. Si el
// día de mañana se suman tarifas de semana/fin de semana, acá es donde se
// bifurca el mapeo (ej. función en vez de objeto fijo).
const TURNOS = {
  dia: { label: 'Día', horaInicio: 9, horaFin: 19, Icon: Sun, nombreProducto: 'Quincho — Turno Día' },
  noche: { label: 'Noche', horaInicio: 19, horaFin: 24, Icon: Moon, nombreProducto: 'Quincho — Turno Noche' },
}

const NOMBRES_MES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const NOMBRES_DIA_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

// ─── Helpers de fecha (sin desfase UTC) ───────────────────────────────────

function fechaLocal(anio, mes1based, dia) {
  return new Date(anio, mes1based - 1, dia)
}

function isoDeFechaLocal(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function diasEnMes(anio, mes1based) {
  return new Date(anio, mes1based, 0).getDate()
}

/**
 * Convierte el rango horario de un turno, para un día dado, a un par de
 * Date en tiempo local — usado para comparar contra fecha_inicio/fecha_fin
 * de las reservas que devuelve el backend (que vienen en UTC/ISO).
 */
function rangoTurno(anio, mes1based, dia, turnoKey) {
  const { horaInicio, horaFin } = TURNOS[turnoKey]
  const inicio = new Date(anio, mes1based - 1, dia, horaInicio, 0, 0)
  // horaFin puede ser 24 (medianoche del mismo día → 00:00 del día siguiente)
  const fin = new Date(anio, mes1based - 1, dia, 0, 0, 0)
  fin.setHours(horaFin, 0, 0, 0)
  return { inicio, fin }
}

/**
 * Determina si una lista de reservas (fecha_inicio/fecha_fin, ISO strings)
 * se superpone con el rango [inicio, fin) de un turno.
 */
function turnoOcupado(reservas, inicio, fin) {
  return reservas.some(r => {
    const rInicio = new Date(r.fecha_inicio)
    const rFin = new Date(r.fecha_fin)
    return rInicio < fin && rFin > inicio
  })
}

// ─── Componente: celda de turno (Día/Noche) dentro de un día ─────────────

function CeldaTurno({ turnoKey, ocupado, esPasado, seleccionado, onClick }) {
  const { label, Icon } = TURNOS[turnoKey]

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
      className={`flex-1 flex items-center justify-center gap-1 rounded-lg border py-1.5 text-[11px] font-semibold transition-colors ${clases}`}
      title={ocupado ? `${label} — ocupado` : esPasado ? `${label} — no disponible` : `${label} — disponible`}
    >
      <Icon size={11} />
      {label}
    </button>
  )
}

// ─── Componente: celda de día (contiene las dos franjas) ──────────────────

function CeldaDia({ anio, mes1based, dia, nombreDiaSemana, reservas, esHoy, esPasado, seleccion, onSeleccionar }) {
  const estadosTurno = useMemo(() => {
    return Object.keys(TURNOS).reduce((acc, key) => {
      const { inicio, fin } = rangoTurno(anio, mes1based, dia, key)
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
        {Object.keys(TURNOS).map(key => (
          <CeldaTurno
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

// ─── Componente: Calendario Mensual de Disponibilidad ─────────────────────

function CalendarioMensual({ instalacion, token, seleccion, onSeleccionar }) {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

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
      const nombreDiaSemana = NOMBRES_DIA_SEMANA[(fecha.getDay() + 6) % 7] // Lun=0
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
      Object.keys(TURNOS).forEach(key => {
        if (esPasado) return
        const { inicio, fin } = rangoTurno(anioVisto, mesVisto, dia, key)
        if (turnoOcupado(reservas, inicio, fin)) ocupados++
        else libres++
      })
    })
    return { libres, ocupados }
  }, [dias, reservas, anioVisto, mesVisto])

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-5 pt-4 sm:pt-5 pb-4 border-b border-gray-100">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <CalendarClock size={17} className="text-gray-400 flex-shrink-0" />
              Disponibilidad — {instalacion}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Turno <strong className="text-gray-600">Día</strong> ({TURNOS.dia.horaInicio}:00–{TURNOS.dia.horaFin}:00) ·{' '}
              Turno <strong className="text-gray-600">Noche</strong> ({TURNOS.noche.horaInicio}:00–00:00)
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {dias.map(({ dia, nombreDiaSemana, esHoy, esPasado }) => (
              <CeldaDia
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

// ─── Página principal ──────────────────────────────────────────────────────

export default function Reservas() {
  const { token } = useAuth()
  const { addToCart } = useCart()
  const [instalacion] = useState('quincho') // TODO: selector cuando haya más de una instalación
  const [seleccion, setSeleccion] = useState(null) // { fecha, turno, fecha_inicio, fecha_fin }

  // Catálogo de productos 'alquiler' (trae precio + id_producto por turno).
  // Se resuelve por nombre exacto contra TURNOS[key].nombreProducto.
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
        for (const key of Object.keys(TURNOS)) {
          porTurno[key] = data.find(p => p.nombre === TURNOS[key].nombreProducto) ?? null
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
        throw new Error(err.detail ?? 'No se pudo reservar ese turno.')
      }
      const reserva = await res.json() // ReservaInstalacionResponse → trae id_reserva

      addToCart({
        id: reserva.id_reserva, // único por turno reservado, nunca se suma qty entre turnos distintos
        name: `${instalacion} — ${TURNOS[seleccion.turno].label} — ${seleccion.fecha}`,
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
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2 sm:gap-3">
          <CalendarClock size={22} className="text-gray-500 flex-shrink-0" />
          Reservas
        </h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-1">
          Elegí un turno disponible para el <strong>{instalacion}</strong> y agregalo a tu carrito.
        </p>
      </div>

      {productosError && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
          <AlertTriangle size={16} className="flex-shrink-0" />
          {productosError}
        </div>
      )}

      <CalendarioMensual
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
                Turno <strong>{TURNOS[seleccion.turno].label}</strong> del <strong>{seleccion.fecha}</strong>
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
                <AlertTriangle size={12} /> No hay un precio configurado para el turno {TURNOS[seleccion.turno].label}. Avisá al club.
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