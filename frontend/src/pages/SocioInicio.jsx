// frontend/src/pages/SocioInicio.jsx
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  QrCode,
  CheckCircle,
  AlertTriangle,
  CreditCard,
  ShoppingBag,
  Home,
  Calendar,
  ChevronRight,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function AccesoRapido({ icon: Icon, label, descripcion, to, colorClasses }) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all
                  hover:scale-[1.02] hover:shadow-sm group ${colorClasses}`}
    >
      <div className="p-2.5 rounded-xl bg-white/60">
        <Icon size={22} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">{label}</p>
        <p className="text-xs opacity-70 mt-0.5 truncate">{descripcion}</p>
      </div>
      <ChevronRight size={16} className="opacity-40 group-hover:opacity-70 transition-opacity" />
    </Link>
  )
}

function CardSkeleton({ className = '' }) {
  return (
    <div className={`rounded-2xl bg-gray-100 animate-pulse ${className}`} />
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function SocioInicio() {
  const { token } = useAuth()

  const [perfil, setPerfil]   = useState(null)
  const [loading, setLoading] = useState(true)

  // Fetch del perfil completo desde el backend
  useEffect(() => {
    const fetchPerfil = async () => {
      try {
        const res = await fetch(`${API}/usuarios/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) setPerfil(await res.json())
      } catch {
        // Si falla, mostramos lo que tengamos del AuthContext
      } finally {
        setLoading(false)
      }
    }
    if (token) fetchPerfil()
    else setLoading(false)
  }, [token])

  // Lógica de estado financiero
  const esMoroso      = (perfil?.deuda_historica_meses ?? 0) > 0
  const mesesDeuda    = perfil?.deuda_historica_meses ?? 0
  const nombreCorto   = perfil?.nombre?.split(' ')[0] ?? 'Socio'

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-5">
        <CardSkeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <CardSkeleton className="h-52" />
          <CardSkeleton className="h-52" />
        </div>
        <CardSkeleton className="h-8 w-36" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <CardSkeleton key={i} className="h-24" />)}
        </div>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">

      {/* Saludo */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          ¡Hola, {nombreCorto}! 👋
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Bienvenido a tu portal personal. Acá encontrás todo lo del club.
        </p>
      </div>

      {/* Tarjetas principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* ── Estado Financiero ──────────────────────────────────────────── */}
        <div
          className={`rounded-2xl p-6 border-2 flex flex-col justify-between min-h-[200px]
            ${esMoroso
              ? 'bg-red-50 border-red-200'
              : 'bg-green-50 border-green-200'
            }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">
              Estado Financiero
            </span>
            {esMoroso
              ? <AlertTriangle size={20} className="text-red-500" />
              : <CheckCircle    size={20} className="text-green-600" />
            }
          </div>

          <div>
            <p className={`text-4xl font-extrabold tracking-tight mt-3 ${
              esMoroso ? 'text-red-700' : 'text-green-700'
            }`}>
              {esMoroso ? 'MOROSO' : 'AL DÍA'}
            </p>

            <div className="mt-2 space-y-0.5">
              {esMoroso ? (
                <p className="text-sm text-red-600 font-medium">
                  Tenés {mesesDeuda} mes{mesesDeuda !== 1 ? 'es' : ''} sin abonar.
                </p>
              ) : perfil?.mes_cubierto_hasta ? (
                <p className="text-sm text-green-700">
                  Cubierto hasta:{' '}
                  <span className="font-semibold">
                    {new Date(perfil.mes_cubierto_hasta + 'T00:00:00').toLocaleDateString('es-AR', {
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>
                </p>
              ) : (
                <p className="text-sm text-green-700">Sin deuda registrada.</p>
              )}
            </div>
          </div>

          <Link
            to="/cuotas"
            className={`mt-4 inline-flex items-center gap-1.5 text-sm font-semibold
              ${esMoroso ? 'text-red-700 hover:text-red-900' : 'text-green-700 hover:text-green-900'}
              underline underline-offset-2 transition-colors`}
          >
            <CreditCard size={14} />
            {esMoroso ? 'Regularizar cuotas' : 'Ver detalle de cuotas'}
          </Link>
        </div>

        {/* ── QR de Acceso ───────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col items-center justify-between min-h-[200px]">
          <div className="w-full flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">
              Mi QR de Acceso
            </span>
            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold
              ${esMoroso
                ? 'bg-red-100 text-red-700'
                : 'bg-green-100 text-green-700'
              }`}>
              {esMoroso ? 'No habilitado' : 'Habilitado'}
            </span>
          </div>

          {/* Placeholder del QR */}
          <div className={`my-3 w-40 h-40 rounded-2xl flex flex-col items-center justify-center gap-2
            border-4 border-dashed transition-colors
            ${esMoroso
              ? 'border-red-200 text-red-300'
              : 'border-gray-200 text-gray-300'
            }`}>
            <QrCode size={68} strokeWidth={1} />
            <p className="text-xs text-center px-4 leading-snug">
              {esMoroso
                ? 'Regularizá tu cuenta para activar el QR'
                : 'QR dinámico — próximamente'
              }
            </p>
          </div>

          <p className="text-xs text-gray-400 text-center max-w-[200px]">
            Mostrá este código al ingresar al club.
          </p>
        </div>
      </div>

      {/* Accesos rápidos */}
      <div>
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
          Accesos Rápidos
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <AccesoRapido
            icon={CreditCard}
            label="Mis Cuotas"
            descripcion="Pagá o adelantá meses"
            to="/cuotas"
            colorClasses="border-blue-200 bg-blue-50/80 text-blue-800 hover:border-blue-400"
          />
          <AccesoRapido
            icon={ShoppingBag}
            label="Tienda Oficial"
            descripcion="Camisetas, buzos y más"
            to="/shopping"
            colorClasses="border-violet-200 bg-violet-50/80 text-violet-800 hover:border-violet-400"
          />
          <AccesoRapido
            icon={Home}
            label="Alquileres"
            descripcion="Quincho y canchas"
            to="/alquileres"
            colorClasses="border-amber-200 bg-amber-50/80 text-amber-800 hover:border-amber-400"
          />
          <AccesoRapido
            icon={Calendar}
            label="Mi Equipo"
            descripcion="Partidos y convocatorias"
            to="/mi-equipo"
            colorClasses="border-emerald-200 bg-emerald-50/80 text-emerald-800 hover:border-emerald-400"
          />
        </div>
      </div>
    </div>
  )
}