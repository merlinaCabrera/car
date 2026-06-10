import Hero from '../components/landing/Hero';
import Historia from '../components/landing/Historia';
import Galeria from '../components/landing/Galeria';
import Calendario from '../components/landing/Calendario';
import Footer from '../components/landing/Footer';

export default function Landing() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <Hero />
      <Historia />
      <Galeria />
      <Calendario />
      <Footer />
    </div>
  );
}