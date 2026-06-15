import { useState } from 'react';

export default function AdminPagos() {
  const [pagos, setPagos] = useState([
    { id: 1, nombre: 'Daniel Arias', detalle: 'Cuota Mayo 2026', total: 5000 },
    { id: 2, nombre: 'Lucía Fernández', detalle: 'Cuota Abril 2026', total: 5000 },
    { id: 3, nombre: 'Marcos Silva', detalle: 'Adelanto x2 Meses', total: 10000 },
  ]);

  const procesarPago = (id) => {
    setPagos((prev) => prev.filter((pago) => pago.id !== id));
  };

  return (
    <div className="space-y-6 mt-8 px-4 sm:px-0">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-3xl font-bold text-slate-800">Aprobación de Pagos</h2>
      </div>

      {pagos.length === 0 ? (
        <div className="bg-emerald-50 border-2 border-emerald-500 text-emerald-800 rounded-2xl p-8 text-center space-y-4 shadow-sm max-w-2xl mx-auto mt-10">
          <h3 className="text-2xl font-bold">¡Todo verificado!</h3>
          <p className="text-emerald-700 font-medium">No hay transferencias o pagos pendientes de revisión.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pagos.map((pago) => (
            <div key={pago.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden animate-fade-in-up">
              <div className="absolute top-0 left-0 w-1 h-full bg-orange-500"></div>
              <div>
                <h3 className="font-bold text-lg text-slate-800">{pago.nombre}</h3>
                <p className="text-sm text-slate-600 font-medium mt-1">{pago.detalle}</p>
                <p className="text-xl font-bold text-slate-900 mt-1">Total: ${pago.total}</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <button className="bg-slate-100 border border-slate-300 hover:bg-slate-200 text-slate-700 font-semibold py-2 px-5 rounded-xl transition-colors">
                  Ver Comprobante
                </button>
                <button onClick={() => procesarPago(pago.id)} className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-5 rounded-xl transition-colors shadow-sm">
                  Aprobar Pago
                </button>
                <button onClick={() => procesarPago(pago.id)} className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-5 rounded-xl transition-colors shadow-sm">
                  Rechazar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}