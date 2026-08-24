import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff } from 'lucide-react';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export default function Login() {
    const [formData, setFormData] = useState({
        dni: '',
        password: '',
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [pedidoReactivacion, setPedidoReactivacion] = useState(null); // { idUsuario }
    const [enviandoReactivacion, setEnviandoReactivacion] = useState(false);
    const [reactivacionEnviada, setReactivacionEnviada] = useState(false);
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { login } = useAuth();
    const [showPassword, setShowPassword] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        setPedidoReactivacion(null);
        setReactivacionEnviada(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setPedidoReactivacion(null);
        setLoading(true);

        try {
            // login() ahora devuelve el perfil completo del usuario recién
            // autenticado (con roles_asignados), así que podemos decidir el
            // redirect correcto sin esperar un re-render del contexto.
            const userData = await login(formData.dni, formData.password);
            const roles = (userData?.roles_asignados ?? [])
                .map(ur => ur.rol?.nombre)
                .filter(Boolean);
 
            let destino = '/socio'; // Por defecto, para socios y otros roles.
 
            if (roles.includes('admin_general')) {
                destino = '/admin';
            }

            // Si venía de un link que la mandó acá por no tener sesión
            // (ej: el link "Revisar Solicitudes" del mail al club), la
            // llevamos a donde quería ir en vez del destino genérico por rol.
            // El 'next' viene de RutaPrivada (ej: se armó cuando alguien sin
            // sesión clickeó el link "Revisar Solicitudes" del mail). Pero
            // ese query param queda pegado en la URL del navegador — si
            // DESPUÉS se loguea una cuenta distinta (ej: un socio común) en
            // esa misma pestaña, no tiene sentido mandarla a una pantalla
            // de admin a la que ni siquiera tiene acceso. Solo lo honramos
            // si además la cuenta que acaba de loguear es admin.
            const esAdmin = roles.includes('admin_general') || roles.includes('personal_administrativo');
            const next = searchParams.get('next');
            if (next && next.startsWith('/admin') && esAdmin) destino = next;

            navigate(destino, { replace: true });
        } catch (err) {
            // Caso especial: cuenta dada de baja — en vez de un error plano,
            // ofrecemos pedir la reactivación sin que la persona tenga que
            // acordarse de su contraseña vieja ni volver a llenar el
            // formulario de alta entero.
            if (err.detail?.tipo === 'dado_de_baja') {
                setPedidoReactivacion({ idUsuario: err.detail.id_usuario });
            } else {
                setError(err.message);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleSolicitarReactivacion = async () => {
        if (!pedidoReactivacion) return;
        setEnviandoReactivacion(true);
        try {
            const res = await fetch(`${API}/usuarios/${pedidoReactivacion.idUsuario}/solicitar-reactivacion`, {
                method: 'POST',
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.detail || 'No se pudo enviar el pedido.');
            }
            setReactivacionEnviada(true);
        } catch (err) {
            setError(err.message);
        } finally {
            setEnviandoReactivacion(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 space-y-6">
                <div className="text-center">
                    <h1 className="text-3xl font-bold text-slate-800">Iniciar Sesión</h1>
                    <p className="text-slate-500 mt-2">Accede a tu panel de socio.</p>
                </div>

                {pedidoReactivacion ? (
                    <div className="text-center space-y-4 py-2">
                        {reactivacionEnviada ? (
                            <>
                                <h2 className="text-lg font-bold text-green-700">¡Listo!</h2>
                                <p className="text-sm text-slate-600">
                                    Tu pedido de reactivación fue enviado al club. Te van a avisar por mail
                                    cuando esté resuelto.
                                </p>
                            </>
                        ) : (
                            <>
                                <h2 className="text-lg font-bold text-orange-600">Esta cuenta fue dada de baja</h2>
                                <p className="text-sm text-slate-600">
                                    Ya existe una cuenta registrada con ese DNI, pero está dada de baja del club.
                                    Si querés volver, podés pedirle al club que la reactive.
                                </p>
                                <div className="flex items-center justify-center gap-3 pt-2">
                                    <button
                                        onClick={handleSolicitarReactivacion}
                                        disabled={enviandoReactivacion}
                                        className="px-4 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors"
                                    >
                                        {enviandoReactivacion ? 'Enviando…' : 'Solicitar reactivación'}
                                    </button>
                                    <button
                                        onClick={() => setPedidoReactivacion(null)}
                                        disabled={enviandoReactivacion}
                                        className="text-sm text-slate-500 hover:text-slate-700 font-medium"
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                ) : (
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
                    
                    <div className="text-right">
                        <Link to="/recuperar-password" className="text-sm text-blue-600 hover:text-blue-500">
                            ¿Olvidaste tu contraseña?
                        </Link>
                    </div>

                    {error && <p className="text-red-500 text-sm text-center">{error}</p>}

                    <button type="submit" disabled={loading} className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-slate-400 disabled:cursor-not-allowed">
                        {loading ? 'Ingresando...' : 'Ingresar'}
                    </button>
                </form>
                )}
                <p className="text-center text-sm text-slate-600">
                    ¿No tienes cuenta?{' '}
                    <Link to="/registro" className="font-medium text-blue-600 hover:text-blue-500">Regístrate aquí</Link>
                </p>
            </div>
        </div>
    );
}