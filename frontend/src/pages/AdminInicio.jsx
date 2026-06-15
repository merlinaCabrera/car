import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function AdminInicio() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="space-y-8 mt-10 px-4 sm:px-0">
      {/* Cabecera */}
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-slate-800">Hola, {user?.nombre || 'Admin'} 👋</h2>
      </div>

      {/* Sección 1: Acciones Rápidas (CTA Lector QR) */}
      <button 
        onClick={() => navigate('/admin/escaner')}
        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-6 px-4 rounded-2xl shadow-xl transition-transform transform active:scale-95 text-lg md:text-2xl flex items-center justify-center gap-3"
      >
        <span className="text-2xl md:text-3xl">📷</span> LECTOR DE QR - Control de Acceso
      </button>

      {/* Sección 2: Grilla de Métricas */}
      <div className="grid grid-cols-3 gap-3 md:gap-6">
        <div className="bg-slate-800 rounded-2xl p-4 md:p-6 shadow-md border border-slate-700 flex flex-col items-center justify-center transition-colors">
          <span className="text-slate-400 text-[10px] md:text-sm font-semibold uppercase tracking-wide text-center">Solicitudes</span>
          <span className="text-2xl md:text-4xl font-bold text-amber-400 mt-1">4</span>
        </div>
        <div className="bg-slate-800 rounded-2xl p-4 md:p-6 shadow-md border border-slate-700 flex flex-col items-center justify-center transition-colors">
          <span className="text-slate-400 text-[10px] md:text-sm font-semibold uppercase tracking-wide text-center">Pagos</span>
          <span className="text-2xl md:text-4xl font-bold text-orange-400 mt-1">12</span>
        </div>
        <div className="bg-slate-800 rounded-2xl p-4 md:p-6 shadow-md border border-slate-700 flex flex-col items-center justify-center transition-colors">
          <span className="text-slate-400 text-[10px] md:text-sm font-semibold uppercase tracking-wide text-center">Socios</span>
          <span className="text-2xl md:text-4xl font-bold text-blue-400 mt-1">342</span>
        </div>
      </div>

      {/* Sección 3: Gestión de Usuarios */}
      <div className="bg-slate-800 rounded-3xl p-5 md:p-8 shadow-xl border border-slate-700">
        <h3 className="text-xl font-bold text-white mb-4">Gestión de Roles</h3>
        
        <input 
          type="search" 
          placeholder="Buscar por DNI o Apellido..." 
          className="w-full bg-slate-900 text-white border border-slate-700 rounded-xl px-4 py-3 mb-6 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-500 transition-shadow"
        />

        <div className="space-y-4">
          {/* Usuario 1 */}
          <div className="bg-slate-700/50 p-4 rounded-2xl border border-slate-600/50 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors hover:bg-slate-700">
            <div>
              <p className="font-bold text-slate-100 text-lg">Sergio Acosta</p>
              <p className="text-sm text-slate-400 font-medium">DNI: 44.196.940</p>
            </div>
            <div className="flex items-center gap-3">
              <select defaultValue="socio" className="bg-slate-900 text-slate-200 border border-slate-600 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full md:w-auto outline-none">
                <option value="socio">Socio</option>
                <option value="jugador">Jugador</option>
                <option value="admin">Admin Temporal</option>
              </select>
              <button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-4 rounded-xl transition-colors text-sm whitespace-nowrap">
                Guardar
              </button>
            </div>
          </div>

          {/* Usuario 2 */}
          <div className="bg-slate-700/50 p-4 rounded-2xl border border-slate-600/50 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors hover:bg-slate-700">
            <div>
              <p className="font-bold text-slate-100 text-lg">Thiago Cabrera</p>
              <p className="text-sm text-slate-400 font-medium">DNI: 47.545.053</p>
            </div>
            <div className="flex items-center gap-3">
              <select defaultValue="jugador" className="bg-slate-900 text-slate-200 border border-slate-600 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full md:w-auto outline-none">
                <option value="socio">Socio</option>
                <option value="jugador">Jugador</option>
                <option value="admin">Admin Temporal</option>
              </select>
              <button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-4 rounded-xl transition-colors text-sm whitespace-nowrap">
                Guardar
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}