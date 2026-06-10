import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import MainLayout from './layouts/MainLayout';
import Landing from './pages/Landing';
import Registro from './pages/Registro';
import RecuperarPassword from './pages/RecuperarPassword';
import Login from './pages/Login';
import SocioInicio from './pages/SocioInicio';
import SocioCarrito from './pages/SocioCarrito';
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
            <Route path="/admin" element={<AdminInicio />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;