import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
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

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Rutas públicas */}
          <Route path="/" element={<Landing />} />
          <Route path="/registro" element={<Registro />} />
          <Route path="/recuperar-password" element={<RecuperarPassword />} />
          <Route path="/login" element={<Login />} />

          {/* Rutas privadas envueltas en el Layout del Portal */}
          <Route element={<MainLayout userRole="socio" />}>
            <Route path="/socio" element={<SocioInicio />} />
            <Route path="/carrito" element={<SocioCarrito />} />
            <Route path="/cuotas" element={<SocioCuotas />} />
            <Route path="/shopping" element={<SocioShopping />} />
            <Route path="/alquileres" element={<SocioAlquileres />} />
            <Route path="/perfil" element={<SocioPerfil />} />
            <Route path="/admin" element={<AdminInicio />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;