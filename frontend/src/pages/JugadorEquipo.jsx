// frontend/src/pages/JugadorEquipo.jsx
/**
 * Mi Equipo — ruta `/mi-equipo`.
 *
 * Complementa a JugadorCalendario (que responde "¿cuándo juego y estoy
 * citado?"): esta página responde "¿quién es mi equipo?" — plantel de
 * compañeros, capitán, y presentismo agregado del jugador. Deliberadamente
 * NO repite la grilla de partidos/citaciones evento por evento; para eso
 * está el calendario. Como mucho muestra un resumen del próximo evento.
 *
 * Si el jugador está inscripto en más de una categoría (ej. juega en Sub-17
 * y también entrena con Primera), se listan todas con un tab selector.
 *
 * Backend consumido:
 *   GET /deportivo/mi-equipo
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  Users,
  Shield,
  Crown,
  CalendarDays,
  MapPin,
  RefreshCw,
  AlertCircle,
  Trophy,
  Dumbbell,
  Building2,
  CheckCircle2,
  XCircle,
  TrendingUp,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

// ─── Config ───────────────────────────────────────────────────────────────────

const TIPO_CONFIG = {
  partido:       { label: 'Partido',       icon: Trophy,       classes: 'bg-emerald-100 text-emerald-800' },
  entrenamiento: { label: 'Entrenamiento', icon: Dumbbell,     classes: 'bg-blue-100 text-blue-800'      },
  torneo:        { label: 'Torneo',        icon: Trophy,       classes: 'bg-purple-100 text-purple-800'  },
  institucional: { label: 'Institucional', icon: Building2,    classes: 'bg-gray-100 text-gray-700'      },
  otro:          { label: 'Evento',        icon: CalendarDays, classes: 'bg-gray-100 text-gray-700'      },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatoFechaLarga = (fecha) =>
  fecha.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })

const formatoHora = (fecha) =>
  fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

const iniciales = (nombre, apellido) =>
  `${nombre?.[0] ?? ''}${apellido?.[0] ?? ''}`.toUpperCase()

// foto_perfil_url puede venir como URL absoluta (ej. subida a un storage externo)
// o como path relativo servido por el propio backend (ej. "/static/fotos/123.jpg").
const resolverFotoUrl = (foto) => {
  if (!foto) return null
  if (/^https?:\/\//i.test(foto)) return foto
  return `${API}${foto.startsWith('/') ? '' : '/'}${foto}`
}

// Color determinístico para el avatar, en base al id (así cada compañero
// tiene siempre el mismo color entre renders/recargas).
const COLORES_AVATAR = [
  'bg-blue-100 text-blue-700',
  'bg-purple-100 text-purple-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-teal-100 text-teal-700',
  'bg-indigo-100 text-indigo-700',
]
const colorAvatar = (id) => COLORES_AVATAR[id % COLORES_AVATAR.length]

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function TipoBadge({ tipo }) {
  const config = TIPO_CONFIG[tipo] ?? TIPO_CONFIG.otro
  const Icon = config.icon
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${config.classes}`}>
      <Icon size={12} /> {config.label}
    </span>
  )
}

function CategoriaTabs({ equipos, activa, onChange }) {
  if (equipos.length < 2) return null
  return (
    <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 overflow-x-auto">
      {equipos.map(eq => (
        <button
          key={eq.id_categoria}
          onClick={() => onChange(eq.id_categoria)}
          className={`flex-shrink-0 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
            activa === eq.id_categoria ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {eq.categoria?.nombre ?? `Categoría ${eq.id_categoria}`}
        </button>
      ))}
    </div>
  )
}

function ProximoEventoCard({ evento }) {
  if (!evento) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center text-sm text-gray-500">
        No hay eventos programados para esta categoría por ahora.
      </div>
    )
  }
  const fecha = new Date(evento.fecha_inicio)
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <TipoBadge tipo={evento.tipo} />
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Próximo evento</span>
      </div>
      <h3 className="font-bold text-gray-900">{evento.titulo}</h3>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-gray-600">
        <span className="flex items-center gap-1.5 font-medium">
          <CalendarDays size={15} className="text-gray-400" />
          {formatoFechaLarga(fecha)} · {formatoHora(fecha)}
        </span>
        {evento.ubicacion && (
          <span className="flex items-center gap-1.5">
            <MapPin size={15} className="text-gray-400" />
            {evento.ubicacion}
          </span>
        )}
      </div>
      <a
        href="/calendario-deportivo"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-800"
      >
        Ver en el calendario →
      </a>
    </div>
  )
}

function PresentismoCard({ presentes, ausentes, total, porcentaje }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-500 flex items-center gap-2">
          <TrendingUp size={16} className="text-gray-400" />
          Tu presentismo
        </h3>
        {porcentaje !== null && (
          <span className="text-2xl font-bold text-gray-900">{porcentaje}%</span>
        )}
      </div>

      {total === 0 ? (
        <p className="text-sm text-gray-500">
          Todavía no hay convocatorias cerradas en esta categoría para calcular tu presentismo.
        </p>
      ) : (
        <>
          <div className="w-full h-2.5 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${porcentaje}%` }}
            />
          </div>
          <div className="flex items-center gap-5 text-sm">
            <span className="flex items-center gap-1.5 text-gray-600">
              <CheckCircle2 size={15} className="text-emerald-600" />
              {presentes} presente{presentes !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1.5 text-gray-600">
              <XCircle size={15} className="text-red-500" />
              {ausentes} ausente{ausentes !== 1 ? 's' : ''}
            </span>
            <span className="text-gray-400">· {total} en total</span>
          </div>
        </>
      )}
    </div>
  )
}

function CompaneroCard({ companero, esVos }) {
  const usuario = companero.usuario
  if (!usuario) return null
  const anio = usuario.fecha_nacimiento
    ? new Date(usuario.fecha_nacimiento + 'T00:00:00').getFullYear()
    : null
  const fotoUrl = resolverFotoUrl(usuario.foto_perfil_url)

  return (
    <div
      className={`flex-shrink-0 w-40 snap-start rounded-2xl overflow-hidden border shadow-sm bg-white ${
        esVos ? 'border-blue-300 ring-2 ring-blue-100' : 'border-gray-100'
      }`}
    >
      <div className={`relative w-40 h-40 flex items-center justify-center overflow-hidden ${colorAvatar(companero.id_usuario)}`}>
        {fotoUrl ? (
          <img
            src={fotoUrl}
            alt={`${usuario.nombre} ${usuario.apellido}`}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <span className="text-4xl font-bold">{iniciales(usuario.nombre, usuario.apellido)}</span>
        )}

        {companero.es_capitan && (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 shadow-sm">
            <Crown size={10} /> Capitán
          </span>
        )}
        {esVos && (
          <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-600 text-white shadow-sm">
            Vos
          </span>
        )}
      </div>
      <div className="p-3">
        <div className="font-semibold text-gray-900 text-sm leading-tight truncate" title={`${usuario.apellido}, ${usuario.nombre}`}>
          {usuario.apellido}
        </div>
        <div className="text-sm text-gray-600 truncate">{usuario.nombre}</div>
        {anio && <div className="text-xs text-gray-400 mt-1">{anio}</div>}
      </div>
    </div>
  )
}

function PlantelCarousel({ companeros, idUsuarioActual }) {
  // Ordena para que "vos" y el/la capitán aparezcan primero — son los más
  // relevantes al abrir la página, sin perder el resto del scroll horizontal.
  const ordenados = useMemo(() => {
    return [...companeros].sort((a, b) => {
      const prioridad = (c) => (c.id_usuario === idUsuarioActual ? 0 : c.es_capitan ? 1 : 2)
      return prioridad(a) - prioridad(b)
    })
  }, [companeros, idUsuarioActual])

  return (
    <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-1 px-1">
      {ordenados.map(c => (
        <CompaneroCard
          key={c.id_usuario}
          companero={c}
          esVos={c.id_usuario === idUsuarioActual}
        />
      ))}
    </div>
  )
}


// ─── Componente Principal ──────────────────────────────────────────────────────

export default function JugadorEquipo() {
  const { user, token } = useAuth()

  const [equipos, setEquipos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [categoriaActiva, setCategoriaActiva] = useState(null)

  const fetchEquipo = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/deportivo/mi-equipo`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`Error ${res.status}: No se pudo cargar tu equipo.`)
      const data = await res.json()
      setEquipos(data)
      // Mantiene la categoría seleccionada si sigue existiendo; si no, toma la primera.
      setCategoriaActiva(prev => {
        if (prev && data.some(eq => eq.id_categoria === prev)) return prev
        return data[0]?.id_categoria ?? null
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { fetchEquipo() }, [fetchEquipo])

  const equipo = useMemo(
    () => equipos.find(eq => eq.id_categoria === categoriaActiva) ?? null,
    [equipos, categoriaActiva]
  )

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Shield size={24} className="text-gray-500" />
            Mi Equipo
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Tu plantel, tu capitán y tu presentismo en la temporada.
          </p>
        </div>
        <button
          onClick={fetchEquipo}
          disabled={loading}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 transition-colors"
          title="Actualizar"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle size={18} className="flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={fetchEquipo} className="underline underline-offset-2 font-medium hover:text-red-900">
            Reintentar
          </button>
        </div>
      )}

      {loading && (
        <div className="space-y-4">
          <div className="h-10 bg-gray-100 rounded-xl animate-pulse w-64" />
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm h-40 animate-pulse" />
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm h-64 animate-pulse" />
        </div>
      )}

      {!loading && !error && equipos.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center space-y-2">
          <Users size={32} className="mx-auto text-gray-300" />
          <p className="text-gray-500 text-sm">
            Todavía no estás inscripto en el plantel de ninguna categoría.
          </p>
          <p className="text-gray-400 text-xs">
            Hablá con tu técnico para que te sume a tu categoría deportiva.
          </p>
        </div>
      )}

      {!loading && !error && equipo && (
        <>
          <CategoriaTabs equipos={equipos} activa={categoriaActiva} onChange={setCategoriaActiva} />

          {/* Encabezado de la categoría */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-bold text-gray-800">{equipo.categoria?.nombre}</h2>
              {equipo.categoria?.descripcion && (
                <p className="text-sm text-gray-500">{equipo.categoria.descripcion}</p>
              )}
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
              <Users size={13} /> {equipo.total_jugadores} jugador{equipo.total_jugadores !== 1 ? 'es' : ''}
            </span>
          </div>

          {/* Resumen: próximo evento + presentismo */}
          <div className="grid sm:grid-cols-2 gap-4">
            <ProximoEventoCard evento={equipo.proxima_convocatoria} />
            <PresentismoCard
              presentes={equipo.asistencia_presentes}
              ausentes={equipo.asistencia_ausentes}
              total={equipo.asistencia_total}
              porcentaje={equipo.asistencia_porcentaje}
            />
          </div>

          {/* Plantel */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-800">Plantel</h2>
            <PlantelCarousel companeros={equipo.companeros} idUsuarioActual={user?.id_usuario} />
          </section>
        </>
      )}
    </div>
  )
}