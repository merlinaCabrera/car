import { useState } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { useNavigate } from 'react-router-dom';

export default function AdminQRScanner() {
  const navigate = useNavigate();
  const [scannedUser, setScannedUser] = useState(null);
  const [scanError, setScanError] = useState('');

  const handleScan = (result) => {
    if (result && result.length > 0) {
      try {
        const data = JSON.parse(result[0].rawValue);
        setScannedUser(data);
        setScanError('');
      } catch (err) {
        setScanError('Código QR no reconocido o inválido');
        setScannedUser(null);
      }
    }
  };

  return (
    <div className="space-y-6 mt-10 px-4 sm:px-0 max-w-2xl mx-auto flex flex-col items-center">
      <div className="w-full mb-2 text-center">
        <h2 className="text-3xl font-bold text-slate-800">Control de Acceso</h2>
        <p className="text-slate-500 mt-2">Escanea el código QR del socio o jugador</p>
      </div>

      {/* Contenedor del escáner con diseño de "dispositivo" */}
      <div className="w-full bg-slate-900 rounded-[2rem] overflow-hidden shadow-2xl border-[8px] border-slate-800 relative aspect-square max-h-[500px]">
        <Scanner 
          onScan={handleScan} 
          onError={(error) => console.error(error?.message)}
        />
      </div>

      {/* Resultados del Escaneo */}
      {scanError && (
        <div className="w-full bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-2xl relative text-center mt-4 font-semibold shadow-sm">
          {scanError}
        </div>
      )}

      {scannedUser && (
        <div className="w-full bg-white border border-slate-200 rounded-3xl p-6 shadow-md mt-4 text-center">
          <h3 className="text-2xl font-bold text-slate-800">{scannedUser.nombre}</h3>
          <p className="text-slate-500 font-medium mt-1">DNI: {scannedUser.dni} | Rol: <span className="capitalize">{scannedUser.rol}</span></p>
          <div className="mt-5">
            <span className={`px-5 py-2.5 rounded-full font-bold text-sm tracking-wide shadow-sm border ${scannedUser.estado === 'Al día' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
              {scannedUser.estado === 'Al día' ? '✅ AL DÍA' : '❌ MOROSO'}
            </span>
          </div>
        </div>
      )}

      <button 
        onClick={() => navigate('/admin')}
        className="w-full md:w-auto mt-6 bg-slate-800 text-white font-bold py-4 px-12 rounded-2xl shadow-lg hover:bg-slate-700 transition-colors active:scale-95"
      >
        Volver al Panel
      </button>
    </div>
  );
}