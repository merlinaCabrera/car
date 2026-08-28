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
    <section className="py-16 bg-slate-50 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-3xl font-bold mb-10 text-center text-blue-900">Sponsors</h2>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {SPONSORS.map((sponsor) => (
            <a
              key={sponsor.img}
              href={sponsor.url}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-slate-100 border border-slate-200 rounded-lg shadow-md p-6 flex items-center justify-center aspect-square hover:shadow-xl hover:scale-105 hover:bg-white transition-all duration-300"
            >
              <img
                src={sponsor.img}
                alt={sponsor.alt}
                className="max-w-full max-h-full object-contain"
              />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}