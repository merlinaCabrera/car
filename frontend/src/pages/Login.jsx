import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff } from 'lucide-react';

export default function Login() {
    const [formData, setFormData] = useState({
        dni: '',
        password: '',
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const navigate = useNavigate();
    const { login } = useAuth();
    const [showPassword, setShowPassword] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            // La función login ahora devuelve true en caso de éxito
            // y se encarga de guardar el token y disparar la carga del perfil.
            await login(formData.dni, formData.password);

            // Redirección única: siempre al panel principal del socio.
            // El MainLayout se encargará de mostrar los accesos a otros paneles (ej: Admin).
            navigate('/socio', { replace: true });
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 space-y-6">
                <div className="text-center">
                    <h1 className="text-3xl font-bold text-slate-800">Iniciar Sesión</h1>
                    <p className="text-slate-500 mt-2">Accede a tu panel de socio.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <input type="text" name="dni" placeholder="DNI" value={formData.dni} onChange={handleChange} required className="w-full p-3 rounded-lg border bg-slate-50 focus:border-blue-500 focus:ring-blue-500" />
                    <div className="relative">
                        <input type={showPassword ? 'text' : 'password'} name="password" placeholder="Contraseña" value={formData.password} onChange={handleChange} required className="w-full p-3 pr-10 rounded-lg border bg-slate-50 focus:border-blue-500 focus:ring-blue-500" />
                        <button
                            type="button"
                            onClick={() => setShowPassword(prev => !prev)}
                            className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700"
                        >
                            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                        </button>
                    </div>
                    
                    {error && <p className="text-red-500 text-sm text-center">{error}</p>}

                    <button type="submit" disabled={loading} className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-slate-400 disabled:cursor-not-allowed">
                        {loading ? 'Ingresando...' : 'Ingresar'}
                    </button>
                </form>
                <p className="text-center text-sm text-slate-600">
                    ¿No tienes cuenta?{' '}
                    <Link to="/registro" className="font-medium text-blue-600 hover:text-blue-500">Regístrate aquí</Link>
                </p>
            </div>
        </div>
    );
}