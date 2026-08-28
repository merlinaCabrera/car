import { useEffect, useRef } from 'react';

/**
 * Carrusel infinito horizontal, reutilizable.
 *
 * - Auto-scroll continuo (vía requestAnimationFrame).
 * - Scroll NATIVO del navegador por debajo (overflow-x: auto), así en mobile
 *   el dedo puede arrastrar/deslizar libremente en cualquier momento — no es
 *   una animación CSS que "ignora" el touch.
 * - Se pausa mientras el usuario toca/arrastra o pasa el mouse, y retoma el
 *   auto-scroll solo un momento después de soltar.
 * - Loop sin cortes: recibe `items` ya pensado para wrappearse (duplicamos
 *   la lista adentro), y cuando el scroll pasa la mitad, se resetea al
 *   instante — como es exactamente la mitad del contenido, no se nota.
 *
 * Uso:
 *   <InfiniteCarousel items={sponsors} renderItem={(s, i) => <a key={i}>...</a>} />
 */
export default function InfiniteCarousel({ items, renderItem, speed = 40, bgClassName = 'from-slate-50' }) {
  const trackRef = useRef(null);
  const isPaused = useRef(false);
  const resumeTimeout = useRef(null);
  const lastTime = useRef(null);
  const rafId = useRef(null);

  const doubled = [...items, ...items];

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const step = (timestamp) => {
      if (lastTime.current == null) lastTime.current = timestamp;
      const dt = (timestamp - lastTime.current) / 1000;
      lastTime.current = timestamp;

      if (!isPaused.current) {
        track.scrollLeft += speed * dt;
      }

      // Loop: sea por auto-scroll o por arrastre manual del usuario,
      // si nos pasamos de la mitad (o nos vamos para atrás del inicio),
      // reacomodamos sin que se note — la segunda mitad es idéntica.
      const half = track.scrollWidth / 2;
      if (half > 0) {
        if (track.scrollLeft >= half) track.scrollLeft -= half;
        else if (track.scrollLeft < 0) track.scrollLeft += half;
      }

      rafId.current = requestAnimationFrame(step);
    };

    rafId.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId.current);
  }, [speed]);

  const pause = () => {
    clearTimeout(resumeTimeout.current);
    isPaused.current = true;
  };
  const resumeDelayed = () => {
    clearTimeout(resumeTimeout.current);
    resumeTimeout.current = setTimeout(() => {
      isPaused.current = false;
    }, 1200);
  };

  return (
    <div className="relative w-full overflow-hidden">
      <div className={`pointer-events-none absolute left-0 top-0 bottom-0 w-12 sm:w-24 bg-gradient-to-r ${bgClassName} to-transparent z-10`} />
      <div className={`pointer-events-none absolute right-0 top-0 bottom-0 w-12 sm:w-24 bg-gradient-to-l ${bgClassName} to-transparent z-10`} />

      <div
        ref={trackRef}
        className="flex overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        style={{ scrollBehavior: 'auto' }}
        onMouseEnter={pause}
        onMouseLeave={resumeDelayed}
        onTouchStart={pause}
        onTouchEnd={resumeDelayed}
        onPointerDown={pause}
        onPointerUp={resumeDelayed}
      >
        {doubled.map((item, i) => renderItem(item, i))}
      </div>
    </div>
  );
}