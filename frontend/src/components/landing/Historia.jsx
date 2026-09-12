import { Link } from 'react-router-dom';
import jugadoresImg from '../../assets/jugadores.PNG';
import InfiniteCarousel from './InfiniteCarousel';

// Mismo placeholder que usa Galería. Cuando haya fotos reales,
// reemplazá esto por un array de imports/paths reales, uno por foto.
const placeholders = [1, 2, 3, 4];

export default function Historia() {
  return (
    <section className="bg-white pt-16 sm:pt-20 pb-24 sm:pb-28">
      <div className="max-w-3xl mx-auto px-6 lg:px-8 text-center">
        {/* Bajada institucional. Antes vivía en el Hero, debajo del lema, y le
            robaba el primer golpe de vista en mobile. Acá cumple mejor: es lo
            primero que se lee ya sobre el fondo blanco, y en cursiva se lee
            como voz del club y no como otro título más. */}
        <p className="italic text-lg sm:text-xl leading-relaxed text-gray-500 [text-wrap:pretty]">
          Portal oficial de socios del Club Atlético Roberts. Gestioná tu cuota,
          reservá las canchas y el quincho, y accedé a los beneficios del club
          desde el celular.
        </p>

        <p className="mt-14 text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-600/70">
          El club
        </p>
        <h2 className="mt-4 font-display text-3xl sm:text-4xl lg:text-[2.75rem] font-bold text-blue-600 leading-tight tracking-tight">
          Nuestra Historia
        </h2>
        {/* Filete corto en Azul Roberts: separa el título del cuerpo sin meter
            una caja más. Mismo recurso que las cabeceras del manual. */}
        <div className="mx-auto mt-6 h-px w-16 bg-blue-600/30" />

        <p className="mt-8 text-lg sm:text-xl leading-[1.75] text-gray-700 [text-wrap:pretty]">
          Fundado con el sudor y el esfuerzo de nuestra comunidad, el Club Atlético Roberts
          ha sido el pilar deportivo de la ciudad por décadas. Aquí no solo formamos jugadores,
          sino personas con valores, compañerismo y un amor incondicional por la camiseta.
        </p>
      </div>

      <div className="mt-14 sm:mt-16">
        <InfiniteCarousel
          items={placeholders}
          bgClassName="from-white"
          renderItem={(item, i) => (
            <div
              key={`historia-${item}-${i}`}
              className="mx-2.5 sm:mx-3 flex-shrink-0 w-48 h-60 sm:w-60 sm:h-72 md:w-72 md:h-80 rounded-2xl shadow-lg overflow-hidden bg-gray-100 ring-1 ring-francia-950/5"
            >
              <img
                src={jugadoresImg}
                alt={`Jugadores históricos del club ${item}`}
                className="w-full h-full object-cover"
                draggable={false}
              />
            </div>
          )}
        />
      </div>

      <div className="flex justify-center mt-12">
        <Link
          to="/galeria"
          className="inline-flex items-center gap-2 px-7 py-3 rounded-xl border border-blue-600 text-blue-600 font-semibold hover:bg-blue-600 hover:text-white transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:ring-offset-2"
        >
          Ver galería completa
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </section>
  );
}
