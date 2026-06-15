export default function JugadorCalendario() {
  return (
    <div className="space-y-6 mt-8">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-2xl font-semibold text-slate-800">Mi Calendario Deportivo</h2>
      </div>

      <div className="bg-slate-800 rounded-2xl p-5 shadow-md border border-slate-700/50">
        <h3 className="text-lg font-semibold mb-4 text-gray-100">Próximos Partidos</h3>
        
        <div className="space-y-4">
          <div className="flex gap-4 items-center bg-slate-900/50 p-3 rounded-xl border border-slate-700/30">
            <div className="bg-blue-900 rounded-lg p-2 text-center w-14 flex flex-col justify-center shadow-inner">
              <span className="text-[10px] text-blue-300 font-bold uppercase tracking-wider">Nov</span>
              <span className="text-xl font-bold text-white leading-none">23</span>
            </div>
            <div>
              <h4 className="font-semibold text-gray-200">Sábado 23 - Atlético vs Deportivo</h4>
              <p className="text-xs text-gray-400 mt-1">Primera División • 16:00 hs</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}