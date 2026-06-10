import { useState } from 'react';
import { Link, Outlet } from 'react-router-dom';

export default function MainLayout({ userRole }) {
  // 1. Manejo del Estado del Menú
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Función de ayuda para cerrar el menú al hacer clic
  const closeMenu = () => setIsMenuOpen(false);

  // Array de rutas para mapear fácilmente y mantener el código limpio
  const navLinks = [
    { name: 'Inicio', path: '/socio' },
    { name: 'Mi Perfil', path: '/perfil' },
    { name: 'Gestión de Cuotas', path: '/cuotas' },
    { name: 'Shopping', path: '/shopping' },
    { name: 'Reserva de Instalaciones', path: '/alquileres' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 font-sans flex flex-col">
      
      {/* Header Principal Fijo (Sticky) */}
      <header className="bg-slate-900 text-slate-100 sticky top-0 z-40 shadow-lg border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            
            {/* Botón de Menú Hamburguesa */}
            <button 
              onClick={() => setIsMenuOpen(true)}
              className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
            >
              <span className="sr-only">Abrir menú principal</span>
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* Logo / Título Central */}
            <div className="flex-shrink-0 flex items-center">
              <Link to="/socio" className="font-black text-xl tracking-widest text-white hover:text-blue-400 transition-colors">
                C.A. ROBERTS
              </Link>
            </div>

            {/* 3. Enlace del Carrito */}
            <Link 
              to="/carrito" 
              className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors relative"
            >
              <span className="sr-only">Ver carrito</span>
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              {/* Badge visual (indicador de items) - Se puede hacer condicional luego */}
              <span className="absolute top-0 right-0 block h-3 w-3 rounded-full bg-red-500 ring-2 ring-slate-900 translate-x-1 -translate-y-1"></span>
            </Link>

          </div>
        </div>
      </header>

      {/* ================= MODAL DEL MENÚ (DRAWER) ================= */}
      
      {/* Backdrop oscuro para desenfocar el fondo cuando el menú está abierto */}
      {isMenuOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity"
          onClick={closeMenu}
        ></div>
      )}

      {/* 4. Estilos Tailwind: Panel lateral deslizable (z-50, position fixed) */}
      <div 
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-slate-900 shadow-2xl transform transition-transform duration-300 ease-in-out flex flex-col border-r border-slate-800 ${
          isMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-950">
          <span className="font-bold text-white tracking-widest text-lg">MENÚ</span>
          <button onClick={closeMenu} className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-lg transition-colors">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* 2. Enlaces de Navegación */}
        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          {navLinks.map((link) => (
            <Link
              key={link.name}
              to={link.path}
              onClick={closeMenu} // Cierra el menú al hacer clic
              className="block px-4 py-3 text-slate-300 hover:bg-blue-600 hover:text-white rounded-xl font-semibold transition-all duration-200"
            >
              {link.name}
            </Link>
          ))}
        </nav>

        {/* Sección de cierre de sesión opcional al fondo */}
        <div className="p-6 border-t border-slate-800 bg-slate-950">
          <Link to="/" className="w-full flex items-center justify-center px-4 py-3 border border-red-500/30 text-red-400 rounded-xl hover:text-white hover:bg-red-600 transition-colors font-bold">
            Cerrar Sesión
          </Link>
        </div>
      </div>

      {/* Contenido Principal (Páginas hijas inyectadas aquí) */}
      <main className="flex-grow w-full max-w-7xl mx-auto">
        <Outlet />
      </main>
    </div>
  );
}