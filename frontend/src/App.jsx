import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
import SocioInicio from './pages/SocioInicio';
import SocioCarrito from './pages/SocioCarrito';
import AdminInicio from './pages/AdminInicio';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Ruta pública */}
          <Route path="/login" element={<Login />} />

          {/* Rutas privadas envueltas en el Layout (Menú) */}
          <Route path="/" element={<MainLayout userRole="socio" />}>
            <Route index element={<Navigate to="/socio" replace />} />
            <Route path="socio" element={<SocioInicio />} />
            <Route path="carrito" element={<SocioCarrito />} />
            <Route path="admin" element={<AdminInicio />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;