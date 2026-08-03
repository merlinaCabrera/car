import { useState, useEffect } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import {
  Menu,
  Home,
  CreditCard,
  ShoppingBag,
  Package,
  Settings,
  LogOut,
  X,
  ScanLine,
  ShoppingCart,
  Calendar,
  Bell,
  Users,
  CalendarDays,
  ClipboardList,
  UserCheck,
  LayoutDashboard,
  Wallet,
  Store,
  Trophy,
  CalendarClock,
  ChevronDown,
} from 'lucide-react'

// Importación del asset real
import escudoCar from '../assets/escudo-car.PNG';

// ─── Definición de bloques de navegación por rol ───────────────────────────
// Cada bloque sabe qué rol(es) lo habilitan y qué enlaces contiene.
// Esto permite que un mismo usuario con varios roles (ej: socio + jugador)
// vea todos los bloques que le correspondan, uno debajo del otro.

const NAV_SOCIO = [
  { name: 'Inicio', path: '/socio', icon: Home },
  { name: 'Gestión de Cuotas', path: '/socio/cuotas', icon: CreditCard },
  { name: 'Reservas', path: '/socio/reservas', icon: Calendar },
  { name: 'Reserva de Cancha', path: '/socio/cancha', icon: Trophy }, 
  { name: 'Tienda', path: '/shopping', icon: ShoppingBag },
  { name: 'Mis Compras', path: '/mis-compras', icon: Package },
  { name: 'Configuración', path: '/perfil', icon: Settings },
];

const NAV_JUGADOR = [
  { name: 'Mi Equipo', path: '/mi-equipo', icon: Users },
  { name: 'Calendario Deportivo', path: '/calendario-deportivo', icon: CalendarDays },
];

const NAV_PERSONAL_TECNICO = [
  { name: 'Gestión de Planteles', path: '/gestion-planteles', icon: ClipboardList },
  { name: 'Eventos y Convocatorias', path: '/gestion-eventos', icon: CalendarDays },
  { name: 'Asistencias', path: '/asistencias', icon: UserCheck },
];

const NAV_PERSONAL_ADMINISTRATIVO = [
  { name: 'Socios', path: '/admin/socios', icon: Users },
  { name: 'Solicitudes Pendientes', path: '/admin/solicitudes', icon: UserCheck },
  { name: 'Tesorería', path: '/admin/pagos', icon: Wallet },
  { name: 'Comercios Adheridos', path: '/admin/comercios', icon: Store },
  { name: 'Agenda de Reservas', path: '/admin/reservas', icon: Calendar },
];

const NAV_ADMIN_TEMPORAL = [
  { name: 'Escáner General', path: '/admin/escaner', icon: ScanLine },
  { name: 'Escáner Eventos', path: '/admin/escaner-evento', icon: CalendarDays },
  { name: 'Escáner Canchas', path: '/admin/escaner-canchas', icon: CalendarClock },
];

// Invitado: por definir. Por ahora muestra el escáner general.
// Cuando se defina su escáner propio, agregar acá.
const NAV_INVITADO = [
  { name: 'Escáner General', path: '/admin/escaner', icon: ScanLine },
];

