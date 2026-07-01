export default function SocioPerfil() {
  
  const handleGuardarCambios = (e) => {
    e.preventDefault();
    // TODO: Enviar petición PATCH a la API con los datos modificados.
    alert("Datos actualizados correctamente.");
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mi Perfil</h1>
        <p className="text-gray-500 text-sm mt-1">Actualizá tus datos de contacto y visualizá tu credencial.</p>
      </div>

      {/* Credencial Digital Simulada (Azul Francia) */}
      <div className="w-full max-w-md mx-auto bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl shadow-2xl p-6 relative overflow-hidden text-white border-2 border-blue-400/30">
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
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-5 border-b border-gray-200 pb-3">Datos de Contacto</h3>
        
        <form onSubmit={handleGuardarCambios} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Email</label>
            <input type="email" defaultValue="sergio.acosta@ejemplo.com" className="w-full p-3 rounded-lg border bg-gray-50 border-gray-200 focus:border-blue-500 focus:ring-blue-500 transition-colors" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Teléfono</label>
            <input type="tel" defaultValue="11 1234 5678" className="w-full p-3 rounded-lg border bg-gray-50 border-gray-200 focus:border-blue-500 focus:ring-blue-500 transition-colors" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Dirección</label>
            <input type="text" defaultValue="Calle Falsa 123, CABA" className="w-full p-3 rounded-lg border bg-gray-50 border-gray-200 focus:border-blue-500 focus:ring-blue-500 transition-colors" />
          </div>
          <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 active:scale-95 transition-all mt-4 shadow-sm">
            Guardar Cambios
          </button>
        </form>
      </div>
    </div>
  );
}