import { Link } from 'react-router-dom';
import heroBg from '../../assets/hero-bg.PNG';
// BUG (rediseño 2026-09-12): antes acá se referenciaba "/escudo-car-1.png",
// que es la versión MONOCROMA BLANCA del escudo. Sobre la pastilla blanca que
// exige el manual quedaba blanco-sobre-blanco: se veía la pastilla vacía.
// El escudo institucional a color es este, y va importado (no por ruta suelta
// en /public) para que Vite lo versione y no se sirva cacheado y viejo.
import escudoCar from '../../assets/escudo-car.PNG';
import { useAuth } from '../../context/AuthContext';

export default function Hero() {
  const { isAuthenticated } = useAuth();

  return (
    <section className="relative min-h-[100svh] flex flex-col overflow-hidden">
      {/* Foto de fondo como <img> y no como background-image: así se puede
          encuadrar con object-position (los jugadores y el paredón "CLUB
          ATLETICO" quedan en el tercio inferior de la toma). */}
      <img
        src={heroBg}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover object-[center_38%]"
      />

      {/* Superposición en dos capas, según el criterio fotográfico del manual
          (doc 05): colorimetría limpia, sin ahogar la imagen. El humo azul de
          la tribuna es un activo de marca, así que se tinta con el Azul
          Francia en vez de aplastar con negro plano.
            · capa 1: tinte parejo suave, sostiene el contraste general.
            · capa 2: degradado vertical que carga arriba (zona del escudo) y
              abajo (zona de botones), y se abre en el medio para dejar
              respirar el humo y el paredón. */}
      <div className="absolute inset-0 bg-francia-900/45" />
      <div className="absolute inset-0 bg-gradient-to-b from-francia-950/85 via-francia-950/25 to-francia-950/90" />

      <header className="relative z-10 w-full px-6 pt-8 pb-4 sm:pt-10 lg:px-12 flex justify-center">
        {/* REGLA DE ORO DEL ESCUDO (doc 05): nunca estampado sobre la foto.
            Va siempre sobre zócalo blanco con margen perimetral de 1 bastón.
            El bastón del escudo mide ~1/9 del ancho de la pieza: con el escudo
            a h-24 (96px) eso da ~11px, de ahí el padding de la pastilla. */}
        <div className="rounded-2xl bg-white p-3 sm:p-3.5 shadow-xl shadow-francia-950/30">
          <img
            src={escudoCar}
            alt="Escudo del Club Atlético Roberts"
            className="h-24 sm:h-28 lg:h-32 w-auto object-contain"
          />
        </div>
      </header>

      <div className="relative z-10 flex-grow flex items-center justify-center px-5 sm:px-6 lg:px-8 py-10">
        <div className="max-w-3xl text-center">
          <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-[0.22em] text-white/70">
            Fundado en 1918 · Roberts, Buenos Aires
          </p>

          <h1 className="mt-5 font-display font-bold text-white text-[2.15rem] leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl [text-wrap:balance] drop-shadow-[0_2px_18px_rgba(17,20,32,0.55)]">
            No existe lo imposible,
            <br className="hidden sm:block" />{' '}
            nos mueve la pasión
          </h1>

          <p className="mt-6 mx-auto max-w-xl text-base sm:text-lg leading-relaxed text-white/80">
            Portal oficial de socios del Club Atlético Roberts. Gestioná tu cuota,
            reservá las canchas y el quincho, y accedé a los beneficios del club
            desde el celular.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 sm:gap-4">
            {isAuthenticated ? (
              <Link
                to="/socio"
                className="w-full sm:w-auto px-8 py-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-base tracking-wide shadow-lg shadow-francia-950/40 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-white/70 focus:ring-offset-2 focus:ring-offset-francia-950"
              >
                Ir a Mi Panel de Socio
              </Link>
            ) : (
              <>
                <Link
                  to="/registro"
                  className="w-full sm:w-auto px-8 py-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-base tracking-wide shadow-lg shadow-francia-950/40 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-white/70 focus:ring-offset-2 focus:ring-offset-francia-950"
                >
                  Asociate Hoy
                </Link>
                <Link
                  to="/login"
                  className="w-full sm:w-auto px-8 py-4 rounded-xl border border-white/80 bg-white/5 text-white font-semibold text-base tracking-wide backdrop-blur-sm hover:bg-white hover:text-blue-600 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-white/70 focus:ring-offset-2 focus:ring-offset-francia-950"
                >
                  Soy Socio
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Transición al blanco de la sección siguiente: que el corte entre el
          hero oscuro y "Nuestra Historia" se sienta intencional y no abrupto. */}
      <div className="relative z-10 h-16 sm:h-20 bg-gradient-to-b from-transparent to-white" />
    </section>
  );
}
