import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function Registro() {
  const [status, setStatus] = useState('idle'); // Estados posibles: 'idle' | 'error' | 'success'
  const [isLoading, setIsLoading] = useState(false);
  const [emailError, setEmailError] = useState(false);
  const [formData, setFormData] = useState({
    nombre: '',
    apellido: '',
    dni: '',
    email: '',
    fechaNac: ''
  });
  const navigate = useNavigate();

  // Guard: Protección Inversa
  useEffect(() => {
    if (localStorage.getItem('isAuthenticated') === 'true') {
      navigate('/socio');
    }
  }, [navigate]);

  const isFormValid = Object.values(formData).every(val => val.length > 0) && !emailError;

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'dni') {
      setFormData({ ...formData, [name]: value.replace(/\D/g, '') });
    } else if (name === 'email') {
      setFormData({ ...formData, [name]: value });
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      setEmailError(value.length > 0 && !emailRegex.test(value));
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isFormValid) return;
    
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setStatus('success'); 
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 border border-slate-100">
        
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-blue-900 tracking-tight">Solicitud de Socio</h1>
          <p className="text-slate-500 text-sm mt-2">
            Completá tus datos para ser parte del Club Atlético Roberts.
          </p>
        </div>

        {status === 'success' ? (
          <div className="bg-green-50 border border-green-200 text-green-800 rounded-2xl p-6 text-center space-y-4">
            <svg className="w-16 h-16 text-green-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-xl font-bold">¡Solicitud enviada!</h2>
            <p className="text-sm">
              Formulario enviado con éxito, espere la aprobación. Te contactaremos pronto.
            </p>
            <Link to="/" className="inline-block mt-4 text-blue-600 hover:text-blue-800 font-semibold underline transition-colors">
              Volver al inicio
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Nombre</label>
                <input 
                  type="text" 
                  name="nombre"
                  value={formData.nombre}
                  onChange={handleChange}
                  className={`w-full p-3 border rounded-xl focus:ring-2 focus:outline-none transition-colors ${status === 'error' ? 'border-red-500 focus:ring-red-200' : 'border-slate-200 focus:ring-blue-200 focus:border-blue-500'}`}
                  placeholder="Juan" 
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Apellido</label>
                <input 
                  type="text" 
                  name="apellido"
                  value={formData.apellido}
                  onChange={handleChange}
                  className={`w-full p-3 border rounded-xl focus:ring-2 focus:outline-none transition-colors ${status === 'error' ? 'border-red-500 focus:ring-red-200' : 'border-slate-200 focus:ring-blue-200 focus:border-blue-500'}`}
                  placeholder="Pérez" 
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">DNI</label>
              <input 
                type="text" 
                name="dni"
                value={formData.dni}
                onChange={handleChange}
                className={`w-full p-3 border rounded-xl focus:ring-2 focus:outline-none transition-colors ${status === 'error' ? 'border-red-500 focus:ring-red-200' : 'border-slate-200 focus:ring-blue-200 focus:border-blue-500'}`}
                placeholder="Sin puntos ni espacios" 
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Email</label>
              <input 
                type="text" 
                name="email"
                value={formData.email}
                onChange={handleChange}
                className={`w-full p-3 border rounded-xl focus:ring-2 focus:outline-none transition-colors ${status === 'error' || emailError ? 'border-red-500 focus:ring-red-200' : 'border-slate-200 focus:ring-blue-200 focus:border-blue-500'}`}
                placeholder="juan@ejemplo.com" 
              />
              {emailError && <p className="text-red-500 text-xs mt-1 font-medium">Formato de correo inválido</p>}
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Fecha de Nacimiento</label>
              <input 
                type="date" 
                name="fechaNac"
                value={formData.fechaNac}
                onChange={handleChange}
                className={`w-full p-3 border rounded-xl focus:ring-2 focus:outline-none transition-colors text-slate-600 ${status === 'error' ? 'border-red-500 focus:ring-red-200' : 'border-slate-200 focus:ring-blue-200 focus:border-blue-500'}`}
              />
            </div>

            {status === 'error' && (
              <p className="text-red-500 text-sm font-semibold text-center mt-2">
                Ha ocurrido un error al enviar el formulario. Verifica tus datos.
              </p>
            )}

            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 mt-4">
              <p className="text-xs text-blue-800 text-center leading-relaxed">
                Una vez enviada la solicitud, se te avisará por mail con los pasos a seguir.
              </p>
            </div>

            <button 
              type="submit" 
              disabled={!isFormValid || isLoading}
              className={`w-full flex justify-center items-center bg-blue-600 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg mt-6 ${(!isFormValid || isLoading) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700 active:scale-95'}`}
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
                'Enviar Solicitud'
              )}
            </button>
          </form>
        )}

        {status !== 'success' && (
          <div className="mt-8 text-center">
            <Link to="/" className="text-slate-400 hover:text-blue-600 text-sm font-medium transition-colors">
              ← Volver al inicio
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}