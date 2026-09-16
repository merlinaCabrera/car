// frontend/src/context/useCart.js
//
// Mismo criterio que useAuth.js: el contexto y el hook separados de
// <CartProvider> para no romper el fast refresh de CartContext.jsx.
import { createContext, useContext } from 'react';

export const CartContext = createContext();

export function useCart() {
  return useContext(CartContext);
}
