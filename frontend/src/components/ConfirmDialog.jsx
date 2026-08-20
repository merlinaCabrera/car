// frontend/src/components/ConfirmDialog.jsx
/**
 * Reemplazo del window.confirm() nativo del navegador — mismo propósito
 * (pedir confirmación antes de una acción), pero con el mismo look del
 * resto de la app en vez del popup feo del sistema operativo.
 *
 * Antes: Aprobar/Baja/Reactivar usaban window.confirm(), pero Rechazar
 * tenía su propio patrón in-card con motivo — quedaba inconsistente.
 * Ahora todos usan este mismo componente (Rechazar sigue con su propio
 * patrón in-card porque además pide un motivo, que es un caso distinto).
 */
import { AlertTriangle } from 'lucide-react'

export default function ConfirmDialog({
  titulo,
  mensaje,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variante = 'default', // 'default' | 'peligro'
  cargando = false,
  onConfirm,
  onCancel,
}) {
  const colorBoton = variante === 'peligro'
    ? 'bg-red-600 hover:bg-red-700'
    : 'bg-green-600 hover:bg-green-700'

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget && !cargando) onCancel() }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-start gap-3">
          {variante === 'peligro' && (
            <div className="p-2 rounded-full bg-red-50 flex-shrink-0">
              <AlertTriangle size={18} className="text-red-600" />
            </div>
          )}
          <div>
            <h2 className="text-base font-bold text-gray-900">{titulo}</h2>
            {mensaje && <p className="text-sm text-gray-500 mt-1">{mensaje}</p>}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            disabled={cargando}
            className="px-4 py-2 rounded-xl text-gray-600 hover:bg-gray-100 text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={cargando}
            className={`px-4 py-2 rounded-xl text-white text-sm font-semibold transition-colors disabled:opacity-60 ${colorBoton}`}
          >
            {cargando ? 'Procesando…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}