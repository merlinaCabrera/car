import { textoError } from '../utils/errores';
import { resolverUrlArchivo } from '../utils/archivos';
import { Revelar } from '../components/landing/animaciones';
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
  UploadCloud,
  Loader2,
  CheckCircle,
  CreditCard,
  RefreshCw,
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

/**
 * Separa los ítems de cuota social del resto (decisión D6, QA del 11-09).
 *
 * Desde D6 las órdenes de cuota también aparecen en esta pantalla, pero SIN
 * desglose: el historial mes por mes sigue viviendo en /socio/cuotas, que es
 * su dueño. Acá se muestran en una línea ("Cuota social — N mes(es) — $X")
 * con un link a esa pantalla. Para una orden mixta, la línea de cuotas va al
 * final del listado de ítems, como resumen redundante pero explícito.
 */
function separarItems(detalles) {
  const todos = detalles ?? [];
  const itemsCuota = todos.filter((d) => d.producto?.categoria === "cuota_social");
  const itemsOtros = todos.filter((d) => d.producto?.categoria !== "cuota_social");

  const mesesCuota = itemsCuota.reduce((acc, d) => acc + (d.cantidad ?? 0), 0);
  const montoCuotas = itemsCuota.reduce(
    (acc, d) => acc + Number(d.precio_unitario_historico ?? 0) * (d.cantidad ?? 0),
    0
  );

  return { itemsCuota, itemsOtros, mesesCuota, montoCuotas };
}

// ─── Link al detalle de cuotas ─────────────────────────────────────────────

function LinkGestionCuotas({ children }) {
  return (
    <Link
      to="/socio/cuotas"
      className="inline-flex items-center gap-1 text-xs font-semibold text-camoti-600 hover:text-camoti-800 hover:underline"
    >
      {children}
      <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  );
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
    classes: "bg-green-100 text-green-800 border-green-300",
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

// Prefijo con el que el backend marca el motivo cuando el que da de baja la
// orden es el CLUB y no un problema del pago (admin_reservas.suspender_reserva,
// BUG-20). Es la misma cadena de los dos lados: si cambia allá, cambia acá.
const PREFIJO_SUSPENSION_CLUB = "Turno suspendido por el club";

/**
 * `motivo` solo se usa para distinguir un rechazo de pago de una cancelación
 * decidida por el club. Las dos dejan la orden en 'rechazada' —el CHECK de
 * `ordenes` no tiene un estado propio para esto—, pero para el socio no son lo
 * mismo: una dice "revisá tu comprobante" y la otra "te cancelamos el turno y
 * te devolvemos la plata". Mostrarlas las dos en rojo como "Rechazada" es
 * exactamente lo que hacía parecer que el socio había hecho algo mal.
 */
function EstadoBadge({ estado, motivo }) {
  const canceladaPorElClub =
    estado === "rechazada" && (motivo ?? "").startsWith(PREFIJO_SUSPENSION_CLUB);

  const config = canceladaPorElClub
    ? {
        label: "Cancelada por el club",
        icon: AlertTriangle,
        classes: "bg-amber-100 text-amber-800 border-amber-300",
      }
    : ESTADO_CONFIG[estado] ?? {
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
      <div className="mb-4 rounded-full bg-camoti-50 p-4">
        <ShoppingBag className="h-8 w-8 text-camoti-500" />
      </div>
      <h3 className="font-display text-lg font-semibold text-gray-900">
        Todavía no hiciste ninguna compra
      </h3>
      <p className="mt-1 max-w-sm text-sm text-gray-500">
        Cuando compres indumentaria, reserves instalaciones del club o pagues
        tu cuota social, vas a ver acá el estado de cada pedido.
      </p>
      <Link
        to="/shopping"
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-camoti-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-camoti-700"
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

// ─── Upload de comprobante inline ──────────────────────────────────────────

function UploadComprobante({ idPago, token, onExito, esReemplazo = false }) {
  const [file,        setFile]        = useState(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error,       setError]       = useState(null)
  const [success,     setSuccess]     = useState(false)

  const handleUpload = async () => {
    if (!file) { setError('Seleccioná un archivo primero.'); return }
    setIsUploading(true)
    setError(null)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch(
        `${API_BASE_URL}/socio/cuotas/pagos/${idPago}/comprobante`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(textoError(err?.detail, 'Error al subir el comprobante.'))
      }
      setSuccess(true)
      setTimeout(() => onExito(), 1500)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsUploading(false)
    }
  }

  if (success) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700 font-medium">
        <CheckCircle className="h-4 w-4 flex-shrink-0" />
        {esReemplazo
          ? '¡Comprobante reemplazado! Un administrador verificará tu pago.'
          : '¡Comprobante enviado! Un administrador verificará tu pago.'}
      </div>
    )
  }

  return (
    <div className="mt-3 space-y-2">
      {error && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <AlertTriangle className="h-3.5 w-3.5" /> {error}
        </p>
      )}
      <label className={`flex items-center gap-3 w-full px-3 py-2.5 border-2 border-dashed rounded-xl cursor-pointer transition-colors
        ${file ? 'border-green-300 bg-green-50' : 'border-gray-300 bg-gray-50 hover:border-camoti-400 hover:bg-camoti-50'}
        ${isUploading ? 'opacity-60 cursor-not-allowed' : ''}`}
      >
        <UploadCloud className={`h-5 w-5 flex-shrink-0 ${file ? 'text-green-500' : 'text-gray-400'}`} />
        <span className={`text-sm ${file ? 'text-green-800 font-medium' : 'text-gray-500'}`}>
          {file
            ? file.name
            : esReemplazo
            ? 'Elegí el comprobante correcto (PNG, JPG, PDF)'
            : 'Adjuntar comprobante (PNG, JPG, PDF)'}
        </span>
        <input type="file" className="sr-only" accept="image/*,.pdf"
          onChange={e => { if (e.target.files[0]) { setFile(e.target.files[0]); setError(null) } }}
          disabled={isUploading}
        />
      </label>
      <button
        onClick={handleUpload}
        disabled={!file || isUploading}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-camoti-600 hover:bg-camoti-700 text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isUploading && <Loader2 className="h-4 w-4 animate-spin" />}
        {isUploading
          ? 'Subiendo…'
          : esReemplazo ? 'Reemplazar comprobante' : 'Subir comprobante'}
      </button>
    </div>
  )
}

