import Hero from '../components/landing/Hero';
import Historia from '../components/landing/Historia';
import Galeria from '../components/landing/Galeria';
import Calendario from '../components/landing/Calendario';
import Footer from '../components/landing/Footer';
import { useAuth } from '../context/AuthContext';

export default function Landing() {
  const { user } = useAuth();

  // Lógica para el botón de acción principal (Call to Action)
  // que se pasará como prop al componente Hero.
  let ctaProps = {
    to: '/socio',
    text: 'Ir a mi Panel de Socio'
  };

  if (user) {
    const userRoles = user?.roles_asignados?.map(r => r.rol.nombre) || user?.roles || [];
    if (userRoles.includes('admin_general')) {
      ctaProps = {
        to: '/admin',
        text: 'Ir a mi Panel de Admin'
      };
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-white">
      <Hero ctaProps={ctaProps} />
      <Historia />
      <Galeria />
      <Calendario />
      <Footer />
    </div>
  );
}