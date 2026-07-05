// frontend/src/pages/SocioNotificaciones.jsx
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Bell,
  ArrowLeft,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL;

// --- Helpers ---

function formatRelativeTime(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diffSeconds = Math.round((now - date) / 1000);

  if (diffSeconds < 60) return `hace ${diffSeconds} seg`;
  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) return `hace ${diffMinutes} min`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `hace ${diffHours} h`;
  
  return date.toLocaleDateString('es-AR', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

const NOTIFICATION_ICONS = {
  orden_aprobada: { Icon: CheckCircle2, color: 'text-emerald-600' },
  orden_rechazada: { Icon: XCircle, color: 'text-red-600' },
  sistema: { Icon: Info, color: 'text-blue-600' },
  default: { Icon: Bell, color: 'text-gray-500' },
};

// --- Sub-componentes ---

function NotificationCard({ notificacion }) {
  const { Icon, color } = NOTIFICATION_ICONS[notificacion.tipo] || NOTIFICATION_ICONS.default;
  // Las notificaciones se marcan como leídas en el backend, pero el estado
  // local mantiene `leida: false` para el destacado visual en la primera carga.
  const isUnread = !notificacion.leida;

  return (
    <div
      className={`
        flex items-start gap-4 p-4 rounded-2xl border transition-colors
        ${isUnread
          ? 'bg-blue-50 border-blue-200'
          : 'bg-white border-gray-100 hover:bg-gray-50'
        }
      `}
    >
      <div className={`mt-1 flex-shrink-0 ${color}`}>
        <Icon size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-900 text-sm">{notificacion.titulo}</h3>
          <p className="text-xs text-gray-400 flex-shrink-0 ml-2">
            {formatRelativeTime(notificacion.created_at)}
          </p>
        </div>
        <p className="text-sm text-gray-600 mt-1">{notificacion.cuerpo}</p>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="flex items-start gap-4 p-4 rounded-2xl border border-gray-100 bg-white animate-pulse">
      <div className="mt-1 w-5 h-5 rounded-full bg-gray-200" />
      <div className="flex-1 space-y-2">
        <div className="flex justify-between">
          <div className="h-4 w-1/3 bg-gray-200 rounded" />
          <div className="h-3 w-1/4 bg-gray-200 rounded" />
        </div>
        <div className="h-3 w-full bg-gray-200 rounded" />
        <div className="h-3 w-2/3 bg-gray-200 rounded" />
      </div>
    </div>
  );
}

// --- Componente Principal ---

export default function SocioNotificaciones() {
  const [notificaciones, setNotificaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { token } = useAuth();
  const navigate = useNavigate();

  const fetchAndMarkNotifications = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    try {
      // 1. Obtener todas las notificaciones
      const response = await fetch(`${API_URL}/notificaciones`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'No se pudieron cargar las notificaciones.');
      }

      const data = await response.json();
      setNotificaciones(data);

      // 2. Encontrar las no leídas y marcarlas en el backend silenciosamente
      const unreadIds = data.filter(n => !n.leida).map(n => n.id_notificacion);

      if (unreadIds.length > 0) {
        // Esta es una llamada "fire and forget". No bloquea la UI.
        // Si falla, se marcarán como leídas en la próxima visita.
        fetch(`${API_URL}/notificaciones/marcar-leidas`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ ids: unreadIds }),
        }).catch(err => {
          console.error("Error silencioso al marcar notificaciones como leídas:", err);
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchAndMarkNotifications();
  }, [fetchAndMarkNotifications]);

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl text-gray-500 hover:bg-gray-100 transition-colors"
          title="Volver"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Bell size={22} className="text-gray-500" />
            Notificaciones
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Tus alertas y mensajes importantes.
          </p>
        </div>
      </div>

      {/* Estado de Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertTriangle size={18} className="flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={fetchAndMarkNotifications} className="underline underline-offset-2 font-medium hover:text-red-900">
            Reintentar
          </button>
        </div>
      )}

      {/* Lista de notificaciones */}
      <div className="space-y-3">
        {loading && (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        )}

        {!loading && !error && notificaciones.length === 0 && (
          <div className="text-center py-16 text-gray-500">
            <Bell size={32} className="mx-auto mb-3" />
            <p className="font-semibold">No tenés notificaciones</p>
            <p className="text-sm">Cuando haya novedades, aparecerán acá.</p>
          </div>
        )}

        {!loading && !error && notificaciones.length > 0 && (
          notificaciones.map(notif => (
            <NotificationCard key={notif.id_notificacion} notificacion={notif} />
          ))
        )}
      </div>
    </div>
  );
}
