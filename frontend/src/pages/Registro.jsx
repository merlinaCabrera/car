import { textoError } from '../utils/errores';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';

export default function Registro() {
    const [formData, setFormData] = useState({
        dni: '',
        nombre: '',
        apellido: '',
        email: '',
        fecha_nacimiento: '',
        telefono: '',
        password: '',
        confirmPassword: '',
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    // Caso especial: el DNI pertenece a una cuenta dada de baja — en vez del
    // error genérico, se ofrece pedir la reactivación con un solo botón.
    const [pedidoReactivacion, setPedidoReactivacion] = useState(null) // { idUsuario, nombre }
    const [enviandoReactivacion, setEnviandoReactivacion] = useState(false)
    const [reactivacionEnviada, setReactivacionEnviada] = useState(false)

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
        if (!formData.fecha_nacimiento) {
            setError("La fecha de nacimiento es obligatoria.");
            return;
        }

        setLoading(true);

        try {   
            // El value de <input type="date"> siempre llega como 'YYYY-MM-DD' desde el browser.
            // NO usamos new Date(str).toISOString() porque en iOS/Android interpreta la
            // cadena como medianoche UTC y la conversión a zona local puede retroceder un día.
            const { confirmPassword, ...payload } = formData;
            const payloadFinal = {
                ...payload,
                fecha_nacimiento: formData.fecha_nacimiento.trim(), // ya es YYYY-MM-DD
            };

            const response = await fetch(`${import.meta.env.VITE_API_URL ?? 'http://localhost:8000'}/usuarios/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payloadFinal),
            });

            if (!response.ok) {
                const errorData = await response.json();
                // El backend manda un objeto (no un string) solo para el
                // caso "esta cuenta fue dada de baja" — el resto de los
                // errores siguen siendo un string plano como antes.
                if (errorData.detail && typeof errorData.detail === 'object' && errorData.detail.tipo === 'dado_de_baja') {
                    setPedidoReactivacion({
                        idUsuario: errorData.detail.id_usuario,
                        nombre: formData.nombre,
                    });
                    return;
                }
                throw new Error(textoError(errorData?.detail, 'Ocurrió un error al registrar la solicitud.'));
            }

            setSuccess(true);
            setFormData({ dni: '', nombre: '', apellido: '', email: '', fecha_nacimiento: '', telefono: '', password: '', confirmPassword: '' });

        } catch (err) {
            // TypeError: Failed to fetch → sin conexión o backend caído
            const mensaje = (err instanceof TypeError)
                ? 'No se pudo conectar con el servidor. Verificá tu conexión a internet.'
                : err.message;
            setError(mensaje);
        } finally {
            setLoading(false);
        }
    };

    const handleSolicitarReactivacion = async () => {
        if (!pedidoReactivacion) return;
        setEnviandoReactivacion(true);
        try {
            const response = await fetch(
                `${import.meta.env.VITE_API_URL ?? 'http://localhost:8000'}/usuarios/${pedidoReactivacion.idUsuario}/solicitar-reactivacion`,
                { method: 'POST' }
            );
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(textoError(errorData?.detail, 'No se pudo enviar el pedido.'));
            }
            setReactivacionEnviada(true);
        } catch (err) {
            setError(err.message);
            setPedidoReactivacion(null);
        } finally {
            setEnviandoReactivacion(false);
        }
    };

    if (reactivacionEnviada) {
        return (
            <div className="max-w-md mx-auto my-10 p-8 bg-white rounded-2xl border border-gray-200 shadow-lg text-center">
                <h2 className="font-display text-2xl font-semibold text-green-700 mb-4">¡Pedido enviado!</h2>
                <p className="text-gray-600 leading-relaxed">Le avisamos al club que querés reactivar tu cuenta. Te van a contactar para confirmarlo.</p>
                <Link to="/login" className="mt-6 inline-block bg-blue-600 text-white font-bold py-2.5 px-5 rounded-xl hover:bg-blue-700 transition-colors">
                    Volver al Login
                </Link>
            </div>
        );
    }

    if (pedidoReactivacion) {
        return (
            <div className="max-w-md mx-auto my-10 p-8 bg-white rounded-2xl border border-gray-200 shadow-lg text-center">
                <h2 className="font-display text-2xl font-semibold text-amber-700 mb-4">Esta cuenta fue dada de baja</h2>
                <p className="text-gray-600 leading-relaxed mb-6">
                    Ya existe una cuenta registrada con ese DNI, pero está dada de baja del club.
                    Si querés volver, podés pedirle al club que la reactive.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <button
                        onClick={handleSolicitarReactivacion}
                        disabled={enviandoReactivacion}
                        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-2.5 px-5 rounded-xl transition-colors"
                    >
                        {enviandoReactivacion ? 'Enviando…' : 'Solicitar reactivación'}
                    </button>
                    <button
                        onClick={() => setPedidoReactivacion(null)}
                        disabled={enviandoReactivacion}
                        className="text-gray-500 hover:text-gray-800 font-semibold py-2.5 px-5"
                    >
                        Cancelar
                    </button>
                </div>
            </div>
        );
    }

    if (success) {
        return (
            <div className="max-w-md mx-auto my-10 p-8 bg-white rounded-2xl border border-gray-200 shadow-lg text-center">
                <h2 className="font-display text-2xl font-semibold text-green-700 mb-4">¡Solicitud Enviada!</h2>
                <p className="text-gray-600 leading-relaxed">Tu solicitud de alta ha sido enviada correctamente. Un administrador la revisará a la brevedad.</p>
                <p className="text-gray-600 leading-relaxed mt-2">Recibirás una notificación cuando tu cuenta sea aprobada.</p>
                <Link to="/login" className="mt-6 inline-block bg-blue-600 text-white font-bold py-2.5 px-5 rounded-xl hover:bg-blue-700 transition-colors">
                    Volver al Login
                </Link>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 shadow-lg p-8 space-y-6">
                <div className="text-center">
                {/* Cabecera de identidad: el escudo completo, sobre fondo
                    claro y con margen perimetral (doc 02). Las pantallas de
                    acceso no llevaban ninguna marca del club. */}
                <img src="/escudo-car.png" alt="Escudo Club Atlético Roberts" className="h-20 w-auto object-contain mx-auto mb-4" />
                    <h1 className="text-3xl font-semibold text-gray-900">Crear Cuenta de Socio</h1>
                    <p className="text-gray-500 text-sm mt-2">Completa tus datos para iniciar el proceso de alta.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input type="text" name="nombre" placeholder="Nombre" value={formData.nombre} onChange={handleChange} required className="w-full p-3 rounded-xl border border-gray-300 bg-white text-gray-900 placeholder-gray-400 transition-colors focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/25" />
                        <input type="text" name="apellido" placeholder="Apellido" value={formData.apellido} onChange={handleChange} required className="w-full p-3 rounded-xl border border-gray-300 bg-white text-gray-900 placeholder-gray-400 transition-colors focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/25" />
                    </div>
                    <input type="text" name="dni" placeholder="DNI (sin puntos)" value={formData.dni} onChange={handleChange} required className="w-full p-3 rounded-xl border border-gray-300 bg-white text-gray-900 placeholder-gray-400 transition-colors focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/25" />
                    <div>
                        <label htmlFor="fecha_nacimiento" className="block text-sm font-medium text-gray-700 mb-1.5">Fecha de Nacimiento</label>
                        <input id="fecha_nacimiento" type="date" name="fecha_nacimiento" value={formData.fecha_nacimiento} onChange={handleChange} required className="w-full p-3 rounded-xl border border-gray-300 bg-white text-gray-900 placeholder-gray-400 transition-colors focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/25" />
                    </div>
                    <input type="email" name="email" placeholder="Email" value={formData.email} onChange={handleChange} required className="w-full p-3 rounded-xl border border-gray-300 bg-white text-gray-900 placeholder-gray-400 transition-colors focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/25" />
                    <input type="tel" name="telefono" placeholder="Teléfono (opcional)" value={formData.telefono} onChange={handleChange} className="w-full p-3 rounded-xl border border-gray-300 bg-white text-gray-900 placeholder-gray-400 transition-colors focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/25" />
                    <div className="relative">
                        <input type={showPassword ? 'text' : 'password'} name="password" placeholder="Contraseña (mín. 8 caracteres)" value={formData.password} onChange={handleChange} required className="w-full p-3 pr-11 rounded-xl border border-gray-300 bg-white text-gray-900 placeholder-gray-400 transition-colors focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/25" />
                        <button
                            type="button"
                            onClick={() => setShowPassword(prev => !prev)}
                            className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-gray-400 hover:text-blue-600 transition-colors"
                        >
                            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                        </button>
                    </div>
                    <div className="relative">
                        <input type={showConfirmPassword ? 'text' : 'password'} name="confirmPassword" placeholder="Confirmar Contraseña" value={formData.confirmPassword} onChange={handleChange} required className="w-full p-3 pr-11 rounded-xl border border-gray-300 bg-white text-gray-900 placeholder-gray-400 transition-colors focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/25" />
                        <button
                            type="button"
                            onClick={() => setShowConfirmPassword(prev => !prev)}
                            className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-gray-400 hover:text-blue-600 transition-colors"
                        >
                            {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                        </button>
                    </div>
                    
                    {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-center">{error}</p>}

                    <div>
                        <button type="submit" disabled={loading} className="w-full flex justify-center py-3.5 px-4 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-600/40 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed">
                            {loading ? 'Enviando...' : 'Enviar Solicitud de Alta'}
                        </button>
                    </div>
                </form>
                <p className="text-center text-sm text-gray-500">
                    ¿Ya tienes cuenta?{' '}
                    <Link to="/login" className="font-semibold text-blue-600 hover:text-blue-700 underline-offset-2 hover:underline">
                        Inicia sesión aquí
                    </Link>
                </p>
            </div>
        </div>
    );
}