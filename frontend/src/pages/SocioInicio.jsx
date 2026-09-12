// frontend/src/pages/SocioInicio.jsx
import { textoError } from '../utils/errores';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { QRCodeSVG } from 'qrcode.react';
import {
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  Wifi,
  WifiOff,
  Clock,
  Wallet,
  UserPlus,
} from 'lucide-react';
import Beneficios from '../components/landing/Beneficios';
import { calcularEstadoFinanciero } from '../utils/cuotas';
import escudoCar from '../assets/escudo-car.PNG';
import camotiAzul from '../assets/camoti-azul.PNG';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
const REFRESH_INTERVAL_SEC = 55; // Rotamos antes de que el token expire en el backend (60s)
const QR_SIZE = 260; // px — se escala bien en móvil con max-w-xs del contenedor

// ─── Estado financiero ─────────────────────────────────────────
// El cálculo vive en utils/cuotas.js, compartido con SocioCuotas y AdminSocios.
//
// Esta pantalla tenía su propia copia, y esa copia se quedó vieja: no conocía
// ni la gracia por mes de ingreso (D1) ni el corte por día de vencimiento
// (BUG-04). Con los mismos datos, /socio/cuotas decía "Mes de ingreso" y acá
// aparecía MOROSO en rojo gigante — y un socio que acababa de pagar su primera
// cuota seguía viendo MOROSO hasta pagar una segunda (QA del 11-09, 7.1 y 7.4).

// ─── Sub-componentes ──────────────────────────────────────────────────────────

// Formateo de presentación del carnet. Son puramente visuales: no consultan
// nada ni derivan estado, solo le dan forma a datos que /usuarios/me ya trajo.
const formatearDNI = (dni) =>
  dni ? String(dni).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '—';

const formatearNroSocio = (id) =>
  id ? String(id).padStart(5, '0') : '—';

const formatearVencimiento = (iso) => {
  if (!iso) return '—';
  const [anio, mes] = String(iso).split('-');
  return mes && anio ? `${mes}/${anio}` : '—';
};

