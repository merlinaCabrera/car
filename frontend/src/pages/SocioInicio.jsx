import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function SocioInicio() {
  // MOCK: Toggle para probar la UI condicional (Activo vs Moroso)
  const [isMoroso, setIsMoroso] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-2xl font-semibold text-slate-800">Hola, Sergio 👋</h2>
        {/* Botón temporal para alternar el estado y probar ambas vistas */}
        <button onClick={() => setIsMoroso(!isMoroso)} className="text-xs font-semibold text-slate-500 bg-slate-200 px-3 py-1 rounded-full hover:bg-slate-300 transition-colors">
          Alternar Estado
        </button>
      </div>
      
      {/* Tarjeta de Carnet Virtual / Estado */}
      <div className={`${isMoroso ? 'bg-red-600 border-red-500' : 'bg-green-600 border-green-500'} rounded-2xl p-6 flex flex-col items-center justify-center shadow-xl relative overflow-hidden border-2 transition-colors duration-500`}>
        {/* Efectos decorativos de fondo */}
        <div className="absolute top-0 right-0 -mr-4 -mt-4 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -ml-4 -mb-4 w-24 h-24 bg-white opacity-10 rounded-full blur-xl"></div>
        
        <h3 className="text-xl font-bold mb-1 z-10 tracking-wide text-white">
          {isMoroso ? 'SOCIO MOROSO' : 'SOCIO ACTIVO'}
        </h3>
        <p className={`${isMoroso ? 'text-red-100' : 'text-green-100'} text-sm mb-5 z-10 font-medium`}>
          {isMoroso ? 'Adeuda 2 cuotas' : 'No adeuda cuotas'}
        </p>
        
        {/* Espacio para Código QR */}
        <div className="bg-white p-3 rounded-xl z-10 shadow-inner">
          <div className={`w-40 h-40 border-2 border-dashed flex items-center justify-center rounded-lg ${isMoroso ? 'border-red-300 bg-red-50 text-red-400' : 'border-green-300 bg-green-50 text-green-400'}`}>
            <span className="text-sm font-bold tracking-widest">{isMoroso ? 'QR_BLOQUEADO' : 'QR_ACTIVO'}</span>
          </div>
        </div>
        <p className={`mt-3 text-xs z-10 font-medium ${isMoroso ? 'text-red-100' : 'text-green-100'}`}>
          {isMoroso ? 'Acceso denegado' : 'Presentá este código en puerta'}
        </p>

        {isMoroso && (
          <button onClick={() => navigate('/cuotas')} className="mt-6 z-10 bg-white text-red-600 font-bold py-2.5 px-8 rounded-full shadow-lg hover:bg-red-50 transition-colors transform hover:scale-105 active:scale-95 duration-200">
            Pagar Cuota
          </button>
        )}
      </div>

      {/* Calendario Deportivo Simple */}
      <div className="bg-slate-800 rounded-2xl p-5 shadow-md border border-slate-700/50">
        <h3 className="text-lg font-semibold mb-4 text-gray-100">Próximos Partidos</h3>
        
        <div className="space-y-4">
          <div className="flex gap-4 items-center bg-slate-900/50 p-3 rounded-xl border border-slate-700/30">
            <div className="bg-blue-900 rounded-lg p-2 text-center w-14 flex flex-col justify-center shadow-inner">
              <span className="text-[10px] text-blue-300 font-bold uppercase tracking-wider">Oct</span>
              <span className="text-xl font-bold text-white leading-none">15</span>
            </div>
            <div>
              <h4 className="font-semibold text-gray-200">Fútbol vs. San Martín</h4>
              <p className="text-xs text-gray-400 mt-1">Cancha Principal • 19:00 hs</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}