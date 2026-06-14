import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function Registro() {
  const [formData, setFormData] = useState({
    nombre: '',
    apellido: '',
    dni: '',
    email: '',
    fechaNac: '',
    domicilio: ''
  });
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const navigate = useNavigate();

  // Guard: Protección Inversa
  useEffect(() => {
    if (localStorage.getItem('isAuthenticated') === 'true') {
      navigate('/socio');
    }
  }, [navigate]);

  // Lógica de Validación Estricta
  const validateField = (name, value) => {
    if (name === 'nombre' || name === 'apellido') {
      if (value.trim().length < 2) return 'Debe tener al menos 2 caracteres';
      if (/\d/.test(value)) return 'No debe contener números';
    }
    if (name === 'dni') {
      if (value.length > 0 && (value.length < 7 || value.length > 8)) return 'El DNI debe tener 7 u 8 números';
    }
    if (name === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (value.length > 0 && !emailRegex.test(value)) return 'Formato de correo inválido';
    }
    if (name === 'fechaNac') {
      if (!value) return 'La fecha de nacimiento es obligatoria';
    }
    if (name === 'domicilio') {
      if (value.trim().length < 5) return 'El domicilio debe tener al menos 5 caracteres';
    }
    return '';
  };

  // Comprobamos si el formulario completo es válido para habilitar el botón
  const isFormValid =
    Object.keys(formData).every((key) => formData[key].trim() !== '') &&
    Object.keys(formData).every((key) => validateField(key, formData[key]) === '');

  const handleChange = (e) => {
    const { name, value } = e.target;
    let newValue = value;

    if (name === 'dni') {
      newValue = value.replace(/\D/g, ''); // Fuerza solo números
    }

    setFormData((prev) => ({ ...prev, [name]: newValue }));

    // Validación en tiempo real al escribir
    const errorMsg = validateField(name, newValue);
    setErrors((prev) => ({ ...prev, [name]: errorMsg }));
  };

  const handleBlur = (e) => {
    const { name, value } = e.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
    const errorMsg = validateField(name, value);
    setErrors((prev) => ({ ...prev, [name]: errorMsg }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isFormValid) return;
    
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSuccess(true); 
    }, 2000);
  };

  // Clases dinámicas de Tailwind según el estado de validación
  const getInputClass = (name) => {
    const showError = errors[name] && (touched[name] || formData[name].length > 0);
    return `w-full p-3 border rounded-xl focus:ring-2 focus:outline-none transition-colors ${
      showError
        ? 'border-red-500 focus:ring-red-200'
        : 'border-slate-200 focus:ring-blue-200 focus:border-blue-500'
    }`;
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

        {isSuccess ? (
          <div className="bg-green-50 border-2 border-green-500 text-green-800 rounded-2xl p-6 text-center space-y-4 shadow-sm">
            <svg className="w-16 h-16 text-green-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-xl font-bold">¡Solicitud enviada!</h2>
            <p className="text-sm font-medium">
              Formulario enviado con éxito, espere la aprobación.
            </p>
            <Link to="/" className="inline-block mt-4 bg-green-600 text-white font-bold py-2 px-6 rounded-xl hover:bg-green-700 transition-colors shadow">
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
                  onBlur={handleBlur}
                  className={getInputClass('nombre')}
                  placeholder="Juan" 
                />
                {errors.nombre && (touched.nombre || formData.nombre.length > 0) && (
                  <p className="text-red-500 text-sm mt-1">{errors.nombre}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Apellido</label>
                <input 
                  type="text" 
                  name="apellido"
                  value={formData.apellido}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  className={getInputClass('apellido')}
                  placeholder="Pérez" 
                />
                {errors.apellido && (touched.apellido || formData.apellido.length > 0) && (
                  <p className="text-red-500 text-sm mt-1">{errors.apellido}</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">DNI</label>
              <input 
                type="text" 
                name="dni"
                value={formData.dni}
                onChange={handleChange}
                onBlur={handleBlur}
                className={getInputClass('dni')}
                placeholder="Sin puntos ni espacios" 
              />
              {errors.dni && (touched.dni || formData.dni.length > 0) && (
                <p className="text-red-500 text-sm mt-1">{errors.dni}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Email</label>
              <input 
                type="text" 
                name="email"
                value={formData.email}
                onChange={handleChange}
                onBlur={handleBlur}
                className={getInputClass('email')}
                placeholder="juan@ejemplo.com" 
              />
              {errors.email && (touched.email || formData.email.length > 0) && (
                <p className="text-red-500 text-sm mt-1">{errors.email}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Fecha de Nacimiento</label>
              <input 
                type="date" 
                name="fechaNac"
                value={formData.fechaNac}
                onChange={handleChange}
                onBlur={handleBlur}
                className={getInputClass('fechaNac')}
              />
              {errors.fechaNac && touched.fechaNac && (
                <p className="text-red-500 text-sm mt-1">{errors.fechaNac}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Domicilio</label>
              <input 
                type="text" 
                name="domicilio"
                value={formData.domicilio}
                onChange={handleChange}
                onBlur={handleBlur}
                className={getInputClass('domicilio')}
                placeholder="Ej: Calle Falsa 123" 
              />
              {errors.domicilio && (touched.domicilio || formData.domicilio.length > 0) && (
                <p className="text-red-500 text-sm mt-1">{errors.domicilio}</p>
              )}
            </div>

            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 mt-4">
              <p className="text-xs text-blue-800 text-center leading-relaxed">
                Una vez enviada la solicitud, se te avisará por mail con los pasos a seguir.
              </p>
            </div>

            <button 
              type="submit" 
              disabled={!isFormValid || isSubmitting}
              className={`w-full flex justify-center items-center bg-blue-600 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg mt-6 ${(!isFormValid || isSubmitting) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700 active:scale-95'}`}
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Enviando...
                </>
              ) : (
                'Enviar Solicitud'
              )}
            </button>
          </form>
        )}

        {!isSuccess && (
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