import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';

export default function SocioCuotas() {
  const navigate = useNavigate();
  const [loadingId, setLoadingId] = useState(null);
  const [toast, setToast] = useState('');
  const { addToCart } = useCart();
  
  // Recibimos el objeto completo de la cuota para enviarlo al contexto
  const handlePagar = (item) => {
    setLoadingId(item.id);
    setTimeout(() => {
      setLoadingId(null);
      addToCart({ ...item, tipo: 'cuota' });
      setToast('Item agregado con éxito al carrito');
      setTimeout(() => setToast(''), 3000);
    }, 2000);
  };

  return (
    <div className="space-y-8 bg-slate-50 min-h-screen pb-10 relative">
      
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-800">Gestión de Cuotas</h2>
        <p className="text-slate-500 text-sm mt-1">Mantené tu cuenta al día para acceder al club.</p>
      </div>

      {/* 1. Deudas Pendientes */}
      <section>
        <h3 className="text-lg font-semibold text-slate-700 mb-3 border-b pb-2">Deudas Pendientes</h3>
        <div className="space-y-3">
          {['Marzo 2026', 'Abril 2026'].map((mes) => (
            <div key={mes} className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-red-100">
              <div>
                <p className="font-bold text-slate-800 capitalize">{mes}</p>
                <p className="text-sm text-red-500 font-medium">Vencida</p>
              </div>
              <button 
                onClick={() => handlePagar({
                  id: `deuda-${mes}`,
                  nombre: `Cuota Atrasada ${mes}`,
                  precio: 6000 // Simulamos un precio con recargo
                })}
                disabled={loadingId !== null}
                className={`flex items-center justify-center bg-red-600 text-white font-semibold py-2 px-5 rounded-full shadow transition-all text-sm w-32 ${loadingId === `deuda-${mes}` ? 'opacity-75 cursor-wait' : 'hover:bg-red-700 active:scale-95'} ${loadingId !== null && loadingId !== `deuda-${mes}` ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {loadingId === `deuda-${mes}` ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Procesando...
                  </>
                ) : (
                  'Pagar'
                )}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* 2. Próximo a vencer */}
      <section>
        <h3 className="text-lg font-semibold text-slate-700 mb-3 border-b pb-2">Próximo a Vencer</h3>
        <div className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
          <div>
            <p className="font-bold text-slate-800">Mayo 2026</p>
            <p className="text-sm text-slate-500">Vence el 10/05</p>
          </div>
          <button 
            onClick={() => handlePagar({
              id: 'cuota-05-2026',
              nombre: 'Cuota Mayo 2026',
              precio: 5000 // Precio base
            })}
            disabled={loadingId !== null}
            className={`flex items-center justify-center bg-slate-700 text-white font-semibold py-2 px-5 rounded-full shadow transition-all text-sm w-32 ${loadingId === 'prox' ? 'opacity-75 cursor-wait' : 'hover:bg-slate-800 active:scale-95'} ${loadingId !== null && loadingId !== 'prox' ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {loadingId === 'prox' ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Procesando...
              </>
            ) : (
              'Pagar'
            )}
          </button>
        </div>
      </section>

      {/* 3. Adelantar pagos (Debe ocultarse si el socio es Moroso) */}
      {/* TODO: Si isMoroso === true, NO renderizar esta sección */}
      <section>
        <h3 className="text-lg font-semibold text-slate-700 mb-3 border-b pb-2">Adelantar Pagos</h3>
        <div className="grid grid-cols-3 gap-3">
          {[ { label: 'x1 Mes', value: '1' }, { label: 'x2 Meses', value: '2' }, { label: 'x6 Meses', value: '6' } ].map((plan) => (
            <div key={plan.value} className="bg-white p-4 rounded-2xl shadow-sm border border-blue-100 flex flex-col items-center justify-center text-center space-y-3">
              <span className="font-bold text-blue-900">{plan.label}</span>
              <button 
                onClick={() => handlePagar({
                  id: `adelanto-${plan.value}`,
                  nombre: `Adelanto ${plan.label}`,
                  precio: 5000 * parseInt(plan.value) // Múltiplo según meses
                })}
                disabled={loadingId !== null}
                className={`w-full flex items-center justify-center bg-blue-600 text-white font-semibold py-2 rounded-xl shadow-md transition-all text-xs ${loadingId === `adelanto-${plan.value}` ? 'opacity-75 cursor-wait' : 'hover:bg-blue-700 active:scale-95'} ${loadingId !== null && loadingId !== `adelanto-${plan.value}` ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {loadingId === `adelanto-${plan.value}` ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-1 h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    ...
                  </>
                ) : (
                  'Pagar'
                )}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* 4. Historial de Pagos */}
      <section>
        <h3 className="text-lg font-semibold text-slate-700 mb-3 border-b pb-2">Historial de Pagos</h3>
        <div className="space-y-3">
          {['Febrero 2026', 'Enero 2026'].map((mes) => (
            <div key={mes} className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-slate-100 opacity-80">
              <p className="font-semibold text-slate-700">{mes}</p>
              <button className="border-2 border-slate-300 text-slate-600 font-semibold py-1.5 px-4 rounded-full hover:bg-slate-50 transition-colors text-xs">
                Comprobante
              </button>
            </div>
          ))}
        </div>
      </section>

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