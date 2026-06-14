import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';

export default function SocioAlquileres() {
  const navigate = useNavigate();
  const { addToCart } = useCart();

  const handleReservar = (e) => {
    e.preventDefault();
    
    // Extraemos los valores simples del formulario
    const fecha = e.target[0].value;
    const turno = e.target[1].options[e.target[1].selectedIndex].text;

    addToCart({
      id: `alq-quincho-${fecha}`,
      nombre: `Alquiler Quincho - ${turno} (${fecha})`,
      precio: 15000,
      tipo: 'alquiler'
    });

    navigate('/carrito');
  };

  return (
    <div className="min-h-screen bg-slate-900 p-4 pb-20 text-slate-100 space-y-6">
      
      <div className="mb-2">
        <h2 className="text-2xl font-bold text-white tracking-wide">Alquiler de Instalaciones</h2>
        <p className="text-slate-400 text-sm mt-1">Reserva tus espacios en el club.</p>
      </div>

      {/* Tarjeta de Beneficio Socio */}
      <div className="bg-blue-900/40 border border-blue-500/50 rounded-2xl p-5 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 bg-blue-600 text-xs font-bold px-3 py-1 rounded-bl-xl text-white tracking-wider">
          BENEFICIO
        </div>
        <h3 className="font-bold text-blue-300 text-lg mb-1">Precios Especiales</h3>
        <p className="text-sm text-slate-300 leading-relaxed">
          Recordá que al ser <span className="font-semibold text-white">SOCIO ACTIVO</span> contás con tarifas diferenciadas para el alquiler del Quincho y Canchas.
        </p>
      </div>

      {/* Formulario de Reserva del Quincho */}
      <div className="bg-slate-800 rounded-3xl shadow-xl p-6 border border-slate-700/50">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center text-blue-400">🔥</div>
          <h3 className="text-xl font-bold text-white">Reserva Quincho</h3>
        </div>
        
        <form onSubmit={handleReservar} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">Fecha solicitada</label>
            <input 
              type="date" 
              required
              className="w-full p-3 bg-slate-900 border border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none text-white transition-all color-scheme-dark" 
            />
          </div>
          
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">Turno</label>
            <select required className="w-full p-3 bg-slate-900 border border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none text-white transition-all appearance-none">
              <option value="mediodia">Mediodía (10:00 a 16:00 hs)</option>
              <option value="noche">Noche (19:00 a 01:00 hs)</option>
            </select>
          </div>

          <button type="submit" className="w-full mt-4 bg-blue-600 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-blue-500 active:scale-95 transition-all text-lg tracking-wide">
            Reservar y Agregar al Carrito
          </button>
        </form>
      </div>
    </div>
  );
}