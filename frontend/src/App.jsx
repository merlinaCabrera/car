import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import MainLayout from './layouts/MainLayout';
import Landing from './pages/Landing';
import Registro from './pages/Registro';
import RecuperarPassword from './pages/RecuperarPassword';
import Login from './pages/Login';
import SocioInicio from './pages/SocioInicio';
import SocioCarrito from './pages/SocioCarrito';
import SocioCuotas from './pages/SocioCuotas';
import SocioShopping from './pages/SocioShopping';
import SocioAlquileres from './pages/SocioAlquileres';
import SocioPerfil from './pages/SocioPerfil';
import AdminInicio from './pages/AdminInicio';
import AdminSolicitudes from './pages/AdminSolicitudes';
import AdminPagos from './pages/AdminPagos';
import AdminSocios from './pages/AdminSocios';
import AdminComercios from './pages/AdminComercios';
import JugadorCalendario from './pages/JugadorCalendario';
import AdminReservas from './pages/AdminReservas';
import AdminScanner from './pages/AdminScanner';
import AdminProductos from './pages/AdminProductos';
import AdminTienda from './pages/AdminTienda';
import SocioCompras from "./pages/SocioCompras";
import Reservas from './pages/Reservas';
import SocioNotificaciones from './pages/SocioNotificaciones';
import JugadorEquipo from './pages/JugadorEquipo';
import TecnicoPlanteles from './pages/TecnicoPlanteles';
import TecnicoAsistencias from './pages/TecnicoAsistencias';
import AdminScannerEvento from './pages/AdminScannerEvento';
import AdminScannerCancha from './pages/AdminScannerCancha';
import TecnicoEventos from './pages/TecnicoEventos';
import SocioCancha from './pages/SocioCancha';

function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <BrowserRouter>
          <Routes>
            {/* Rutas públicas */}
            <Route path="/" element={<Landing />} />
            <Route path="/registro" element={<Registro />} />
            <Route path="/recuperar-password" element={<RecuperarPassword />} />
            <Route path="/login" element={<Login />} />

            {/* Rutas privadas envueltas en el Layout del Portal */}
            <Route element={<MainLayout userRole="socio" />}>
              {/* Socio */}
              <Route path="/socio" element={<SocioInicio />} />
              <Route path="/carrito" element={<SocioCarrito />} />
              <Route path="/socio/cuotas" element={<SocioCuotas />} />
              <Route path="/shopping" element={<SocioShopping />} />
              <Route path="/alquileres" element={<SocioAlquileres />} />
              <Route path="/configuracion" element={<SocioPerfil />} />
              <Route path="/perfil" element={<SocioPerfil />} />
              <Route path="/mis-compras" element={<SocioCompras />} />
              <Route path="/socio/reservas" element={<Reservas />} />
              <Route path="/socio/cancha" element={<SocioCancha />} />
              <Route path="/notificaciones" element={<SocioNotificaciones />} />

              {/* Jugador */}
              <Route path="/mi-equipo" element={<JugadorEquipo />} />
              <Route path="/calendario-deportivo" element={<JugadorCalendario />} />

              {/* Técnico */}
              <Route path="/gestion-planteles" element={<TecnicoPlanteles />} />
              <Route path="/asistencias" element={<TecnicoAsistencias />} />
              <Route path="/gestion-eventos" element={<TecnicoEventos />} />

              {/* Admin */}
              <Route path="/admin" element={<AdminInicio />} />
              <Route path="/admin/solicitudes" element={<AdminSolicitudes />} />
              <Route path="/admin/socios" element={<AdminSocios />} />
              <Route path="/admin/comercios" element={<AdminComercios />} />
              <Route path="/admin/pagos" element={<AdminPagos />} />
              <Route path="/admin/escaner" element={<AdminScanner />} />
              <Route path="/admin/escaner-evento" element={<AdminScannerEvento />} />
              <Route path="/admin/escaner-canchas" element={<AdminScannerCancha />} />
              <Route path="/admin/reservas" element={<AdminReservas />} />
              <Route path="/admin/productos" element={<AdminProductos />} />
              <Route path="/admin/tienda" element={<AdminTienda />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </CartProvider>
    </AuthProvider>
  );
}

export default App;