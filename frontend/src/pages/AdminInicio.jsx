export default function AdminInicio() {
  return (
    <div className="space-y-6 pb-6">
      <h2 className="text-2xl font-semibold mb-2">Panel de Control</h2>
      
      {/* Botón Escáner QR Destacado */}
      <button className="w-full bg-blue-600 hover:bg-blue-500 text-white py-10 rounded-3xl shadow-lg flex flex-col items-center justify-center gap-3 transition-transform active:scale-[0.98]">
        <svg className="w-14 h-14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm14 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
        </svg>
        <span className="text-xl font-bold tracking-widest">ESCANEAR QR</span>
      </button>

      {/* Alertas Administrativas */}
      <div className="bg-red-900/20 border border-red-900/50 rounded-2xl p-4 flex items-start gap-3 shadow-sm">
        <svg className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div>
          <h4 className="font-semibold text-red-400">Atención Requerida</h4>
          <p className="text-sm text-red-200 mt-1">Hay <strong>4 transferencias</strong> pendientes de validación manual.</p>
        </div>
      </div>

      {/* Buscador de Socios */}
      <div className="bg-slate-800 rounded-2xl p-5 shadow-md border border-slate-700/50">
        <h3 className="text-lg font-semibold mb-4 text-gray-100">Búsqueda Manual</h3>
        
        <div className="relative mb-5">
          <input 
            type="text" 
            placeholder="Ingresar DNI o Apellido..." 
            className="w-full bg-slate-900 border border-slate-600 rounded-xl py-3.5 pl-11 pr-4 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <svg className="w-5 h-5 text-gray-400 absolute left-4 top-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        {/* Resultados Simulados */}
        <div className="space-y-3">
          <div className="bg-slate-700/30 p-3.5 rounded-xl flex justify-between items-center border border-slate-600/50">
            <div>
              <p className="font-semibold text-gray-200">Gómez, Carlos</p>
              <p className="text-xs text-gray-400 mt-0.5">DNI: 34.567.890</p>
            </div>
            <span className="bg-green-900/30 text-green-400 text-[11px] px-2.5 py-1 rounded-md border border-green-800/50 font-bold uppercase tracking-wider">Al día</span>
          </div>
        </div>
      </div>
    </div>
  );
}