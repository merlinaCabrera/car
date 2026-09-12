import camotiAzul from '../../assets/camoti-azul.PNG';
import { Link } from 'react-router-dom';

// lucide-react no incluye logos de marca (Facebook/Instagram/YouTube) a
// propósito — son solo íconos genéricos de UI. Por eso estos van inline,
// sin agregar ninguna dependencia nueva al proyecto.
function FacebookIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M22.675 0h-21.35C.593 0 0 .593 0 1.325v21.351C0 23.407.593 24 1.325 24H12.82v-9.294H9.692v-3.622h3.128V8.413c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.795.143v3.24l-1.918-.001c-1.504 0-1.795.715-1.795 1.763v2.313h3.587l-.467 3.622h-3.12V24h6.116C23.407 24 24 23.407 24 22.675V1.325C24 .593 23.407 0 22.675 0z" />
    </svg>
  );
}

function InstagramIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.332.014 7.052.072 2.694.272.273 2.69.073 7.052.014 8.332 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.332 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
    </svg>
  );
}

function YoutubeIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

// Completá con los links reales cuando los tengas.
const REDES = [
  { Icon: FacebookIcon, url: 'https://facebook.com/', label: 'Facebook' },
  { Icon: InstagramIcon, url: 'https://instagram.com/', label: 'Instagram' },
  { Icon: YoutubeIcon, url: 'https://youtube.com/', label: 'YouTube' },
];

// El Camotí es una abeja, así que en vez de estar clavado en una caja, flota.
//
// El CSS va acá y no en components/landing/animaciones.jsx a propósito: este
// pie también lo usa GaleriaCompleta, que no monta los estilos de la landing.
// Si esto viviera allá, el camotí quedaría quieto en esa página.
//
// El halo reemplaza a la pastilla blanca que había antes. Es apenas una luz
// tenue por debajo, no un círculo: se apaga a los 55% del radio.
//
// ⚠️ Con esta intensidad el halo ya NO sirve para contrastar. El Azul Camotí
// está definido para fondos claros y sobre el pie oscuro casi no se lee: la
// pastilla existía por eso. Es una decisión estética tomada a sabiendas — si
// la abeja queda demasiado apagada, la salida no es subir el halo (vuelve el
// círculo) sino un camotí claro para soportes oscuros.
const ESTILOS_CAMOTI = `
  @keyframes camotiFlota {
    0%, 100% { transform: translateY(0)     rotate(-2deg); }
    50%      { transform: translateY(-7px)  rotate(2deg);  }
  }
  @keyframes camotiHalo {
    0%, 100% { transform: scale(1);    opacity: 0.85; }
    50%      { transform: scale(1.07); opacity: 1;    }
  }
  /* Desfasados a propósito (4.5s y 6s): al no coincidir los ciclos, el
     movimiento no se lee como un loop corto repitiéndose. */
  .camoti-flota { animation: camotiFlota 4.5s ease-in-out infinite; }
  .camoti-halo  { animation: camotiHalo  6s   ease-in-out infinite; }

  @media (prefers-reduced-motion: reduce) {
    .camoti-flota, .camoti-halo { animation: none; }
  }
`;

// Etiqueta de columna: un solo estilo para las tres cabeceras del pie.
function TituloColumna({ children }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">
      {children}
    </h3>
  );
}

export default function Footer() {
  return (
    /* Azul Francia (#1C1F2D) exacto = francia-900 en tailwind.config.js. */
    <footer className="bg-francia-900 text-white/75">
      <style>{ESTILOS_CAMOTI}</style>
      <div className="max-w-6xl mx-auto px-6 lg:px-8 py-16 sm:py-20">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-3 lg:gap-10">
          {/* ── Identidad ─────────────────────────────────────────────── */}
          <div className="sm:col-span-2 lg:col-span-1">
            {/* El escudo NO va en el pie (va en cabecera). Acá la marca
                secundaria: El Camotí, en su tinta oficial Azul Camotí. */}
            <div className="relative inline-flex items-center justify-center p-4">
              {/* Halo: reemplaza a la pastilla. aria-hidden porque es puro
                  soporte visual — quien usa lector de pantalla ya tiene el alt
                  de la imagen. */}
              <span
                aria-hidden="true"
                className="camoti-halo absolute inset-0 rounded-full
                           bg-[radial-gradient(circle,rgba(255,255,255,0.09)_0%,rgba(255,255,255,0.05)_30%,rgba(255,255,255,0)_55%)]"
              />
              <img
                src={camotiAzul}
                alt="El Camotí — marca secundaria del Club Atlético Roberts"
                className="camoti-flota relative h-14 w-auto object-contain"
              />
            </div>

            <p className="mt-6 font-display text-2xl font-bold text-white tracking-tight">
              Club Atlético Roberts
            </p>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/60">
              Deporte, formación y vida social en Roberts, Buenos Aires, desde 1918.
            </p>
          </div>

          {/* ── Contacto ──────────────────────────────────────────────── */}
          <div>
            <TituloColumna>Contacto</TituloColumna>
            <ul className="mt-5 space-y-3 text-sm">
              <li className="text-white/70">Sarmiento y Güemes, Roberts</li>
              <li>
                <a
                  href="mailto:clubatleticoroberts1@gmail.com"
                  className="text-white/70 hover:text-white transition-colors break-all"
                >
                  clubatleticoroberts1@gmail.com
                </a>
              </li>
              <li>
                <a
                  href="https://clubatleticoroberts.com"
                  className="text-white/70 hover:text-white transition-colors"
                >
                  clubatleticoroberts.com
                </a>
              </li>
              <li>
                <Link to="/ayuda" className="text-white/70 hover:text-white transition-colors">
                  Ayuda y Contacto
                </Link>
              </li>
            </ul>
          </div>

          {/* ── Redes ─────────────────────────────────────────────────── */}
          <div>
            <TituloColumna>Seguinos</TituloColumna>
            <div className="mt-5 flex items-center gap-3">
              {REDES.map(({ Icon, url, label }) => (
                <a
                  key={label}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl
                             border border-white/15 bg-white/5 text-white/70
                             hover:bg-white hover:text-francia-900 hover:border-white
                             transition-colors focus:outline-none focus:ring-2 focus:ring-white/40"
                >
                  <Icon className="w-[18px] h-[18px]" />
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-14 pt-8 border-t border-white/10">
          <p className="text-xs text-white/55">
            © {new Date().getFullYear()} Club Atlético Roberts. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}
