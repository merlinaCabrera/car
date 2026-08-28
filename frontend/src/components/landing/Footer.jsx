import camotiAzul from '../../assets/camoti-azul.PNG';

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

export default function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-300 py-12 px-6 text-center">
      <div className="max-w-4xl mx-auto space-y-4">
        <h3 className="text-2xl font-bold text-white tracking-widest">CLUB ATLÉTICO ROBERTS</h3>
        <p className="text-sm">Sarmiento y Güemes, Roberts</p>
        <p className="text-sm">clubatleticoroberts1@gmail.com</p>

        <div className="flex items-center justify-center gap-5 pt-2">
          {REDES.map(({ Icon, url, label }) => (
            <a
              key={label}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              className="text-slate-400 hover:text-blue-400 transition-colors"
            >
              <Icon className="w-5 h-5" />
            </a>
          ))}
        </div>

        <div className="pt-6 mt-6 border-t border-slate-700 flex flex-col items-center gap-4">
          <img src={camotiAzul} alt="Mascota Camoti Azul" className="h-16 w-auto object-contain opacity-80 hover:opacity-100 transition-opacity drop-shadow-md" />
          <a href="https://clubatleticoroberts.com" className="text-blue-400 hover:text-blue-300 transition-colors font-medium">
            clubatleticoroberts.com
          </a>
        </div>
      </div>
    </footer>
  );
}