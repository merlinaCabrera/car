// frontend/src/pages/SocioInicio.jsx
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
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
const REFRESH_INTERVAL_SEC = 55; // Rotamos antes de que el token expire en el backend (60s)
const QR_SIZE = 260; // px — se escala bien en móvil con max-w-xs del contenedor

// ─── Sub-componentes ──────────────────────────────────────────────────────────

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

  const fetchTimerRef = useRef(null);
  const countdownTimerRef = useRef(null);

  // --- Lógica del Perfil ---
  useEffect(() => {
    const fetchPerfil = async () => {
      try {
        const res = await fetch(`${API}/usuarios/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setPerfil(await res.json());
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
        throw new Error(body.detail ?? `Error ${res.status} al generar el QR.`);
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
  const esMoroso = (perfil?.deuda_historica_meses ?? 0) > 0;
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
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">¡Hola, {nombreCorto}! 👋</h1>
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
              {esMoroso ? 'MOROSO' : 'AL DÍA'}
            </p>
          </div>
          <Link to="/socio/cuotas" className="mt-4 text-sm font-semibold underline inline-block w-fit">
            {esMoroso ? 'Regularizar cuotas' : 'Ver detalle'}
          </Link>
        </div>

        {/* Tarjeta QR (fusionada) */}
        <div className={`flex-1 rounded-3xl shadow-md border-2 overflow-hidden
                       transition-colors duration-300
                       ${esMoroso
                         ? 'border-red-200   bg-white'
                         : 'border-green-200 bg-white'
                       }`}>
          {/* Franja de estado */}
          <div className={`w-full py-2.5 px-4 flex items-center justify-between
                           text-sm font-semibold
                           ${esMoroso
                             ? 'bg-red-50 text-red-700'
                             : 'bg-green-50 text-green-700'
                           }`}>
            <span className="flex items-center gap-2">
              {esMoroso ? <AlertTriangle size={15} /> : <ShieldCheck size={15} />}
              {esMoroso ? 'CUENTA CON DEUDA' : 'HABILITADO ✓'}
            </span>
            <span className="font-normal text-xs opacity-70">{nombreCorto}</span>
          </div>

          {/* Cuerpo con el QR */}
          <div className="flex flex-col items-center p-6 sm:p-8 gap-6">
            <div className={`relative p-3 rounded-2xl transition-all duration-300
                             ${esMoroso
                               ? 'bg-red-50/60 ring-1 ring-red-200'
                               : 'bg-gray-50   ring-1 ring-gray-200'
                             }
                             ${rotating ? 'opacity-40 scale-95' : 'opacity-100 scale-100'}`}>
              {qrValue ? (
                <QRCodeSVG
                  value={qrValue}
                  size={QR_SIZE}
                  level="H"
                  includeMargin={false}
                  fgColor={esMoroso ? '#991b1b' : '#14532d'}
                  bgColor="transparent"
                />
              ) : (
                <div style={{ width: QR_SIZE, height: QR_SIZE }} className="flex items-center justify-center">
                  <RefreshCw size={40} className="text-gray-300 animate-spin" />
                </div>
              )}
              {rotating && qrValue && (
                <div className="absolute inset-0 flex items-center justify-center rounded-2xl">
                  <div className="bg-white/80 rounded-full p-3 shadow">
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

            <div className="w-full space-y-1 text-center">
              <p className="text-xs text-gray-400 font-mono truncate px-2">
                {qrValue ? `ID: ${qrValue.substring(0, 8)}…` : 'Generando…'}
              </p>
              <p className="text-xs text-gray-400">Este código es único y cambia automáticamente</p>
            </div>
          </div>

          {/* Footer de la tarjeta */}
          <div className="border-t border-gray-100 px-6 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs text-gray-400 min-w-0">
              {online ? <Wifi size={13} className="flex-shrink-0 text-green-500" /> : <WifiOff size={13} className="flex-shrink-0 text-red-400" />}
              <span className="truncate">
                {online ? (countdown > 0 ? `Nuevo código en ${countdown}s` : 'Actualizando…') : 'Sin conexión'}
              </span>
            </div>
            <button
              onClick={handleRefreshManual}
              disabled={rotating}
              className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl
                         text-xs font-semibold text-gray-700
                         bg-gray-100 hover:bg-gray-200
                         active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed
                         transition-all duration-150 shadow-sm"
              aria-label="Forzar actualización del código QR"
            >
              <RefreshCw size={13} className={rotating ? 'animate-spin' : ''} />
              Actualizar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
