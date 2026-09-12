import { useEffect, useState } from 'react';

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
    <section className="bg-gray-50 py-24 sm:py-28 border-y border-gray-200/70">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-600/70">
          Ser socio conviene
        </p>
        <h2 className="mt-4 font-display text-3xl sm:text-4xl lg:text-[2.75rem] font-bold text-blue-600 leading-tight tracking-tight">
          Beneficios
        </h2>
        <p className="mt-5 mx-auto max-w-xl text-base sm:text-lg leading-relaxed text-gray-600">
          Comercios de Roberts adheridos al club. Mostrá tu carnet digital y listo.
        </p>
      </div>

      {/* BUG (rediseño 2026-09-12): esta sección usaba el carrusel infinito, que
          dibuja dos veladuras blancas en degradé sobre los bordes del riel. En
          mobile esas veladuras tapaban ~1/4 del ancho visible y las fotos de los
          comercios se veían lavadas todo el tiempo. Acá no hace falta auto-scroll:
          en mobile es un riel con scroll-snap (el dedo manda, y las cards no se
          cortan porque el riel tiene padding y las tarjetas ancho fijo), y de sm
          para arriba es una grilla. Sin veladuras, sin filtros: las imágenes se
          ven a contraste pleno. */}
      <div
        className="mt-14 flex gap-4 overflow-x-auto snap-x snap-mandatory scroll-px-6 px-6
                   pb-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden
                   sm:mx-auto sm:max-w-7xl sm:grid sm:grid-cols-2 sm:gap-6 sm:overflow-visible
                   sm:px-6 sm:pb-0 lg:grid-cols-3 lg:px-8"
      >
        {beneficios.map((beneficio) => (
          <article
            key={beneficio.id_comercio}
            className="snap-start flex-none w-[80%] max-w-[20rem] sm:w-auto sm:max-w-none
                       flex flex-col overflow-hidden rounded-2xl bg-white
                       border border-gray-200 shadow-sm transition-shadow duration-200 hover:shadow-md"
          >
            {beneficio.imagen_url && (
              <img
                src={beneficio.imagen_url}
                alt={beneficio.nombre_fantasia}
                loading="lazy"
                className="w-full h-40 sm:h-44 object-cover bg-gray-100"
                draggable={false}
              />
            )}

            <div className="flex flex-col flex-grow p-5">
              {beneficio.rubro && (
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-500">
                  {beneficio.rubro}
                </p>
              )}
              <h3 className="mt-1.5 text-base sm:text-lg font-bold text-francia-900 leading-snug">
                {beneficio.nombre_fantasia}
              </h3>
              <p className="mt-auto pt-4 text-sm sm:text-base font-semibold text-blue-600 leading-snug">
                {beneficio.beneficio_ofrecido}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
