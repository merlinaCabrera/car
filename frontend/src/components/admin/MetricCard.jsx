// frontend/src/components/admin/MetricCard.jsx
/**
 * Card genérica del Panel de Control admin.
 *
 * Reemplaza al `TareaCard` que vivía embebido en AdminInicio.jsx, con dos
 * modos de contenido:
 *
 *   1. Modo contador (el original): pasás `valor` y se muestra grande,
 *      igual que antes ("3 pendientes", "0", etc).
 *   2. Modo custom: pasás `children` y renderiza lo que necesites en vez
 *      del número — usado para "Ingresos del mes" (formateado en $) y
 *      "Próximos eventos" (una mini-lista), que no encajan en "un número
 *      grande + descripción".
 *
 * Loading/error states son compartidos por ambos modos.
 */

import { useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowRight, Clock } from 'lucide-react'

export default function MetricCard({
  icon: Icon,
  iconColor = 'bg-gray-100 text-gray-600',
  titulo,
  descripcion,
  valor,
  children,
  loading,
  error,
  ctaLabel,
  ctaPath,
  proximamente = false,
  span = false, // ocupa 2 columnas en la grilla (para contenido más rico)
}) {
  const navigate = useNavigate()

  return (
    <div
      className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-4 ${
        span ? 'md:col-span-2' : ''
      }`}
    >
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

      <div className="flex-1">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">{titulo}</h3>

        {/* Estado: cargando */}
        {loading && (
          <div className="h-9 w-24 bg-gray-200 rounded-md animate-pulse mt-2" />
        )}

        {/* Estado: error */}
        {!loading && error && (
          <div className="mt-2 flex items-center gap-2 text-red-600">
            <AlertCircle size={14} className="flex-shrink-0" />
            <span className="text-xs">Error al cargar</span>
          </div>
        )}

        {/* Estado: contenido custom (children) */}
        {!loading && !error && children !== undefined && (
          <div className="mt-2">{children}</div>
        )}

        {/* Estado: contador numérico (modo original) */}
        {!loading && !error && children === undefined && (
          <p className={`text-3xl font-bold mt-1 ${valor > 0 ? 'text-blue-600' : 'text-gray-900'}`}>
            {valor}
          </p>
        )}

        {descripcion && <p className="text-sm text-gray-400 mt-1">{descripcion}</p>}
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