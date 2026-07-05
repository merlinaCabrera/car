import { useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { Menu, Home, CreditCard, ShoppingBag, Package, Settings, LogOut, X, ScanLine, ShoppingCart } from 'lucide-react'

// Importación del asset real
import escudoCar from '../assets/escudo-car.PNG';

export default function MainLayout({ userRole }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { cart } = useCart();

  const closeMenu = () => setIsMenuOpen(false);

  // --- Lógica de Navegación Multi-Rol ---
  const userRoles = user?.roles_asignados?.map(r => r.rol.nombre) || [];

  const isAdmin = userRoles.includes('admin_general') || userRoles.includes('personal_administrativo');
  const adminAccessRoles = ['admin_general', 'personal_administrativo', 'admin_temporal', 'invitado'];
  const hasAdminAccess = userRoles.some(role => adminAccessRoles.includes(role));
  
  const isSoloInvitado = userRoles.length > 0 && userRoles.every(role => role === 'invitado');
  
  // Enlaces de navegación visibles solo para socios (no admin, no invitado puro)
  const navLinks = [
    { name: 'Inicio', path: '/socio/inicio', icon: Home },
    { name: 'Gestión de Cuotas', path: '/socio/cuotas', icon: CreditCard },
    { name: 'Gestión de Cuotas', path: '/cuotas' },
    { name: 'Reservas', path: '/reservas' },
    { name: 'Tienda', path: '/shopping', icon: ShoppingBag },
    { name: 'Mis Compras', path: '/mis-compras', icon: Package },
    { name: 'Configuración', path: '/configuracion', icon: Settings },
  ];
  // -----------------------------------------

  const handleLogout = () => {
    logout();
    setIsMenuOpen(false);
    navigate('/');
  };

  const itemCount = cart.reduce((acc, item) => acc + item.qty, 0);

  return (
    <div className="min-h-screen bg-slate-50 font-sans flex flex-col">
      
      {/* Header Principal */}
      <header className="bg-slate-900 text-slate-100 sticky top-0 z-40 shadow-lg border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative flex items-center justify-between py-3">
            
            {/* Menú Hamburguesa */}
            <div>
              <button 
                onClick={() => setIsMenuOpen(true)}
                className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 focus:outline-none transition-colors"
              >
                <Menu className="h-6 w-6" />
              </button>
            </div>

            {/* Logo */}
            <div className="absolute left-1/2 transform -translate-x-1/2">
              <Link to="/" className="block transition-transform hover:scale-105 active:scale-95">
                <img src={escudoCar} alt="Escudo Club" className="h-16 sm:h-20 w-auto object-contain drop-shadow-xl" />
              </Link>
            </div>

            {/* Carrito */}
            {!isAdmin && !isSoloInvitado && (
              <div>
                <Link 
                  to="/carrito" 
                  className="flex p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors relative"
                >
                  <ShoppingCart className="h-6 w-6" />
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

      {/* Modal del Menú */}
      {isMenuOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity"
          onClick={closeMenu}
        ></div>
      )}

      <div 
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-slate-900 shadow-2xl transform transition-transform duration-300 ease-in-out flex flex-col border-r border-slate-800 ${
          isMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-950">
          <span className="font-bold text-white tracking-widest text-lg">MENÚ</span>
          <button onClick={closeMenu} className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-lg transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          
          {/* Enlaces de Socio */}
          {!isAdmin && !isSoloInvitado && navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              onClick={closeMenu}
              className="flex items-center gap-3 px-4 py-3 text-slate-300 hover:bg-slate-800 hover:text-white rounded-xl font-semibold transition-colors"
            >
              <link.icon size={18} />
              <span>{link.name}</span>
            </Link>
          ))}

          {/* Enlaces de Admin */}
          {isAdmin && (
            <div className="px-2 pb-4 mb-4 border-b border-slate-800">
              <Link
                to="/admin"
                onClick={closeMenu}
                className="block w-full text-center px-4 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-500 transition-all duration-200 shadow-lg"
              >
                Panel de Admin
              </Link>
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
              <Link
                to="/admin/productos"
                onClick={closeMenu}
                className="block w-full text-left px-4 py-2 mt-2 bg-slate-800 text-slate-300 rounded-lg font-medium hover:bg-slate-700 hover:text-white transition-colors"
              >
                Catálogo de Productos
              </Link>
              <Link
                to="/admin/pagos"
                onClick={closeMenu}
                className="block w-full text-left px-4 py-2 mt-2 bg-slate-800 text-slate-300 rounded-lg font-medium hover:bg-slate-700 hover:text-white transition-colors"
              >
                Tesorería y Pagos
              </Link>
            </div>
          )}

          {/* Funciones de Admin (Escáner) */}
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

        <div className="p-6 border-t border-slate-800 bg-slate-950">
          <button onClick={handleLogout} className="w-full flex items-center justify-center px-4 py-3 border border-red-500/30 text-red-400 rounded-xl hover:text-white hover:bg-red-600 transition-colors font-bold">
            Cerrar Sesión
          </button>
        </div>
      </div>

      <main className="flex-grow w-full max-w-7xl mx-auto">
        <Outlet />
      </main>
    </div>
  );
}