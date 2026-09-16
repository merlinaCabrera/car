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
  Maximize2,
  Copy,
  Key,
  Mail,
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
  const [emailInvitado, setEmailInvitado] = useState('');
  const [comprandoMP, setComprandoMP] = useState(false);
  const [modalTransferencia, setModalTransferencia] = useState(false);
  const [pedidoTransferencia, setPedidoTransferencia] = useState(null);
  const [comprandoTransf, setComprandoTransf] = useState(false);
  const [errorCompra, setErrorCompra] = useState(null);
  const [copiado, setCopiado] = useState(false);
  const [copiadoLink, setCopiadoLink] = useState(false);
  const [mostrarRestaurarTicket, setMostrarRestaurarTicket] = useState(false);
  const [ticketManual, setTicketManual] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Refs
  const heartbeatRef = useRef(null);
  const playerContainerRef = useRef(null);

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
        // Ticket de invitado: chequear URL param primero, luego localStorage
        const searchParams = new URLSearchParams(location.search);
        const ticketUrl = searchParams.get('ticket');
        if (ticketUrl) {
          localStorage.setItem(`car_ticket_${ev.id_evento}`, ticketUrl);
        }
        const effectiveTicket = ticketUrl || localStorage.getItem(`car_ticket_${ev.id_evento}`) || '';

        // Verificar acceso
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const queryTicket = effectiveTicket ? `?ticket=${encodeURIComponent(effectiveTicket)}` : '';
        const resAcceso = await fetch(`${API}/transmisiones/${ev.id_evento}/acceso${queryTicket}`, { headers });

        if (resAcceso.ok) {
          const acc = await resAcceso.json();
          setAccesoInfo(acc);

          if (acc.ticket_token) {
            localStorage.setItem(`car_ticket_${ev.id_evento}`, acc.ticket_token);
          }

          // Si tiene acceso, obtener datos del stream
          if (acc.tiene_acceso) {
            const resStream = await fetch(`${API}/transmisiones/${ev.id_evento}/stream${queryTicket}`, { headers });
            if (resStream.ok) {
              const stream = await resStream.json();
              setStreamData(stream);
              if (stream.ticket_token) {
                localStorage.setItem(`car_ticket_${ev.id_evento}`, stream.ticket_token);
              }
            }
          }
        }
      }
    } catch (err) {
      setErrorGeneral(err.message);
    } finally {
      setLoading(false);
    }
  }, [idEventoParam, token, location.search]);

  useEffect(() => {
    cargarPartido();
  }, [cargarPartido]);

  // 2. Control de Heartbeat anti-concurrencia (cada 30 segundos)
  useEffect(() => {
    if (!streamData?.token_sesion || !evento?.id_evento) {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      return;
    }

    const effectiveTicket = localStorage.getItem(`car_ticket_${evento.id_evento}`) || '';

    const enviarHeartbeat = async () => {
      try {
        const headers = {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };
        const body = {
          token_sesion: streamData.token_sesion,
          ...(effectiveTicket ? { ticket_token: effectiveTicket } : {}),
        };
        const res = await fetch(`${API}/transmisiones/${evento.id_evento}/heartbeat`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
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

  // Listener para estado Fullscreen
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!playerContainerRef.current) return;
    if (!document.fullscreenElement) {
      playerContainerRef.current.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  // 3. Comprar Entrada Virtual con Mercado Pago (Socios o Invitados sin cuenta)
  const handleComprarMP = async () => {
    setErrorCompra(null);
    if (!user && (!emailInvitado || !emailInvitado.includes('@'))) {
      setErrorCompra('Ingresá un correo electrónico válido para recibir tu entrada.');
      return;
    }
    setComprandoMP(true);
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      const body = !user ? JSON.stringify({ email: emailInvitado.trim() }) : JSON.stringify({});
      const res = await fetch(`${API}/transmisiones/${evento.id_evento}/comprar-mp`, {
        method: 'POST',
        headers,
        body,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Error al conectar con Mercado Pago.');
      }
      const data = await res.json();
      if (data.ticket_token) {
        localStorage.setItem(`car_ticket_${evento.id_evento}`, data.ticket_token);
      }
      if (data.init_point) {
        window.location.href = data.init_point;
      }
    } catch (err) {
      setErrorCompra(err.message);
      setComprandoMP(false);
    }
  };

  // 4. Comprar Entrada Virtual por Transferencia (Socios o Invitados)
  const handleComprarTransferencia = async () => {
    setErrorCompra(null);
    if (!user && (!emailInvitado || !emailInvitado.includes('@'))) {
      setErrorCompra('Ingresá un correo electrónico válido para registrar el pedido de entrada.');
      return;
    }
    setComprandoTransf(true);
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      const body = !user ? JSON.stringify({ email: emailInvitado.trim() }) : JSON.stringify({});
      const res = await fetch(`${API}/transmisiones/${evento.id_evento}/comprar-transferencia`, {
        method: 'POST',
        headers,
        body,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Error al generar orden de transferencia.');
      }
      const data = await res.json();
      if (data.ticket_token) {
        localStorage.setItem(`car_ticket_${evento.id_evento}`, data.ticket_token);
      }
      setPedidoTransferencia(data);
      setModalTransferencia(true);
    } catch (err) {
      setErrorCompra(err.message);
    } finally {
      setComprandoTransf(false);
    }
  };

  const handleRestaurarTicket = (e) => {
    e.preventDefault();
    if (!ticketManual.trim() || !evento) return;
    let t = ticketManual.trim();
    if (t.includes('ticket=')) {
      try {
        const urlObj = new URL(t.startsWith('http') ? t : `https://example.com/${t}`);
        t = urlObj.searchParams.get('ticket') || t;
      } catch {
        // Dejar tal cual
      }
    }
    localStorage.setItem(`car_ticket_${evento.id_evento}`, t);
    setMostrarRestaurarTicket(false);
    cargarPartido();
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
        <div
          ref={playerContainerRef}
          onContextMenu={(e) => e.preventDefault()}
          className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10 group select-none"
        >
          {/* 🛡️ Player Blindado: Máscara Superior Invisible (Bloquea Título, Avatar de canal, Compartir, Ver más tarde) */}
          <div
            className="absolute top-0 left-0 right-0 h-16 sm:h-20 z-20 pointer-events-auto cursor-default bg-transparent"
            title=""
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          />

          {/* 🛡️ Player Blindado: Máscara Inferior Derecha Invisible (Bloquea Watermark/Logo de YouTube para que no salten a youtube.com) */}
          <div
            className="absolute bottom-0 right-12 w-28 h-12 z-20 pointer-events-auto cursor-default bg-transparent"
            title=""
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          />

          {/* Control Oficial CAR: Barra Flotante con Badge e Icono Fullscreen */}
          <div className="absolute top-3 right-3 z-30 flex items-center gap-2 pointer-events-auto">
            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black bg-black/60 backdrop-blur-md text-emerald-400 border border-emerald-500/30 shadow-lg">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Oficial CAR
            </span>
            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-2 rounded-xl bg-black/70 hover:bg-black/90 backdrop-blur-md text-white transition-all hover:scale-105 border border-white/20 shadow-lg"
              title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla Completa'}
            >
              <Maximize2 size={16} />
            </button>
          </div>

          <iframe
            src={`https://www.youtube-nocookie.com/embed/${parsedYoutubeId}?autoplay=1&rel=0&modestbranding=1&playsinline=1&controls=1&iv_load_policy=3`}
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
        <div
          ref={playerContainerRef}
          className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10"
        >
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
          ref={playerContainerRef}
          className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10 [&>iframe]:w-full [&>iframe]:h-full"
          dangerouslySetInnerHTML={{ __html: video_id }}
        />
      );
    }

    return (
      <div
        ref={playerContainerRef}
        className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10"
      >
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
                    <span>
                      Acceso verificado (
                      {accesoInfo.motivo === 'socio_al_dia'
                        ? 'Socio al Día · Gratis'
                        : accesoInfo.motivo === 'admin'
                        ? 'Staff Oficial'
                        : 'Entrada Virtual'}
                      )
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-gray-500">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Sesión única activa protegida</span>
                  </div>
                </div>

                {/* Widget Magic Link de Acceso para el Hincha */}
                <div className="bg-gray-900/80 border border-white/10 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex-shrink-0">
                      <Key size={18} />
                    </div>
                    <div>
                      <div className="font-bold text-white flex items-center gap-2">
                        <span>Acceso guardado en este navegador</span>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                          Activo
                        </span>
                      </div>
                      <p className="text-gray-400 text-[11px] mt-0.5">
                        Si actualizás la página no vas a perder el acceso. Para verlo en tu Smart TV u otro dispositivo, copiá tu link directo:
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const ticketToken =
                        localStorage.getItem(`car_ticket_${evento.id_evento}`) ||
                        accesoInfo?.ticket_token ||
                        '';
                      const url = `${window.location.origin}/en-vivo/${evento.id_evento}${
                        ticketToken ? `?ticket=${ticketToken}` : ''
                      }`;
                      navigator.clipboard.writeText(url);
                      setCopiadoLink(true);
                      setTimeout(() => setCopiadoLink(false), 2500);
                    }}
                    className="flex-shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold transition-colors"
                  >
                    <Copy size={14} />
                    {copiadoLink ? '¡Link Copiado!' : 'Copiar Link Mágico'}
                  </button>
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
                    El streaming de los partidos es privado. Adquirí tu entrada virtual al instante o ingresá como socio con cuota al día.
                  </p>
                </div>

                {/* Lado Derecho: Acciones de Entrada Virtual o Login */}
                <div className="lg:col-span-5 flex flex-col justify-center bg-gray-900/60 rounded-3xl p-6 sm:p-8 border border-white/10 space-y-5">
                  {user && accesoInfo?.es_socio && !accesoInfo?.socio_al_dia ? (
                    /* Caso 1: Socio con cuota atrasada */
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

                      {/* Botón Comprar Entrada Individual para socio */}
                      <button
                        onClick={handleComprarMP}
                        disabled={comprandoMP}
                        className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-colors disabled:opacity-50 shadow-lg shadow-blue-600/20"
                      >
                        {comprandoMP ? <RefreshCw size={16} className="animate-spin" /> : <Play size={16} />}
                        Comprar Entrada Virtual (${evento.transmision_precio || '0'})
                      </button>
                    </div>
                  ) : (
                    /* Caso 2: Hincha / No-Socio (o usuario sin membresía bonificada) */
                    <div className="space-y-5">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                            Pay-Per-View Oficial
                          </span>
                          <span className="text-[10px] font-semibold text-emerald-400">
                            Sin registro previo
                          </span>
                        </div>
                        <h3 className="text-xl font-bold text-white">Comprar Entrada Virtual</h3>
                        <p className="text-xs text-gray-400 mt-1">
                          Mirá el partido en vivo en Full HD. Ingresá tu correo para recibir tu acceso directo.
                        </p>
                      </div>

                      {errorCompra && (
                        <div className="p-3 rounded-xl bg-red-950/50 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
                          <AlertCircle size={15} className="flex-shrink-0 text-red-400" />
                          <span>{errorCompra}</span>
                        </div>
                      )}

                      {/* Campo Email si no está logueado */}
                      {!user && (
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-gray-300 flex items-center justify-between">
                            <span>Tu correo electrónico</span>
                            <span className="text-[10px] text-gray-500 font-normal">Para comprobante y link</span>
                          </label>
                          <div className="relative">
                            <input
                              type="email"
                              value={emailInvitado}
                              onChange={(e) => setEmailInvitado(e.target.value)}
                              placeholder="ej: tuemail@gmail.com"
                              className="w-full bg-black/50 border border-white/10 rounded-xl px-3.5 py-2.5 pl-9 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                            />
                            <Mail size={15} className="absolute left-3 top-3 text-gray-500" />
                          </div>
                        </div>
                      )}

                      <div className="bg-black/40 rounded-2xl p-4 border border-white/10 flex items-center justify-between">
                        <div>
                          <span className="text-xs text-gray-400 block">Precio Entrada</span>
                          <span className="text-2xl font-black text-white">
                            ${Number(evento.transmision_precio || 0).toLocaleString('es-AR')}{' '}
                            <span className="text-xs font-medium text-gray-400">ARS</span>
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

                      <div className="pt-2 border-t border-white/10 space-y-2 text-center text-xs">
                        {!user && (
                          <div>
                            <Link
                              to={`/login?next=${encodeURIComponent(location.pathname)}`}
                              className="text-gray-400 hover:text-white transition-colors underline underline-offset-2"
                            >
                              ¿Sos socio del club? Iniciar Sesión para ver gratis
                            </Link>
                          </div>
                        )}

                        {/* Acordeón para ingresar ticket existente */}
                        <div className="pt-1">
                          {!mostrarRestaurarTicket ? (
                            <button
                              type="button"
                              onClick={() => setMostrarRestaurarTicket(true)}
                              className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors flex items-center justify-center gap-1 mx-auto"
                            >
                              <Key size={11} /> ¿Ya compraste tu entrada o estás en otro dispositivo?
                            </button>
                          ) : (
                            <form onSubmit={handleRestaurarTicket} className="space-y-2 bg-black/30 p-3 rounded-xl border border-white/10 text-left">
                              <span className="text-[11px] text-gray-400 block font-medium">
                                Pegá tu código o link de ticket:
                              </span>
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  value={ticketManual}
                                  onChange={(e) => setTicketManual(e.target.value)}
                                  placeholder="Ej: ABC123xyz o link completo"
                                  className="flex-1 bg-black/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
                                />
                                <button
                                  type="submit"
                                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs"
                                >
                                  Restaurar
                                </button>
                              </div>
                            </form>
                          )}
                        </div>
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
                Una vez transferido, envianos el comprobante por WhatsApp al <strong>2355-123456</strong> indicando tu correo (<strong>{emailInvitado || user?.email || 'registrado'}</strong>) para que el staff active tu entrada de inmediato.
              </div>

              {pedidoTransferencia?.ticket_token && (
                <div className="text-[11px] text-gray-400 bg-black/40 p-2.5 rounded-xl border border-white/10 space-y-1">
                  <span className="text-gray-300 block font-semibold">Código de tu Ticket (guardalo):</span>
                  <span className="font-mono text-blue-300 break-all select-all">{pedidoTransferencia.ticket_token}</span>
                </div>
              )}
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
