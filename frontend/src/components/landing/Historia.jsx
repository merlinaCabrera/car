import { Link } from 'react-router-dom';
import jugadoresImg from '../../assets/jugadores.PNG';
import InfiniteCarousel from './InfiniteCarousel';

// Mismo placeholder que usa Galería. Cuando haya fotos reales,
// reemplazá esto por un array de imports/paths reales, uno por foto.
const placeholders = [1, 2, 3, 4];

export default function Historia() {
  return (
    <section className="py-20 bg-white text-slate-800">
      <div className="max-w-3xl mx-auto px-6 lg:px-12 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold mb-6 text-blue-900">Nuestra Historia</h2>
        <p className="text-lg leading-relaxed text-slate-600">
          Fundado con el sudor y el esfuerzo de nuestra comunidad, el Club Atlético Roberts
          ha sido el pilar deportivo de la ciudad por décadas. Aquí no solo formamos jugadores,
          sino personas con valores, compañerismo y un amor incondicional por la camiseta.
        </p>
      </div>

      <div className="mt-10">
        <InfiniteCarousel
          items={placeholders}
          bgClassName="from-white"
          renderItem={(item, i) => (
            <div
              key={`historia-${item}-${i}`}
              className="mx-3 sm:mx-4 flex-shrink-0 w-40 h-40 sm:w-52 sm:h-52 md:w-64 md:h-64 rounded-xl shadow-lg overflow-hidden hover:scale-105 transition-transform duration-300 cursor-pointer bg-white"
            >
              <img
                src={jugadoresImg}
                alt={`Jugadores históricos del club ${item}`}
                className="w-full h-full object-cover hover:opacity-90 transition-opacity"
                draggable={false}
              />
            </div>
          )}
        />
      </div>

      <div className="flex justify-center mt-8">
        <Link
          to="/galeria"
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full border-2 border-blue-900 text-blue-900 font-semibold hover:bg-blue-900 hover:text-white transition-colors duration-300"
        >
          Ver galería completa
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </section>
  );
}