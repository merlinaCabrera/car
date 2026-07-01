import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { QRCodeSVG } from 'qrcode.react';
import { Loader, AlertCircle, RefreshCw } from 'lucide-react';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
const REFRESH_INTERVAL_SECONDS = 30;

export default function SocioQR() {
  const { token } = useAuth();
  const [qrData, setQrData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL_SECONDS);

  useEffect(() => {
    const fetchNewQRToken = async () => {
      if (!token) return;
      try {
        // No es necesario poner setLoading(true) aquí para evitar parpadeo en el refresh
        const res = await fetch(`${API}/qr/token`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.detail || 'No se pudo generar el QR.');
        }
        const data = await res.json();
        setQrData(data.qr_token);
        setError(null);
      } catch (err) {
        setError(err.message);
        setQrData(null);
      } finally {
        setLoading(false);
        setCountdown(REFRESH_INTERVAL_SECONDS);
      }
    };

    fetchNewQRToken(); // Fetch inicial
    const fetchInterval = setInterval(fetchNewQRToken, REFRESH_INTERVAL_SECONDS * 1000);
    const countdownInterval = setInterval(() => {
      setCountdown(prev => (prev > 1 ? prev - 1 : 0));
    }, 1000);

    return () => {
      clearInterval(fetchInterval);
      clearInterval(countdownInterval);
    };
  }, [token]);

  return (
    <div className="p-6 max-w-4xl mx-auto flex flex-col items-center justify-center text-center space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mi QR de Acceso</h1>
        <p className="text-gray-500 text-sm mt-1">Mostrá este código en la entrada del club. Se actualiza automáticamente.</p>
      </div>

      <div className="w-full max-w-xs bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col items-center justify-center aspect-square">
        {loading && (
          <div className="flex flex-col items-center justify-center text-gray-400">
            <Loader className="animate-spin mb-4" size={48} />
            <p className="font-semibold">Generando QR seguro...</p>
          </div>
        )}
        {error && !loading && (
          <div className="flex flex-col items-center justify-center text-red-500">
            <AlertCircle size={48} className="mb-4" />
            <p className="font-bold">Error al generar QR</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        )}
        {qrData && !loading && !error && (
          <QRCodeSVG value={qrData} size={256} level={"H"} includeMargin={true} />
        )}
      </div>

      <div className="flex items-center gap-2 text-sm text-gray-500">
        <RefreshCw size={16} className={countdown < 5 && countdown > 0 ? "animate-spin" : ""} />
        <span>
          {countdown > 0 ? `Actualizando en ${countdown}s...` : 'Actualizando...'}
        </span>
      </div>
    </div>
  );
}