// ─── Tarjeta de orden ───────────────────────────────────────────────────────

function TarjetaOrden({ orden, token, onComprobanteCargado }) {
  const [reemplazando, setReemplazando] = useState(false)

  const comprobanteUrl = resolverUrlArchivo(orden.pago?.comprobante_url)
  const esMercadoPago = orden.pago?.metodo_pago === 'mercado_pago'
  // El efectivo se cobra en el club: no hay comprobante que subir. Ofrecer el
  // uploader acá era parte del mismo enredo de BUG-08 (QA del 08-09).
  const esEfectivo = orden.pago?.metodo_pago === 'efectivo'

  const { itemsCuota, itemsOtros, mesesCuota, montoCuotas } = separarItems(orden.detalles)
  const soloCuota = itemsCuota.length > 0 && itemsOtros.length === 0

  // El comprobante de una orden de SOLO cuota se maneja en /socio/cuotas, que
  // es la pantalla dueña de ese trámite: acá se muestra el resumen y el link
  // (decisión D6). Para todo lo demás —alquileres, tienda— el trámite es acá.
  const gestionaComprobante =
    orden.estado === 'pendiente_verificacion' && !esMercadoPago && !esEfectivo && !soloCuota
  const puedeSubirComprobante = gestionaComprobante && !comprobanteUrl
  // BUG-18 (QA del 11-09): si el socio subió el comprobante equivocado, en
  // /socio/cuotas podía cambiarlo y acá no. Mismo endpoint, que pisa el
  // archivo anterior en S3 y reinicia las 48 hs de la orden.
  const puedeReemplazarComprobante = gestionaComprobante && Boolean(comprobanteUrl)

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
          {esMercadoPago && (
            <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-xs font-medium text-blue-700">
              💳 Mercado Pago
            </div>
          )}
        </div>
        <EstadoBadge estado={orden.estado} motivo={orden.motivo_rechazo} />
      </div>

      {soloCuota ? (
        /* Orden de solo cuota social: una línea y el link al desglose (D6). */
        <div className="mt-4 rounded-xl bg-camoti-50 border border-camoti-100 px-3 py-2.5">
          <div className="flex items-start gap-2">
            <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-camoti-400" />
            <p className="text-sm text-gray-800 break-words">
              <span className="font-semibold">Cuota social</span>
              {' — '}{mesesCuota} {mesesCuota === 1 ? 'mes' : 'meses'}
              {' — '}{formatearARS(montoCuotas)}
            </p>
          </div>
          <div className="mt-2 pl-6">
            <LinkGestionCuotas>Ver detalle en Gestión de Cuotas</LinkGestionCuotas>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-gray-50 px-3 py-2.5">
            <Package className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            <p className="text-sm text-gray-700 break-words">{resumenItems(itemsOtros)}</p>
          </div>

          {/* Orden mixta: la parte de cuotas se resume al final del listado,
              con el link al lugar donde sí está el desglose (D6). */}
          {itemsCuota.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-camoti-50 border border-camoti-100 px-3 py-2.5">
              <p className="text-sm text-gray-800">
                <span className="font-semibold">{formatearARS(montoCuotas)}</span> en cuotas
                {' '}({mesesCuota} {mesesCuota === 1 ? 'mes' : 'meses'})
              </p>
              <LinkGestionCuotas>Ver detalle</LinkGestionCuotas>
            </div>
          )}
        </>
      )}

      {orden.estado === "rechazada" && orden.motivo_rechazo && (
        <p
          className={`mt-2 text-xs ${
            orden.motivo_rechazo.startsWith(PREFIJO_SUSPENSION_CLUB)
              ? "text-amber-700"
              : "text-red-600"
          }`}
        >
          Motivo: {orden.motivo_rechazo}
        </p>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-gray-200 pt-3">
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <Receipt className="h-3.5 w-3.5" />
          Total
        </div>
        <span className="text-base font-bold text-gray-900">
          {formatearARS(orden.monto_total)}
        </span>
      </div>

      {comprobanteUrl && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <a
            href={comprobanteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-camoti-600 hover:text-camoti-800 hover:underline"
          >
            <ImageIcon className="h-3.5 w-3.5" />
            Ver comprobante adjunto
          </a>

          {puedeReemplazarComprobante && (
            <button
              type="button"
              onClick={() => setReemplazando((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 hover:underline"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {reemplazando ? 'Cancelar' : 'Cambiar comprobante'}
            </button>
          )}
        </div>
      )}

      {(puedeSubirComprobante || (puedeReemplazarComprobante && reemplazando)) && (
        <UploadComprobante
          idPago={orden.id_pago}
          token={token}
          esReemplazo={puedeReemplazarComprobante}
          onExito={() => { setReemplazando(false); onComprobanteCargado() }}
        />
      )}
    </div>
  )
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
          throw new Error(textoError(cuerpo?.detail, `Error ${respuesta.status} al obtener tus compras.`));
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
      <div className="anim-entrada mb-6 flex items-center gap-3">
        <div className="rounded-xl bg-camoti-100 p-2 sm:p-2.5 flex-shrink-0">
          <ShoppingBag className="h-5 w-5 sm:h-6 sm:w-6 text-camoti-600" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-bold text-gray-900">Mis Compras</h1>
          <p className="text-xs sm:text-sm text-gray-500">
            Historial y estado de tus pedidos: tienda, alquileres y cuota social.
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
            <Revelar key={orden.id_orden}>
              <TarjetaOrden
                orden={orden}
                token={token}
                onComprobanteCargado={() => setRecargarTick((t) => t + 1)}
              />
            </Revelar>
          ))}
        </div>
      )}
    </div>
  );
}