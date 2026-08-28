import jugadoresImg from '../../assets/jugadores.PNG';
import InfiniteCarousel from './InfiniteCarousel';

// Mock iterable para generar el carrusel. Cuando haya fotos reales,
// reemplazá esto por un array de imports/paths reales, uno por foto.
const placeholders = [1, 2, 3, 4];

export default function Galeria() {
  return (
    <section className="py-16 bg-slate-50">
      <InfiniteCarousel
        items={placeholders}
        bgClassName="from-slate-50"
        renderItem={(item, i) => (
          <div
            key={`galeria-${item}-${i}`}
            className="mx-3 sm:mx-4 flex-shrink-0 w-40 h-40 sm:w-52 sm:h-52 md:w-64 md:h-64 rounded-xl shadow-lg overflow-hidden hover:scale-105 transition-transform duration-300 cursor-pointer bg-white"
          >
            <img
              src={jugadoresImg}
              alt={`Galería histórica ${item}`}
              className="w-full h-full object-cover hover:opacity-90 transition-opacity"
              draggable={false}
            />
          </div>
        )}
      />
    </section>
  );
}