import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function Login() {
  const [dni, setDni] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('idle'); // 'idle' | 'error'
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  // Guard: Protección Inversa
  useEffect(() => {
    if (localStorage.getItem('isAuthenticated') === 'true') {
      navigate('/socio');
    }
  }, [navigate]);

  const handleLogin = (e) => {
    e.preventDefault();
    setIsLoading(true);
    setStatus('idle');
    setTimeout(() => {
      setIsLoading(false);
      // Validación con el mock de Sergio Acosta
      if (dni === '44196940' && password === 'roberts2026') {
        localStorage.setItem('isAuthenticated', 'true');
        navigate('/socio');
      } else {
        setStatus('error');
      }
    }, 2000);
  };

  const isFormValid = dni.length > 0 && password.length > 0;

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
            <label className="block text-sm font-semibold text-slate-700 mb-1">Usuario (DNI)</label>
            <input 
              type="text" 
              value={dni}
              onChange={(e) => setDni(e.target.value.replace(/\D/g, ''))}
              className={`w-full p-3 border rounded-xl focus:ring-2 focus:outline-none transition-colors ${status === 'error' ? 'border-red-500 focus:ring-red-200' : 'border-slate-200 focus:ring-blue-200 focus:border-blue-500'}`}
              placeholder="Ingrese su DNI sin puntos" 
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Contraseña</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`w-full p-3 border rounded-xl focus:ring-2 focus:outline-none transition-colors ${status === 'error' ? 'border-red-500 focus:ring-red-200' : 'border-slate-200 focus:ring-blue-200 focus:border-blue-500'}`}
              placeholder="••••••••" 
            />
          </div>

          <button 
            type="submit" 
            disabled={!isFormValid || isLoading}
            className={`w-full flex items-center justify-center bg-blue-600 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg mt-2 ${(!isFormValid || isLoading) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700 active:scale-95'}`}
          >
            {isLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Procesando...
              </>
            ) : (
              'Ingresar'
            )}
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