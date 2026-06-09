import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    // Contenedor principal: Ocupa toda la pantalla (min-h-screen), imagen de fondo y Flexbox
    <div 
      className="relative min-h-screen bg-cover bg-center bg-no-repeat flex flex-col"
      style={{ backgroundImage: "url('https://images.unsplash.com/photo-1518605368461-1e1252270b20?auto=format&fit=crop&q=80')" }}
    >
      {/* Capa de superposición oscura (overlay) para asegurar el contraste de lectura */}
      <div className="absolute inset-0 bg-black/60 z-0"></div>

      {/* Header sutil: transparente con posición absoluta / z-index superior */}
      <header className="relative z-10 w-full p-6 lg:px-12">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-widest">
            C.A. ROBERTS
          </h1>
        </div>
      </header>

      {/* Contenido central (Hero Section) */}
      <main className="relative z-10 flex-grow flex items-center justify-center px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl text-center space-y-8">
          
          {/* Lema impactante */}
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-white tracking-tight drop-shadow-lg">
            No existe lo imposible, <br className="hidden sm:block" /> nos mueve la pasión
          </h2>
          
          {/* Subtítulo opcional para dar contexto */}
          <p className="text-base sm:text-xl text-gray-200 font-light max-w-2xl mx-auto drop-shadow-md">
            El orgullo de la ciudad. Gestioná tu cuota, accedé a beneficios exclusivos y seguí siendo parte de nuestra historia.
          </p>

          {/* Llamados a la Acción (CTAs): Columna en móviles, fila a partir de 'sm' */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
            <Link 
              to="/registro" 
              className="w-full sm:w-auto px-8 py-3 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors duration-300 shadow-lg text-lg"
            >
              Asociate Hoy
            </Link>
            <Link 
              to="/login" 
              className="w-full sm:w-auto px-8 py-3 rounded-full bg-transparent border-2 border-white text-white hover:bg-white/10 font-semibold transition-colors duration-300 shadow-lg text-lg"
            >
              Portal del Socio
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}