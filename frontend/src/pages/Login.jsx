import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function Login() {
  const [status, setStatus] = useState('idle'); // 'idle' | 'error'
  const navigate = useNavigate();

  const handleLogin = (e) => {
    e.preventDefault();
    // Simulando comportamiento de error que pediste
    // Si el logueo fuera exitoso harías: navigate('/socio');
    setStatus('error');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 border border-slate-100">
        
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-blue-900 tracking-tight">Portal del Socio</h1>
          <p className="text-slate-500 mt-2">Ingrese a su cuenta</p>
        </div>

        {status === 'error' && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl relative text-center font-bold text-xs tracking-wider">
            USUARIO O CONTRASEÑA INCORRECTOS
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Usuario (DNI o Email)</label>
            <input 
              type="text" 
              className={`w-full p-3 border rounded-xl focus:ring-2 focus:outline-none transition-colors ${status === 'error' ? 'border-red-500 focus:ring-red-200' : 'border-slate-200 focus:ring-blue-200 focus:border-blue-500'}`}
              placeholder="Ingrese su usuario" 
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Contraseña</label>
            <input 
              type="password" 
              className={`w-full p-3 border rounded-xl focus:ring-2 focus:outline-none transition-colors ${status === 'error' ? 'border-red-500 focus:ring-red-200' : 'border-slate-200 focus:ring-blue-200 focus:border-blue-500'}`}
              placeholder="••••••••" 
            />
          </div>

          <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-xl hover:bg-blue-700 transition-colors shadow-lg mt-2">
            Ingresar
          </button>
        </form>

        <div className="mt-8 flex flex-col items-center space-y-4">
          <Link to="/recuperar-password" className="text-sm text-blue-600 hover:text-blue-800 font-semibold transition-colors">
            Olvidé mi contraseña
          </Link>
          <Link to="/registro" className="text-sm text-slate-600 hover:text-blue-600 transition-colors">
            ¿No es socio? <span className="font-semibold underline">Envíe solicitud aquí</span>
          </Link>
          
          <div className="w-full border-t border-slate-100 pt-4 mt-2 text-center">
            <Link to="/" className="text-sm text-slate-400 hover:text-blue-600 transition-colors">
              ← Volver al inicio
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}