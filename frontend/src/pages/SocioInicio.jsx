export default function SocioInicio() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold mb-2">Hola, Merlina 👋</h2>
      
      {/* Tarjeta de Carnet Virtual / Estado */}
      <div className="bg-green-600 rounded-2xl p-6 flex flex-col items-center justify-center shadow-lg relative overflow-hidden">
        {/* Efectos decorativos de fondo */}
        <div className="absolute top-0 right-0 -mr-4 -mt-4 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -ml-4 -mb-4 w-24 h-24 bg-white opacity-10 rounded-full blur-xl"></div>
        
        <h3 className="text-xl font-bold mb-1 z-10 tracking-wide text-white">SOCIO ACTIVO</h3>
        <p className="text-green-100 text-sm mb-5 z-10">No adeuda cuotas</p>
        
        {/* Espacio para Código QR */}
        <div className="bg-white p-3 rounded-xl z-10 shadow-inner">
          <div className="w-40 h-40 border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 bg-gray-50 rounded-lg">
            <span className="text-sm">QR_CODE_AQUI</span>
          </div>
        </div>
        <p className="mt-3 text-xs text-green-100 z-10 font-medium">Presentá este código en puerta</p>
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