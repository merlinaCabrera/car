import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  ShoppingBag,
  Package,
  Calendar,
  Hash,
  Receipt,
  ImageIcon,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";

// Ajustá esta base según tu configuración (proxy de Vite, .env, etc.)
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// ─── Helpers de formato ────────────────────────────────────────────────────

function formatearFecha(fechaISO) {
  if (!fechaISO) return "—";
  try {
    return new Date(fechaISO).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return fechaISO;
  }
}

function formatearARS(monto) {
  const numero = Number(monto ?? 0);
  return numero.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  });
}

function resumenItems(detalles) {
  if (!detalles || detalles.length === 0) return "Sin ítems";
  return detalles
    .map((d) => `${d.producto?.nombre ?? "Producto"} x${d.cantidad}`)
    .join(", ");
}

function resolverUrlArchivo(url) {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  return `${API_BASE_URL}${url}`;
}

// ─── Config visual por estado ──────────────────────────────────────────────

const ESTADO_CONFIG = {
  pendiente_verificacion: {
    label: "Pendiente",
    icon: Clock,
    classes: "bg-amber-100 text-amber-800 border-amber-300",
  },
  aprobada: {
    label: "Aprobada",
    icon: CheckCircle2,
    classes: "bg-emerald-100 text-emerald-800 border-emerald-300",
  },
  rechazada: {
    label: "Rechazada",
    icon: XCircle,
    classes: "bg-red-100 text-red-800 border-red-300",
  },
  cancelada_socio: {
    label: "Cancelada",
    icon: XCircle,
    classes: "bg-gray-100 text-gray-700 border-gray-300",
  },
  expirada: {
    label: "Expirada",
    icon: AlertTriangle,
    classes: "bg-gray-100 text-gray-700 border-gray-300",
  },
};

function EstadoBadge({ estado }) {
  const config = ESTADO_CONFIG[estado] ?? {
    label: estado,
    icon: AlertTriangle,
    classes: "bg-gray-100 text-gray-700 border-gray-300",
  };
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${config.classes}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {config.label}
    </span>
  );
}

// ─── Esqueleto de carga ─────────────────────────────────────────────────────

function TarjetaEsqueleto() {
  return (
    <div className="animate-pulse rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-3 w-24 rounded bg-gray-200" />
          <div className="h-4 w-40 rounded bg-gray-200" />
        </div>
        <div className="h-6 w-24 rounded-full bg-gray-200" />
      </div>
      <div className="mt-4 h-3 w-full rounded bg-gray-100" />
      <div className="mt-2 h-3 w-2/3 rounded bg-gray-100" />
      <div className="mt-4 flex items-center justify-between">
        <div className="h-3 w-16 rounded bg-gray-100" />
        <div className="h-5 w-28 rounded bg-gray-200" />
      </div>
    </div>
  );
}

// ─── Estado vacío ───────────────────────────────────────────────────────────

function EstadoVacio() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-16 text-center">
      <div className="mb-4 rounded-full bg-indigo-50 p-4">
        <ShoppingBag className="h-8 w-8 text-indigo-500" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900">
        Todavía no hiciste ninguna compra
      </h3>
      <p className="mt-1 max-w-sm text-sm text-gray-500">
        Cuando compres indumentaria o reserves instalaciones del club, vas a
        ver acá el estado de cada pedido.
      </p>
      <Link
        to="/shopping"
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
      >
        Ir a la tienda
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

// ─── Estado de error ────────────────────────────────────────────────────────

function EstadoError({ mensaje, onReintentar }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-6 py-12 text-center">
      <AlertTriangle className="mb-3 h-8 w-8 text-red-500" />
      <h3 className="text-base font-semibold text-red-800">
        No pudimos cargar tus compras
      </h3>
      <p className="mt-1 text-sm text-red-600">{mensaje}</p>
      <button
        onClick={onReintentar}
        className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
      >
        Reintentar
      </button>
    </div>
  );
}

// ─── Tarjeta de orden ───────────────────────────────────────────────────────

function TarjetaOrden({ orden }) {
  const comprobanteUrl = resolverUrlArchivo(orden.pago?.comprobante_url);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-400">
            <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
            {formatearFecha(orden.fecha_creacion)}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
            <Hash className="h-4 w-4 text-gray-400 flex-shrink-0" />
            Orden #{orden.id_orden}
          </div>
        </div>
        <EstadoBadge estado={orden.estado} />
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-xl bg-gray-50 px-3 py-2.5">
        <Package className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
        <p className="text-sm text-gray-700 break-words">{resumenItems(orden.detalles)}</p>
      </div>

      {orden.estado === "rechazada" && orden.motivo_rechazo && (
        <p className="mt-2 text-xs text-red-600">
          Motivo: {orden.motivo_rechazo}
        </p>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <Receipt className="h-3.5 w-3.5" />
          Total
        </div>
        <span className="text-base font-bold text-gray-900">
          {formatearARS(orden.monto_total)}
        </span>
      </div>

      {comprobanteUrl && (
        <a
          href={comprobanteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
        >
          <ImageIcon className="h-3.5 w-3.5" />
          Ver comprobante adjunto
        </a>
      )}
    </div>
  );
}

// ─── Página principal ───────────────────────────────────────────────────────

export default function SocioCompras() {
  const [ordenes, setOrdenes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [recargarTick, setRecargarTick] = useState(0);
  const { token } = useAuth();

  useEffect(() => {
    const controller = new AbortController();

    async function cargarCompras() {
      setCargando(true);
      setError(null);
      try {
        const respuesta = await fetch(
          `${API_BASE_URL}/socio/carrito/mis-compras`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            signal: controller.signal,
          }
        );

        if (!respuesta.ok) {
          const cuerpo = await respuesta.json().catch(() => null);
          throw new Error(
            cuerpo?.detail || `Error ${respuesta.status} al obtener tus compras.`
          );
        }

        const datos = await respuesta.json();
        setOrdenes(datos);
      } catch (err) {
        if (err.name !== "AbortError") {
          setError(err.message || "Ocurrió un error inesperado.");
        }
      } finally {
        setCargando(false);
      }
    }

    cargarCompras();
    return () => controller.abort();
  }, [recargarTick]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="rounded-xl bg-indigo-100 p-2 sm:p-2.5 flex-shrink-0">
          <ShoppingBag className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-600" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-bold text-gray-900">Mis Compras</h1>
          <p className="text-xs sm:text-sm text-gray-500">
            Historial y estado de tus pedidos en la tienda del club.
          </p>
        </div>
      </div>

      {cargando && (
        <div className="space-y-4">
          <TarjetaEsqueleto />
          <TarjetaEsqueleto />
          <TarjetaEsqueleto />
        </div>
      )}

      {!cargando && error && (
        <EstadoError
          mensaje={error}
          onReintentar={() => setRecargarTick((t) => t + 1)}
        />
      )}

      {!cargando && !error && ordenes.length === 0 && <EstadoVacio />}

      {!cargando && !error && ordenes.length > 0 && (
        <div className="space-y-4">
          {ordenes.map((orden) => (
            <TarjetaOrden key={orden.id_orden} orden={orden} />
          ))}
        </div>
      )}
    </div>
  );
}