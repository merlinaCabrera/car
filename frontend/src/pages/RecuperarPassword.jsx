import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function RecuperarPassword() {
  const [isSuccess, setIsSuccess] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    // Simula éxito
    setIsSuccess(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 border border-slate-100">
        
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-blue-900 tracking-tight">Recuperar Contraseña</h1>
        </div>

        {isSuccess ? (
          <div className="text-center space-y-6">
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-2xl p-5 text-sm leading-relaxed shadow-inner">
              <strong>Aviso:</strong> SI USTED ESTÁ REGISTRADO se envió un mail con el instructivo para reestablecer su contraseña. Revise su bandeja de entrada (y la carpeta de spam).
            </div>
            <button 
              onClick={() => navigate('/')}
              className="w-full bg-slate-800 text-white font-bold py-3 px-4 rounded-xl hover:bg-slate-900 transition-colors shadow-lg"
            >
              Regresar al inicio
            </button>
          </div>
        ) : (
          <>
            <p className="text-slate-500 text-sm text-center mb-6 leading-relaxed">
              Ingresá tu DNI o correo electrónico y te enviaremos las instrucciones para recuperar tu acceso.
            </p>
            
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">DNI o Mail</label>
                <input type="text" required className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-200 focus:border-blue-500 focus:outline-none transition-colors" placeholder="Ej: 30123456 o juan@mail.com" />
              </div>
              <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-xl hover:bg-blue-700 transition-colors shadow-lg">
                Enviar solicitud
              </button>
            </form>

            <div className="mt-8 text-center pt-4 border-t border-slate-100">
              <Link to="/login" className="text-slate-400 hover:text-blue-600 text-sm font-medium transition-colors">
                ← Volver al Login
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}