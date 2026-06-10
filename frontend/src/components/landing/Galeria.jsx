import jugadoresImg from '../../assets/jugadores.PNG';

export default function Galeria() {
  // Mock iterable para generar la grilla
  const placeholders = [1, 2, 3, 4];

  return (
    <section className="py-16 bg-slate-50 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-3xl font-bold mb-10 text-center text-blue-900">Galería</h2>
        
        {/* Grid responsivo: 2 columnas en móvil, 4 en desktop */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {placeholders.map((item) => (
            <div key={item} className="aspect-square rounded-xl shadow-lg overflow-hidden hover:scale-105 transition-transform duration-300 cursor-pointer bg-white">
              <img src={jugadoresImg} alt={`Galería histórica ${item}`} className="w-full h-full object-cover hover:opacity-90 transition-opacity" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}