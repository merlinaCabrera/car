import jugadoresImg from '../../assets/jugadores.PNG';

export default function Historia() {
  return (
    <section className="py-20 px-6 lg:px-12 bg-white text-slate-800 flex flex-col items-center">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center gap-10">
        
        <div className="md:w-1/2 text-center md:text-left">
          <h2 className="text-3xl sm:text-4xl font-bold mb-6 text-blue-900">Nuestra Historia</h2>
          <p className="text-lg leading-relaxed text-slate-600">
            Fundado con el sudor y el esfuerzo de nuestra comunidad, el Club Atlético Roberts
            ha sido el pilar deportivo de la ciudad por décadas. Aquí no solo formamos jugadores,
            sino personas con valores, compañerismo y un amor incondicional por la camiseta.
          </p>
        </div>

        <div className="md:w-1/2 w-full">
          <img 
            src={jugadoresImg} 
            alt="Jugadores históricos del club" 
            className="w-full h-auto rounded-lg shadow-xl object-cover"
          />
        </div>
        
      </div>
    </section>
  );
}