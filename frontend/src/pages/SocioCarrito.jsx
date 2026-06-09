export default function SocioCarrito() {
  // Mock de datos para diseño
  const cartItems = [
    { id: 1, name: 'Cuota socio Octubre', quantity: 1, price: 5500 },
    { id: 2, name: 'Cuota socio Noviembre', quantity: 1, price: 5500 },
    { id: 3, name: 'Camiseta Oficial Talle M', quantity: 1, price: 28000 },
  ];

  const subtotal = cartItems.reduce((acc, item) => acc + item.price, 0);

  return (
    <div className="flex flex-col h-full relative pb-28">
      <h2 className="text-2xl font-semibold mb-5 text-gray-100">Mi Carrito</h2>
      
      <div className="space-y-4">
        {cartItems.map(item => (
          <div key={item.id} className="bg-slate-800 p-4 rounded-2xl flex justify-between items-center shadow-sm border border-slate-700/50">
            <div className="flex flex-col">
              <span className="font-medium text-gray-200">{item.name}</span>
              <span className="text-xs text-gray-400 mt-1">Cant: {item.quantity}</span>
            </div>
            <span className="font-bold text-lg text-white">
              ${item.price.toLocaleString('es-AR')}
            </span>
          </div>
        ))}
      </div>
      
      {/* Sección inferior fija (Call to Action) */}
      <div className="bg-slate-800/95 backdrop-blur-md border-t border-slate-700 p-5 rounded-t-3xl fixed bottom-0 left-0 w-full shadow-[0_-10px_30px_rgba(0,0,0,0.4)]">
        <div className="flex justify-between items-end mb-4">
          <span className="text-gray-400 text-sm font-medium">Subtotal a pagar</span>
          <span className="text-3xl font-bold text-white">${subtotal.toLocaleString('es-AR')}</span>
        </div>
        <button className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl text-lg shadow-lg shadow-blue-900/40 transition-transform active:scale-95">
          COMPRAR AHORA
        </button>
      </div>
    </div>
  );
}