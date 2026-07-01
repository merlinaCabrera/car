// frontend/src/pages/SocioInicio.jsx
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import SocioQR from './SocioQR' // Importación correcta
import {
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

  useEffect(() => {
    const fetchPerfil = async () => {
      try {
        const res = await fetch(`${API}/usuarios/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) setPerfil(await res.json())
      } catch {} finally {
        setLoading(false)
      }
    }
    if (token) fetchPerfil()
    else setLoading(false)
  }, [token])

  const esMoroso      = (perfil?.deuda_historica_meses ?? 0) > 0
  const mesesDeuda    = perfil?.deuda_historica_meses ?? 0
  const nombreCorto   = perfil?.nombre?.split(' ')[0] ?? 'Socio'

  if (loading) {
    return <div className="p-6 max-w-4xl mx-auto space-y-5"><CardSkeleton className="h-40" /></div>
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">¡Hola, {nombreCorto}! 👋</h1>
        <p className="text-gray-500 text-sm mt-1">Bienvenido a tu portal personal.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Estado Financiero */}
        <div className={`rounded-2xl p-6 border-2 flex flex-col justify-between min-h-[200px] ${esMoroso ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Estado Financiero</span>
            {esMoroso ? <AlertTriangle size={20} className="text-red-500" /> : <CheckCircle size={20} className="text-green-600" />}
          </div>
          <div>
            <p className={`text-4xl font-extrabold tracking-tight mt-3 ${esMoroso ? 'text-red-700' : 'text-green-700'}`}>
              {esMoroso ? 'MOROSO' : 'AL DÍA'}
            </p>
          </div>
          <Link to="/cuotas" className="mt-4 text-sm font-semibold underline">
            {esMoroso ? 'Regularizar cuotas' : 'Ver detalle'}
          </Link>
        </div>

        {/* QR de Acceso */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col items-center justify-center min-h-[200px]">
          <div className="w-full mb-4 flex justify-between items-center">
             <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Mi QR</span>
          </div>
          <div className="scale-[0.6] origin-center -my-10">
             <SocioQR />
          </div>
        </div>
      </div>

      {/* Accesos rápidos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <AccesoRapido icon={CreditCard} label="Mis Cuotas" to="/cuotas" colorClasses="border-blue-200 bg-blue-50" />
        <AccesoRapido icon={ShoppingBag} label="Tienda" to="/shopping" colorClasses="border-violet-200 bg-violet-50" />
      </div>
    </div>
  )
}