export default function MainLayout({ userRole }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [seccionesAbiertas, setSeccionesAbiertas] = useState({});
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { cart } = useCart();

  const closeMenu = () => setIsMenuOpen(false);

  const toggleSeccion = (key) =>
    setSeccionesAbiertas(prev => ({ ...prev, [key]: !prev[key] }));

  // --- Lógica de Navegación Multi-Rol ---
  // El usuario puede tener varios roles a la vez (ej: socio + jugador), así
  // que cada bloque del menú se evalúa de forma independiente y pueden
  // aparecer varios apilados para la misma persona.
  // Soporta dos formatos: array de strings (del JWT) y array de objetos (de la API)
  const userRoles = (() => {
    const fromJwt = user?.roles  // string[] directo del token
    const fromApi = user?.roles_asignados?.map(r => r.rol?.nombre).filter(Boolean)
    // Preferir el que tenga datos
    if (fromApi?.length) return fromApi
    if (fromJwt?.length) return fromJwt
    return []
  })()

  const esSocio = userRoles.includes('socio');
  const esJugador = userRoles.includes('jugador');
  const esPersonalTecnico = userRoles.includes('personal_tecnico');

  // Lógica de roles de administración estricta
  const esAdminGeneral = userRoles.includes('admin_general');
  const esPersonalAdministrativo = userRoles.includes('personal_administrativo');
  const esAdminTemporal = userRoles.includes('admin_temporal');
  const esAdmin = esAdminGeneral || esPersonalAdministrativo || esAdminTemporal;

  const isSoloInvitado = userRoles.length > 0 && userRoles.every((role) => role === 'invitado');

  // El header (notificaciones/carrito) se oculta para perfiles puramente
  // administrativos o invitados, igual que antes.
  const mostrarIconosCompra = !esAdmin && !isSoloInvitado;
  // -----------------------------------------

  useEffect(() => {
    const fetchNotifications = async () => {
      const token = localStorage.getItem('token');
      if (!token) return;

      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/notificaciones`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });

        if (response.ok) {
          const notifications = await response.json();
          const unread = notifications.filter(n => !n.leida).length;
          setUnreadCount(unread);
        }
      } catch (error) {
        console.error("Error al buscar notificaciones:", error);
      }
    };

    if (user) {
      fetchNotifications();
    }
  }, [user]);

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
              <Link to={esAdminGeneral ? '/admin' : esSocio ? '/socio' : '/'} className="block transition-transform hover:scale-105 active:scale-95">
                <img src={escudoCar} alt="Escudo Club" className="h-16 sm:h-20 w-auto object-contain drop-shadow-xl" />
              </Link>
            </div>

            {/* Iconos de la derecha: Notificaciones y Carrito */}
            {mostrarIconosCompra && (
              <div className="flex items-center gap-4">
                {/* Notificaciones */}
                <Link
                  to="/notificaciones"
                  className="flex p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors relative"
                >
                  <Bell className="h-6 w-6" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-slate-900">
                      {unreadCount}
                    </span>
                  )}
                </Link>

                {/* Carrito */}
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

          {/* ══ ADMIN: sus secciones van PRIMERO ══════════════════════════ */}
          {(esPersonalAdministrativo || esAdminGeneral) && (
            <div>
              {esAdminGeneral && (
                <Link to="/admin" onClick={closeMenu}
                  className="flex items-center justify-center gap-2 w-full px-4 py-3 mb-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-500 transition-all duration-200 shadow-lg">
                  <LayoutDashboard size={18} />Panel de Admin
                </Link>
              )}
              <p className="px-2 mb-2 text-xs text-gray-400 uppercase tracking-wider font-semibold">Cuerpo Administrativo</p>
              {esAdminGeneral && (
                <Link to="/admin/pagos" onClick={closeMenu} className="flex items-center gap-3 px-4 py-3 text-slate-300 hover:bg-slate-800 hover:text-white rounded-xl font-semibold transition-colors">
                  <Wallet size={18} /><span>Tesorería</span>
                </Link>
              )}
              {(esAdminGeneral || esPersonalAdministrativo) && (
                <Link to="/admin/socios" onClick={closeMenu} className="flex items-center gap-3 px-4 py-3 text-slate-300 hover:bg-slate-800 hover:text-white rounded-xl font-semibold transition-colors">
                  <Users size={18} /><span>Socios</span>
                </Link>
              )}
              {esAdminGeneral && (<>
                <Link to="/gestion-planteles" onClick={closeMenu} className="flex items-center gap-3 px-4 py-3 text-slate-300 hover:bg-slate-800 hover:text-white rounded-xl font-semibold transition-colors">
                  <ClipboardList size={18} /><span>Planteles</span>
                </Link>
                <Link to="/gestion-eventos" onClick={closeMenu} className="flex items-center gap-3 px-4 py-3 text-slate-300 hover:bg-slate-800 hover:text-white rounded-xl font-semibold transition-colors">
                  <CalendarDays size={18} /><span>Eventos y Convocatorias</span>
                </Link>
                <Link to="/admin/productos" onClick={closeMenu} className="flex items-center gap-3 px-4 py-3 text-slate-300 hover:bg-slate-800 hover:text-white rounded-xl font-semibold transition-colors">
                  <Package size={18} /><span>Catálogo de Productos</span>
                </Link>
              </>)}
              {(esAdminGeneral || esPersonalAdministrativo) && (<>
                <Link to="/admin/comercios" onClick={closeMenu} className="flex items-center gap-3 px-4 py-3 text-slate-300 hover:bg-slate-800 hover:text-white rounded-xl font-semibold transition-colors">
                  <Store size={18} /><span>Comercios Adheridos</span>
                </Link>
                <Link to="/admin/reservas" onClick={closeMenu} className="flex items-center gap-3 px-4 py-3 text-slate-300 hover:bg-slate-800 hover:text-white rounded-xl font-semibold transition-colors">
                  <Calendar size={18} /><span>Agenda de Reservas</span>
                </Link>
              </>)}
            </div>
          )}

          {/* Control de Acceso — solo para quienes tienen admin_temporal o personal_administrativo
              como rol REAL (no vía "Ver como"). Admin General ya lo ve anidado dentro de
              "Ver como... > Vista Admin Temporal", así que acá se lo ocultamos para no duplicarlo. */}
          {(esAdminTemporal || esPersonalAdministrativo) && !esAdminGeneral && (
            <div>
              <hr className="border-gray-700 my-4" />
              <p className="px-2 mb-2 text-xs text-gray-400 uppercase tracking-wider font-semibold">Control de Acceso</p>
              <Link to="/admin/escaner" onClick={closeMenu} className="flex items-center gap-3 px-4 py-3 text-slate-300 hover:bg-slate-800 hover:text-white rounded-xl font-semibold transition-colors">
                <ScanLine size={18} /><span>Escáner General</span>
              </Link>
              <Link to="/admin/escaner-evento" onClick={closeMenu} className="flex items-center gap-3 px-4 py-3 text-slate-300 hover:bg-slate-800 hover:text-white rounded-xl font-semibold transition-colors">
                <CalendarDays size={18} /><span>Escáner Eventos</span>
              </Link>
              <Link to="/admin/escaner-canchas" onClick={closeMenu} className="flex items-center gap-3 px-4 py-3 text-slate-300 hover:bg-slate-800 hover:text-white rounded-xl font-semibold transition-colors">
                <CalendarClock size={18} /><span>Escáner Canchas</span>
              </Link>
            </div>
          )}

          {/* ══ VER COMO... — 6 roles plegables, solo para admin ══════════ */}
          {esAdminGeneral && (
            <div>
              <hr className="border-gray-700 my-4" />
              <p className="px-2 mb-2 text-xs text-gray-400 uppercase tracking-wider font-semibold">Ver como...</p>

              {[
                { key: 'socio',     label: 'Vista Socio',                  icon: Home,          nav: NAV_SOCIO },
                { key: 'jugador',   label: 'Vista Jugador',                 icon: Users,         nav: NAV_JUGADOR },
                { key: 'tecnico',   label: 'Vista Técnico',                 icon: ClipboardList, nav: NAV_PERSONAL_TECNICO },
                { key: 'padmin',    label: 'Vista Personal Administrativo', icon: Wallet,        nav: NAV_PERSONAL_ADMINISTRATIVO },
                { key: 'atemp',     label: 'Vista Admin Temporal',          icon: ScanLine,      nav: NAV_ADMIN_TEMPORAL },
                { key: 'invitado',  label: 'Vista Invitado',                icon: UserCheck,     nav: NAV_INVITADO },
              ].map(({ key, label, icon: Icon, nav }) => (
                <div key={key}>
                  <button onClick={() => toggleSeccion(key)}
                    className="flex items-center justify-between w-full px-4 py-3 text-slate-400 hover:bg-slate-800 hover:text-white rounded-xl font-semibold transition-colors">
                    <span className="flex items-center gap-3"><Icon size={18} /> {label}</span>
                    <ChevronDown size={16} className={`transition-transform ${seccionesAbiertas[key] ? 'rotate-180' : ''}`} />
                  </button>
                  {seccionesAbiertas[key] && (
                    <div className="ml-4 border-l border-slate-700 pl-2 mb-1">
                      {nav.map((link) => (
                        <Link key={link.path} to={link.path} onClick={closeMenu}
                          className="flex items-center gap-3 px-4 py-2.5 text-slate-400 hover:bg-slate-800 hover:text-white rounded-xl text-sm font-medium transition-colors">
                          <link.icon size={16} /><span>{link.name}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ══ ROLES NO-ADMIN: menú normal ════════════════════════════════ */}
          {!esAdmin && (<>
            {esSocio && (
              <div>
                {NAV_SOCIO.map((link) => (
                  <Link key={link.path} to={link.path} onClick={closeMenu}
                    className="flex items-center gap-3 px-4 py-3 text-slate-300 hover:bg-slate-800 hover:text-white rounded-xl font-semibold transition-colors">
                    <link.icon size={18} /><span>{link.name}</span>
                  </Link>
                ))}
              </div>
            )}
            {esJugador && (
              <div>
                <hr className="border-gray-700 my-4" />
                <p className="px-2 mb-2 text-xs text-gray-400 uppercase tracking-wider font-semibold">Deportivo</p>
                {NAV_JUGADOR.map((link) => (
                  <Link key={link.path} to={link.path} onClick={closeMenu}
                    className="flex items-center gap-3 px-4 py-3 text-slate-300 hover:bg-slate-800 hover:text-white rounded-xl font-semibold transition-colors">
                    <link.icon size={18} /><span>{link.name}</span>
                  </Link>
                ))}
              </div>
            )}
            {esPersonalTecnico && (
              <div>
                <hr className="border-gray-700 my-4" />
                <p className="px-2 mb-2 text-xs text-gray-400 uppercase tracking-wider font-semibold">Cuerpo Técnico</p>
                {NAV_PERSONAL_TECNICO.map((link) => (
                  <Link key={link.path} to={link.path} onClick={closeMenu}
                    className="flex items-center gap-3 px-4 py-3 text-slate-300 hover:bg-slate-800 hover:text-white rounded-xl font-semibold transition-colors">
                    <link.icon size={18} /><span>{link.name}</span>
                  </Link>
                ))}
              </div>
            )}
          </>)}

        </nav>

        <div className="p-6 border-t border-slate-800 bg-slate-950">
          <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-red-500/30 text-red-400 rounded-xl hover:text-white hover:bg-red-600 transition-colors font-bold">
            <LogOut size={18} />
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