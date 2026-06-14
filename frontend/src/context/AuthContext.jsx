import { createContext, useState, useContext } from 'react';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  // Estado global del usuario
  const [user, setUser] = useState(null);
  
  // Variable derivada para no romper compatibilidad previa
  const isAuthenticated = !!user;

  const login = (dni, password) => {
    if (dni === '44196940' && password === 'roberts2026') {
      setUser({ nombre: 'Sergio Acosta', dni: '44196940', isMoroso: false });
      return true;
    }
    if (dni === '30396607' && password === 'roberts2026') {
      setUser({ nombre: 'Daniel Arias', dni: '30396607', isMoroso: true, deudas: 2 });
      return true;
    }
    return false;
  };

  const logout = () => {
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// Hook personalizado para facilitar la importación
export function useAuth() {
  return useContext(AuthContext);
}