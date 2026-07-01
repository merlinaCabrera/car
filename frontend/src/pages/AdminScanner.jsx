import { useState, useEffect } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { useAuth } from '../context/AuthContext';
import { CheckCircle, XCircle, User, Hash, Loader, ScanLine } from 'lucide-react';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

const ResultPanel = ({ result, onReset }) => {
  const isSuccess = result.es_socio_activo && result.estado_financiero === 'Al día';
  const bgColor = isSuccess ? 'bg-green-500' : 'bg-red-500';
  const textColor = 'text-white';
  const Icon = isSuccess ? CheckCircle : XCircle;
  
  let statusText = 'NO HABILITADO';
  if (isSuccess) {
    statusText = 'HABILITADO';
  } else if (result.estado_financiero === 'Moroso') {
    statusText = 'ACCESO DENEGADO (MOROSO)';
  } else if (!result.es_socio_activo) {
    statusText = 'ACCESO DENEGADO (INACTIVO)';
  }

  useEffect(() => {
    const timer = setTimeout(onReset, 7000); // Reset after 7 seconds
    return () => clearTimeout(timer);
  }, [onReset]);

  return (
    <div className={`w-full h-full flex flex-col items-center justify-center p-8 text-center ${bgColor} ${textColor} rounded-2xl shadow-2xl transition-colors duration-300`}>
      <Icon size={96} className="mb-6 drop-shadow-lg animate-pulse" />
      <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight uppercase drop-shadow-md">{statusText}</h2>
      <div className="mt-8 text-left bg-black/20 p-6 rounded-xl w-full max-w-md">
        <p className="text-lg flex items-center gap-3">
          <User size={20} className="opacity-80" />
          <span className="font-semibold">{result.nombre} {result.apellido}</span>
        </p>
        <p className="text-lg flex items-center gap-3 mt-2">
          <Hash size={20} className="opacity-80" />
          <span className="font-mono tracking-wider">{result.dni}</span>
        </p>
      </div>
      <div className="absolute bottom-4 text-xs text-white/70">
        Volviendo al escáner...
      </div>
    </div>
  );
};

export default function AdminScanner() {
  const { token } = useAuth();
  const [scanResult, setScanResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [manualDni, setManualDni] = useState('');

  const processValidation = async (endpoint, body) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}${endpoint}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Error de validación');
      }
      setScanResult(data);
    } catch (err) {
      setError(err.message);
      setTimeout(() => setError(null), 4000);
    } finally {
      setLoading(false);
    }
  };

  const handleScan = (text) => {
    if (loading || scanResult) return;
    processValidation('/qr/validar', { token: text });
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!manualDni.trim() || loading || scanResult) return;
    processValidation('/qr/validar-dni', { dni: manualDni.trim() });
    setManualDni('');
  };

  const resetScanner = () => {
    setScanResult(null);
    setError(null);
    setLoading(false);
  };

  if (scanResult) {
    return <ResultPanel result={scanResult} onReset={resetScanner} />;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto flex flex-col items-center space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900">Control de Acceso</h1>
        <p className="text-gray-500 text-sm mt-1">Apuntá la cámara al QR del socio o ingresá el DNI manualmente.</p>
      </div>

      <div className="w-full max-w-md aspect-square bg-gray-900 rounded-2xl overflow-hidden relative shadow-lg">
        {loading ? (
          <div className="w-full h-full flex items-center justify-center text-white"><Loader size={48} className="animate-spin" /></div>
        ) : (
          <Scanner
            onDecode={handleScan}
            onError={(err) => console.warn(err?.message)}
            containerStyle={{ width: '100%', height: '100%' }}
            videoStyle={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
        {!loading && <div className="absolute inset-0 border-8 border-white/20 rounded-2xl pointer-events-none" />}
      </div>

      {error && (
        <div className="w-full max-w-md p-3 text-center bg-red-100 text-red-700 rounded-lg border border-red-200 font-semibold animate-pulse">
          {error}
        </div>
      )}

      <form onSubmit={handleManualSubmit} className="w-full max-w-md space-y-2">
        <label htmlFor="dni-manual" className="text-sm font-semibold text-gray-600">Ingreso Manual</label>
        <div className="flex gap-2">
          <input
            id="dni-manual" type="text" inputMode="numeric" pattern="\d*"
            value={manualDni} onChange={(e) => setManualDni(e.target.value)}
            placeholder="Ingresar DNI sin puntos"
            className="flex-grow p-3 rounded-lg border bg-gray-50 border-gray-200 focus:border-blue-500 focus:ring-blue-500 transition-colors"
            disabled={loading}
          />
          <button type="submit" className="px-6 bg-slate-700 text-white font-bold rounded-lg hover:bg-slate-800 active:scale-95 transition-all shadow-sm disabled:bg-slate-400" disabled={loading || !manualDni}>
            Validar
          </button>
        </div>
      </form>
    </div>
  );
}