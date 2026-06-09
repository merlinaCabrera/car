export default function Login() {
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-6 text-white font-sans">
      <div className="w-full max-w-sm flex flex-col items-center">
        {/* Logo Simulado */}
        <div className="w-24 h-24 bg-blue-600 rounded-full mb-8 flex items-center justify-center shadow-[0_0_20px_rgba(37,99,235,0.6)]">
          <span className="text-3xl font-bold tracking-tighter">CAR</span>
        </div>
        
        <h1 className="text-2xl font-bold mb-8 tracking-wide">Iniciar Sesión</h1>
        
        <form className="w-full space-y-5" onSubmit={(e) => e.preventDefault()}>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5 ml-1">Correo electrónico</label>
            <input 
              type="email" 
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3.5 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              placeholder="socio@email.com"
            />
          </div>
          
          <div>
            <label className="block text-sm text-gray-400 mb-1.5 ml-1">Contraseña</label>
            <input 
              type="password" 
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3.5 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              placeholder="••••••••"
            />
          </div>
          
          <button className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-xl mt-6 shadow-lg shadow-blue-900/50 transition-transform active:scale-95">
            INGRESAR
          </button>
        </form>
        
        <div className="mt-8 flex flex-col items-center gap-4">
          <button className="text-sm text-blue-400 hover:text-blue-300 underline-offset-4 hover:underline">¿Olvidaste tu contraseña?</button>
        </div>
      </div>
    </div>
  );
}