import { createContext, useState, useContext, useEffect, useCallback } from 'react';

const AuthContext = createContext();
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

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
        
        // Ya no devolvemos un rol. El componente de Login simplemente redirigirá
        // a una ruta base, y el MainLayout se encargará de mostrar las opciones
        // correctas basándose en el objeto 'user' que se poblará en el `useEffect`.
        return true; // Devolvemos 'true' para indicar éxito.
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