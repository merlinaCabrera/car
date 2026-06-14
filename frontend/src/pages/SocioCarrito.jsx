import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';

export default function SocioCarrito() {
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { cart, removeFromCart, cartTotal } = useCart();

  // Guard: Carrito Vacío
  if (cart.length === 0) {
    return (
      <div className="bg-slate-50 min-h-[80vh] flex flex-col justify-center items-center p-4">
        <svg className="w-24 h-24 text-slate-300 mb-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        <h2 className="text-2xl font-bold text-slate-700 mb-2 text-center">Tu carrito está vacío</h2>
        <p className="text-slate-500 mb-8 text-center max-w-sm">No tienes cuotas ni productos pendientes de pago en este momento.</p>
        <Link to="/shopping" className="bg-blue-600 text-white font-bold py-3 px-8 rounded-full shadow-lg hover:bg-blue-700 active:scale-95 transition-all">
          Ir al Catálogo
        </Link>
      </div>
    );
  }

  const handleComprar = () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setStep(2);
    }, 2000);
  };

  return (
    <div className="bg-slate-50 min-h-screen pb-10">
      {/* Header del Checkout */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-800">Checkout</h2>
        <div className="flex items-center space-x-2 mt-2 text-sm font-medium">
          <span className={`${step >= 1 ? 'text-blue-600' : 'text-slate-400'}`}>Resumen</span>
          <span className="text-slate-300">/</span>
          <span className={`${step >= 2 ? 'text-blue-600' : 'text-slate-400'}`}>Pago</span>
          <span className="text-slate-300">/</span>
          <span className={`${step >= 3 ? 'text-blue-600' : 'text-slate-400'}`}>Comprobante</span>
        </div>
      </div>

      {/* Paso 1: Resumen */}
      {step === 1 && (
        <div className="space-y-4 animate-fade-in">
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-5 space-y-4">
            {cart.map((item) => (
              <div key={item.id} className="flex justify-between items-center border-b border-slate-50 pb-3 last:border-0 last:pb-0">
                <div className="flex flex-col flex-1 pr-4">
                  <span className="font-semibold text-slate-800">{item.nombre || item.title}</span>
                  <span className="text-xs text-slate-500">Cantidad: {item.qty}</span>
                </div>
                <div className="flex items-center space-x-4">
                  <span className="font-bold text-slate-700">${(item.precio || item.price) * item.qty}</span>
                  <button 
                    onClick={() => removeFromCart(item.id)}
                    className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition-colors"
                    title="Eliminar ítem"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
          
          <div className="bg-blue-900 rounded-3xl shadow-lg p-6 text-white flex justify-between items-center">
            <span className="text-lg font-medium text-blue-100">TOTAL</span>
            <span className="text-2xl font-bold">${cartTotal}</span>
          </div>

          <button 
            onClick={handleComprar}
            disabled={isLoading}
            className={`w-full flex justify-center items-center bg-blue-600 text-white font-bold py-4 rounded-2xl shadow-lg transition-all text-lg ${isLoading ? 'opacity-75 cursor-wait' : 'hover:bg-blue-700 active:scale-95'}`}
          >
            {isLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Procesando...
              </>
            ) : (
              'Comprar'
            )}
          </button>
        </div>
      )}

      {/* Paso 2: Método de Pago */}
      {step === 2 && (
        <div className="space-y-6 animate-fade-in">
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 text-center">
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"></path></svg>
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">Seleccioná tu método de pago</h3>
            <p className="text-sm text-slate-500 mb-6">
              Podés acercarte a la secretaría del club para pagar en efectivo, o realizar una transferencia bancaria y adjuntar el comprobante en el siguiente paso.
            </p>
            
            <div className="space-y-3">
              <button 
                onClick={() => alert('Generando cupón de pago en efectivo...')}
                className="w-full bg-slate-800 text-white font-bold py-4 rounded-2xl shadow hover:bg-slate-900 active:scale-95 transition-all"
              >
                Pago en Efectivo (Secretaría)
              </button>
              <button 
                onClick={() => setStep(3)}
                className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl shadow-lg hover:bg-blue-700 active:scale-95 transition-all"
              >
                Pago por Transferencia
              </button>
            </div>
          </div>
          <button onClick={() => setStep(1)} className="w-full text-center text-slate-500 text-sm font-semibold hover:text-slate-800">
            ← Volver al resumen
          </button>
        </div>
      )}

      {/* Paso 3: Comprobante */}
      {step === 3 && (
        <div className="space-y-6 animate-fade-in">
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 text-center">
            <h3 className="text-xl font-bold text-slate-800 mb-2">Total a transferir: <span className="text-blue-600">${cartTotal}</span></h3>
            <div className="bg-slate-50 p-4 rounded-xl text-left text-sm text-slate-600 mb-6 font-mono break-all border border-slate-200">
              CBU: 1234567890123456789012 <br/>
              Alias: CLUB.ROBERTS.PAGOS <br/>
              Banco: Banco Nación
            </div>
            
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-blue-300 rounded-2xl cursor-pointer bg-blue-50 hover:bg-blue-100 transition-colors">
              <span className="font-bold text-blue-600">Cargar Comprobante</span>
              <span className="text-xs text-blue-400 mt-1">PDF, JPG, PNG (Max 5MB)</span>
              <input type="file" className="hidden" />
            </label>
          </div>
          <button onClick={() => setStep(2)} className="w-full text-center text-slate-500 text-sm font-semibold hover:text-slate-800">
            ← Cambiar método de pago
          </button>
        </div>
      )}
    </div>
  );
}