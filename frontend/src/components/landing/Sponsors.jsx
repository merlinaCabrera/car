import { useEffect, useState } from 'react';

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
    /* Fondo BLANCO PURO a propósito: la mayoría de los logos vienen en PNG con
       transparencia, y sobre un gris se ensucian. Además esta sección era la
       otra que usaba el carrusel con veladuras blancas encima de los logos
       (ver comentario en Beneficios.jsx): grilla quieta, sin degradés, sin
       filtros y sin cajas con bordes que compitan con las marcas. */
    <section className="bg-white py-24 sm:py-28">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-600/70">
          Nos acompañan
        </p>
        <h2 className="mt-4 font-display text-3xl sm:text-4xl lg:text-[2.75rem] font-bold text-blue-600 leading-tight tracking-tight">
          Sponsors
        </h2>
        <div className="mx-auto mt-6 h-px w-16 bg-blue-600/30" />
      </div>

      <div className="mx-auto mt-14 max-w-6xl px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 sm:gap-x-6 sm:gap-y-8 lg:grid-cols-4">
          {sponsors.map((sponsor) => (
            <a
              key={sponsor.id_sponsor}
              href={sponsor.url_destino}
              target="_blank"
              rel="noopener noreferrer"
              title={sponsor.nombre}
              className="group flex items-center justify-center rounded-2xl bg-white p-5 sm:p-6
                         transition-colors duration-200 hover:bg-gray-50
                         focus:outline-none focus:ring-2 focus:ring-blue-600/30"
            >
              <img
                src={sponsor.imagen_url}
                alt={sponsor.nombre}
                loading="lazy"
                className="h-20 sm:h-24 w-full object-contain transition-transform duration-200 group-hover:scale-[1.04]"
                draggable={false}
              />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
