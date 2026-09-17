// frontend/src/components/TourGuiado.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronRight,
  ChevronLeft,
  X,
  CheckCircle,
  Sparkles,
  ShieldCheck,
  CreditCard,
  ShoppingBag,
  Menu,
} from 'lucide-react';
import camotiAzul from '../assets/camoti-azul.PNG';

/**
 * TourGuiado — Onboarding interactivo con spotlight y globitos explicativos.
 *
 * Características:
 * - Diseñado especialmente para el primer ingreso de socios al Club Atlético Roberts.
 * - Utiliza Camote como anfitrión simpático e institucional.
 * - Efecto "Spotlight" con recorte luminoso y backdrop oscuro.
 * - Posicionamiento adaptativo y responsive (mobile-first y desktop).
 * - Scroll automático suave al elemento en foco.
 * - Persistencia por usuario en localStorage (se muestra SOLO en el primer ingreso).
 */

const ICONOS_DEFAULT = {
  carnet: ShieldCheck,
  cuotas: CreditCard,
  beneficios: ShoppingBag,
  menu: Menu,
  default: Sparkles,
};

export default function TourGuiado({
  pasos = [],
  tourKey = 'car_tour_socio_default',
  nombreUsuario = '',
  abiertoManual = false,
  onFinalizar,
}) {
  const [activo, setActivo] = useState(false);
  const [pasoActual, setPasoActual] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const tooltipRef = useRef(null);

  // ─── Detección de primer ingreso o apertura manual ─────────────────────────
  useEffect(() => {
    if (abiertoManual) {
      setPasoActual(0);
      setActivo(true);
      return;
    }

    try {
      const yaVisto = localStorage.getItem(tourKey);
      if (!yaVisto && pasos.length > 0) {
        // Retraso de 700ms para permitir que el DOM y las animaciones de entrada terminen
        const timer = setTimeout(() => {
          setActivo(true);
        }, 700);
        return () => clearTimeout(timer);
      }
    } catch {
      // Si localStorage está bloqueado o inaccesible, no rompemos la app
    }
  }, [tourKey, pasos.length, abiertoManual]);

  // ─── Detección de pantalla móvil ───────────────────────────────────────────
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // ─── Medición y actualización del elemento en foco ────────────────────────
  const actualizarPosicion = useCallback(() => {
    if (!activo || !pasos[pasoActual]) return;

    const targetId = pasos[pasoActual].targetId;
    const elemento = document.getElementById(targetId);

    if (elemento) {
      const rect = elemento.getBoundingClientRect();
      setTargetRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        bottom: rect.bottom,
        right: rect.right,
      });
    } else {
      setTargetRect(null);
    }
  }, [activo, pasos, pasoActual]);

  // Scroll suave al elemento al cambiar de paso
  useEffect(() => {
    if (!activo || !pasos[pasoActual]) return;

    const targetId = pasos[pasoActual].targetId;
    const elemento = document.getElementById(targetId);

    if (elemento) {
      elemento.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest',
      });

      // Recalcular posición tras completarse el scroll suave
      const timer = setTimeout(() => {
        actualizarPosicion();
      }, 350);

      return () => clearTimeout(timer);
    }
  }, [activo, pasoActual, pasos, actualizarPosicion]);

  // Escuchar scroll y resize para recalcular el spotlight
  useEffect(() => {
    if (!activo) return;

    const handleUpdate = () => {
      requestAnimationFrame(actualizarPosicion);
    };

    window.addEventListener('scroll', handleUpdate, { passive: true });
    window.addEventListener('resize', handleUpdate, { passive: true });

    actualizarPosicion();

    return () => {
      window.removeEventListener('scroll', handleUpdate);
      window.removeEventListener('resize', handleUpdate);
    };
  }, [activo, actualizarPosicion]);

  // ─── Controles de navegación ───────────────────────────────────────────────
  const completarTour = useCallback(() => {
    try {
      localStorage.setItem(tourKey, 'completado');
    } catch {
      // Ignorar fallos de almacenamiento
    }
    setActivo(false);
    if (onFinalizar) onFinalizar();
  }, [tourKey, onFinalizar]);

  const siguientePaso = () => {
    if (pasoActual < pasos.length - 1) {
      setPasoActual((prev) => prev + 1);
    } else {
      completarTour();
    }
  };

  const anteriorPaso = () => {
    if (pasoActual > 0) {
      setPasoActual((prev) => prev - 1);
    }
  };

  // Tecla Escape para salir
  useEffect(() => {
    if (!activo) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') completarTour();
      if (e.key === 'ArrowRight') siguientePaso();
      if (e.key === 'ArrowLeft') anteriorPaso();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  if (!activo || pasos.length === 0) return null;

  const paso = pasos[pasoActual];
  const IconoPaso = ICONOS_DEFAULT[paso.icono] || ICONOS_DEFAULT.default;
  const esUltimoPaso = pasoActual === pasos.length - 1;

  // ─── Cálculo de posición del Tooltip (Globito) ─────────────────────────────
  let tooltipStyle = {};

  if (isMobile) {
    // En móviles: anclado cómodamente abajo para fácil alcance con el pulgar
    tooltipStyle = {
      position: 'fixed',
      bottom: '1rem',
      left: '1rem',
      right: '1rem',
      maxWidth: 'calc(100vw - 2rem)',
      zIndex: 60,
    };
  } else if (targetRect) {
    // En pantallas grandes: posicionado inteligente arriba o abajo del spotlight
    const espacioAbajo = window.innerHeight - targetRect.bottom;
    const colocarAbajo = espacioAbajo > 280;

    const anchoTooltip = 420;
    let left = targetRect.left + targetRect.width / 2 - anchoTooltip / 2;
    // Evitar que se salga de los márgenes laterales
    left = Math.max(20, Math.min(left, window.innerWidth - anchoTooltip - 20));

    if (colocarAbajo) {
      tooltipStyle = {
        position: 'fixed',
        top: `${Math.min(targetRect.bottom + 16, window.innerHeight - 300)}px`,
        left: `${left}px`,
        width: `${anchoTooltip}px`,
        zIndex: 60,
      };
    } else {
      tooltipStyle = {
        position: 'fixed',
        bottom: `${Math.max(window.innerHeight - targetRect.top + 16, 20)}px`,
        left: `${left}px`,
        width: `${anchoTooltip}px`,
        zIndex: 60,
      };
    }
  } else {
    // Fallback centrado si el elemento no está visible aún
    tooltipStyle = {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: '90%',
      maxWidth: '440px',
      zIndex: 60,
    };
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden select-none animate-in fade-in duration-300">
      {/* ─── Spotlight: Recorte iluminado con backdrop oscurecido ─────────── */}
      {targetRect ? (
        <div
          className="fixed pointer-events-none transition-all duration-300 ease-out"
          style={{
            top: targetRect.top - 8,
            left: targetRect.left - 8,
            width: targetRect.width + 16,
            height: targetRect.height + 16,
            borderRadius: '1.25rem',
            border: '2px solid rgba(59, 130, 246, 0.9)',
            boxShadow:
              '0 0 0 9999px rgba(10, 15, 30, 0.78), 0 0 25px rgba(59, 130, 246, 0.45)',
          }}
        >
          {/* Pulso animado sutil en las esquinas */}
          <span className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-blue-500" />
          </span>
        </div>
      ) : (
        // Backdrop uniforme mientras se calcula
        <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm pointer-events-auto" />
      )}

      {/* ─── Globito / Tooltip Explicativo ─────────────────────────────────── */}
      <div
        ref={tooltipRef}
        style={tooltipStyle}
        className="pointer-events-auto bg-white rounded-3xl p-5 sm:p-6 shadow-2xl border border-blue-100 ring-1 ring-black/5 text-gray-900 transition-all duration-200"
      >
        {/* Cabecera del Globito con Camote */}
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="relative">
              <img
                src={camotiAzul}
                alt="Camote - Club Atlético Roberts"
                className="h-11 w-11 object-contain drop-shadow-md"
              />
              <span className="absolute -bottom-1 -right-1 bg-amber-400 text-[9px] font-black text-amber-950 px-1.5 py-0.2 rounded-full ring-2 ring-white">
                CAR
              </span>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-blue-600">
                  Guía con Camote
                </span>
                <span className="text-xs text-gray-300">•</span>
                <span className="text-[11px] font-semibold text-gray-400">
                  Paso {pasoActual + 1} de {pasos.length}
                </span>
              </div>
              <p className="text-xs text-gray-500 font-medium">
                {nombreUsuario ? `¡Hola, ${nombreUsuario}! ` : ''}{paso.badge || 'Portal de Socios'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={completarTour}
            className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            title="Saltar guía"
            aria-label="Cerrar guía"
          >
            <X size={18} />
          </button>
        </div>

        {/* Cuerpo explicativo */}
        <div className="py-3.5 space-y-2">
          <div className="flex items-center gap-2 text-gray-900">
            <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
              <IconoPaso size={18} />
            </div>
            <h3 className="font-display font-bold text-base sm:text-lg leading-tight">
              {paso.titulo}
            </h3>
          </div>

          <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
            {paso.descripcion}
          </p>

          {paso.tip && (
            <div className="mt-2.5 p-2.5 rounded-xl bg-blue-50/70 border border-blue-100/80 text-[11px] text-blue-900 flex items-start gap-2">
              <span className="text-blue-500 font-bold shrink-0">💡 Tip:</span>
              <span>{paso.tip}</span>
            </div>
          )}
        </div>

        {/* Barra de progreso y botones de acción */}
        <div className="pt-3 border-t border-gray-100 flex items-center justify-between gap-3">
          {/* Indicador de puntitos */}
          <div className="flex items-center gap-1.5">
            {pasos.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPasoActual(i)}
                aria-label={`Ir al paso ${i + 1}`}
                className={`h-2 rounded-full transition-all duration-200 ${
                  i === pasoActual
                    ? 'w-6 bg-blue-600'
                    : 'w-2 bg-gray-200 hover:bg-gray-300'
                }`}
              />
            ))}
          </div>

          {/* Botones */}
          <div className="flex items-center gap-2">
            {pasoActual > 0 && (
              <button
                type="button"
                onClick={anteriorPaso}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors flex items-center gap-1"
              >
                <ChevronLeft size={14} />
                <span className="hidden sm:inline">Anterior</span>
              </button>
            )}

            <button
              type="button"
              onClick={siguientePaso}
              className={`px-4 py-2 rounded-xl text-xs font-bold text-white transition-all duration-150 flex items-center gap-1.5 shadow-md active:scale-95 ${
                esUltimoPaso
                  ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                  : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20'
              }`}
            >
              {esUltimoPaso ? (
                <>
                  <CheckCircle size={14} />
                  <span>¡Entendido, vamos!</span>
                </>
              ) : (
                <>
                  <span>Siguiente</span>
                  <ChevronRight size={14} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
