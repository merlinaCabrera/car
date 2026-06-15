import { Scanner } from '@yudiel/react-qr-scanner';
import { useNavigate } from 'react-router-dom';

export default function AdminQRScanner() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 mt-10 px-4 sm:px-0 max-w-2xl mx-auto flex flex-col items-center">
      <div className="w-full mb-2 text-center">
        <h2 className="text-3xl font-bold text-slate-800">Control de Acceso</h2>
        <p className="text-slate-500 mt-2">Escanea el código QR del socio o jugador</p>
      </div>

      {/* Contenedor del escáner con diseño de "dispositivo" */}
      <div className="w-full bg-slate-900 rounded-[2rem] overflow-hidden shadow-2xl border-[8px] border-slate-800 relative aspect-square max-h-[500px]">
        <Scanner 
          onScan={(result) => alert(`QR Escaneado: ${result[0]?.rawValue}`)} 
          onError={(error) => console.error(error?.message)}
        />
      </div>

      <button 
        onClick={() => navigate('/admin')}
        className="w-full md:w-auto mt-6 bg-slate-800 text-white font-bold py-4 px-12 rounded-2xl shadow-lg hover:bg-slate-700 transition-colors active:scale-95"
      >
        Volver al Panel
      </button>
    </div>
  );
}