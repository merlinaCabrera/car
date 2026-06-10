export default function SocioPerfil() {
  
  const handleGuardarCambios = (e) => {
    e.preventDefault();
    // TODO: Enviar petición PATCH a la API con los datos modificados.
    alert("Datos actualizados correctamente.");
  };

  return (
    <div className="min-h-screen bg-slate-900 p-4 pb-20 text-slate-100 space-y-8">
      
      <div>
        <h2 className="text-2xl font-bold text-white tracking-wide">Mi Perfil</h2>
      </div>

      {/* Credencial Digital Simulada (Azul Francia) */}
      <div className="w-full max-w-sm mx-auto bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl shadow-2xl p-6 relative overflow-hidden text-white border-2 border-blue-400/30">
        {/* Background Decorations */}
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-white opacity-10 rounded-full blur-xl"></div>
        <div className="absolute -bottom-5 -left-10 w-24 h-24 bg-black opacity-20 rounded-full blur-lg"></div>
        
        <div className="flex justify-between items-start mb-6 relative z-10">
          <h3 className="font-black text-xl tracking-widest">C.A. ROBERTS</h3>
          <span className="bg-green-500 text-white text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider">
            SOCIO ACTIVO
          </span>
        </div>
        
        <div className="relative z-10 space-y-1">
          <p className="text-blue-100 text-xs uppercase tracking-widest font-semibold">Titular</p>
          <h4 className="text-2xl font-bold tracking-wide">ACOSTA SERGIO</h4>
        </div>

        <div className="mt-6 flex justify-between items-end relative z-10 font-mono">
          <div>
            <p className="text-blue-200 text-xs">DNI</p>
            <p className="font-semibold tracking-wider">44.196.940</p>
          </div>
          <div className="text-right">
            <p className="text-blue-200 text-xs">Nº Socio</p>
            <p className="font-bold text-lg">12345</p>
          </div>
        </div>
      </div>

      {/* Formulario Pre-poblado */}
      <div className="bg-slate-800 rounded-3xl shadow-xl p-6 border border-slate-700/50">
        <h3 className="text-lg font-bold text-white mb-5 border-b border-slate-700 pb-2">Datos de Contacto</h3>
        
        <form onSubmit={handleGuardarCambios} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-1">Email</label>
            <input type="email" defaultValue="sergio.acosta@ejemplo.com" className="w-full p-3 bg-slate-900 border border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 text-white transition-colors" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-1">Teléfono</label>
            <input type="tel" defaultValue="11 1234 5678" className="w-full p-3 bg-slate-900 border border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 text-white transition-colors" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-1">Dirección</label>
            <input type="text" defaultValue="Calle Falsa 123, CABA" className="w-full p-3 bg-slate-900 border border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 text-white transition-colors" />
          </div>
          <button type="submit" className="w-full bg-slate-700 text-white font-bold py-3 rounded-xl hover:bg-slate-600 active:scale-95 transition-all mt-4 border border-slate-600">
            Guardar Cambios
          </button>
        </form>
      </div>
    </div>
  );
}