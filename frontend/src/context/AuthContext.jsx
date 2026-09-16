/* eslint-disable react-refresh/only-export-components --
   `useAuth` lo importan 39 archivos desde este mismo modulo. Moverlo a un archivo
   aparte para contentar a fast refresh implica tocar los 39 imports; el unico
   efecto de dejarlo asi es que Vite hace full reload en vez de HMR en dev. */
import { createContext, useState, useContext, useEffect, useCallback } from 'react';

const AuthContext = createContext();
// AuthContext.jsx
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

// ── Perfil persistido ───────────────────────────────────────────────────────
//
// Por qué existe: el escáner de la puerta funciona sin conexión (ver
// hooks/useEscanerCache.js), pero eso solo servía mientras la pestaña no se
// recargara. En un celular el navegador descarta la pestaña al bloquear la
// pantalla; al volver, la app arrancaba de cero, /usuarios/me fallaba sin
// señal y el portero terminaba en /login con la caché del padrón ahí al lado
// sin poder usarla.
//
// Ahora el perfil se guarda junto al token y se usa como punto de partida.
// `authToken` sigue siendo la credencial: sin token el perfil guardado se
// ignora y se borra.
//
// Todo va envuelto en try/catch: en modo incógnito, con el almacenamiento
// bloqueado o con la cuota llena, localStorage TIRA EXCEPCIÓN, y acá eso se
// llevaría puesta la app entera antes del primer render.
const CLAVE_PERFIL = 'car_user_profile'

function leerStorage(clave) {
  try { return localStorage.getItem(clave) } catch { return null }
}

function leerPerfilPersistido() {
  const crudo = leerStorage(CLAVE_PERFIL)
  if (!crudo) return null
  try { return JSON.parse(crudo) } catch { return null }
}

function guardarPerfilPersistido(perfil) {
  try { localStorage.setItem(CLAVE_PERFIL, JSON.stringify(perfil)) } catch { /* storage no disponible */ }
}

function borrarPerfilPersistido() {
  try { localStorage.removeItem(CLAVE_PERFIL) } catch { /* storage no disponible */ }
}

export function AuthProvider({ children }) {
  // El perfil guardado solo vale si además hay token: es el token el que
  // autoriza, el perfil es nada más la copia de lo que devolvió /usuarios/me.
  const [token, setToken] = useState(() => leerStorage('authToken'));
  const [user, setUser] = useState(() => (leerStorage('authToken') ? leerPerfilPersistido() : null));
  const [loading, setLoading] = useState(true); // Para verificar el token en la carga inicial

  const isAuthenticated = !!token && !!user;

  // Última copia conocida del perfil, para seguir funcionando cuando
  // /usuarios/me no contesta. Devuelve null si nunca se guardó ninguna, y en
  // ese caso RutaPrivada manda a /login — sin perfil no hay nada que mostrar,
  // pero el token queda intacto para el próximo intento.
  const usarPerfilPersistido = () => {
    const persistido = leerPerfilPersistido();
    if (persistido) setUser(persistido);
    return persistido;
  };

  // Función para obtener el perfil del usuario usando el token
  const fetchUserProfile = useCallback(async (authToken) => {
    if (!authToken) {
      setUser(null);
      borrarPerfilPersistido();
      setLoading(false);
      return null;
    }
    try {
      const res = await fetch(`${API}/usuarios/me`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
        guardarPerfilPersistido(userData);
        return userData;
      }

      // Solo un rechazo EXPLÍCITO del backend cierra la sesión:
      //   401 → token inválido o vencido.
      //   403 → en /usuarios/me solo puede significar socio dado de baja
      //         (el otro 403 posible, requiere_cambio_password, está
      //         exceptuado para esta ruta en dependencies.py).
      if (res.status === 401 || res.status === 403) {
        logout();
        return null;
      }

      // Cualquier otro status (502/503 del cold start de Render, un 500
      // transitorio) NO es motivo para desloguear a nadie: el token sigue
      // siendo válido. Se sigue con la última copia conocida del perfil.
      return usarPerfilPersistido();
    } catch (error) {
      // Acá llega SOLO el fallo de red: `fetch` rechaza con TypeError
      // ("Failed to fetch") cuando no hay conexión, no hay DNS o está el modo
      // avión. Antes esto llamaba a logout() y era justo el caso que rompía
      // el modo offline del escáner: recargar la pantalla sin señal borraba
      // la sesión del portero.
      console.warn("No se pudo refrescar el perfil (¿sin conexión?):", error);
      return usarPerfilPersistido();
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
        guardarPerfilPersistido(userData);

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
    try { localStorage.removeItem('authToken') } catch { /* storage no disponible */ }
    borrarPerfilPersistido();
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
    if (perfilDesbloqueado) {
      setUser(perfilDesbloqueado);
      guardarPerfilPersistido(perfilDesbloqueado);
    }

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
    if (datos) {
      setUser(datos);
      guardarPerfilPersistido(datos);
    }
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