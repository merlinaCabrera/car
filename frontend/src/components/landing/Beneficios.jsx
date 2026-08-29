import { useEffect, useState } from 'react';
import InfiniteCarousel from './InfiniteCarousel';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export default function Beneficios() {
  const [beneficios, setBeneficios] = useState([]);
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    fetch(`${API}/beneficios`)
      .then((res) => res.json())
      .then((data) => setBeneficios(data))
      .catch(() => setBeneficios([]))
      .finally(() => setCargado(true));
  }, []);

  if (!cargado || beneficios.length === 0) return null;

  return (
    <section className="py-16 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold mb-10 text-center text-blue-900">Beneficios</h2>
      </div>

      <InfiniteCarousel
        items={beneficios}
        bgClassName="from-white"
        renderItem={(beneficio, i) => (
          <div
            key={`${beneficio.id_comercio}-${i}`}
            className="mx-3 sm:mx-4 flex-shrink-0 w-56 sm:w-64 rounded-xl shadow-lg overflow-hidden bg-slate-50 border border-slate-100"
          >
            <img
              src={beneficio.imagen_url}
              alt={beneficio.nombre_fantasia}
              className="w-full h-36 sm:h-40 object-cover"
              draggable={false}
            />
            <div className="p-4">
              <h3 className="font-bold text-blue-900 text-sm sm:text-base">{beneficio.nombre_fantasia}</h3>
              {beneficio.rubro && (
                <p className="text-xs text-slate-400 mb-1">{beneficio.rubro}</p>
              )}
              <p className="text-sm text-slate-600">{beneficio.beneficio_ofrecido}</p>
            </div>
          </div>
        )}
      />
    </section>
  );
}