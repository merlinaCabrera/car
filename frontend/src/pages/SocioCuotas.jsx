import { useNavigate } from 'react-router-dom';

export default function SocioCuotas() {
  const navigate = useNavigate();
  
  // Mock de agregar al carrito y redirigir
  const handlePagar = () => {
    navigate('/carrito');
  };

  return (
    <div className="space-y-8 bg-slate-50 min-h-screen pb-10">
      
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
                onClick={handlePagar}
                className="bg-red-600 text-white font-semibold py-2 px-5 rounded-full shadow hover:bg-red-700 active:scale-95 transition-all text-sm"
              >
                Pagar
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
            onClick={handlePagar}
            className="bg-slate-700 text-white font-semibold py-2 px-5 rounded-full shadow hover:bg-slate-800 active:scale-95 transition-all text-sm"
          >
            Pagar
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
                onClick={handlePagar}
                className="w-full bg-blue-600 text-white font-semibold py-2 rounded-xl shadow-md hover:bg-blue-700 active:scale-95 transition-all text-xs"
              >
                Pagar
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

    </div>
  );
}