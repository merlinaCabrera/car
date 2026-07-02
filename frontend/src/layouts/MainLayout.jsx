import { useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { ScanLine } from 'lucide-react';

// Importación del asset real
import escudoCar from '../assets/escudo-car.PNG';

export default function MainLayout() {
  // 1. Manejo del Estado del Menú
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { cart } = useCart();

  // Función de ayuda para cerrar el menú al hacer clic
  const closeMenu = () => setIsMenuOpen(false);

  // --- Lógica de Navegación Multi-Rol ---
  // 1. Extraemos todos los nombres de roles del usuario.
  const userRoles = user?.roles_asignados?.map(r => r.rol.nombre) || [];
  
  // 4. Verificamos si el usuario tiene permisos de administrador.
  const isAdmin = userRoles.includes('admin_general') || userRoles.includes('personal_administrativo');
  // 5. Verificamos si tiene acceso a funciones de admin (incluye rol temporal e invitado para escaner)
  const adminAccessRoles = ['admin_general', 'personal_administrativo', 'admin_temporal', 'invitado'];
  const hasAdminAccess = userRoles.some(role => adminAccessRoles.includes(role));
  // 6. Cuentas de comercio: tienen ÚNICAMENTE el rol 'invitado'. Su menú debe
  //    quedar limpio: solo Escáner y Cerrar Sesión (sin links de socio ni carrito).
  const isSoloInvitado = userRoles.length > 0 && userRoles.every(role => role === 'invitado');
  // -----------------------------------------

  const handleLogout = () => {
    logout(); // Destruye la sesión en el contexto global
    setIsMenuOpen(false); // Cierra el menú
    navigate('/'); // Redirige a la Landing Page
  };

  // Derivamos la cantidad total de artículos sumando sus 'qty'
  const itemCount = cart.reduce((acc, item) => acc + item.qty, 0);

  return (
    <div className="min-h-screen bg-slate-50 font-sans flex flex-col">
      
      {/* Header Principal Fijo (Sticky) */}
      <header className="bg-slate-900 text-slate-100 sticky top-0 z-40 shadow-lg border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Contenedor relativo para centrado absoluto del logo */}
          <div className="relative flex items-center justify-between py-3">
            
            {/* Botón de Menú Hamburguesa (A la izquierda) */}
            <div>
              <button 
                onClick={() => setIsMenuOpen(true)}
                className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              >
                <span className="sr-only">Abrir menú principal</span>
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>

            {/* Logo / Escudo (Centrado matemático absoluto) */}
            <div className="absolute left-1/2 transform -translate-x-1/2">
              <Link to="/" className="block transition-transform hover:scale-105 active:scale-95">
                <img src={escudoCar} alt="Escudo Club Atlético Roberts" className="h-16 sm:h-20 w-auto object-contain drop-shadow-xl" />
              </Link>
            </div>

            {/* Enlace del Carrito (A la derecha) */}
            {!isAdmin && !isSoloInvitado && (
              <div>
                <Link 
                  to="/carrito" 
                  className="flex p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors relative"
                >
                  <span className="sr-only">Ver carrito</span>
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  {/* Badge condicional con número de ítems */}
                  {itemCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-slate-900">
                      {itemCount}
                    </span>
                  )}
                </Link>
              </div>
            )}

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
          {/* Botón destacado para acceder al panel de admin si el rol existe */}
          {isAdmin && (
            <div className="px-2 pb-4 mb-4 border-b border-slate-800 space-y-2">
              <Link
                to="/admin/socios"
                onClick={closeMenu}
                className="block w-full text-left px-4 py-2 mt-2 bg-slate-800 text-slate-300 rounded-lg font-medium hover:bg-slate-700 hover:text-white transition-colors"
              >
                Gestionar Socios
              </Link>
              <Link
                to="/admin/comercios"
                onClick={closeMenu}
                className="block w-full text-left px-4 py-2 mt-2 bg-slate-800 text-slate-300 rounded-lg font-medium hover:bg-slate-700 hover:text-white transition-colors"
              >
                Comercios Adheridos
              </Link>
            </div>
          )}

          {/* Sección de funciones de Admin (ej: Escáner) */}
          {hasAdminAccess && (
            <div className="pt-4 mt-4 border-t border-slate-800">
              <h3 className="px-2 mb-2 text-xs font-semibold tracking-wider text-slate-500 uppercase">
                Funciones de Admin
              </h3>
              <Link
                to="/admin/escaner"
                onClick={closeMenu}
                className="flex items-center gap-3 px-4 py-3 text-slate-300 hover:bg-blue-600 hover:text-white rounded-xl font-semibold transition-all duration-200"
              >
                <ScanLine size={18} />
                <span>Control de Acceso (Escáner)</span>
              </Link>
            </div>
          )}

        </nav>

        {/* Sección de cierre de sesión opcional al fondo */}
        <div className="p-6 border-t border-slate-800 bg-slate-950">
          <button onClick={handleLogout} className="w-full flex items-center justify-center px-4 py-3 border border-red-500/30 text-red-400 rounded-xl hover:text-white hover:bg-red-600 transition-colors font-bold">
            Cerrar Sesión
          </button>
        </div>
      </div>

      {/* Contenido Principal (Páginas hijas inyectadas aquí) */}
      <main className="flex-grow w-full max-w-7xl mx-auto">
        <Outlet />
      </main>
    </div>
  );
}