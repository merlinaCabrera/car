import { useState } from 'react';
import { Link, Outlet } from 'react-router-dom';

export default function MainLayout({ userRole = 'socio' }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans flex flex-col">
      {/* Cabecera (Header) */}
      <header className="bg-blue-950 p-4 flex justify-between items-center sticky top-0 z-50 shadow-md">
        <div className="flex items-center gap-3">
          {/* Botón Menú Hamburguesa */}
          <button 
            onClick={() => setMenuOpen(!menuOpen)} 
            className="p-1 text-white focus:outline-none transition-transform active:scale-95"
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
          <h1 className="text-xl font-bold tracking-wider text-blue-50">C.A. ROBERTS</h1>
        </div>
        
        {/* Ícono de Carrito (Visible solo para socios) */}
        {userRole === 'socio' && (
          <Link to="/carrito" className="relative p-1">
            <svg className="w-7 h-7 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span className="absolute top-0 right-0 bg-red-600 text-xs font-bold rounded-full h-4 w-4 flex items-center justify-center">
              2
            </span>
          </Link>
        )}
      </header>

      {/* Menú Desplegable (Responsive) */}
      {menuOpen && (
        <nav className="bg-blue-900/95 backdrop-blur-sm absolute top-[68px] left-0 w-full flex flex-col p-4 shadow-xl z-40">
          {userRole === 'admin' ? (
            <>
              <Link to="/admin" className="py-3 border-b border-blue-800 font-medium" onClick={() => setMenuOpen(false)}>Inicio Admin</Link>
              <Link to="/admin/socios" className="py-3 border-b border-blue-800 font-medium" onClick={() => setMenuOpen(false)}>Admin Socios</Link>
              <Link to="/admin/alquileres" className="py-3 border-b border-blue-800 font-medium" onClick={() => setMenuOpen(false)}>Gestión Alquileres</Link>
              <Link to="/admin/permisos" className="py-3 font-medium" onClick={() => setMenuOpen(false)}>Permisos</Link>
            </>
          ) : (
            <>
              <Link to="/socio" className="py-3 border-b border-blue-800 font-medium" onClick={() => setMenuOpen(false)}>Inicio</Link>
              <Link to="/socio/perfil" className="py-3 border-b border-blue-800 font-medium" onClick={() => setMenuOpen(false)}>Mi Perfil</Link>
              <Link to="/calendario" className="py-3 font-medium" onClick={() => setMenuOpen(false)}>Calendario Deportivo</Link>
            </>
          )}
        </nav>
      )}

      {/* Contenedor Principal dinámico */}
      <main className="flex-1 p-5 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}