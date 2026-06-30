import { useState } from 'react';
import { Link } from 'react-router-dom';

export default function Registro() {
    const [formData, setFormData] = useState({
        dni: '',
        nombre: '',
        apellido: '',
        email: '',
        telefono: '',
        password: '',
        confirmPassword: '',
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccess(false);

        if (formData.password !== formData.confirmPassword) {
            setError("Las contraseñas no coinciden.");
            return;
        }
        if (formData.password.length < 8) {
            setError("La contraseña debe tener al menos 8 caracteres.");
            return;
        }

        setLoading(true);

        try {
            // Excluimos confirmPassword del payload que se envía al backend
            const { confirmPassword, ...payload } = formData;
            const response = await fetch('http://127.0.0.1:8000/usuarios/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Ocurrió un error al registrar la solicitud.');
            }

            setSuccess(true);
            setFormData({ dni: '', nombre: '', apellido: '', email: '', telefono: '', password: '', confirmPassword: '' });

        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="max-w-md mx-auto mt-10 p-8 bg-white rounded-lg shadow-xl text-center">
                <h2 className="text-2xl font-bold text-green-600 mb-4">¡Solicitud Enviada!</h2>
                <p className="text-slate-600">Tu solicitud de alta ha sido enviada correctamente. Un administrador la revisará a la brevedad.</p>
                <p className="text-slate-600 mt-2">Recibirás una notificación cuando tu cuenta sea aprobada.</p>
                <Link to="/login" className="mt-6 inline-block bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors">
                    Volver al Login
                </Link>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 space-y-6">
                <div className="text-center">
                    <h1 className="text-3xl font-bold text-slate-800">Crear Cuenta de Socio</h1>
                    <p className="text-slate-500 mt-2">Completa tus datos para iniciar el proceso de alta.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input type="text" name="nombre" placeholder="Nombre" value={formData.nombre} onChange={handleChange} required className="w-full p-3 rounded-lg border bg-slate-50 focus:border-blue-500 focus:ring-blue-500" />
                        <input type="text" name="apellido" placeholder="Apellido" value={formData.apellido} onChange={handleChange} required className="w-full p-3 rounded-lg border bg-slate-50 focus:border-blue-500 focus:ring-blue-500" />
                    </div>
                    <input type="text" name="dni" placeholder="DNI (sin puntos)" value={formData.dni} onChange={handleChange} required className="w-full p-3 rounded-lg border bg-slate-50 focus:border-blue-500 focus:ring-blue-500" />
                    <input type="email" name="email" placeholder="Email" value={formData.email} onChange={handleChange} required className="w-full p-3 rounded-lg border bg-slate-50 focus:border-blue-500 focus:ring-blue-500" />
                    <input type="tel" name="telefono" placeholder="Teléfono (opcional)" value={formData.telefono} onChange={handleChange} className="w-full p-3 rounded-lg border bg-slate-50 focus:border-blue-500 focus:ring-blue-500" />
                    <input type="password" name="password" placeholder="Contraseña (mín. 8 caracteres)" value={formData.password} onChange={handleChange} required className="w-full p-3 rounded-lg border bg-slate-50 focus:border-blue-500 focus:ring-blue-500" />
                    <input type="password" name="confirmPassword" placeholder="Confirmar Contraseña" value={formData.confirmPassword} onChange={handleChange} required className="w-full p-3 rounded-lg border bg-slate-50 focus:border-blue-500 focus:ring-blue-500" />
                    
                    {error && <p className="text-red-500 text-sm text-center">{error}</p>}

                    <div>
                        <button type="submit" disabled={loading} className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-slate-400 disabled:cursor-not-allowed">
                            {loading ? 'Enviando...' : 'Enviar Solicitud de Alta'}
                        </button>
                    </div>
                </form>
                <p className="text-center text-sm text-slate-600">
                    ¿Ya tienes cuenta?{' '}
                    <Link to="/login" className="font-medium text-blue-600 hover:text-blue-500">
                        Inicia sesión aquí
                    </Link>
                </p>
            </div>
        </div>
    );
}