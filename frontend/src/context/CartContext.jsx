import { createContext, useState, useEffect, useContext } from 'react';

const CartContext = createContext();

export function CartProvider({ children }) {
  const [cart, setCart] = useState([]);

  // Inicializar leyendo del localStorage al montar el componente
  useEffect(() => {
    const savedCart = localStorage.getItem('car_cart');
    if (savedCart) {
      try {
        setCart(JSON.parse(savedCart));
      } catch (error) {
        console.error("Error leyendo el carrito del localStorage", error);
      }
    }
  }, []);

  // Guardar en localStorage cada vez que el carrito cambie
  useEffect(() => {
    localStorage.setItem('car_cart', JSON.stringify(cart));
  }, [cart]);

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