import { useState } from 'react';

export default function SocioCarrito() {
  const [step, setStep] = useState(1);

  // Mocks de ítems del carrito
  const cartItems = [
    { id: 1, title: 'Cuota Marzo 2026', qty: 1, price: 5000 },
    { id: 2, title: 'Camiseta Titular M', qty: 2, price: 35000 },
    { id: 3, title: 'Alquiler Quincho', qty: 1, price: 15000 },
  ];

  const total = cartItems.reduce((acc, item) => acc + (item.price * item.qty), 0);

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
            {cartItems.map((item) => (
              <div key={item.id} className="flex justify-between items-center border-b border-slate-50 pb-3 last:border-0 last:pb-0">
                <div className="flex flex-col">
                  <span className="font-semibold text-slate-800">{item.title}</span>
                  <span className="text-xs text-slate-500">Cantidad: {item.qty}</span>
                </div>
                <span className="font-bold text-slate-700">${item.price * item.qty}</span>
              </div>
            ))}
          </div>
          
          <div className="bg-blue-900 rounded-3xl shadow-lg p-6 text-white flex justify-between items-center">
            <span className="text-lg font-medium text-blue-100">TOTAL</span>
            <span className="text-2xl font-bold">${total}</span>
          </div>

          <button 
            onClick={() => setStep(2)}
            className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl shadow-lg hover:bg-blue-700 active:scale-95 transition-all text-lg"
          >
            Comprar
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
            <h3 className="text-xl font-bold text-slate-800 mb-2">Total a transferir: <span className="text-blue-600">${total}</span></h3>
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