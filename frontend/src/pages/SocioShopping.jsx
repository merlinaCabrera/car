import { useState } from 'react';

export default function SocioShopping() {
  const [toast, setToast] = useState('');
  const [loadingId, setLoadingId] = useState(null);

  // Mock de productos con nomenclatura y referencias sugeridas
  const productos = [
    { id: 1, nombre: "Camiseta Titular Talle M", precio: 25000, img: "https://placehold.co/300x300/1e3a8a/ffffff?text=Camiseta+Titular" },
    { id: 2, nombre: "Pantalón Entrenamiento", precio: 15000, img: "https://placehold.co/300x300/1e3a8a/ffffff?text=Pantalon" },
    { id: 3, nombre: "Buzo Oficial Club", precio: 35000, img: "https://placehold.co/300x300/1e3a8a/ffffff?text=Buzo" },
    { id: 4, nombre: "Gorra Azul Francia", precio: 10000, img: "https://placehold.co/300x300/1e3a8a/ffffff?text=Gorra" }
  ];

  const handleAddToCart = (producto) => {
    setLoadingId(producto.id);
    setTimeout(() => {
      setLoadingId(null);
      // TODO: Integrar con el Contexto Global (ej. dispatch({ type: 'ADD_TO_CART', payload: producto }))
      setToast(`¡${producto.nombre} agregado con éxito!`);
      setTimeout(() => {
        setToast('');
      }, 3000);
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-slate-900 p-4 pb-20 text-slate-100">
      
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white tracking-wide">Tienda Oficial</h2>
        <p className="text-slate-400 text-sm mt-1">Llevá los colores del club a todas partes.</p>
      </div>

      {/* Grilla de productos: 1 columna móvil, 2 en md */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {productos.map((prod) => (
          <div key={prod.id} className="bg-slate-800 rounded-3xl overflow-hidden shadow-lg border border-slate-700/50 flex flex-col">
            <img src={prod.img} alt={prod.nombre} className="w-full h-48 object-cover object-center" />
            <div className="p-5 flex flex-col flex-grow justify-between space-y-4">
              <div>
                <h3 className="font-bold text-lg text-white">{prod.nombre}</h3>
                <p className="text-blue-400 font-extrabold text-xl mt-1">${prod.precio}</p>
              </div>
              <button 
                onClick={() => handleAddToCart(prod)}
                disabled={loadingId !== null}
                className={`w-full flex justify-center items-center bg-blue-600 text-white font-bold py-3 rounded-xl shadow-lg transition-all ${loadingId === prod.id ? 'opacity-75 cursor-wait' : 'hover:bg-blue-500 active:scale-95'} ${loadingId !== null && loadingId !== prod.id ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {loadingId === prod.id ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Procesando...
                  </>
                ) : (
                  'Agregar al Carrito'
                )}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 transform -translate-x-1/2 z-50 animate-fade-in-up">
          <div className="bg-green-500 text-white px-6 py-3 rounded-full shadow-2xl font-semibold text-sm flex items-center space-x-2">
            <span>{toast}</span>
          </div>
        </div>
      )}
    </div>
  );
}