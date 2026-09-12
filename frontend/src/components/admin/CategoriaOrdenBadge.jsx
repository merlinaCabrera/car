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
  cuota:        { label: 'Cuota',        classes: 'bg-roberts-50 text-roberts-600 ring-1 ring-roberts-200' },
  alquiler:     { label: 'Alquiler',     classes: 'bg-camoti-50 text-camoti-600 ring-1 ring-camoti-200' },
  indumentaria: { label: 'Indumentaria', classes: 'bg-francia-50 text-francia-700 ring-1 ring-francia-200' },
  otro:         { label: 'Otro',         classes: 'bg-gray-100 text-gray-600 ring-1 ring-gray-200' },
  mixta:        { label: 'Mixta',        classes: 'bg-amber-50 text-amber-800 ring-1 ring-amber-300' },
}

export default function CategoriaOrdenBadge({ categoria, className = '' }) {
  const config = CATEGORIA_CONFIG[categoria] ?? CATEGORIA_CONFIG.otro
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${config.classes} ${className}`}
    >
      {config.label}
    </span>
  )
}