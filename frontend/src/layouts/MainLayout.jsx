import { useState, useEffect } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { rolesDeUsuario } from '../components/RequireRole';
import { useCart } from '../context/CartContext';
import {
  Menu,
  Home,
  History,
  CreditCard,
  ShoppingBag,
  Package,
  Settings,
  LogOut,
  HelpCircle,
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
  TrendingUp,
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
  { name: 'Reserva Salón', path: '/socio/reservas', icon: Calendar },
  { name: 'Reserva Canchas', path: '/socio/cancha', icon: Trophy }, 
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
  { name: 'Verificaciones', path: '/admin/verificaciones', icon: Wallet },
  { name: 'Comercios Adheridos', path: '/admin/comercios', icon: Store },
  { name: 'Agenda de Reservas', path: '/admin/reservas', icon: Calendar },
  { name: 'Historial', path: '/admin/auditoria', icon: History },
];

// Menú REAL de un usuario personal_administrativo (no admin_general).
// Nota: son menos links que NAV_PERSONAL_ADMINISTRATIVO (usada en el preview
// "Ver como..." del admin_general), porque Tesorería y Solicitudes Pendientes
// hoy están reservadas a admin_general.
const NAV_PERSONAL_ADMINISTRATIVO_PROPIO = [
  { name: 'Socios', path: '/admin/socios', icon: Users },
  { name: 'Comercios Adheridos', path: '/admin/comercios', icon: Store },
  { name: 'Agenda de Reservas', path: '/admin/reservas', icon: Calendar },
  { name: 'Historial', path: '/admin/auditoria', icon: History },
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

// Menú curado del admin_general, el que va después del link a "Inicio".
// Antes eran diez <Link> escritos a mano repitiendo la misma tira de clases;
// como array se escribe una sola vez y además se puede escalonar la animación
// de entrada por índice. Mismos paths, mismos íconos y mismo orden que antes.
const NAV_ADMIN_GENERAL = [
  { name: 'Socios', path: '/admin/socios', icon: Users },
  { name: 'Verificaciones', path: '/admin/verificaciones', icon: Wallet },
  { name: 'Estadísticas', path: '/admin/estadisticas', icon: TrendingUp },
  { name: 'Alquileres', path: '/admin/reservas', icon: Calendar },
  { name: 'Eventos', path: '/gestion-eventos', icon: CalendarDays },
  { name: 'Planteles', path: '/gestion-planteles', icon: ClipboardList },
  { name: 'Catálogo', path: '/admin/productos', icon: Package },
  { name: 'Comercios', path: '/admin/comercios', icon: Store },
  { name: 'Historial', path: '/admin/auditoria', icon: History },
];

export default function MainLayout({ userRole }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [seccionesAbiertas, setSeccionesAbiertas] = useState({});
  const { user, token, logout } = useAuth();
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
  // rolesDeUsuario() (components/RequireRole.jsx) es la ÚNICA fuente de verdad
  // de roles en el frontend: descarta roles desactivados y asignaciones
  // vencidas, igual que require_roles() en el backend. Antes acá había una
  // copia propia que no filtraba nada y el menú mostraba secciones que el
  // backend después rechazaba con 403 (BUG-01 de la QA del 08-09).
  const userRoles = rolesDeUsuario(user)

  const esSocio = userRoles.includes('socio');
  const esJugador = userRoles.includes('jugador');
  const esPersonalTecnico = userRoles.includes('personal_tecnico');

  // Lógica de roles de administración estricta
  const esAdminGeneral = userRoles.includes('admin_general');
  const esPersonalAdministrativo = userRoles.includes('personal_administrativo');
  const esAdminTemporal = userRoles.includes('admin_temporal');
  // Nota: antes existía una variable `esAdmin` (esAdminGeneral ||
  // esPersonalAdministrativo || esAdminTemporal) usada para OCULTAR el
  // carrito/notificaciones. La sacamos: ver mostrarIconosCompra más abajo.

  const isSoloInvitado = userRoles.length > 0 && userRoles.every((role) => role === 'invitado');

  // El header (notificaciones/carrito) se oculta para perfiles puramente
  // administrativos o invitados, igual que antes.
  // Antes esto era `!esAdmin && !isSoloInvitado`: un usuario multi-rol (socio
  // + personal_administrativo, por ejemplo) tiene esAdmin=true y se quedaba
  // SIN ícono de carrito/notificaciones aunque también fuera socio y quisiera
  // comprar/reservar. Mejor preguntar por capacidad positiva: si puede
  // comprar (es socio o jugador), mostrale los íconos — sin importar qué
  // otros roles administrativos tenga además.
  const mostrarIconosCompra = (esSocio || esJugador) && !isSoloInvitado;
  // -----------------------------------------

  const location = useLocation();

  useEffect(() => {
    const fetchNotifications = async () => {
      // BUG viejo: acá se leía localStorage.getItem('token'), pero
      // AuthContext guarda el token bajo la clave 'authToken' — esa clave
      // nunca existió, así que esto cortaba antes de intentar nada y el
      // contador de no-leídas quedaba en 0 para siempre.
      if (!token) return;

      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/notificaciones/`, {
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

    if (!user) return;

    fetchNotifications();

    // Las notificaciones las genera el BACKEND por acciones de otra persona
    // (el admin aprueba tu orden, te asignan una beca, te cambian los roles).
    // Con el efecto atado solo a [user, token, pathname], si el socio se
    // quedaba parado en una pantalla el badge no aparecía nunca hasta navegar
    // — ese era el bug reportado. Ahora además:
    //   · se re-consulta cada 60 s mientras la pestaña está visible
    //   · se re-consulta al volver a la pestaña (el caso más común: el socio
    //     deja la app abierta, hace otra cosa y vuelve)
    // Se evita consultar con la pestaña oculta para no gastar requests al
    // pedo contra el free tier de Render.
    const intervalo = setInterval(() => {
      if (document.visibilityState === 'visible') fetchNotifications();
    }, 60_000);

    const alVolver = () => {
      if (document.visibilityState === 'visible') fetchNotifications();
    };
    document.addEventListener('visibilitychange', alVolver);

    return () => {
      clearInterval(intervalo);
      document.removeEventListener('visibilitychange', alVolver);
    };
    // location.pathname sigue en las deps: al volver de /notificaciones (donde
    // se marcan como leídas) el numerito baja enseguida.
  }, [user, token, location.pathname]);

  const handleLogout = () => {
    logout();
    setIsMenuOpen(false);
    navigate('/');
  };

  const itemCount = cart.reduce((acc, item) => acc + item.qty, 0);

  // ─── Estilos del panel lateral ────────────────────────────────────────────
  // El panel es flotante: fondo semitransparente + backdrop-blur, sin fondo
  // sólido. Por eso ningún hijo puede llevar un `bg-` opaco — antes la cabecera
  // y el pie del panel eran `bg-gray-950` y tapaban el blur justo en las dos
  // franjas donde más se nota.
  //
  // Las tiras de clases están acá arriba porque los mismos estilos se repiten
  // en ~20 <Link>: escritas inline una por una se desincronizan sin que se note.
  const ITEM =
    'relative flex items-center gap-3 rounded-xl px-4 py-3 font-medium ' +
    'text-white/80 transition-colors hover:bg-white/5';
  const SUBITEM =
    'relative flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium ' +
    'text-white/60 transition-colors hover:bg-white/5';
  const TRIGGER =
    'flex w-full items-center justify-between rounded-xl px-4 py-3 font-medium ' +
    'text-white/70 transition-colors hover:bg-white/5';
  const ROTULO = 'px-2 mb-2 text-xs font-semibold uppercase tracking-wider text-white/40';
  // Indicador del ítem activo: barra de 3px en Azul Roberts pegada al borde
  // izquierdo. Va como pseudo-elemento para no meter un <span> extra adentro de
  // cada Link. La altura la define quien lo use (before:h-6 / before:h-4).
  const BARRA_ACTIVA =
    'bg-white/5 text-white before:absolute before:left-0 before:top-1/2 ' +
    'before:w-[3px] before:-translate-y-1/2 before:rounded-r-full before:bg-[#183F7C]';

  // Comparación exacta de pathname: `/admin` no tiene que marcarse como activo
  // mientras estás en `/admin/socios`.
  const esActivo = (path) => location.pathname === path;

  // Entrada escalonada de los ítems. Arranca en 0.15s —cuando el panel ya
  // terminó de entrar— y suma 0.05s por ítem, con tope a los 10 pasos: más que
  // eso y el último ítem aparece cuando el usuario ya lo está mirando.
  //
  // La clase de animación se aplica SOLO con el menú abierto. Si estuviera
  // siempre, el fadeUp se dispararía al cargar la página con el panel cerrado y
  // quedaría gastado para cuando el usuario abre el menú.
  const propsItem = (path, i) => ({
    className: `${ITEM} ${esActivo(path) ? `${BARRA_ACTIVA} before:h-6` : ''} ${
      isMenuOpen ? 'anim-menu-item' : ''
    }`,
    style: { animationDelay: `${(0.15 + Math.min(i, 10) * 0.05).toFixed(2)}s` },
  });

  // Los sub-ítems de los desplegables se montan al expandir la sección, así que
  // animan en ese momento: no les corresponde el retraso inicial del panel.
  const propsSubitem = (path, i) => ({
    className: `${SUBITEM} ${esActivo(path) ? `${BARRA_ACTIVA} before:h-4` : ''} anim-menu-item`,
    style: { animationDelay: `${(Math.min(i, 8) * 0.04).toFixed(2)}s` },
  });

  // Retraso del bloque desplegable número `idx` de la lista de roles, contando
  // los ítems planos que vengan antes.
  const retrasoBloque = (idx, previos) => ({
    animationDelay: `${(0.15 + Math.min(previos + idx, 10) * 0.05).toFixed(2)}s`,
  });

  return (
    <div className="min-h-screen bg-gray-50 font-sans flex flex-col">

      {/* Header Principal */}
      <header className="bg-blue-600 text-white sticky top-0 z-40 shadow-md border-b border-blue-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative flex items-center justify-between py-3">

            {/* Menú Hamburguesa */}
            <div>
              <button
                onClick={() => setIsMenuOpen(true)}
                aria-label="Abrir menú"
                aria-expanded={isMenuOpen}
                className="p-2 rounded-xl bg-white/10 text-white/90 hover:text-white hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/40 transition-colors"
              >
                <Menu
                  className={`h-6 w-6 transition-transform duration-[250ms] ease-in-out ${
                    isMenuOpen ? 'rotate-90' : 'rotate-0'
                  }`}
                />
              </button>
            </div>

            {/* Logo */}
            <div className="absolute left-1/2 transform -translate-x-1/2">
              <Link
                to={esAdminGeneral ? '/admin' : esSocio ? '/socio' : '/'}
                className="block rounded-2xl bg-white p-2 sm:p-2.5 shadow-sm transition-transform hover:scale-105 active:scale-95"
                aria-label="Ir al inicio"
              >
                <img src={escudoCar} alt="Escudo Club Atlético Roberts" className="h-12 sm:h-16 w-auto object-contain" />
              </Link>
            </div>

            {/* Iconos de la derecha: Notificaciones y Carrito */}
            {mostrarIconosCompra && (
              <div className="flex items-center gap-4">
                {/* Notificaciones */}
                <Link
                  to="/notificaciones"
                  className="flex p-2 rounded-xl bg-white/10 text-white/90 hover:text-white hover:bg-white/20 transition-colors relative"
                >
                  <Bell className="h-6 w-6" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-blue-600">
                      {unreadCount}
                    </span>
                  )}
                </Link>

                {/* Carrito */}
                <Link
                  to="/carrito"
                  className="flex p-2 rounded-xl bg-white/10 text-white/90 hover:text-white hover:bg-white/20 transition-colors relative"
                >
                  <ShoppingCart className="h-6 w-6" />
                  {itemCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-blue-600">
                      {itemCount}
                    </span>
                  )}
                </Link>
              </div>
            )}

          </div>
        </div>
      </header>

      {/* Overlay del menú — negro puro al 40%, sin color de marca ni blur (el
          blur ahora vive en el panel). Queda SIEMPRE montado: antes era
          `{isMenuOpen && <div/>}` y desmontarlo mata el fade, porque no hay a
          qué transicionar si el nodo desaparece del DOM. */}
      <div
        onClick={closeMenu}
        aria-hidden="true"
        className={`menu-overlay fixed inset-0 z-40 bg-black transition-opacity ${
          isMenuOpen
            ? 'opacity-40 duration-300 ease-out'
            : 'opacity-0 pointer-events-none duration-[220ms] ease-in'
        }`}
      />

      {/* Panel del menú.
          · El cierre es más rápido que la apertura (220ms ease-in vs 300ms
            ease-out): al abrir se quiere ver el gesto, al cerrar se quiere que
            se vaya.
          · `visible/invisible` se transiciona junto al resto. visibility es una
            propiedad discreta y se mantiene en `visible` durante toda la
            salida, así que la animación de cierre se ve completa y recién
            después el panel deja de existir para el mouse y para el tab. Sin
            esto, con el menú cerrado los ~20 links seguían siendo alcanzables
            con el teclado.
          · El max-w deja siempre al menos 48px del contenido de atrás a la
            vista, para que se lea como panel y no como pantalla nueva. */}
      <aside
        aria-hidden={!isMenuOpen}
        className={`menu-lateral fixed inset-y-0 left-0 z-50 flex w-72 max-w-[calc(100vw-48px)] flex-col overflow-hidden border-r border-white/10 bg-[#1C1F2D]/80 backdrop-blur-xl [-webkit-backdrop-filter:blur(24px)] transition-all ${
          isMenuOpen
            ? 'translate-x-0 opacity-100 visible duration-300 ease-out'
            : '-translate-x-full opacity-0 invisible duration-[220ms] ease-in'
        }`}
      >
        {/* Halos difusos: son los que dan profundidad ahora que no hay fondo
            sólido ni sombra de caja. `pointer-events-none` para no comerse los
            clics; el `overflow-hidden` del panel los recorta. */}
        <div aria-hidden="true" className="pointer-events-none absolute -left-10 -top-16 h-52 w-52 rounded-full bg-[#183F7C]/25 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-12 -right-12 h-40 w-40 rounded-full bg-[#26348C]/15 blur-3xl" />

        {/* Los tres bloques de contenido van `relative` a propósito: los halos
            están posicionados, y un elemento posicionado pinta por encima del
            contenido en flujo de sus hermanos siguientes. Sin esto los halos
            quedarían ENCIMA del texto del menú. */}
        <div className="relative flex items-center justify-between border-b border-white/10 p-5">
          <span className="font-display font-semibold text-white tracking-widest text-lg">Menú</span>
          <button
            onClick={closeMenu}
            aria-label="Cerrar menú"
            className="rounded-lg bg-white/5 p-2 text-white/70 transition-all duration-[250ms] hover:rotate-90 hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="relative flex-1 px-4 py-6 space-y-2 overflow-y-auto">

          {/* ══ ADMIN GENERAL: su menú curado va PRIMERO, sin compartir
              condición con personal_administrativo (ese tiene su propio
              bloque desplegable más abajo, junto al resto de roles) ══ */}
          {esAdminGeneral && (
            <div>
              <Link to="/admin" onClick={closeMenu} {...propsItem('/admin', 0)}>
                <LayoutDashboard size={18} /><span>Inicio</span>
              </Link>
              <hr className="border-white/10 my-2" />
              <p className={ROTULO}>Gestión</p>
              {NAV_ADMIN_GENERAL.map((link, i) => (
                <Link key={link.path} to={link.path} onClick={closeMenu} {...propsItem(link.path, i + 1)}>
                  <link.icon size={18} /><span>{link.name}</span>
                </Link>
              ))}
            </div>
          )}

          {/* ══ VER COMO... — 6 roles plegables, solo para admin ══════════ */}
          {esAdminGeneral && (
            <div>
              <hr className="border-white/10 my-4" />
              <p className={ROTULO}>Ver como...</p>

              {[
                { key: 'socio',     label: 'Socio',          icon: Home,          nav: NAV_SOCIO },
                { key: 'jugador',   label: 'Jugador',         icon: Users,         nav: NAV_JUGADOR },
                { key: 'tecnico',   label: 'Técnico',         icon: ClipboardList, nav: NAV_PERSONAL_TECNICO },
                { key: 'padmin',    label: 'Administrativo',  icon: Wallet,        nav: NAV_PERSONAL_ADMINISTRATIVO },
                { key: 'atemp',     label: 'Escáneres',       icon: ScanLine,      nav: NAV_ADMIN_TEMPORAL },
                { key: 'invitado',  label: 'Invitado',        icon: UserCheck,     nav: NAV_INVITADO },
              ].map(({ key, label, icon: Icon, nav }, idx) => (
                <div
                  key={key}
                  className={isMenuOpen ? 'anim-menu-item' : ''}
                  style={retrasoBloque(idx, NAV_ADMIN_GENERAL.length + 1)}
                >
                  <button onClick={() => toggleSeccion(key)} className={TRIGGER}>
                    <span className="flex items-center gap-3"><Icon size={18} /> {label}</span>
                    <ChevronDown size={16} className={`transition-transform ${seccionesAbiertas[key] ? 'rotate-180' : ''}`} />
                  </button>
                  {seccionesAbiertas[key] && (
                    <div className="ml-4 border-l border-white/10 pl-2 mb-1">
                      {nav.map((link, i) => (
                        <Link key={link.path} to={link.path} onClick={closeMenu} {...propsSubitem(link.path, i)}>
                          <link.icon size={16} /><span>{link.name}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ══ ROLES NO-ADMIN: Socio siempre primero y plano; el resto de
              roles (si los tiene) van como desplegables, en jerarquía fija:
              Admin Temporal > Personal Administrativo > Personal Técnico >
              Jugador (último). Todo esto se oculta para admin_general porque
              ya tiene su menú curado arriba + "Ver como..." para previsualizar
              estas mismas vistas sin duplicarlas acá abajo. */}
          {!esAdminGeneral && (
            <>
              {esSocio && (
                <div>
                  {NAV_SOCIO.map((link, i) => (
                    <Link key={link.path} to={link.path} onClick={closeMenu} {...propsItem(link.path, i)}>
                      <link.icon size={18} /><span>{link.name}</span>
                    </Link>
                  ))}
                </div>
              )}

              {[
                esAdminTemporal && { key: 'own_atemp', label: 'Escáneres', icon: ScanLine, nav: NAV_ADMIN_TEMPORAL },
                esPersonalAdministrativo && { key: 'own_padmin', label: 'Administrativo', icon: Wallet, nav: NAV_PERSONAL_ADMINISTRATIVO_PROPIO },
                esPersonalTecnico && { key: 'own_tecnico', label: 'Técnico', icon: ClipboardList, nav: NAV_PERSONAL_TECNICO },
                esJugador && { key: 'own_jugador', label: 'Deportivo', icon: Users, nav: NAV_JUGADOR },
              ].filter(Boolean).map(({ key, label, icon: Icon, nav }, idx) => (
                <div
                  key={key}
                  className={isMenuOpen ? 'anim-menu-item' : ''}
                  style={retrasoBloque(idx, esSocio ? NAV_SOCIO.length : 0)}
                >
                  {idx === 0 && <hr className="border-white/10 my-4" />}
                  <button onClick={() => toggleSeccion(key)} className={TRIGGER}>
                    <span className="flex items-center gap-3"><Icon size={18} /> {label}</span>
                    <ChevronDown size={16} className={`transition-transform ${seccionesAbiertas[key] ? 'rotate-180' : ''}`} />
                  </button>
                  {seccionesAbiertas[key] && (
                    <div className="ml-4 border-l border-white/10 pl-2 mb-1">
                      {nav.map((link, i) => (
                        <Link key={link.path} to={link.path} onClick={closeMenu} {...propsSubitem(link.path, i)}>
                          <link.icon size={16} /><span>{link.name}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}

        </nav>

        <div className="relative border-t border-white/10 p-6">
          <Link
            to="/ayuda"
            onClick={closeMenu}
            className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 font-medium text-white/80 transition-colors hover:bg-white/5 hover:text-white"
          >
            <HelpCircle size={18} />
            <span>Ayuda</span>
          </Link>
          <button
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/40 px-4 py-3 font-bold text-red-300 transition-colors hover:bg-red-600 hover:text-white"
          >
            <LogOut size={18} />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      <main className="flex-grow w-full max-w-7xl mx-auto">
        <Outlet />
      </main>
    </div>
  );
}
