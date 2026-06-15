import { useState } from 'react';

export default function AdminSolicitudes() {
  const [solicitudes, setSolicitudes] = useState([
    { id: 1, nombre: 'Juan Pérez', dni: '12.345.678', fecha: 'Hoy' },
    { id: 2, nombre: 'María López', dni: '44.555.666', fecha: 'Ayer' },
    { id: 3, nombre: 'Carlos Gómez', dni: '33.222.111', fecha: 'Hace 2 días' },
  ]);

  const procesarSolicitud = (id) => {
    setSolicitudes((prev) => prev.filter((solicitud) => solicitud.id !== id));
  };

  return (
    <div className="space-y-6 mt-8 px-4 sm:px-0">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-3xl font-bold text-slate-800">Aprobación de Solicitudes</h2>
      </div>

      {solicitudes.length === 0 ? (
        <div className="bg-emerald-50 border-2 border-emerald-500 text-emerald-800 rounded-2xl p-8 text-center space-y-4 shadow-sm max-w-2xl mx-auto mt-10">
          <h3 className="text-2xl font-bold">¡Al día!</h3>
          <p className="text-emerald-700 font-medium">No hay solicitudes pendientes por revisar.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {solicitudes.map((solicitud) => (
            <div key={solicitud.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col gap-5 relative overflow-hidden animate-fade-in-up">
              <div className="absolute top-0 left-0 w-1 h-full bg-amber-500"></div>
              <div>
                <h3 className="font-bold text-lg text-slate-800">{solicitud.nombre}</h3>
                <p className="text-sm text-slate-500 mt-1">DNI: {solicitud.dni}</p>
                <p className="text-sm text-slate-500">Fecha: {solicitud.fecha}</p>
              </div>
              
              <div className="flex gap-3 mt-auto">
                <button onClick={() => procesarSolicitud(solicitud.id)} className="flex-1 bg-green-50 text-green-700 border border-green-200 hover:bg-green-600 hover:text-white font-bold py-2 px-4 rounded-xl transition-colors duration-200">
                  Aprobar
                </button>
                <button onClick={() => procesarSolicitud(solicitud.id)} className="flex-1 bg-red-50 text-red-700 border border-red-200 hover:bg-red-600 hover:text-white font-bold py-2 px-4 rounded-xl transition-colors duration-200">
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