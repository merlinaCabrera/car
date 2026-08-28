import { Store } from 'lucide-react';
import InfiniteCarousel from './InfiniteCarousel';

// Comercios adheridos con beneficios para socios. Por ahora esto NO viene
// de la base de datos (los comercios sí se gestionan por DB vía admin, pero
// todavía no tienen logo asignado) — es un placeholder puramente visual,
// mismo patrón que Sponsors. Cuando el admin pueda cargar logo por comercio,
// este array se reemplaza por datos reales desde la API.
const BENEFICIOS = [
  { nombre: 'Comercio 1' },
  { nombre: 'Comercio 2' },
  { nombre: 'Comercio 3' },
  { nombre: 'Comercio 4' },
  { nombre: 'Comercio 5' },
  { nombre: 'Comercio 6' },
];

export default function Beneficios() {
  return (
    <section className="pt-6 pb-16 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold mb-10 text-center text-blue-900">Beneficios</h2>
      </div>
      
      <InfiniteCarousel
        items={BENEFICIOS}
        bgClassName="from-white"
        renderItem={(beneficio, i) => (
          <div
            key={`${beneficio.nombre}-${i}`}
            className="mx-3 sm:mx-4 flex-shrink-0 w-40 h-40 sm:w-52 sm:h-52 md:w-64 md:h-64 bg-slate-50 border-2 border-dashed border-slate-300 rounded-lg shadow-sm p-4 flex flex-col items-center justify-center gap-3 hover:shadow-md hover:border-blue-300 transition-all duration-300"
          >
            <Store className="w-10 h-10 sm:w-12 sm:h-12 text-slate-400" />
            <span className="text-sm sm:text-base font-medium text-slate-500 text-center">{beneficio.nombre}</span>
          </div>
        )}
      />
    </section>
  );
}