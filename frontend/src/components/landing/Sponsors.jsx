import { useEffect, useState } from 'react';
import InfiniteCarousel from './InfiniteCarousel';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export default function Sponsors() {
  const [sponsors, setSponsors] = useState([]);
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    fetch(`${API}/sponsors`)
      .then((res) => res.json())
      .then((data) => setSponsors(data))
      .catch(() => setSponsors([])) // si falla, simplemente no se muestra la sección
      .finally(() => setCargado(true));
  }, []);

  // Nada que mostrar todavía (cargando) o no hay sponsors activos cargados.
  if (!cargado || sponsors.length === 0) return null;

  return (
    <section className="pt-6 pb-16 bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold mb-10 text-center text-blue-900">Sponsors</h2>
      </div>

      <InfiniteCarousel
        items={sponsors}
        bgClassName="from-slate-50"
        renderItem={(sponsor, i) => (
          <a
            key={`${sponsor.id_sponsor}-${i}`}
            href={sponsor.url_destino}
            target="_blank"
            rel="noopener noreferrer"
            className="mx-3 sm:mx-4 flex-shrink-0 w-40 h-40 sm:w-52 sm:h-52 md:w-64 md:h-64 bg-blue-900 rounded-lg shadow-md p-3 sm:p-4 md:p-6 flex items-center justify-center hover:shadow-xl hover:bg-blue-950 transition-all duration-300"
          >
            <img
              src={sponsor.imagen_url}
              alt={sponsor.nombre}
              className="max-w-full max-h-full object-contain"
              draggable={false}
            />
          </a>
        )}
      />
    </section>
  );
}