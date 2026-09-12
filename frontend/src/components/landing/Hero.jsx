import { Link } from 'react-router-dom';
import heroBg from '../../assets/hero-bg.PNG';
import { useAuth } from '../../context/AuthContext';

export default function Hero() {
  const { isAuthenticated } = useAuth();

  return (
    <div
      className="relative min-h-screen bg-cover bg-center bg-no-repeat flex flex-col"
      style={{ backgroundImage: `url(${heroBg})` }}
    >
      {/* Capa de superposición: antes era un negro plano al 60%. Ahora tinta la
          foto con el Azul Francia de la marca, que es lo que pide el criterio
          fotográfico del manual (humo azul de tribuna, colorimetría limpia). */}
      <div className="absolute inset-0 bg-gray-950/70 z-0"></div>

      <header className="relative z-10 w-full p-6 lg:px-12 flex justify-center">
        {/* REGLA DE ORO DEL ESCUDO (doc 05): nunca estampado sobre la foto.
            Va siempre en marco o zócalo blanco perimetral, con margen de
            1 bastón alrededor. De ahí la pastilla blanca con padding. */}
        <div className="rounded-2xl bg-white px-5 py-4 sm:px-6 sm:py-5">
          <img
            src="/escudo-car-1.png"
            alt="Escudo C.A. Roberts"
            className="h-24 sm:h-28 lg:h-32 w-auto object-contain"
          />
        </div>
      </header>

      <main className="relative z-10 flex-grow flex items-center justify-center px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl text-center space-y-8">
          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-bold text-white tracking-tight leading-[1.1]">
            No existe lo imposible, <br className="hidden sm:block" /> nos mueve la pasión
          </h1>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 pt-2">
            {isAuthenticated ? (
              <Link to="/socio" className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-colors duration-200 text-base">
                Ir a Mi Panel de Socio
              </Link>
            ) : (
              <>
                <Link to="/registro" className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-colors duration-200 text-base">
                  Asociate Hoy
                </Link>
                <Link to="/login" className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-transparent border border-white/70 text-white hover:bg-white hover:text-blue-600 font-semibold transition-colors duration-200 text-base">
                  Soy Socio
                </Link>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
