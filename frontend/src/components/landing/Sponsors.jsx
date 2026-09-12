import { useEffect, useState } from 'react';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export default function Sponsors() {
  const [sponsors, setSponsors] = useState([]);
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    fetch(`${API}/sponsors`)
      .then((res) => res.json())
      .then((data) => setSponsors(data))
      .catch(() => setSponsors([])) // si falla, simplemente no se muestra la sección
      .finally(() => setCargado(true));
  }, []);

  // Nada que mostrar todavía (cargando) o no hay sponsors activos cargados.
  if (!cargado || sponsors.length === 0) return null;

  return (
    <section className="bg-white py-24 sm:py-28">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-600/70">
          Nos acompañan
        </p>
        <h2 className="mt-4 font-display text-3xl sm:text-4xl lg:text-[2.75rem] font-bold text-blue-600 leading-tight tracking-tight">
          Sponsors
        </h2>
        <div className="mx-auto mt-6 h-px w-16 bg-blue-600/30" />
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          POR QUÉ LAS PLACAS SON OSCURAS Y NO BLANCAS
          ---------------------------------------------------------------------
          Los 5 logos cargados hoy en el bucket público son arte BLANCO sobre
          fondo transparente (verificado pixel a pixel: el 100% de los píxeles
          con alfa tienen luminancia > 235). Sobre blanco no se ven lavados:
          no se ven, punto. Es el mismo caso que el escudo blanco del Hero.

          No hay filtro CSS que arreglar — acá no hay ninguno. Con estos
          archivos, la única forma de que el logo se lea es darle un fondo
          oscuro. Se usa Azul Francia (#1C1F2D), que es tinta oficial del
          manual, así que la sección sigue dentro de la paleta cerrada.

          SI EL CLUB CONSIGUE LOS LOGOS A COLOR O EN VERSIÓN OSCURA: cambiar
          en la placa `bg-francia-900 border-white/10` por
          `bg-white border-gray-100` y listo, es esa línea nada más.
          ───────────────────────────────────────────────────────────────────── */}
      <div className="mx-auto mt-14 max-w-6xl px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
          {sponsors.map((sponsor) => (
            <a
              key={sponsor.id_sponsor}
              href={sponsor.url_destino}
              target="_blank"
              rel="noopener noreferrer"
              title={sponsor.nombre}
              className="relative block overflow-hidden rounded-2xl border border-white/10
                         bg-francia-900 aspect-[2/1] transition-shadow duration-200
                         hover:shadow-lg focus:outline-none focus:ring-2
                         focus:ring-blue-600/40 focus:ring-offset-2"
            >
              {/* Los 5 archivos cargados son exports de Instagram: lienzo 4:5
                  con el logo chiquito y centrado (el arte real ocupa entre 18% y
                  30% del alto). Con object-contain el logo entraba entero pero
                  se veía diminuto, porque lo que entraba era el margen vacío.
                  Acá la imagen se ajusta por ANCHO y la placa recorta el sobrante
                  vertical: como el arte está centrado en el lienzo, lo único que
                  se corta es transparencia. Nada de object-cover (deformaría). */}
              <img
                src={sponsor.imagen_url}
                alt={sponsor.nombre}
                loading="lazy"
                className="absolute left-1/2 top-1/2 w-[calc(100%-2.5rem)] max-w-none
                           -translate-x-1/2 -translate-y-1/2"
                draggable={false}
              />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
