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
 * Mejoras aplicadas:
 * 1. Protección estricta de "Primer Ingreso Único": No se dispara para socios existentes
 *    a menos que vengan explícitamente con ?bienvenida=1 (tras cambio obligatorio de contraseña)
 *    o ?tour=1 (desde el botón manual de perfil).
 * 2. Posicionamiento Matemático Blindado: Clamp de margen superior/inferior para que
 *    el globito JAMÁS se corte arriba (evita top < 16px).
 * 3. Adaptación Mobile: En pantallas estrechas ancla el globito al pie con scroll al inicio
 *    del elemento, evitando solapamientos con el carnet.
 * 4. Integración con Menú Desplegable: Al llegar a los pasos del menú lateral, despacha
 *    automáticamente el evento para abrir el menú y enfocar los bloques temáticos.
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

  // ─── Detección de primer ingreso estricto o activación manual ──────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const esBienvenida = params.get('bienvenida') === '1';
    const esTourManual = params.get('tour') === '1';

    // 1. Si se activó manualmente (vía prop o ?tour=1 en URL)
    if (abiertoManual || esTourManual) {
      setPasoActual(0);
      setActivo(true);
      return;
    }

    // 2. SOLO si viene con ?bienvenida=1 (recién completó /cambiar-password-obligatorio)
    if (esBienvenida) {
      try {
        const yaVisto = localStorage.getItem(tourKey);
        if (!yaVisto && pasos.length > 0) {
          const timer = setTimeout(() => {
            setActivo(true);
          }, 600);
          return () => clearTimeout(timer);
        }
      } catch {
        // Ignorar errores de almacenamiento
      }
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

  // ─── Manejo de apertura/cierre de menú según el paso actual ────────────────
  useEffect(() => {
    if (!activo || !pasos[pasoActual]) return;

    const paso = pasos[pasoActual];
    if (paso.abrirMenu) {
      window.dispatchEvent(new CustomEvent('car:tour-abrir-menu'));
    } else {
      window.dispatchEvent(new CustomEvent('car:tour-cerrar-menu'));
    }
  }, [activo, pasoActual, pasos]);

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
      // En móvil o elementos altos, scroll hacia el inicio para no tapar la cabecera
      const paso = pasos[pasoActual];
      const scrollBlock = isMobile && !paso.abrirMenu ? 'start' : 'center';

      elemento.scrollIntoView({
        behavior: 'smooth',
        block: scrollBlock,
        inline: 'nearest',
      });

      // Recalcular tras scroll o animación de apertura de menú
      const delay = paso.abrirMenu ? 380 : 300;
      const timer = setTimeout(() => {
        actualizarPosicion();
      }, delay);

      return () => clearTimeout(timer);
    }
  }, [activo, pasoActual, pasos, isMobile, actualizarPosicion]);

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

    // Limpiar query params de la URL sin recargar
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('bienvenida') || url.searchParams.has('tour')) {
        url.searchParams.delete('bienvenida');
        url.searchParams.delete('tour');
        window.history.replaceState({}, '', url.pathname + (url.search || ''));
      }
    } catch {
      // Ignorar fallos de URL
    }

    // Asegurar cierre del menú si quedó abierto
    window.dispatchEvent(new CustomEvent('car:tour-cerrar-menu'));

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

  // ─── Cálculo Matemático Blindado de Posición del Tooltip ────────────────────
  let tooltipStyle = {};
  const margen = 16;
  const tooltipH = tooltipRef.current?.offsetHeight || 250;

  if (isMobile) {
    // En móviles: Anclado abajo, con altura máxima acotada para no tapar toda la pantalla
    tooltipStyle = {
      position: 'fixed',
      bottom: '12px',
      left: '12px',
      right: '12px',
      maxWidth: 'calc(100vw - 24px)',
      maxHeight: '44vh',
      overflowY: 'auto',
      zIndex: 70,
    };
  } else if (targetRect) {
    const anchoTooltip = 420;

    if (paso.abrirMenu) {
      // Si el elemento está adentro del menú lateral en desktop:
      // Ubicar el globito a la derecha del menú lateral
      const leftMenu = Math.min(window.innerWidth - anchoTooltip - margen, (targetRect.right || 288) + 24);
      let topMenu = targetRect.top;
      topMenu = Math.max(margen, Math.min(topMenu, window.innerHeight - tooltipH - margen));

      tooltipStyle = {
        position: 'fixed',
        top: `${topMenu}px`,
        left: `${leftMenu}px`,
        width: `${anchoTooltip}px`,
        zIndex: 70,
      };
    } else {
      // Elementos normales en el contenido principal
      let left = targetRect.left + targetRect.width / 2 - anchoTooltip / 2;
      left = Math.max(margen, Math.min(left, window.innerWidth - anchoTooltip - margen));

      const espacioAbajo = window.innerHeight - targetRect.bottom;
      const espacioArriba = targetRect.top;
      let topPos;

      if (espacioAbajo >= tooltipH + margen) {
        topPos = targetRect.bottom + 12;
      } else if (espacioArriba >= tooltipH + margen) {
        topPos = targetRect.top - tooltipH - 12;
      } else {
        // Elemento muy alto (ej. Carnet): ubicar en el lado con más espacio visible
        topPos = espacioAbajo >= espacioArriba ? window.innerHeight - tooltipH - margen : margen;
      }

      // CLAMP MATEMÁTICO ABSOLUTO: Nunca permitir top < margen ni desborde inferior
      topPos = Math.max(margen, Math.min(topPos, window.innerHeight - tooltipH - margen));

      tooltipStyle = {
        position: 'fixed',
        top: `${topPos}px`,
        left: `${left}px`,
        width: `${anchoTooltip}px`,
        zIndex: 70,
      };
    }
  } else {
    // Fallback centrado
    tooltipStyle = {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: '90%',
      maxWidth: '440px',
      zIndex: 70,
    };
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden select-none animate-in fade-in duration-300">
      {/* ─── Spotlight: Recorte iluminado con halo azul CAR ───────────────── */}
      {targetRect ? (
        <div
          className="fixed pointer-events-none transition-all duration-300 ease-out"
          style={{
            top: Math.max(0, targetRect.top - 6),
            left: Math.max(0, targetRect.left - 6),
            width: targetRect.width + 12,
            height: targetRect.height + 12,
            borderRadius: '1.25rem',
            border: '2px solid rgba(59, 130, 246, 0.95)',
            boxShadow:
              '0 0 0 9999px rgba(10, 15, 30, 0.78), 0 0 25px rgba(59, 130, 246, 0.45)',
          }}
        >
          {/* Pulso de esquina */}
          <span className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-blue-500" />
          </span>
        </div>
      ) : (
        <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm pointer-events-auto" />
      )}

      {/* ─── Globito / Tooltip Explicativo ─────────────────────────────────── */}
      <div
        ref={tooltipRef}
        style={tooltipStyle}
        className="pointer-events-auto bg-white rounded-3xl p-4 sm:p-5 shadow-2xl border border-blue-100 ring-1 ring-black/5 text-gray-900 transition-all duration-200"
      >
        {/* Cabecera del Globito con Camote */}
        <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <img
                src={camotiAzul}
                alt="Camote - Club Atlético Roberts"
                className="h-10 w-10 sm:h-11 sm:w-11 object-contain drop-shadow-md"
              />
              <span className="absolute -bottom-1 -right-1 bg-amber-400 text-[9px] font-black text-amber-950 px-1 py-0.2 rounded-full ring-2 ring-white">
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
                  {pasoActual + 1}/{pasos.length}
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
        <div className="py-2.5 space-y-1.5">
          <div className="flex items-center gap-2 text-gray-900">
            <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600 shrink-0">
              <IconoPaso size={17} />
            </div>
            <h3 className="font-display font-bold text-sm sm:text-base leading-tight">
              {paso.titulo}
            </h3>
          </div>

          <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
            {paso.descripcion}
          </p>

          {paso.tip && (
            <div className="mt-2 p-2 rounded-xl bg-blue-50/70 border border-blue-100/80 text-[11px] text-blue-900 flex items-start gap-1.5">
              <span className="text-blue-500 font-bold shrink-0">💡 Tip:</span>
              <span>{paso.tip}</span>
            </div>
          )}
        </div>

        {/* Barra de progreso y botones de acción */}
        <div className="pt-2.5 border-t border-gray-100 flex items-center justify-between gap-2">
          {/* Indicador de puntitos */}
          <div className="flex items-center gap-1">
            {pasos.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPasoActual(i)}
                aria-label={`Ir al paso ${i + 1}`}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  i === pasoActual
                    ? 'w-5 bg-blue-600'
                    : 'w-1.5 bg-gray-200 hover:bg-gray-300'
                }`}
              />
            ))}
          </div>

          {/* Botones */}
          <div className="flex items-center gap-1.5">
            {pasoActual > 0 && (
              <button
                type="button"
                onClick={anteriorPaso}
                className="px-2.5 py-1.5 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors flex items-center gap-1"
              >
                <ChevronLeft size={14} />
                <span className="hidden sm:inline">Anterior</span>
              </button>
            )}

            <button
              type="button"
              onClick={siguientePaso}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold text-white transition-all duration-150 flex items-center gap-1 shadow-md active:scale-95 ${
                esUltimoPaso
                  ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                  : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20'
              }`}
            >
              {esUltimoPaso ? (
                <>
                  <CheckCircle size={14} />
                  <span>¡Entendido!</span>
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
