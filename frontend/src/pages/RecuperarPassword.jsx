import { textoError } from '../utils/errores';
import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export default function RecuperarPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token'); // presente cuando viene del link del mail
  const navigate = useNavigate();

  const [loading, setLoading]   = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError]       = useState(null);

  // Validez del token del link: 'chequeando' | 'ok' | 'invalido'.
  // El backend pone token_recuperacion en NULL apenas se usa, pero esta
  // pantalla mostraba el formulario igual con solo ver un ?token= en la URL:
  // un link ya usado se veía idéntico a uno nuevo y el error recién saltaba al
  // enviar (BUG-03 de la QA del 08-09). Ahora se pregunta primero.
  const [tokenEstado, setTokenEstado] = useState(token ? 'chequeando' : 'ok');

  useEffect(() => {
    if (!token) return;
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch(
          `${API}/auth/reset-password/estado?token=${encodeURIComponent(token)}`
        );
        const data = await res.json().catch(() => ({}));
        if (!cancelado) setTokenEstado(data?.valido ? 'ok' : 'invalido');
      } catch {
        // Si no se pudo consultar (red caída, backend dormido), no bloqueamos:
        // dejamos intentar y que el POST decida. Es el mismo comportamiento
        // que había antes de este chequeo.
        if (!cancelado) setTokenEstado('ok');
      }
    })();
    return () => { cancelado = true; };
  }, [token]);

  // ── Paso 1: pedir el link ─────────────────────────────────────────────────
  const [identificador, setIdentificador] = useState('');

  const handleSolicitar = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/recuperar-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identificador }),
      });
      // El endpoint responde 200 exista o no la cuenta, a propósito (no
      // revelamos si el DNI/email está registrado). PERO tiene rate limit:
      // con un 429 antes se mostraba igual "te mandamos el mail" y el socio
      // esperaba un mail que nunca iba a llegar. El 429 no revela nada sobre
      // la cuenta, así que se puede mostrar tal cual.
      if (res.status === 429) {
        setError('Hiciste varios pedidos seguidos. Esperá unos minutos y volvé a intentar.');
        return;
      }
      if (!res.ok && res.status >= 500) {
        setError('El servidor no respondió bien. Probá de nuevo en un momento.');
        return;
      }
      setIsSuccess(true); // 200 o 4xx de validación: no revelamos si existe
    } catch {
      setError('Error de conexión. Intentá de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  // ── Paso 2: nueva contraseña (viene con ?token=...) ───────────────────────
  const [password, setPassword]           = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword]   = useState(false);
  const [showConfirm, setShowConfirm]     = useState(false);

  const handleReset = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) { setError('Las contraseñas no coinciden.'); return; }
    if (password.length < 8)          { setError('Mínimo 8 caracteres.');          return; }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(textoError(data?.detail, 'Link inválido o expirado.'));
      }
      setIsSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 space-y-6">

        <div className="text-center">
          <h1 className="text-3xl font-bold text-slate-800">
            {!token
              ? 'Recuperar contraseña'
              : tokenEstado === 'invalido' ? 'Link no válido' : 'Nueva contraseña'}
          </h1>
          <p className="text-slate-500 mt-2">
            {!token
              ? 'Te enviaremos un link para restablecer tu acceso.'
              : tokenEstado === 'invalido'
                ? 'El link de recuperación ya no está activo.'
                : 'Elegí una contraseña nueva para tu cuenta.'}
          </p>
        </div>

        {/* ── Éxito ── */}
        {isSuccess && (
          <div className="space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-xl p-4 text-sm leading-relaxed">
              {token
                ? '✅ ¡Contraseña actualizada! Ya podés iniciar sesión con tu nueva clave.'
                : '📬 Si tu DNI o mail están registrados, vas a recibir un correo con el link. Revisá también la carpeta de spam.'}
            </div>
            <button
              onClick={() => navigate(token ? '/login' : '/')}
              className="w-full py-3 px-4 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
            >
              {token ? 'Ir al Login' : 'Volver al inicio'}
            </button>
          </div>
        )}

        {/* ── Paso 1: pedir link ── */}
        {!isSuccess && !token && (
          <form onSubmit={handleSolicitar} className="space-y-4">
            <input
              type="text"
              placeholder="DNI o correo electrónico"
              value={identificador}
              onChange={e => setIdentificador(e.target.value)}
              required
              className="w-full p-3 rounded-lg border bg-slate-50 focus:border-blue-500 focus:ring-blue-500"
            />
            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed"
            >
              {loading ? 'Enviando...' : 'Enviar solicitud'}
            </button>
            <p className="text-center text-sm text-slate-600">
              <Link to="/login" className="font-medium text-blue-600 hover:text-blue-500">
                ← Volver al Login
              </Link>
            </p>
          </form>
        )}

        {/* ── Link ya usado o vencido ── */}
        {!isSuccess && token && tokenEstado === 'invalido' && (
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 text-sm leading-relaxed">
              Este link ya no sirve: o ya lo usaste para cambiar tu contraseña, o pasó
              más de una hora desde que lo pediste. Pedí uno nuevo, es gratis.
            </div>
            <button
              onClick={() => navigate('/recuperar-password', { replace: true })}
              className="w-full py-3 px-4 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
            >
              Pedir un link nuevo
            </button>
            <p className="text-center text-sm text-slate-600">
              <Link to="/login" className="font-medium text-blue-600 hover:text-blue-500">
                ← Volver al Login
              </Link>
            </p>
          </div>
        )}

        {/* ── Chequeando el link ── */}
        {!isSuccess && token && tokenEstado === 'chequeando' && (
          <p className="text-center text-sm text-slate-500 py-4">Verificando el link…</p>
        )}

        {/* ── Paso 2: nueva contraseña ── */}
        {!isSuccess && token && tokenEstado === 'ok' && (
          <form onSubmit={handleReset} className="space-y-4">
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Nueva contraseña (mín. 8 caracteres)"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full p-3 pr-10 rounded-lg border bg-slate-50 focus:border-blue-500 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(p => !p)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                placeholder="Repetí la contraseña"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                className="w-full p-3 pr-10 rounded-lg border bg-slate-50 focus:border-blue-500 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(p => !p)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700"
              >
                {showConfirm ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed"
            >
              {loading ? 'Guardando...' : 'Guardar nueva contraseña'}
            </button>
          </form>
        )}

      </div>
    </div>
  );
}