import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import {
  Tv,
  Play,
  Lock,
  CheckCircle,
  AlertCircle,
  Clock,
  MapPin,
  ShieldCheck,
  CreditCard,
  Building2,
  RefreshCw,
  ExternalLink,
  Users,
  Trophy,
  Share2,
  ChevronLeft,
  ArrowRight,
} from 'lucide-react';
import escudoCar from '../assets/escudo-car-blanco.png';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export default function TransmisionEnVivo() {
  const { idEvento: idEventoParam } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, token } = useAuth();

  // Estados del evento y stream
  const [loading, setLoading] = useState(true);
  const [evento, setEvento] = useState(null);
  const [accesoInfo, setAccesoInfo] = useState(null);
  const [streamData, setStreamData] = useState(null);
  const [errorGeneral, setErrorGeneral] = useState(null);
  const [sesionDuplicada, setSesionDuplicada] = useState(false);

  // Estados de checkout de entrada virtual
  const [comprandoMP, setComprandoMP] = useState(false);
  const [modalTransferencia, setModalTransferencia] = useState(false);
  const [pedidoTransferencia, setPedidoTransferencia] = useState(null);
  const [comprandoTransf, setComprandoTransf] = useState(false);
  const [errorCompra, setErrorCompra] = useState(null);
  const [copiado, setCopiado] = useState(false);

  // Intervalo de Heartbeat
  const heartbeatRef = useRef(null);

  // 1. Cargar el partido (el indicado por URL o el actual/próximo)
  const cargarPartido = useCallback(async () => {
    setLoading(true);
    setErrorGeneral(null);
    try {
      let ev = null;
      if (idEventoParam) {
        const res = await fetch(`${API}/transmisiones/${idEventoParam}/info`);
        if (!res.ok) throw new Error('No se encontró el partido solicitado.');
        ev = await res.json();
      } else {
        const res = await fetch(`${API}/transmisiones/partido-actual`);
        if (!res.ok) throw new Error('Error al consultar la transmisión actual.');
        ev = await res.json();
      }

      setEvento(ev);

      if (ev) {
        // Verificar acceso
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const resAcceso = await fetch(`${API}/transmisiones/${ev.id_evento}/acceso`, { headers });
        if (resAcceso.ok) {
          const acc = await resAcceso.json();
          setAccesoInfo(acc);

          // Si tiene acceso y hay token, obtener datos del stream
          if (acc.tiene_acceso && token) {
            const resStream = await fetch(`${API}/transmisiones/${ev.id_evento}/stream`, { headers });
            if (resStream.ok) {
              const stream = await resStream.json();
              setStreamData(stream);
            }
          }
        }
      }
    } catch (err) {
      setErrorGeneral(err.message);
    } finally {
      setLoading(false);
    }
  }, [idEventoParam, token]);

  useEffect(() => {
    cargarPartido();
  }, [cargarPartido]);

  // 2. Control de Heartbeat anti-concurrencia (cada 30 segundos)
  useEffect(() => {
    if (!streamData?.token_sesion || !evento?.id_evento || !token) {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      return;
    }

    const enviarHeartbeat = async () => {
      try {
        const res = await fetch(`${API}/transmisiones/${evento.id_evento}/heartbeat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ token_sesion: streamData.token_sesion }),
        });

        if (res.status === 409) {
          // Concurrencia detectada: otra pestaña o dispositivo inició sesión
          setSesionDuplicada(true);
          setStreamData(null);
          if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        }
      } catch {
        // Error de red temporal — se reintentará en el próximo ciclo
      }
    };

    heartbeatRef.current = setInterval(enviarHeartbeat, 30000);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [streamData, evento, token]);

  // 3. Comprar Entrada Virtual con Mercado Pago
  const handleComprarMP = async () => {
    if (!token) {
      navigate(`/login?next=${encodeURIComponent(location.pathname)}`);
      return;
    }
    setComprandoMP(true);
    setErrorCompra(null);
    try {
      const res = await fetch(`${API}/transmisiones/${evento.id_evento}/comprar-mp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Error al conectar con Mercado Pago.');
      }
      const data = await res.json();
      if (data.init_point) {
        window.location.href = data.init_point;
      }
    } catch (err) {
      setErrorCompra(err.message);
      setComprandoMP(false);
    }
  };

  // 4. Comprar Entrada Virtual por Transferencia
  const handleComprarTransferencia = async () => {
    if (!token) {
      navigate(`/login?next=${encodeURIComponent(location.pathname)}`);
      return;
    }
    setComprandoTransf(true);
    setErrorCompra(null);
    try {
      const res = await fetch(`${API}/transmisiones/${evento.id_evento}/comprar-transferencia`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Error al generar orden de transferencia.');
      }
      const data = await res.json();
      setPedidoTransferencia(data);
      setModalTransferencia(true);
    } catch (err) {
      setErrorCompra(err.message);
    } finally {
      setComprandoTransf(false);
    }
  };

  const copiarAlias = (texto) => {
    navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  // 5. Renderizar Reproductor de Video
  const renderPlayer = () => {
    if (!streamData?.video_id) {
      return (
        <div className="w-full aspect-video bg-gray-900 rounded-2xl flex flex-col items-center justify-center p-6 text-center text-white border border-white/10">
          <Tv size={48} className="text-gray-500 mb-3 animate-pulse" />
          <h3 className="text-lg font-bold">Transmisión no iniciada</h3>
          <p className="text-sm text-gray-400 max-w-md mt-1">
            El partido está programado pero el streaming en vivo aún no ha comenzado.
            Mantené esta pantalla abierta, comenzará automáticamente en unos minutos.
          </p>
        </div>
      );
    }

    const { plataforma, video_id } = streamData;

    // Extractor de ID si mandaron URL completa de YouTube
    let parsedYoutubeId = video_id;
    if (video_id.includes('youtube.com') || video_id.includes('youtu.be')) {
      const match = video_id.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|live\/|embed\/))([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        parsedYoutubeId = match[1];
      }
    }

    if (plataforma === 'youtube') {
      return (
        <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${parsedYoutubeId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
            title="Transmisión en Vivo CAR"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="w-full h-full border-0"
          />
        </div>
      );
    }

    if (plataforma === 'vimeo') {
      let parsedVimeoId = video_id;
      const vMatch = video_id.match(/vimeo\.com\/(?:video\/)?([0-9]+)/);
      if (vMatch && vMatch[1]) parsedVimeoId = vMatch[1];
      return (
        <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10">
          <iframe
            src={`https://player.vimeo.com/video/${parsedVimeoId}?autoplay=1&title=0&byline=0&portrait=0`}
            title="Transmisión en Vivo CAR"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            className="w-full h-full border-0"
          />
        </div>
      );
    }

    // Custom Iframe
    if (video_id.startsWith('<iframe')) {
      return (
        <div
          className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10 [&>iframe]:w-full [&>iframe]:h-full"
          dangerouslySetInnerHTML={{ __html: video_id }}
        />
      );
    }

    return (
      <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10">
        <iframe
          src={video_id}
          title="Transmisión en Vivo"
          allowFullScreen
          className="w-full h-full border-0"
        />
      </div>
    );
  };

  const formatearFechaPartido = (f) => {
    if (!f) return '';
    return new Date(f).toLocaleDateString('es-AR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 text-white flex flex-col font-sans">
      {/* Barra Superior */}
      <header className="sticky top-0 z-30 bg-gray-950/80 backdrop-blur-md border-b border-white/10 px-4 py-3 sm:px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-colors"
              title="Volver al inicio"
            >
              <ChevronLeft size={20} />
            </Link>
            <div className="flex items-center gap-2.5">
              <img src={escudoCar} alt="CAR" className="h-7 sm:h-8 w-auto object-contain" />
              <div className="flex flex-col">
                <span className="font-bold text-sm tracking-wide leading-none">Club Atlético Roberts</span>
                <span className="text-[10px] text-blue-400 font-semibold tracking-wider uppercase mt-0.5">
                  CAR Streaming Oficial
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-300 hidden sm:inline">
                  {user.nombre} {user.apellido}
                </span>
                <Link
                  to="/socio"
                  className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors"
                >
                  Mi Portal
                </Link>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to={`/login?next=${encodeURIComponent(location.pathname)}`}
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs transition-colors"
                >
                  Ingresar
                </Link>
                <Link
                  to={`/registro?next=${encodeURIComponent(location.pathname)}`}
                  className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors"
                >
                  Registrarme
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {loading ? (
          <div className="py-24 text-center space-y-4">
            <RefreshCw size={36} className="mx-auto text-blue-500 animate-spin" />
            <p className="text-gray-400 font-medium text-sm">Cargando transmisión del partido…</p>
          </div>
        ) : errorGeneral || !evento ? (
          <div className="bg-gray-900/60 rounded-3xl p-8 sm:p-12 text-center border border-white/10 max-w-lg mx-auto mt-12 space-y-4">
            <Tv size={56} className="mx-auto text-gray-600" />
            <h2 className="text-xl font-bold text-white">No hay transmisiones activas</h2>
            <p className="text-gray-400 text-sm">
              {errorGeneral || 'En este momento no hay ningún partido programado con transmisión en vivo.'}
            </p>
            <div className="pt-2">
              <Link
                to="/"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors"
              >
                Volver al Sitio
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Header del Partido / Fixture Banner */}
            <div className="bg-gradient-to-r from-blue-950/60 via-gray-900/80 to-blue-950/60 rounded-3xl p-5 sm:p-6 border border-blue-500/20 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {evento.transmision_estado === 'en_vivo' ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-red-600 text-white tracking-wider animate-pulse">
                      <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                      EN VIVO
                    </span>
                  ) : evento.transmision_estado === 'pausada' ? (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-amber-500 text-black">
                      PAUSADA
                    </span>
                  ) : evento.transmision_estado === 'finalizada' ? (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-gray-700 text-gray-300">
                      FINALIZADA
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-600/60 text-blue-200 border border-blue-400/30">
                      <Clock size={12} /> PROGRAMADA
                    </span>
                  )}

                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-white/10 text-gray-300 capitalize">
                    {evento.condicion === 'local' ? 'Estadio CAR (Local)' : evento.condicion === 'visitante' ? 'Condición: Visitante' : 'Cancha Neutral'}
                  </span>

                  {evento.categoria && (
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300">
                      {evento.categoria.nombre}
                    </span>
                  )}
                </div>

                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3">
                  <span>Club Atlético Roberts</span>
                  <span className="text-blue-400 font-normal">vs</span>
                  <span className="text-amber-400">{evento.rival || 'Rival a confirmar'}</span>
                </h1>

                <div className="flex items-center gap-4 text-xs sm:text-sm text-gray-400 flex-wrap">
                  <span className="flex items-center gap-1.5">
                    <Clock size={14} className="text-gray-500" />
                    {formatearFechaPartido(evento.fecha_inicio)}
                  </span>
                  {evento.ubicacion && (
                    <span className="flex items-center gap-1.5">
                      <MapPin size={14} className="text-gray-500" />
                      {evento.ubicacion}
                    </span>
                  )}
                </div>
              </div>

              {/* Marcador si está disponible */}
              {evento.goles_local !== null && evento.goles_rival !== null && (
                <div className="flex items-center gap-3 bg-black/40 px-5 py-3 rounded-2xl border border-white/10 self-start md:self-center">
                  <div className="text-center">
                    <div className="text-2xl font-black text-white">{evento.goles_local}</div>
                    <div className="text-[10px] text-gray-400 font-bold uppercase">CAR</div>
                  </div>
                  <span className="text-xl font-bold text-gray-600">-</span>
                  <div className="text-center">
                    <div className="text-2xl font-black text-amber-400">{evento.goles_rival}</div>
                    <div className="text-[10px] text-gray-400 font-bold uppercase truncate max-w-[80px]">
                      {evento.rival || 'Rival'}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Aviso de Sesión Duplicada */}
            {sesionDuplicada && (
              <div className="bg-amber-950/80 border border-amber-500/40 rounded-2xl p-5 text-amber-200 flex items-start gap-3.5 shadow-lg">
                <AlertCircle size={22} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1 text-sm">
                  <h4 className="font-bold text-amber-300">Reproducción pausada: Tu sesión se abrió en otro dispositivo</h4>
                  <p className="text-amber-200/90 text-xs">
                    Por seguridad y para evitar cuentas compartidas, solo se permite un reproductor activo por usuario.
                    Si querés reanudar en esta pantalla, hacé clic en el botón a continuación.
                  </p>
                  <button
                    onClick={() => {
                      setSesionDuplicada(false);
                      cargarPartido();
                    }}
                    className="mt-2 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition-colors"
                  >
                    <RefreshCw size={13} /> Reanudar en este dispositivo
                  </button>
                </div>
              </div>
            )}

            {/* ── ZONA DE STREAMING / PLAYER O GATE DE ACCESO ── */}
            {accesoInfo?.tiene_acceso && streamData ? (
              <div className="space-y-4">
                {renderPlayer()}

                {/* Banner de protección activa */}
                <div className="flex items-center justify-between text-xs text-gray-400 px-2 flex-wrap gap-2">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-emerald-400" />
                    <span>Acceso verificado ({accesoInfo.motivo === 'socio_al_dia' ? 'Socio al Día · Gratis' : accesoInfo.motivo === 'admin' ? 'Staff Oficial' : 'Entrada Virtual'})</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-gray-500">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Sesión única activa protegida</span>
                  </div>
                </div>
              </div>
            ) : (
              /* GATE / PAYWALL / INICIO DE SESIÓN */
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Lado Izquierdo: Placeholder cinematográfico */}
                <div className="lg:col-span-7 bg-gray-950 rounded-3xl aspect-video border border-white/10 flex flex-col items-center justify-center p-6 text-center relative overflow-hidden group">
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-transparent to-transparent pointer-events-none" />
                  <div className="p-4 rounded-full bg-blue-600/20 text-blue-400 border border-blue-500/30 mb-4 group-hover:scale-110 transition-transform">
                    <Lock size={36} />
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold text-white max-w-sm">
                    Transmisión Exclusiva en Vivo
                  </h3>
                  <p className="text-xs sm:text-sm text-gray-400 max-w-sm mt-1.5">
                    El streaming de los partidos es privado. Adquirí tu entrada virtual o ingresá con tu cuenta de socio con cuota al día.
                  </p>
                </div>

                {/* Lado Derecho: Acciones de Entrada Virtual o Login */}
                <div className="lg:col-span-5 flex flex-col justify-center bg-gray-900/60 rounded-3xl p-6 sm:p-8 border border-white/10 space-y-5">
                  {!user ? (
                    /* Caso 1: Usuario No Logueado */
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <span className="text-xs font-bold uppercase tracking-wider text-blue-400">Paso 1</span>
                        <h3 className="text-xl font-bold text-white">Identificate para ver el partido</h3>
                        <p className="text-xs text-gray-400">
                          Iniciá sesión para acceder gratis como socio al día o comprar tu entrada virtual.
                        </p>
                      </div>

                      <div className="space-y-2.5 pt-2">
                        <Link
                          to={`/login?next=${encodeURIComponent(location.pathname)}`}
                          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-colors shadow-lg shadow-blue-600/20"
                        >
                          Iniciar Sesión
                        </Link>
                        <Link
                          to={`/registro?next=${encodeURIComponent(location.pathname)}`}
                          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-sm transition-colors"
                        >
                          Crear Cuenta Nueva
                        </Link>
                      </div>

                      <div className="pt-3 border-t border-white/10 text-center">
                        <span className="text-xs text-emerald-400 font-semibold flex items-center justify-center gap-1.5">
                          <CheckCircle size={14} /> Socios con cuota al día miran gratis
                        </span>
                      </div>
                    </div>
                  ) : accesoInfo?.es_socio && !accesoInfo?.socio_al_dia ? (
                    /* Caso 2: Socio con cuota atrasada */
                    <div className="space-y-4">
                      <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-500/30 text-amber-200 space-y-1">
                        <h4 className="font-bold text-xs flex items-center gap-1.5 text-amber-300">
                          <AlertCircle size={14} /> Cuota Social Pendiente
                        </h4>
                        <p className="text-xs text-amber-200/90">
                          Los socios con cuota al día acceden sin cargo a la transmisión. Regularizá tu cuota para habilitar el reproductor inmediatamente.
                        </p>
                      </div>

                      <Link
                        to="/socio/cuotas"
                        className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition-colors shadow-lg shadow-emerald-600/20"
                      >
                        <CreditCard size={16} /> Poner mi cuota al día
                      </Link>

                      <div className="relative flex py-1 items-center">
                        <div className="flex-grow border-t border-white/10"></div>
                        <span className="flex-shrink mx-3 text-gray-500 text-xs font-semibold uppercase">O comprá entrada individual</span>
                        <div className="flex-grow border-t border-white/10"></div>
                      </div>

                      {/* Botón Comprar Entrada Individual */}
                      <button
                        onClick={handleComprarMP}
                        disabled={comprandoMP}
                        className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-colors disabled:opacity-50"
                      >
                        {comprandoMP ? <RefreshCw size={16} className="animate-spin" /> : <Play size={16} />}
                        Comprar Entrada Virtual (${evento.transmision_precio || '0'})
                      </button>
                    </div>
                  ) : (
                    /* Caso 3: Hincha / No-Socio sin entrada comprada */
                    <div className="space-y-5">
                      <div>
                        <span className="text-xs font-bold uppercase tracking-wider text-blue-400">Pay-Per-View</span>
                        <h3 className="text-xl font-bold text-white">Comprar Entrada Virtual</h3>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Acceso en vivo de alta definición con soporte para Smart TV y dispositivos móviles.
                        </p>
                      </div>

                      {errorCompra && (
                        <div className="p-3 rounded-xl bg-red-950/50 border border-red-500/40 text-red-200 text-xs">
                          {errorCompra}
                        </div>
                      )}

                      <div className="bg-black/40 rounded-2xl p-4 border border-white/10 flex items-center justify-between">
                        <div>
                          <span className="text-xs text-gray-400 block">Precio Entrada</span>
                          <span className="text-2xl font-black text-white">
                            ${Number(evento.transmision_precio || 0).toLocaleString('es-AR')} <span className="text-xs font-medium text-gray-400">ARS</span>
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] uppercase font-bold text-blue-400 block">Activación</span>
                          <span className="text-xs font-semibold text-emerald-400">Automática e Instantánea</span>
                        </div>
                      </div>

                      <div className="space-y-2.5">
                        <button
                          onClick={handleComprarMP}
                          disabled={comprandoMP}
                          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-colors disabled:opacity-50 shadow-lg shadow-blue-600/20"
                        >
                          {comprandoMP ? (
                            <RefreshCw size={16} className="animate-spin" />
                          ) : (
                            <CreditCard size={16} />
                          )}
                          Pagar con Mercado Pago
                        </button>

                        <button
                          onClick={handleComprarTransferencia}
                          disabled={comprandoTransf}
                          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white font-semibold text-xs transition-colors border border-white/10"
                        >
                          {comprandoTransf ? (
                            <RefreshCw size={14} className="animate-spin" />
                          ) : (
                            <Building2 size={14} />
                          )}
                          Pagar por Transferencia Bancaria
                        </button>
                      </div>

                      <div className="pt-2 text-center">
                        <Link
                          to="/registro"
                          className="text-xs text-gray-400 hover:text-white transition-colors underline underline-offset-2"
                        >
                          ¿Sos socio? Asociate al Club y mirá los partidos gratis
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Modal Datos de Transferencia Bancaria */}
      {modalTransferencia && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-gray-900 border border-white/10 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl text-white">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-bold text-base flex items-center gap-2">
                <Building2 size={18} className="text-blue-400" />
                Pago por Transferencia Bancaria
              </h3>
              <button
                onClick={() => setModalTransferencia(false)}
                className="text-gray-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-gray-300">
                Tu pedido <strong>#{pedidoTransferencia?.id_pago}</strong> fue registrado. Realizá la transferencia por el monto exacto:
              </p>

              <div className="bg-black/40 rounded-xl p-3.5 space-y-2 border border-white/10">
                <div className="flex justify-between">
                  <span className="text-gray-400">Monto:</span>
                  <span className="font-bold text-white">${pedidoTransferencia?.monto}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Banco:</span>
                  <span className="font-medium text-white">Banco Provincia</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Alias:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-amber-400">CLUB.ATLETICO.ROBERTS</span>
                    <button
                      onClick={() => copiarAlias('CLUB.ATLETICO.ROBERTS')}
                      className="text-[10px] px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-gray-200"
                    >
                      {copiado ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Titular:</span>
                  <span className="font-medium text-white">Club Atlético Roberts</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-blue-950/40 border border-blue-500/20 text-blue-200">
                Una vez transferido, envianos el comprobante por WhatsApp al <strong>2355-123456</strong> con tu nombre o número de socio para que el staff te habilite el acceso de inmediato.
              </div>
            </div>

            <button
              onClick={() => {
                setModalTransferencia(false);
                cargarPartido();
              }}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-colors"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
