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

      {/* Mismo carrusel que gira solo que Historia y Sponsors, y la misma placa
          oscura que Sponsors: los logos de los comercios también son arte
          BLANCO sobre fondo transparente, así que sobre la tarjeta blanca que
          había antes no se veían. El detalle de por qué la placa es oscura y
          qué cambiar si algún día llegan los logos a color está en Sponsors.jsx.

          La imagen va con object-contain y padding, no object-cover: estos
          archivos son logos, no fotos de local. Recortarlos por el medio les
          comía el nombre. Si alguna vez se cargan FOTOS de los comercios,
          volver a object-cover y sacar el padding. */}
      <div className="mt-14">
        <InfiniteCarousel
          items={beneficios}
          bgClassName="from-gray-50"
          renderItem={(beneficio, i) => (
            <article
              key={`beneficio-${beneficio.id_comercio}-${i}`}
              className="mx-2.5 sm:mx-3 flex-shrink-0 w-64 sm:w-72 flex flex-col
                         overflow-hidden rounded-2xl border border-white/10
                         bg-francia-900 shadow-sm"
            >
              {beneficio.imagen_url && (
                <div className="relative h-36 sm:h-40 border-b border-white/10 bg-francia-950/40">
                  <img
                    src={beneficio.imagen_url}
                    alt={beneficio.nombre_fantasia}
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-contain p-6"
                    draggable={false}
                  />
                </div>
              )}

              <div className="flex flex-col flex-grow p-5 text-left">
                {beneficio.rubro && (
                  <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/45">
                    {beneficio.rubro}
                  </p>
                )}
                <h3 className="mt-1.5 text-base sm:text-lg font-bold text-white leading-snug">
                  {beneficio.nombre_fantasia}
                </h3>
                <p className="mt-auto pt-4 text-sm sm:text-base font-semibold text-blue-300 leading-snug">
                  {beneficio.beneficio_ofrecido}
                </p>
              </div>
            </article>
          )}
        />
      </div>

    </section>
  );
}
