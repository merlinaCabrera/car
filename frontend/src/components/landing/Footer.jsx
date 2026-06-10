import camotiAzul from '../../assets/camoti-azul.PNG';

export default function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-300 py-12 px-6 text-center">
      <div className="max-w-4xl mx-auto space-y-4">
        <h3 className="text-2xl font-bold text-white tracking-widest">C.A. ROBERTS</h3>
        <p className="text-sm">Dirección Ficticia 1234, Ciudad, País</p>
        <p className="text-sm">Email: contacto@car.com.ar | Tel: (123) 456-7890</p>
        <div className="pt-6 mt-6 border-t border-slate-700 flex flex-col items-center gap-4">
          <img src={camotiAzul} alt="Mascota Camoti Azul" className="h-16 w-auto object-contain opacity-80 hover:opacity-100 transition-opacity drop-shadow-md" />
          <a href="https://www.car.com.ar" className="text-blue-400 hover:text-blue-300 transition-colors font-medium">
            www.car.com.ar
          </a>
        </div>
      </div>
    </footer>
  );
}