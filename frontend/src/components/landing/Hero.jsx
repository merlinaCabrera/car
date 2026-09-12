import { Link } from 'react-router-dom';
import heroBg from '../../assets/hero-bg.PNG';
// BUG (rediseño 2026-09-12): antes acá se referenciaba "/escudo-car-1.png",
// que es la versión MONOCROMA BLANCA del escudo. Sobre la pastilla blanca que
// exige el manual quedaba blanco-sobre-blanco: se veía la pastilla vacía.
// El escudo institucional a color es este, y va importado (no por ruta suelta
// en /public) para que Vite lo versione y no se sirva cacheado y viejo.
import escudoCar from '../../assets/escudo-car.PNG';
import { useAuth } from '../../context/AuthContext';

// Animación de entrada institucional. Va como <style> local y no en index.css
// ni en tailwind.config porque es exclusiva del hero de la landing: si algún
// día se rediseña esta sección, se borra el componente y no queda CSS muerto
// dando vueltas en los archivos compartidos.
//
// Coreografía (una sola pasada, sin loop):
//   0.0s → 0.6s   escudo (scale 0.75 → 1)
//   0.6s → 1.0s   pausa: el escudo solo, respirando
//   1.0s → 1.4s   eyebrow
//   1.2s → 1.7s   titular
//   1.5s → 1.9s   subtítulo
//   1.8s → 2.2s   botones
//
// `both` como fill-mode es lo que hace que cada elemento arranque invisible
// (aplica el frame `from` durante el delay) y se quede en su estado final.
const estilosEntrada = `
  @keyframes heroScaleIn {
    from { opacity: 0; transform: scale(0.75); }
    to   { opacity: 1; transform: scale(1); }
  }
  @keyframes heroFadeUp {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .hero-escudo    { animation: heroScaleIn 0.6s ease-out 0s   both; }
  .hero-eyebrow   { animation: heroFadeUp  0.4s ease-out 1.0s both; }
  .hero-titulo    { animation: heroFadeUp  0.5s ease-out 1.2s both; }
  .hero-subtitulo { animation: heroFadeUp  0.4s ease-out 1.5s both; }
  .hero-botones   { animation: heroFadeUp  0.4s ease-out 1.8s both; }

  /* Quien pidió menos movimiento ve el hero ya armado, sin esperar 2.3s. */
  @media (prefers-reduced-motion: reduce) {
    .hero-escudo,
    .hero-eyebrow,
    .hero-titulo,
    .hero-subtitulo,
    .hero-botones { animation: none; }
  }
`;

export default function Hero() {
  const { isAuthenticated } = useAuth();

  return (
    <section className="relative min-h-[100svh] flex flex-col overflow-hidden">
      <style>{estilosEntrada}</style>

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
        {/* El escudo va estampado directo sobre la foto, sin la pastilla blanca
            que pedía el manual (doc 05, "regla de oro"): decisión de producto
            del 12-09 para que la entrada animada no arrastre una caja blanca.
            El drop-shadow reemplaza el zócalo como separador del fondo — tiene
            que ser filter y no box-shadow: box-shadow dibuja el rectángulo del
            <img>, no la silueta del escudo. */}
        <img
          src={escudoCar}
          alt="Escudo del Club Atlético Roberts"
          className="hero-escudo h-24 sm:h-28 w-auto object-contain [filter:drop-shadow(0_2px_8px_rgba(0,0,0,0.4))]"
        />
      </header>

      <div className="relative z-10 flex-grow flex items-center justify-center px-5 sm:px-6 lg:px-8 py-10">
        <div className="max-w-3xl text-center">
          <p className="hero-eyebrow text-[11px] sm:text-xs font-semibold uppercase tracking-[0.22em] text-white/70">
            Fundado en 1918 · Roberts, Buenos Aires
          </p>

          <h1 className="hero-titulo mt-5 font-display font-bold text-white text-[2.15rem] leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl [text-wrap:balance] drop-shadow-[0_2px_18px_rgba(17,20,32,0.55)]">
            No existe lo imposible,
            <br className="hidden sm:block" />{' '}
            nos mueve la pasión
          </h1>

          <p className="hero-subtitulo mt-6 mx-auto max-w-xl text-base sm:text-lg leading-relaxed text-white/80">
            Portal oficial de socios del Club Atlético Roberts. Gestioná tu cuota,
            reservá las canchas y el quincho, y accedé a los beneficios del club
            desde el celular.
          </p>

          <div className="hero-botones mt-10 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 sm:gap-4">
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
