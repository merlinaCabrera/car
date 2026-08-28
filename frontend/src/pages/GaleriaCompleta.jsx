import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import jugadoresImg from '../assets/jugadores.PNG';
import Footer from '../components/landing/Footer';

// Fotos de la galería completa. Para agregar una foto nueva:
// 1. Poné el archivo en /frontend/src/assets/ (o /frontend/public/ si preferís).
// 2. Agregá un import acá arriba (si va en /assets) y una entrada abajo.
// El campo "caption" es opcional, se muestra debajo de la foto.
const FOTOS = [
  { src: jugadoresImg, caption: '' },
  { src: jugadoresImg, caption: '' },
  { src: jugadoresImg, caption: '' },
  { src: jugadoresImg, caption: '' },
  { src: jugadoresImg, caption: '' },
  { src: jugadoresImg, caption: '' },
];

export default function GaleriaCompleta() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-10 pb-16">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-blue-900 font-medium hover:text-blue-700 transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver al inicio
        </Link>

        <h1 className="text-3xl sm:text-4xl font-bold text-blue-900 mb-2 text-center">Galería</h1>
        <p className="text-slate-600 text-center mb-10">Momentos del Club Atlético Roberts</p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-6">
          {FOTOS.map((foto, i) => (
            <figure
              key={i}
              className="aspect-square rounded-xl shadow-md overflow-hidden bg-slate-100 hover:scale-[1.02] transition-transform duration-300"
            >
              <img
                src={foto.src}
                alt={foto.caption || `Foto del club ${i + 1}`}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </figure>
          ))}
        </div>
      </div>

      <Footer />
    </div>
  );
}