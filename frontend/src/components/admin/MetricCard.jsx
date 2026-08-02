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
  span = false,       // ocupa 2 columnas en la grilla (para contenido más rico)
  compacto = false,    // en mobile: sin descripción ni botón de texto, tile de ícono+número+título
}) {
  const navigate = useNavigate()

  const irAlDestino = () => {
    if (ctaPath && !loading) navigate(ctaPath)
  }

  return (
    <div
      onClick={compacto ? irAlDestino : undefined}
      className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-3 sm:p-6 flex flex-col gap-2 sm:gap-4 ${
        span ? 'md:col-span-2' : ''
      } ${compacto && ctaPath ? 'cursor-pointer active:bg-gray-50 sm:cursor-default sm:active:bg-white' : ''}`}
    >
      <div className="flex items-start justify-between">
        <div className={`p-2 sm:p-2.5 rounded-xl ${iconColor}`}>
          <Icon size={18} className="sm:w-5 sm:h-5" />
        </div>
        {proximamente && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700">
            <Clock size={11} /> Próximamente
          </span>
        )}
        {/* En modo compacto, la flecha reemplaza al botón de texto en mobile */}
        {compacto && ctaPath && !proximamente && (
          <ArrowRight size={14} className="text-gray-300 sm:hidden mt-1.5" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <h3 className="text-xs sm:text-sm font-semibold text-gray-500 uppercase tracking-wide truncate">{titulo}</h3>

        {/* Estado: cargando */}
        {loading && (
          <div className="h-7 sm:h-9 w-20 sm:w-24 bg-gray-200 rounded-md animate-pulse mt-2" />
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
          <p className={`text-2xl sm:text-3xl font-bold mt-1 ${valor > 0 ? 'text-blue-600' : 'text-gray-900'}`}>
            {valor}
          </p>
        )}

        {descripcion && (
          <p
            className={`text-xs sm:text-sm text-gray-400 mt-1 line-clamp-2 sm:line-clamp-none ${
              compacto ? 'hidden sm:block' : ''
            }`}
          >
            {descripcion}
          </p>
        )}
      </div>

      {ctaPath && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            navigate(ctaPath)
          }}
          className={`mt-auto inline-flex items-center justify-center gap-1.5 text-xs sm:text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors disabled:opacity-50 ${
            compacto ? 'hidden sm:inline-flex' : ''
          }`}
          disabled={loading}
        >
          {ctaLabel}
          <ArrowRight size={14} />
        </button>
      )}
    </div>
  )
}