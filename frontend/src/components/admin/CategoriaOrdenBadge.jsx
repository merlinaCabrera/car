// frontend/src/components/admin/CategoriaOrdenBadge.jsx
/**
 * Badge de categoría de una Orden — consume `orden.categoria_resumen`
 * (propiedad calculada en backend/models.py::Orden.categoria_resumen).
 *
 * 'mixta' se resalta distinto (ámbar, con borde) porque es la señal que le
 * interesa al admin: una orden que combina, por ejemplo, indumentaria +
 * alquiler en la misma compra, y por lo tanto aprobar/rechazar esa orden
 * toca dos subsistemas de negocio a la vez (stock Y reserva), no solo uno.
 */

const CATEGORIA_CONFIG = {
  cuota:        { label: 'Cuota',        classes: 'bg-blue-100 text-blue-700' },
  alquiler:     { label: 'Alquiler',     classes: 'bg-purple-100 text-purple-700' },
  indumentaria: { label: 'Indumentaria', classes: 'bg-teal-100 text-teal-700' },
  otro:         { label: 'Otro',         classes: 'bg-gray-100 text-gray-700' },
  mixta:        { label: 'Mixta',        classes: 'bg-amber-100 text-amber-800 border border-amber-300' },
}

export default function CategoriaOrdenBadge({ categoria, className = '' }) {
  const config = CATEGORIA_CONFIG[categoria] ?? CATEGORIA_CONFIG.otro
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${config.classes} ${className}`}
    >
      {config.label}
    </span>
  )
}