// frontend/src/pages/AdminMensajeria.jsx
// ─── Mensajería — ruta `/admin/mensajeria` ─────────────────────────────────
//
// Punto único para toda la comunicación con el socio: hoy el recordatorio de
// cuota por WhatsApp (antes vivía como bloque suelto en /admin/socios y su
// editor en /admin/productos), y las plantillas de mail transaccional.
import { MessageCircle } from 'lucide-react'
import RecordatorioCuota from '../components/admin/RecordatorioCuota'

export default function AdminMensajeria() {
  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2 sm:gap-3">
          <MessageCircle size={22} className="text-gray-500 flex-shrink-0" />
          Mensajería
        </h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-1">
          Las plantillas de los mensajes que le llegan al socio, por WhatsApp y por mail.
        </p>
      </div>

      <RecordatorioCuota />
    </div>
  )
}
