import { Revelar } from '../components/landing/animaciones';
import CamotiVolador from '../components/landing/CamotiVolador';
import Hero from '../components/landing/Hero';
import Historia from '../components/landing/Historia';
import Galeria from '../components/landing/Galeria';
import Beneficios from '../components/landing/Beneficios';
import Sponsors from '../components/landing/Sponsors';
import Footer from '../components/landing/Footer';
import { useAuth } from '../context/AuthContext';
import { rolesDeUsuario } from '../components/RequireRole';

export default function Landing() {
  const { user } = useAuth();

  // Lógica para el botón de acción principal (Call to Action)
  // que se pasará como prop al componente Hero.
  let ctaProps = {
    to: '/socio',
    text: 'Ir a mi Panel de Socio'
  };

  if (user) {
    const userRoles = rolesDeUsuario(user);
    if (userRoles.includes('admin_general')) {
      ctaProps = {
        to: '/admin',
        text: 'Ir a mi Panel de Admin'
      };
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-white">
      {/* Easter egg: cada tanto El Camotí cruza la pantalla. Va acá suelto y
          no dentro de una sección porque se posiciona fixed sobre toda la
          ventana. Solo en la landing: en MainLayout molestaría al socio. */}
      <CamotiVolador />

      {/* El Hero se anima solo al cargar (está sobre el pliegue). Las secciones
          de abajo van envueltas en <Revelar>: aparecen cuando el scroll las
          alcanza, así la animación no se gasta fuera de pantalla.
          El envoltorio va acá y no dentro de cada sección porque Footer y
          Beneficios se reusan en otras páginas — ver el comentario en
          components/landing/animaciones.jsx. */}
      <Hero ctaProps={ctaProps} />

      <Revelar><Historia /></Revelar>
      <Revelar><Beneficios /></Revelar>
      <Revelar><Sponsors /></Revelar>
      <Revelar><Footer /></Revelar>
    </div>
  );
}