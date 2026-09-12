import { useEffect, useState } from 'react';
import camotiAzul from '../../assets/camoti-azul.PNG';

// Easter egg: cada tanto El Camotí cruza la pantalla de punta a punta.
// Va montado solo en la landing (ver Landing.jsx) — adentro de la app, con el
// socio tratando de pagar una cuota, una avispa cruzando es un estorbo.

const ESPERA_MIN_MS = 15000;
const ESPERA_MAX_MS = 45000;
const DURACION_MS = 1800;   // tiene que coincidir con la duración del CSS

// El vuelo va en dos elementos y no en uno: el div hace el recorrido y la
// imagen de adentro hace el espejo. Es obligatorio separarlos — los keyframes
// animan `transform`, así que un scaleX(-1) puesto en el mismo elemento se
// pisaría con el translateX del frame y la avispa no se movería.
//
// La curva la pasa el componente como --curva (un valor por vuelo): sube o
// baja hasta 20px en el medio del recorrido y vuelve, así el cruce se lee
// como vuelo y no como una calcomanía deslizándose.
const CSS = `
  @keyframes camotiCruzaDerecha {
    0%   { transform: translateX(-80px) translateY(0px); opacity: 0; }
    8%   { opacity: 1; }
    50%  { transform: translateX(50vw) translateY(var(--curva, 0px)); }
    92%  { opacity: 1; }
    100% { transform: translateX(calc(100vw + 80px)) translateY(0px); opacity: 0; }
  }

  @keyframes camotiCruzaIzquierda {
    0%   { transform: translateX(calc(100vw + 80px)) translateY(0px); opacity: 0; }
    8%   { opacity: 1; }
    50%  { transform: translateX(50vw) translateY(var(--curva, 0px)); }
    92%  { opacity: 1; }
    100% { transform: translateX(-80px) translateY(0px); opacity: 0; }
  }

  .camoti-volador {
    position: fixed;
    left: 0;
    z-index: 50;          /* arriba del contenido, abajo de cualquier modal */
    pointer-events: none; /* que no se coma un click al pasar por un botón */
    will-change: transform, opacity;
  }
  .camoti-volador--derecha   { animation: camotiCruzaDerecha   1.8s linear both; }
  .camoti-volador--izquierda { animation: camotiCruzaIzquierda 1.8s linear both; }

  /* El Azul Camotí es casi el mismo valor que el overlay del Hero, y el primer
     cruce cae entre los 15 y 45 segundos: justo cuando el visitante todavía
     está arriba de todo. Sin esto, la avispa pasa invisible en la única
     ventana en la que se la iba a ver. El halo es blanco y difuso: sobre los
     fondos blancos de la landing no se nota, y sobre el Hero le dibuja el
     borde. Va con filter y no box-shadow, que seguiría la silueta y no la
     caja del <img>. Si algún día hay un camotí blanco, esto sobra. */
  .camoti-volador img {
    filter: drop-shadow(0 0 5px rgba(255, 255, 255, 0.65))
            drop-shadow(0 1px 3px rgba(17, 20, 32, 0.35));
  }
`;

const azar = (min, max) => min + Math.random() * (max - min);

function prefiereQuietud() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function CamotiVolador() {
  // null = no está cruzando. Que el vuelo sea un objeto (y no un booleano) es
  // lo que garantiza "una sola instancia a la vez": mientras haya uno, el
  // efecto de abajo no programa el siguiente.
  const [vuelo, setVuelo] = useState(null);
  const [permitido, setPermitido] = useState(() => !prefiereQuietud());

  // Se escucha el cambio y no solo el valor inicial: si alguien activa
  // "reducir movimiento" con la página abierta, la avispa para sin recargar.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const consulta = window.matchMedia('(prefers-reduced-motion: reduce)');
    const alCambiar = () => setPermitido(!consulta.matches);
    consulta.addEventListener('change', alCambiar);
    return () => consulta.removeEventListener('change', alCambiar);
  }, []);

  // Programa el próximo cruce. Depende de `vuelo`: cuando termina uno vuelve a
  // null, el efecto corre de nuevo y agenda el siguiente. Mientras hay uno en
  // curso sale temprano, así que nunca se superponen dos.
  useEffect(() => {
    if (!permitido || vuelo) return;

    const id = setTimeout(() => {
      setVuelo({
        direccion: Math.random() < 0.5 ? 'derecha' : 'izquierda',
        y: azar(15, 75),      // % de alto: ni el header ni el pie de la página
        curva: azar(-20, 20), // px que sube o baja en el medio del recorrido
      });
    }, azar(ESPERA_MIN_MS, ESPERA_MAX_MS));

    return () => clearTimeout(id);
  }, [permitido, vuelo]);

  // Red de seguridad. Lo normal es que termine por onAnimationEnd, pero ese
  // evento puede no llegar (pestaña en segundo plano, por ejemplo) y entonces
  // `vuelo` se quedaría fijo y no habría más cruces en toda la sesión.
  useEffect(() => {
    if (!vuelo) return;
    const id = setTimeout(() => setVuelo(null), DURACION_MS + 400);
    return () => clearTimeout(id);
  }, [vuelo]);

  if (!permitido) return null;

  return (
    <>
      <style>{CSS}</style>

      {vuelo && (
        <div
          aria-hidden="true"
          className={`camoti-volador camoti-volador--${vuelo.direccion}`}
          style={{ top: `${vuelo.y}%`, '--curva': `${vuelo.curva}px` }}
          onAnimationEnd={() => setVuelo(null)}
        >
          <img
            src={camotiAzul}
            alt=""
            draggable={false}
            className="h-12 w-auto object-contain"
            style={vuelo.direccion === 'izquierda' ? { transform: 'scaleX(-1)' } : undefined}
          />
        </div>
      )}
    </>
  );
}
