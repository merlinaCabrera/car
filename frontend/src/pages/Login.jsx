import { textoError } from '../utils/errores';
import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { homePorRol, rolesDeUsuario } from '../components/RequireRole';
import { Eye, EyeOff, ArrowLeft } from 'lucide-react';

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
            // rolesDeUsuario() = la MISMA función que usa RequireRole, que
            // descarta roles desactivados y asignaciones vencidas igual que
            // require_roles() en el backend. Antes acá se mapeaba
            // roles_asignados crudo: una asignación vieja de admin mandaba a
            // un socio a /admin y el panel cargaba vacío con 403 (BUG-01).
            const roles = rolesDeUsuario(userData);

            // Mismo mapa rol → home que usa RequireRole (única fuente de
            // verdad). Desde la ronda 2 de QA la regla es: solo admin_general
            // aterriza en /admin; cualquier otra cuenta —incluso si además de
            // socio tiene personal_administrativo, técnico o escáner— cae en
            // /socio. Ver homePorRol() en components/RequireRole.jsx.
            let destino = homePorRol(roles);

            // Si venía de un link que la mandó acá por no tener sesión
            // (ej: el link "Revisar Solicitudes" del mail al club), la
            // llevamos a donde quería ir en vez del destino genérico por rol.
            // El 'next' viene de RutaPrivada (ej: se armó cuando alguien sin
            // sesión clickeó el link "Revisar Solicitudes" del mail). Pero
            // ese query param queda pegado en la URL del navegador — si
            // DESPUÉS se loguea una cuenta distinta (ej: un socio común) en
            // esa misma pestaña, no tiene sentido mandarla a una pantalla
            // de admin a la que ni siquiera tiene acceso. Solo lo honramos
            // si además la cuenta que acaba de loguear tiene acceso real al
            // panel. Ojo: esto NO contradice la regla de homePorRol() — ahí se
            // decide el destino POR DEFECTO (solo admin_general va a /admin);
            // acá hay una intención de navegación explícita de la persona, así
            // que alcanza con que la ruta le esté permitida.
            const puedeEntrarAlPanel =
                roles.includes('admin_general') || roles.includes('personal_administrativo');
            const next = searchParams.get('next');
            if (next && next.startsWith('/admin') && puedeEntrarAlPanel) destino = next;

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
                throw new Error(textoError(data?.detail, 'No se pudo enviar el pedido.'));
            }
            setReactivacionEnviada(true);
        } catch (err) {
            setError(err.message);
        } finally {
            setEnviandoReactivacion(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 relative">
            <Link
                to="/"
                className="absolute top-4 left-4 sm:top-6 sm:left-6 p-2 rounded-xl text-gray-500 hover:text-blue-600 hover:bg-white transition-colors"
                title="Volver al inicio"
            >
                <ArrowLeft size={22} />
            </Link>
            <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 shadow-lg p-8 space-y-6">
                <div className="text-center">
                {/* Cabecera de identidad: el escudo completo, sobre fondo
                    claro y con margen perimetral (doc 02). Las pantallas de
                    acceso no llevaban ninguna marca del club. */}
                <img src="/escudo-car.png" alt="Escudo Club Atlético Roberts" className="h-20 w-auto object-contain mx-auto mb-4" />
                    <h1 className="text-3xl font-semibold text-gray-900">Iniciar Sesión</h1>
                    <p className="text-gray-500 text-sm mt-2">Accede a tu panel de socio.</p>
                </div>

                {pedidoReactivacion ? (
                    <div className="text-center space-y-4 py-2">
                        {reactivacionEnviada ? (
                            <>
                                <h2 className="font-display text-lg font-semibold text-green-700">¡Listo!</h2>
                                <p className="text-sm text-gray-600">
                                    Tu pedido de reactivación fue enviado al club. Te van a avisar por mail
                                    cuando esté resuelto.
                                </p>
                            </>
                        ) : (
                            <>
                                <h2 className="font-display text-lg font-semibold text-amber-700">Esta cuenta fue dada de baja</h2>
                                <p className="text-sm text-gray-600">
                                    Ya existe una cuenta registrada con ese DNI, pero está dada de baja del club.
                                    Si querés volver, podés pedirle al club que la reactive.
                                </p>
                                <div className="flex items-center justify-center gap-3 pt-2">
                                    <button
                                        onClick={handleSolicitarReactivacion}
                                        disabled={enviandoReactivacion}
                                        className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-bold transition-colors"
                                    >
                                        {enviandoReactivacion ? 'Enviando…' : 'Solicitar reactivación'}
                                    </button>
                                    <button
                                        onClick={() => setPedidoReactivacion(null)}
                                        disabled={enviandoReactivacion}
                                        className="text-sm text-gray-500 hover:text-gray-800 font-medium"
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                    <input type="text" name="dni" placeholder="DNI" value={formData.dni} onChange={handleChange} required className="w-full p-3 rounded-xl border border-gray-300 bg-white text-gray-900 placeholder-gray-400 transition-colors focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/25" />
                    <div className="relative">
                        <input type={showPassword ? 'text' : 'password'} name="password" placeholder="Contraseña" value={formData.password} onChange={handleChange} required className="w-full p-3 pr-11 rounded-xl border border-gray-300 bg-white text-gray-900 placeholder-gray-400 transition-colors focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/25" />
                        <button
                            type="button"
                            onClick={() => setShowPassword(prev => !prev)}
                            className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-gray-400 hover:text-blue-600 transition-colors"
                        >
                            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                        </button>
                    </div>
                    
                    <div className="text-right">
                        <Link to="/recuperar-password" className="text-sm font-medium text-blue-600 hover:text-blue-700">
                            ¿Olvidaste tu contraseña?
                        </Link>
                    </div>

                    {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-center">{error}</p>}

                    <button type="submit" disabled={loading} className="w-full flex justify-center py-3.5 px-4 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-600/40 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed">
                        {loading ? 'Ingresando...' : 'Ingresar'}
                    </button>
                </form>
                )}
                <p className="text-center text-sm text-gray-500">
                    ¿No tienes cuenta?{' '}
                    <Link to="/registro" className="font-semibold text-blue-600 hover:text-blue-700 underline-offset-2 hover:underline">Regístrate aquí</Link>
                </p>
            </div>
        </div>
    );
}