import InfiniteCarousel from './InfiniteCarousel';

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

export default function Sponsors() {
  return (
    <section className="py-16 bg-slate-50">
      <InfiniteCarousel
        items={SPONSORS}
        bgClassName="from-slate-50"
        renderItem={(sponsor, i) => (
          <a
            key={`${sponsor.img}-${i}`}
            href={sponsor.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mx-3 sm:mx-4 flex-shrink-0 w-40 h-40 sm:w-52 sm:h-52 md:w-64 md:h-64 bg-blue-900 rounded-lg shadow-md p-3 sm:p-4 md:p-6 flex items-center justify-center hover:shadow-xl hover:bg-blue-950 transition-all duration-300"
          >
            <img
              src={sponsor.img}
              alt={sponsor.alt}
              className="max-w-full max-h-full object-contain"
              draggable={false}
            />
          </a>
        )}
      />
    </section>
  );
}