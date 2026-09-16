/* eslint-disable react-refresh/only-export-components --
   Mismo caso que AuthContext: `useCart` lo importan 8 archivos desde aca.
   Separarlo es un refactor de imports y solo mejora el HMR en dev. */
import { createContext, useState, useEffect, useContext } from 'react';
import { useAuth } from './AuthContext';

const CartContext = createContext();

// El carrito vive en localStorage, así que sobrevive al logout y al cierre del
// navegador. Por eso se guarda también de QUIÉN es: sin ese dato, el carrito
// de una sesión se le aparecía a la siguiente.
//
// Eso es lo que estaba atrás de BUG-24 de la QA manual: al dar de baja a un
// socio se le cierra la sesión, pero al reactivarlo volvía a entrar con el
// carrito viejo intacto (y con una pre-reserva que ya no existía del lado del
// servidor, porque la baja ahora la libera). También cubre el caso más común
// en el club: dos personas usando el mismo celular o la misma compu del buffet.
const CART_KEY = 'car_cart';
const CART_OWNER_KEY = 'car_cart_owner';

/**
 * Lee el carrito guardado SOLO si pertenece a la sesión actual.
 * Sin sesión (o si el dueño guardado es otro) devuelve un carrito vacío:
 * el checkout es siempre autenticado, así que un carrito sin dueño no sirve
 * para nada.
 */
function leerCarritoGuardado(idUsuario) {
  if (idUsuario === null || idUsuario === undefined) return [];
  try {
    if (localStorage.getItem(CART_OWNER_KEY) !== String(idUsuario)) return [];
    const guardado = localStorage.getItem(CART_KEY);
    const parseado = guardado ? JSON.parse(guardado) : [];
    return Array.isArray(parseado) ? parseado : [];
  } catch (error) {
    console.error('Error leyendo el carrito del localStorage', error);
    return [];
  }
}

export function CartProvider({ children }) {
  // AuthProvider envuelve a CartProvider (ver App.jsx) y no renderiza a sus
  // hijos hasta que terminó de resolver el token, así que acá `user` ya es el
  // definitivo: o hay sesión, o no la hay. No hay un estado intermedio en el
  // que se borre un carrito válido por creer que nadie está logueado.
  const { user } = useAuth();
  const idUsuario = user?.id_usuario ?? null;

  const [cart, setCart] = useState(() => leerCarritoGuardado(idUsuario));

  // Cambió el dueño de la sesión (login, logout, o baja forzada que cierra la
  // sesión sola): el carrito en memoria ya no es de quien está adelante de la
  // pantalla. Se ajusta durante el render, no en un useEffect, para que no
  // llegue a pintarse un solo frame con el carrito de la sesión anterior.
  const [duenoCarrito, setDuenoCarrito] = useState(idUsuario);
  if (duenoCarrito !== idUsuario) {
    setDuenoCarrito(idUsuario);
    setCart(leerCarritoGuardado(idUsuario));
  }

  // Guardar en localStorage cada vez que el carrito cambie, siempre junto al
  // dueño — los dos valores tienen que moverse en bloque o el chequeo de
  // arriba deja de significar algo.
  useEffect(() => {
    try {
      if (idUsuario === null) {
        localStorage.removeItem(CART_KEY);
        localStorage.removeItem(CART_OWNER_KEY);
        return;
      }
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
      localStorage.setItem(CART_OWNER_KEY, String(idUsuario));
    } catch (error) {
      console.error('Error guardando el carrito en el localStorage', error);
    }
  }, [cart, idUsuario]);

  // Función para agregar ítems sumando cantidades si ya existen
  const addToCart = (newItem) => {
    if (newItem.id === undefined || newItem.id === null || Number.isNaN(Number(newItem.id))) {
      console.error('CartContext.addToCart: se intentó agregar un ítem sin id válido', newItem)
      return
    }
    setCart((prevCart) => {
      const existingItem = prevCart.find((i) => i.id === newItem.id);
      
      // Si el ítem ya existe, sumamos la cantidad que viene en el nuevo ítem
      if (existingItem) {
        return prevCart.map((i) => 
          i.id === newItem.id 
            ? { ...i, qty: i.qty + (newItem.qty || 1) } 
            : i
        );
      }
      // Si no existe, agregamos el ítem con su cantidad inicial (o 1)
      return [...prevCart, { ...newItem, qty: newItem.qty || 1 }];
    });
  };

  const removeFromCart = (id) => {
    setCart((prevCart) => prevCart.filter((item) => item.id !== id));
  };

  const clearCart = () => setCart([]);

  // Variable derivada para el total monetario
  const cartTotal = cart.reduce((total, item) => total + (item.price * item.qty), 0);

  return (
    <CartContext.Provider value={{ cart, addToCart, removeFromCart, clearCart, cartTotal }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
