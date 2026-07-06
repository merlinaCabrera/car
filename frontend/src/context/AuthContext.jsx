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
            // El backend ahora puede devolver errores más específicos (ej: 403 pendiente)
            const errorData = await res.json().catch(() => ({ detail: "DNI o contraseña incorrectos" }));
            throw new Error(errorData.detail);
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

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated, login, logout, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

// Hook personalizado para facilitar la importación
export function useAuth() {
  return useContext(AuthContext);
}