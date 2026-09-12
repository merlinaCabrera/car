import { useEffect, useRef, useState } from 'react';

// Animaciones de la landing pública. Están todas acá y no en index.css ni en
// tailwind.config porque son exclusivas de esta pantalla: si se rediseña, se
// borra este archivo y no queda CSS muerto en los archivos compartidos.
//
// Hay dos efectos, y los dos comparten el mismo keyframe (heroFadeUp) para que
// la landing se sienta de una sola pieza:
//
//   1. ENTRADA DEL HERO — corre sola al cargar, una única pasada, escalonada:
//        0.0s → 0.6s   escudo (scale 0.75 → 1)
//        0.6s → 1.0s   pausa: el escudo solo, respirando
//        1.0s → 1.4s   eyebrow
//        1.2s → 1.7s   titular
//        1.5s → 1.9s   botones
//      El orden de los delays sigue el orden VISUAL de arriba a abajo. Si
//      movés un elemento de lugar en el JSX, reacomodá el delay también: si no,
//      la página se arma salteado y se nota.
//
//   2. REVELADO POR SCROLL — el resto de las secciones. No pueden usar delays
//      fijos como el hero: están debajo del pliegue, así que si arrancaran con
//      la página la animación pasaría entera sin que nadie la vea. Se disparan
//      cuando la sección entra en pantalla (ver Revelar, abajo).
//
// `both` como fill-mode es lo que hace que cada elemento arranque invisible
// (aplica el frame `from` durante el delay) y se quede en su estado final.
const CSS = `
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
  .hero-botones   { animation: heroFadeUp  0.4s ease-out 1.5s both; }

  /* Arranca oculto y recién se anima cuando el observer agrega .revelar-visible.
     El recorrido es un toque más largo y más lejos que el del hero: en el hero
     los elementos son chicos y están juntos, acá se mueven bloques enteros. */
  .revelar         { opacity: 0; }
  .revelar-visible { animation: heroFadeUp 0.55s ease-out both; }

  /* Con "reducir movimiento" activado se ve la landing armada, sin esperas:
     el hero no retiene 1.9s y las secciones no dependen del scroll para
     aparecer (importante: si acá solo apagáramos la animación sin forzar el
     opacity, .revelar se quedaría invisible para siempre). */
  @media (prefers-reduced-motion: reduce) {
    .hero-escudo,
    .hero-eyebrow,
    .hero-titulo,
    .hero-botones,
    .revelar-visible { animation: none; }
    .revelar { opacity: 1; }
  }
`;

// Va una sola vez, arriba de todo en Landing. Si se montara dentro de cada
// sección habría un <style> duplicado por sección.
export function EstilosLanding() {
  return <style>{CSS}</style>;
}

// Envoltorio que revela a sus hijos cuando entran en pantalla.
//
// Se usa desde Landing envolviendo cada sección, y NO metiéndolo adentro de los
// componentes de sección, a propósito: Footer también lo usa GaleriaCompleta y
// Beneficios lo usa SocioInicio, así que meterlo adentro filtraría la animación
// a páginas que no la pidieron.
export function Revelar({ children }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const nodo = ref.current;
    if (!nodo) return;

    // Sin IntersectionObserver mostramos el contenido sin animar. Vale la pena
    // el chequeo: el fallo silencioso sería una landing en blanco, no una
    // landing sin animación.
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entrada]) => {
        if (!entrada.isIntersecting) return;
        setVisible(true);
        observer.disconnect();   // una sola vez: al volver a subir no se repite
      },
      // threshold 0 + margen inferior negativo en vez de un threshold alto:
      // dispara cuando el borde de arriba de la sección sube un 12% desde el
      // pie de la pantalla. Con un threshold por porcentaje del elemento, una
      // sección más alta que la ventana nunca llegaría a cumplirlo.
      { threshold: 0, rootMargin: '0px 0px -12% 0px' }
    );

    observer.observe(nodo);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={visible ? 'revelar revelar-visible' : 'revelar'}>
      {children}
    </div>
  );
}
