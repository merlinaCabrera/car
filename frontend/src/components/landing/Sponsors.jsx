// Sponsors de la landing. Para agregar/sacar un sponsor, solo editá este array.
// Las imágenes van en /frontend/public/sponsorN.png (11 por ahora).
const SPONSORS = [
  { img: '/sponsor1.png', url: 'https://', alt: 'Sponsor 1' },
  { img: '/sponsor2.png', url: 'https://', alt: 'Sponsor 2' },
  { img: '/sponsor3.png', url: 'https://', alt: 'Sponsor 3' },
  { img: '/sponsor4.png', url: 'https://', alt: 'Sponsor 4' },
  { img: '/sponsor5.png', url: 'https://', alt: 'Sponsor 5' },
  { img: '/sponsor6.png', url: 'https://', alt: 'Sponsor 6' },
  { img: '/sponsor7.png', url: 'https://', alt: 'Sponsor 7' },
  { img: '/sponsor8.png', url: 'https://', alt: 'Sponsor 8' },
  { img: '/sponsor9.png', url: 'https://', alt: 'Sponsor 9' },
  { img: '/sponsor10.png', url: 'https://', alt: 'Sponsor 10' },
  { img: '/sponsor11.png', url: 'https://', alt: 'Sponsor 11' },
];

// Duplicamos la lista para que el loop sea continuo (cuando la primera copia
// termina de salir por la izquierda, la segunda copia ya está ocupando su
// lugar exacto — no hay salto ni corte visible).
const SPONSORS_LOOP = [...SPONSORS, ...SPONSORS];

export default function Sponsors() {
  return (
    <section className="py-16 bg-slate-50 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold mb-10 text-center text-blue-900">Sponsors</h2>
      </div>

      {/* Contenedor sin padding horizontal: el carrusel necesita ocupar
          todo el ancho de la pantalla para que el loop se vea prolijo. */}
      <div className="group relative w-full overflow-hidden">
        {/* Degradados en los bordes para que las cards no corten en seco */}
        <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-12 sm:w-24 bg-gradient-to-r from-slate-50 to-transparent z-10" />
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-12 sm:w-24 bg-gradient-to-l from-slate-50 to-transparent z-10" />

        <div className="flex w-max animate-sponsors-scroll group-hover:[animation-play-state:paused]">
          {SPONSORS_LOOP.map((sponsor, i) => (
            <a
              key={`${sponsor.img}-${i}`}
              href={sponsor.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mx-3 sm:mx-4 flex-shrink-0 w-28 h-28 sm:w-36 sm:h-36 md:w-40 md:h-40 bg-blue-900 rounded-lg shadow-md p-3 sm:p-4 md:p-6 flex items-center justify-center hover:shadow-xl hover:bg-blue-950 transition-all duration-300"
            >
              <img
                src={sponsor.img}
                alt={sponsor.alt}
                className="max-w-full max-h-full object-contain"
                draggable={false}
              />
            </a>
          ))}
        </div>
      </div>

      {/* Animación del carrusel. Duración proporcional a la cantidad de
          sponsors para que la velocidad se sienta igual sin importar
          cuántos haya (si mañana son 20, no hace falta tocar esto). */}
      <style>{`
        @keyframes sponsors-scroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .animate-sponsors-scroll {
          animation: sponsors-scroll ${SPONSORS.length * 4}s linear infinite;
        }
      `}</style>
    </section>
  );
}