function CardSkeleton({ className = '' }) {
  return (
    <div className={`rounded-2xl bg-gray-100 animate-pulse ${className}`} />
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function SocioInicio() {
  const { user, token } = useAuth();
  const [perfil, setPerfil] = useState(null);
  const [loading, setLoading] = useState(true);

  // --- Estados del QR (fusionados desde SocioQR.jsx) ---
  const [qrValue, setQrValue] = useState(user?.qr_token ?? null);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL_SEC);
  const [rotating, setRotating] = useState(false);
  const [errorQR, setErrorQR] = useState(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [ordenPendiente, setOrdenPendiente] = useState(null);

  const fetchTimerRef = useRef(null);
  const countdownTimerRef = useRef(null);

  // --- Lógica del Perfil ---
  useEffect(() => {
    const fetchPerfil = async () => {
      try {
        const [res, resPend] = await Promise.all([
          fetch(`${API}/usuarios/me`, { headers: { Authorization: `Bearer ${token}` } }),
          // Para distinguir "moroso" de "ya pagó, falta que el admin verifique".
          // Sin esto la home le gritaba MOROSO en rojo a un socio que acababa
          // de pagar y subir el comprobante.
          fetch(`${API}/socio/cuotas/orden-pendiente`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        if (res.ok) setPerfil(await res.json());
        if (resPend.ok) setOrdenPendiente(await resPend.json().catch(() => null));
      } catch {} finally {
        setLoading(false);
      }
    };
    if (token) fetchPerfil();
    else setLoading(false);
  }, [token]);

  // --- Lógica del QR (fusionada desde SocioQR.jsx) ---
  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const rotarToken = useCallback(async ({ silencioso = false } = {}) => {
    if (!token) return;
    if (!silencioso) setRotating(true);
    setErrorQR(null);
    try {
      const res = await fetch(`${API}/qr/token`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(textoError(body?.detail, `Error ${res.status} al generar el QR.`));
      }
      const data = await res.json();
      setQrValue(data.qr_token);
    } catch (err) {
      setErrorQR(err.message);
    } finally {
      if (!silencioso) setRotating(false);
    }
  }, [token]);

  const iniciarTimers = useCallback(() => {
    clearInterval(fetchTimerRef.current);
    clearInterval(countdownTimerRef.current);
    setCountdown(REFRESH_INTERVAL_SEC);
    fetchTimerRef.current = setInterval(() => {
      rotarToken({ silencioso: true });
      setCountdown(REFRESH_INTERVAL_SEC);
    }, REFRESH_INTERVAL_SEC * 1000);
    countdownTimerRef.current = setInterval(() => {
      setCountdown(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
  }, [rotarToken]);

  useEffect(() => {
    if (token) {
      rotarToken({ silencioso: true });
      iniciarTimers();
    }
    return () => {
      clearInterval(fetchTimerRef.current);
      clearInterval(countdownTimerRef.current);
    };
  }, [token, rotarToken, iniciarTimers]);

  const handleRefreshManual = async () => {
    await rotarToken({ silencioso: false });
    iniciarTimers();
  };

  // --- Datos Derivados ---
  // Bypass de beca: si es_becado está activo hoy, nunca es moroso
  const hoyISO = new Date().toISOString().split('T')[0]
  const becaActiva = perfil?.es_becado && (
    !perfil?.becado_hasta || perfil.becado_hasta >= hoyISO
  )
  const { moroso: esMorosoReal, enMesIngreso } = calcularEstadoFinanciero(
    perfil?.mes_cubierto_hasta,
    perfil?.fecha_ingreso,
    // /usuarios/me sí devuelve dia_vencimiento_cuota (lo agrega el router
    // leyendo configuracion_club); el default es solo la red por si falta.
    perfil?.dia_vencimiento_cuota ?? 10
  )
  const esMoroso = becaActiva ? false : esMorosoReal;
  // El socio ya generó la orden y espera verificación. Si debía, sigue sin
  // acceso (el QR tiene que seguir denegando en la puerta hasta que el admin
  // apruebe), pero el mensaje deja de ser un reproche y le explica en qué
  // estado está. También aplica al socio en su mes de ingreso: no está moroso,
  // pero si ya mandó su primera cuota no tiene sentido seguir invitándolo a
  // pagarla.
  const enVerificacion = !!ordenPendiente && (esMoroso || enMesIngreso);
  const nombreCorto = perfil?.nombre?.split(' ')[0] ?? 'Socio';

  if (loading) {
    return (
      <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5 sm:space-y-6">
        <div className="h-10 w-1/2 bg-gray-100 rounded-lg animate-pulse" />
        <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
          <CardSkeleton className="h-52 flex-1" />
          <CardSkeleton className="h-96 lg:h-auto flex-1" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900">¡Hola, {nombreCorto}!</h1>
        <p className="text-gray-500 text-sm mt-1">Bienvenido a tu portal personal.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
        {/* Estado Financiero */}
        <div
          className={`flex-1 rounded-2xl p-5 sm:p-6 border-2 flex flex-col justify-between min-h-[180px] sm:min-h-[200px] ${
            esMoroso ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Estado Financiero</span>
            {esMoroso ? <AlertTriangle size={20} className="text-red-500 shrink-0" /> : <CheckCircle size={20} className="text-green-600 shrink-0" />}
          </div>
          <div>
            <p className={`text-3xl sm:text-4xl font-extrabold tracking-tight mt-3 ${esMoroso ? 'text-red-700' : 'text-green-700'}`}>
              {enVerificacion ? 'EN VERIFICACIÓN' : esMoroso ? 'MOROSO' : 'AL DÍA'}
            </p>
            {/* El socio recién asociado está al día (decisión D1), pero su primera
                cuota sigue pendiente: se aclara acá para que "AL DÍA" no se lea
                como "no debés nada". */}
            {enMesIngreso && !enVerificacion && (
              <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-camoti-700">
                <UserPlus size={12} className="flex-shrink-0" />
                Mes de ingreso · tu primera cuota queda pendiente
              </p>
            )}
          </div>
          <Link to="/socio/cuotas" className="mt-4 text-sm font-semibold underline inline-block w-fit">
            {enVerificacion
              ? 'Ver mi pago'
              : esMoroso
                ? 'Regularizar cuotas'
                : enMesIngreso
                  ? 'Pagar mi primera cuota'
                  : 'Ver detalle'}
          </Link>
        </div>

        {/* ── Carnet digital de socio ─────────────────────────────────
            Aplicación del doc 06 del manual de marca: cabecera con el escudo
            sobre blanco y margen perimetral, franja de estado, cuerpo con el
            QR, y el bloque de datos del socio (nombre en Playfair, datos en
            Inter). El Camotí va de marca de agua sutil — nunca sobre el QR,
            que necesita contraste limpio para que el escáner lo lea. */}
        <div className="flex-1 rounded-2xl overflow-hidden bg-white border border-gray-200 shadow-md">

          {/* Cabecera institucional */}
          <div className="flex items-center gap-3 px-5 py-4 bg-white border-b border-gray-200">
            <img src={escudoCar} alt="Escudo Club Atlético Roberts" className="h-11 w-auto object-contain flex-shrink-0" />
            <div className="min-w-0">
              <p className="font-display text-sm sm:text-base font-semibold text-blue-600 leading-tight truncate">
                Club Atlético Roberts
              </p>
              <p className="text-[10px] text-gray-400 uppercase tracking-[0.16em] mt-0.5">
                Carnet oficial de socio
              </p>
            </div>
          </div>

          {/* Franja de estado */}
          <div className={`w-full py-2.5 px-5 flex items-center justify-between text-xs sm:text-sm font-semibold
                           ${esMoroso
                             ? 'bg-red-50 text-red-700 border-y border-red-100'
                             : enVerificacion
                               ? 'bg-amber-50 text-amber-800 border-y border-amber-100'
                               : 'bg-green-50 text-green-700 border-y border-green-100'
                           }`}>
            <span className="flex items-center gap-2">
              {esMoroso ? <AlertTriangle size={15} /> : enVerificacion ? <Clock size={15} /> : <ShieldCheck size={15} />}
              {enVerificacion ? 'PAGO EN VERIFICACIÓN' : esMoroso ? 'CUENTA CON DEUDA' : becaActiva ? 'SOCIO BECADO' : enMesIngreso ? 'BIENVENIDO — HABILITADO' : 'HABILITADO'}
            </span>
          </div>

          {/* Cuerpo con el QR */}
          <div className="relative flex flex-col items-center px-6 pt-7 pb-5 gap-5">
            <div className={`relative p-3 rounded-2xl transition-all duration-300
                             ${esMoroso
                               ? 'bg-red-50/60 ring-1 ring-red-200'
                               : 'bg-gray-50 ring-1 ring-gray-200'
                             }
                             ${rotating ? 'opacity-40 scale-95' : 'opacity-100 scale-100'}`}>
              {qrValue ? (
                <QRCodeSVG
                  value={qrValue}
                  size={QR_SIZE}
                  level="H"
                  includeMargin={false}
                  fgColor={esMoroso ? '#832323' : '#1C1F2D'}
                  bgColor="transparent"
                />
              ) : (
                <div style={{ width: QR_SIZE, height: QR_SIZE }} className="flex items-center justify-center">
                  <RefreshCw size={40} className="text-gray-300 animate-spin" />
                </div>
              )}
              {rotating && qrValue && (
                <div className="absolute inset-0 flex items-center justify-center rounded-2xl">
                  <div className="bg-white/80 rounded-full p-3 shadow-sm">
                    <RefreshCw size={24} className="text-gray-500 animate-spin" />
                  </div>
                </div>
              )}
            </div>

            {errorQR && (
              <div className="w-full flex items-start gap-2 px-3 py-2.5 rounded-xl
                              bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                <span>{errorQR} El código anterior sigue siendo válido.</span>
              </div>
            )}

            <p className="text-[11px] text-gray-400 font-mono truncate px-2 max-w-full">
              {qrValue ? `ID: ${qrValue.substring(0, 8)}…` : 'Generando…'}
            </p>
          </div>

          {/* Datos del socio — nombre en Playfair, datos en Inter (doc 04).
              La marca de agua de El Camotí vive acá, lejos del QR. */}
          <div className="relative px-5 pb-5 pt-4 border-t border-gray-200 overflow-hidden">
            <img
              src={camotiAzul}
              alt=""
              aria-hidden="true"
              className="pointer-events-none select-none absolute -right-4 -bottom-6 h-28 w-auto object-contain opacity-[0.055]"
            />
            <div className="relative">
              <p className="text-[10px] text-gray-400 uppercase tracking-[0.16em]">Socio</p>
              <p className="font-display text-xl sm:text-2xl font-bold text-gray-900 leading-tight mt-0.5 break-words">
                {[perfil?.nombre, perfil?.apellido].filter(Boolean).join(' ') || nombreCorto}
              </p>
              <dl className="mt-3 grid grid-cols-3 gap-3 text-xs">
                <div>
                  <dt className="text-[10px] text-gray-400 uppercase tracking-wider">N.º Socio</dt>
                  <dd className="font-semibold text-gray-700 tabular-nums mt-0.5">{formatearNroSocio(perfil?.id_usuario)}</dd>
                </div>
                <div>
                  <dt className="text-[10px] text-gray-400 uppercase tracking-wider">DNI</dt>
                  <dd className="font-semibold text-gray-700 tabular-nums mt-0.5">{formatearDNI(perfil?.dni)}</dd>
                </div>
                <div>
                  <dt className="text-[10px] text-gray-400 uppercase tracking-wider">Vence</dt>
                  <dd className="font-semibold text-gray-700 tabular-nums mt-0.5">{formatearVencimiento(perfil?.mes_cubierto_hasta)}</dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Pie de la tarjeta */}
          <div className="border-t border-gray-200 px-5 py-4 space-y-3 bg-gray-50/60">

            {/* Saldo a favor — solo si tiene crédito */}
            {perfil?.saldo_a_favor > 0 && (
              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-green-50 border border-green-200">
                <span className="flex items-center gap-2 text-xs font-semibold text-green-700">
                  <Wallet size={13} />
                  Saldo a favor
                </span>
                <span className="text-xs font-bold text-green-700 tabular-nums">
                  {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).format(perfil.saldo_a_favor)}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs text-gray-400 min-w-0">
                {online ? <Wifi size={13} className="flex-shrink-0 text-green-600" /> : <WifiOff size={13} className="flex-shrink-0 text-red-500" />}
                <span className="truncate">
                  {online ? (countdown > 0 ? `Nuevo código en ${countdown}s` : 'Actualizando…') : 'Sin conexión'}
                </span>
              </div>
              <button
                onClick={handleRefreshManual}
                disabled={rotating}
                className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl
                           text-xs font-semibold text-gray-700
                           bg-white border border-gray-200 hover:bg-gray-100 hover:border-gray-300
                           active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed
                           transition-all duration-150"
                aria-label="Forzar actualización del código QR"
              >
                <RefreshCw size={13} className={rotating ? 'animate-spin' : ''} />
                Actualizar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Acceso rápido a Beneficios — mensaje contextual según estado financiero */}
      <div className="pt-2">
        {enVerificacion ? (
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-blue-50 border border-blue-200 text-blue-800">
            <AlertTriangle size={20} className="flex-shrink-0" />
            <p className="text-sm">
              <span className="font-bold">Ya recibimos tu pago.</span> Un administrador lo está verificando; tu acceso se habilita apenas lo apruebe.{' '}
              <Link to="/socio/cuotas" className="underline font-semibold">Ver el detalle</Link>
            </p>
          </div>
        ) : esMoroso ? (
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800">
            <AlertTriangle size={20} className="flex-shrink-0" />
            <p className="text-sm">
              <span className="font-bold">Regularizá tu cuenta</span> para acceder a los descuentos y beneficios exclusivos de nuestros comercios adheridos.{' '}
              <Link to="/socio/cuotas" className="underline font-semibold">Pagar ahora</Link>
            </p>
          </div>
        ) : enMesIngreso ? (
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-camoti-50 border border-camoti-200 text-camoti-800">
            <UserPlus size={20} className="flex-shrink-0" />
            <p className="text-sm">
              <span className="font-bold">¡Bienvenido al club!</span> Tu acceso ya está habilitado. La cuota de este
              mes, tu primera, queda pendiente de pago y podés abonarla cuando quieras.{' '}
              <Link to="/socio/cuotas" className="underline font-semibold">Pagar mi primera cuota</Link>
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-green-50 border border-green-200 text-green-800">
            <CheckCircle size={20} className="flex-shrink-0" />
            <p className="text-sm">
              <span className="font-bold">¡Estás al día!</span> Aprovechá tus beneficios de socio en los comercios adheridos al club.
            </p>
          </div>
        )}
        <Beneficios />
      </div>
    </div>
  );
}