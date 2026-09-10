import { createContext, useState, useContext, useEffect, useCallback } from 'react';

const AuthContext = createContext();
// AuthContext.jsx
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('authToken'));
  const [loading, setLoading] = useState(true); // Para verificar el token en la carga inicial

  const isAuthenticated = !!token && !!user;

  // Función para obtener el perfil del usuario usando el token
  const fetchUserProfile = useCallback(async (authToken) => {
    if (!authToken) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${API}/usuarios/me`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
        return userData;
      } else {
        // El token puede ser inválido o expirado
        logout();
      }
    } catch (error) {
      console.error("Error al obtener el perfil del usuario:", error);
      logout(); // Limpiar en caso de error de red
    } finally {
      setLoading(false);
    }
    return null;
  }, []);

  // Al cargar, verifica si hay un token y busca los datos del usuario
  useEffect(() => {
    fetchUserProfile(token);
  }, [token, fetchUserProfile]);

  const login = async (dni, password) => {
    try {
        const res = await fetch(`${API}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dni, password }), 
        });

        if (!res.ok) {
            // El backend ahora puede devolver errores más específicos (ej: 403 pendiente,
            // o el caso "dado_de_baja" con un objeto en vez de un string plano).
            const errorData = await res.json().catch(() => ({ detail: "DNI o contraseña incorrectos" }));
            const esObjeto = errorData.detail && typeof errorData.detail === 'object';
            const err = new Error(esObjeto ? errorData.detail.mensaje : errorData.detail);
            if (esObjeto) err.detail = errorData.detail; // Login.jsx lo usa para el botón de reactivación
            throw err;
        }

        const data = await res.json();
        localStorage.setItem('authToken', data.access_token);
        setToken(data.access_token);

        // Buscamos el perfil ACÁ MISMO (en vez de depender del useEffect que
        // reacciona al cambio de `token`) porque el componente que llama a
        // login() (ej: Login.jsx) necesita decidir el redirect según los
        // roles reales apenas el login termina, y `user` del contexto todavía
        // no se actualizó en ese punto (el useEffect corre en el próximo render).
        const perfilRes = await fetch(`${API}/usuarios/me`, {
            headers: { Authorization: `Bearer ${data.access_token}` },
        });
        if (!perfilRes.ok) {
            throw new Error('Login correcto, pero no se pudo cargar tu perfil. Intentá de nuevo.');
        }
        const userData = await perfilRes.json();
        setUser(userData);

        // Devolvemos el perfil completo (con roles_asignados) para que el
        // componente que llama pueda redirigir según el rol sin esperar un
        // re-render.
        return userData;
    } catch (error) {
        console.error("Fallo el login:", error);
        throw error;
    }
};

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('authToken');
  };

  // Reemplaza el token de la sesión sin pasar por login().
  // Lo usa el cambio de contraseña: el backend invalida los tokens emitidos
  // antes del cambio y devuelve uno nuevo en la misma respuesta. Sin esto la
  // sesión se caía (401) justo después de cambiar la clave.
  // Devuelve el perfil ya recargado, y recién ahí resuelve. Es a propósito
  // `await fetchUserProfile(...)` en vez de dejarlo en manos del useEffect que
  // reacciona a `token`: quien llama (CambiarPasswordObligatorio) navega apenas
  // vuelve, y si `user` todavía tuviera requiere_cambio_password=true,
  // RutaPrivada lo rebota a /cambiar-password-obligatorio y la pantalla parece
  // colgada (BUG-02 de la QA del 08-09).
  const aplicarToken = async (nuevoToken) => {
    if (!nuevoToken) return null;
    localStorage.setItem('authToken', nuevoToken);
    setToken(nuevoToken);   // el useEffect re-consulta /usuarios/me con el nuevo
    return await fetchUserProfile(nuevoToken);
  };

  // Cierre del cambio de contraseña OBLIGATORIO (primer ingreso).
  //
  // Por qué no alcanza con aplicarToken(): ese camino hace que el redirect
  // dependa de que /usuarios/me conteste bien ANTES de navegar. Si esa
  // request falla o tarda (token recién rotado, cold start de Render de 40-60 s,
  // un 401 de borde por la granularidad de `iat`, la respuesta cacheada por el
  // navegador), `user` sigue con requiere_cambio_password=true, RutaPrivada
  // rebota a /cambiar-password-obligatorio y desde afuera se ve como que el
  // botón "no hace nada" — el síntoma exacto de BUG-02, que sobrevivió al
  // primer intento de arreglo justamente porque el arreglo seguía colgado de
  // esa request.
  //
  // Acá invertimos la dependencia: el 200 del backend YA es la confirmación de
  // que la contraseña cambió y de que el flag quedó en false. Con eso alcanza
  // para desbloquear la navegación, así que bajamos el flag en memoria de
  // forma sincrónica y recién después refrescamos el perfil, sin que el
  // redirect quede a la espera de nada.
  const confirmarCambioPassword = (nuevoToken) => {
    if (nuevoToken) {
      localStorage.setItem('authToken', nuevoToken);
      setToken(nuevoToken);
    }

    // Bajar el flag YA, sin red de por medio. Es lo único que RutaPrivada
    // mira para decidir si deja pasar. `user` es el perfil del render actual
    // (el previo, con el flag en true): alcanza porque esta pantalla es
    // standalone y no hay ninguna otra actualización de perfil en vuelo.
    const perfilDesbloqueado = user
      ? { ...user, requiere_cambio_password: false }
      : null;
    if (perfilDesbloqueado) setUser(perfilDesbloqueado);

    // Refresco en segundo plano, para traer cualquier otro cambio del perfil.
    // Deliberadamente NO se espera: si falla, la persona ya está adentro con
    // un perfil válido y el próximo refresh lo corrige.
    fetchUserProfile(nuevoToken ?? token).catch(() => {});

    // Se devuelve el perfil con el flag bajado para que quien llama pueda
    // calcular el destino por rol sin esperar el re-render.
    return perfilDesbloqueado;
  };

  // Actualiza el usuario en memoria con lo que devolvió un PATCH/POST, sin
  // volver a pegarle a /usuarios/me.
  const actualizarUsuario = (datos) => {
    if (datos) setUser(datos);
  };

  return (
    <AuthContext.Provider value={{
      user, token, isAuthenticated, login, logout, loading,
      aplicarToken, actualizarUsuario, confirmarCambioPassword,
      refreshUser: () => fetchUserProfile(token),
    }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

// Hook personalizado para facilitar la importación
export function useAuth() {
  return useContext(AuthContext);
}