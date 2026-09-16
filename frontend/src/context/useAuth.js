// frontend/src/context/useAuth.js
//
// El contexto y su hook viven acá, separados de <AuthProvider> (AuthContext.jsx),
// para que ese archivo exporte SOLO componentes y Vite pueda hacer HMR en dev en
// vez de un full reload en cada cambio. Este módulo no exporta componentes, así
// que no dispara react-refresh/only-export-components.
import { createContext, useContext } from 'react';

export const AuthContext = createContext();

// Hook personalizado para facilitar la importación
export function useAuth() {
  return useContext(AuthContext);
}
