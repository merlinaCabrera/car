import { useEffect, useRef, useState } from 'react';

// Sistema de animaciones de entrada, compartido por la landing y por las
// páginas del socio y de roles.
//
// El CSS (keyframes + clases .anim-*, .revelar y .hero-*) NO está acá: vive en
// src/index.css, que se carga en toda la app. Antes estaba en este archivo
// dentro de un <style> que solo montaba Landing, así que fuera de la landing
// las clases no existían y no animaban nada. Ver el bloque comentado en
// index.css antes de mover nada de vuelta.
//
// Acá queda solo lo que necesita JavaScript: detectar cuándo una sección entra
// en pantalla.

// Envoltorio que revela a sus hijos cuando el scroll los alcanza.
//
// Cuándo usar cuál:
//   · clases .anim-* → contenido que ya está en pantalla al cargar (títulos,
//     tarjetas de arriba). Animan al montar, con delay fijo.
//   · <Revelar>      → contenido debajo del pliegue (historiales, listas
//     largas). Con delays fijos la animación se gastaría fuera de pantalla.
//
// En la landing se usa envolviendo las secciones desde Landing.jsx y NO desde
// adentro de los componentes de sección, a propósito: Footer también lo usa
// GaleriaCompleta y Beneficios lo usa SocioInicio, así que meterlo adentro
// filtraría la animación a páginas que no la pidieron.
export function Revelar({ children, className = '' }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const nodo = ref.current;
    if (!nodo) return;

    // Sin IntersectionObserver mostramos el contenido sin animar. Vale la pena
    // el chequeo: el fallo silencioso sería una pantalla en blanco, no una
    // pantalla sin animación.
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
      // dispara cuando el borde de arriba del bloque sube un 12% desde el pie
      // de la pantalla. Con un threshold por porcentaje del elemento, un bloque
      // más alto que la ventana nunca llegaría a cumplirlo.
      { threshold: 0, rootMargin: '0px 0px -12% 0px' }
    );

    observer.observe(nodo);
    return () => observer.disconnect();
  }, []);

  const clases = ['revelar', visible ? 'revelar-visible' : '', className]
    .filter(Boolean)
    .join(' ');

  return <div ref={ref} className={clases}>{children}</div>;
}
