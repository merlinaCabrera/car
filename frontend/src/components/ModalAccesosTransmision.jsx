// frontend/src/components/ModalAccesosTransmision.jsx
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../context/useAuth'
import {
  Ticket,
  Users,
  X,
  Loader2,
  AlertCircle,
  RefreshCw,
  Search,
  CheckCircle2,
  Copy,
  Check,
  Send,
  Trash2,
  Radio,
  Eye,
  Tv,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
  CreditCard,
  Building2,
  ArrowRight,
  UserCheck,
  UserX,
  UserPlus,
  DollarSign,
  Clock,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

function normalizarTelefonoWhatsApp(tel) {
  if (!tel) return ''
  let digits = String(tel).replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('0')) digits = digits.substring(1)
  if (digits.length === 10) {
    digits = '549' + digits
  } else if (digits.startsWith('54') && !digits.startsWith('549') && digits.length === 12) {
    digits = '549' + digits.substring(2)
  }
  return digits
}

function construirLink(ticketToken, idEvento) {
  const base = window.location.origin
  if (ticketToken) {
    return `${base}/en-vivo/${idEvento}?ticket=${ticketToken}`
  }
  return `${base}/en-vivo/${idEvento}`
}

function abrirWhatsApp(telefono, mensaje) {
  const digits = normalizarTelefonoWhatsApp(telefono)
  const encoded = encodeURIComponent(mensaje)
  const url = digits ? `https://wa.me/${digits}?text=${encoded}` : `https://wa.me/?text=${encoded}`
  window.open(url, '_blank', 'noopener,noreferrer')
}

export default function ModalAccesosTransmision({ evento, onClose, onActualizarEvento }) {
  const { token } = useAuth()

  const [metricas, setMetricas] = useState({
    espectadores_activos: 0,
    total_espectadores_registrados: 0,
    entradas_pagas: 0,
    recaudacion_verificada: 0,
    espectadores: [],
  })
  const [loadingMetricas, setLoadingMetricas] = useState(true)
  const [errorMetricas, setErrorMetricas] = useState(null)

  // Estado del stream en vivo (programada, en_vivo, pausada, finalizada)
  const [estadoStream, setEstadoStream] = useState(evento.transmision_estado || 'programada')
  const [cambiandoEstado, setCambiandoEstado] = useState(false)

  // Pestaña activa: 'emitir' | 'espectadores'
  const [pestana, setPestana] = useState('emitir')

  // Copiado al portapapeles
  const [copiadoId, setCopiadoId] = useState(null)
  const copiarTexto = (texto, id = 'global') => {
    navigator.clipboard.writeText(texto)
    setCopiadoId(id)
    setTimeout(() => setCopiadoId(null), 2500)
  }

  // Carga de métricas y espectadores
  const cargarMetricas = useCallback(async () => {
    setLoadingMetricas(true)
    setErrorMetricas(null)
    try {
      const res = await fetch(`${API}/transmisiones/${evento.id_evento}/espectadores`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Error al cargar métricas de transmisión.')
      }
      const data = await res.json()
      setMetricas(data)
      if (data.transmision_estado) {
        setEstadoStream(data.transmision_estado)
      }
    } catch (err) {
      setErrorMetricas(err.message)
    } finally {
      setLoadingMetricas(false)
    }
  }, [evento.id_evento, token])

  useEffect(() => {
    cargarMetricas()
  }, [cargarMetricas])

  // Cambio de estado de transmisión (programada | en_vivo | pausada | finalizada)
  const cambiarEstadoTransmision = async (nuevoEstado) => {
    if (nuevoEstado === estadoStream) return
    setCambiandoEstado(true)
    try {
      const res = await fetch(
        `${API}/transmisiones/${evento.id_evento}/estado?estado=${nuevoEstado}`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}` },
        }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Error al actualizar estado del stream.')
      }
      setEstadoStream(nuevoEstado)
      if (onActualizarEvento) {
        onActualizarEvento({ ...evento, transmision_estado: nuevoEstado })
      }
      cargarMetricas()
    } catch (err) {
      alert(err.message)
    } finally {
      setCambiandoEstado(false)
    }
  }

  // ─── TAB 1: FORMULARIO DE ASIGNACIÓN MANUAL ───────────────────────────────
  const [modoTipo, setModoTipo] = useState('no_socio') // 'no_socio' | 'socio'

  // Form No-Socio
  const [formNoSocio, setFormNoSocio] = useState({
    email: '',
    nombre: '',
    telefono: '',
    motivo: 'Cobranza en efectivo / Boletería',
  })

  // Form Socio
  const [busquedaSocio, setBusquedaSocio] = useState('')
  const [buscandoSocios, setBuscandoSocios] = useState(false)
  const [resultadosSocios, setResultadosSocios] = useState([])
  const [socioSeleccionado, setSocioSeleccionado] = useState(null)
  const [formSocio, setFormSocio] = useState({
    telefono: '',
    motivo: 'Socio moroso - Pago de entrada presencial',
  })

  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState(null)
  const [ultimoAccesoGenerado, setUltimoAccesoGenerado] = useState(null)

  // Buscador de socios en vivo
  useEffect(() => {
    if (modoTipo !== 'socio' || !busquedaSocio.trim() || busquedaSocio.trim().length < 2) {
      setResultadosSocios([])
      return
    }
    const timer = setTimeout(async () => {
      setBuscandoSocios(true)
      try {
        const res = await fetch(
          `${API}/transmisiones/buscar-usuarios?q=${encodeURIComponent(busquedaSocio.trim())}`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        if (res.ok) {
          const data = await res.json()
          setResultadosSocios(data)
        }
      } catch (e) {
        console.error('Error buscando socios:', e)
      } finally {
        setBuscandoSocios(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [busquedaSocio, modoTipo, token])

  const seleccionarSocio = (socio) => {
    setSocioSeleccionado(socio)
    setBusquedaSocio('')
    setResultadosSocios([])
    setFormSocio((prev) => ({
      ...prev,
      telefono: socio.telefono || '',
      motivo: socio.socio_al_dia
        ? 'Acceso de cortesía para socio al día'
        : 'Socio con deuda / Pago directo de entrada',
    }))
  }

  const handleEmitirAcceso = async (e) => {
    e.preventDefault()
    setGuardando(true)
    setErrorForm(null)

    try {
      let payload = {}
      let telParaWA = ''

      if (modoTipo === 'no_socio') {
        const emailTrim = formNoSocio.email.trim().toLowerCase()
        if (!emailTrim || !emailTrim.includes('@')) {
          throw new Error('Por favor ingresá un correo electrónico válido.')
        }
        payload = {
          email: emailTrim,
          nombre: formNoSocio.nombre.trim() || null,
          telefono: formNoSocio.telefono.trim() || null,
          motivo: formNoSocio.motivo.trim() || 'Cobranza manual',
        }
        telParaWA = formNoSocio.telefono.trim()
      } else {
        if (!socioSeleccionado) {
          throw new Error('Debés seleccionar un socio de la lista para emitir el acceso.')
        }
        payload = {
          id_usuario: socioSeleccionado.id_usuario,
          nombre: socioSeleccionado.nombre_completo,
          telefono: formSocio.telefono.trim() || socioSeleccionado.telefono || null,
          motivo: formSocio.motivo.trim() || 'Acceso manual socio',
        }
        telParaWA = formSocio.telefono.trim() || socioSeleccionado.telefono || ''
      }

      const res = await fetch(`${API}/transmisiones/${evento.id_evento}/dar-acceso-manual`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.detail || 'Error al emitir el acceso manual.')
      }

      const data = await res.json()
      const linkReal = construirLink(data.ticket_token, evento.id_evento)

      const rivalStr = evento.rival ? ` vs ${evento.rival}` : ''
      const mensajeWhatsApp =
        data.mensaje_whatsapp ||
        `¡Hola ${data.nombre || 'Hincha'}! ⚽ Acá tenés tu entrada para ver Club Atlético Roberts${rivalStr} en vivo.\n\n` +
          `Ingresá directamente desde este link en tu celular o Smart TV:\n${linkReal}\n\n` +
          `¡Vamos CAR! 🔴⚪`

      setUltimoAccesoGenerado({
        ...data,
        link_acceso: linkReal,
        telefono: telParaWA,
        mensaje_whatsapp: mensajeWhatsApp,
      })

      // Limpiar inputs
      setFormNoSocio({
        email: '',
        nombre: '',
        telefono: '',
        motivo: 'Cobranza en efectivo / Boletería',
      })
      setSocioSeleccionado(null)

      // Actualizar listado en segundo plano
      cargarMetricas()
    } catch (err) {
      setErrorForm(err.message)
    } finally {
      setGuardando(false)
    }
  }

  // ─── TAB 2: GESTIÓN DE ENTRADAS Y CONTROL DE PAGOS ────────────────────────
  const [busquedaFiltro, setBusquedaFiltro] = useState('')
  const [filtroEstadoPago, setFiltroEstadoPago] = useState('todos') // 'todos' | 'en_linea' | 'pendiente' | 'verificado' | 'cortesia'
  const [procesandoEntradaId, setProcesandoEntradaId] = useState(null)

  const espectadoresFiltrados = useMemo(() => {
    let list = metricas.espectadores || []

    if (filtroEstadoPago === 'en_linea') {
      list = list.filter((e) => e.en_linea)
    } else if (filtroEstadoPago === 'pendiente') {
      list = list.filter((e) => e.estado_pago === 'pendiente')
    } else if (filtroEstadoPago === 'verificado') {
      list = list.filter((e) => e.estado_pago === 'verificado')
    } else if (filtroEstadoPago === 'cortesia') {
      list = list.filter((e) => e.estado_pago === 'cortesia')
    }

    if (busquedaFiltro.trim()) {
      const q = busquedaFiltro.trim().toLowerCase()
      list = list.filter(
        (e) =>
          (e.nombre && e.nombre.toLowerCase().includes(q)) ||
          (e.email && e.email.toLowerCase().includes(q)) ||
          (e.ticket_token && e.ticket_token.toLowerCase().includes(q))
      )
    }

    return list
  }, [metricas.espectadores, filtroEstadoPago, busquedaFiltro])

  const cantidadPendientes = useMemo(() => {
    return (metricas.espectadores || []).filter((e) => e.estado_pago === 'pendiente').length
  }, [metricas.espectadores])

  // Aprobar pago de transferencia pendiente
  const handleAprobarPago = async (entrada) => {
    setProcesandoEntradaId(entrada.id_entrada)
    try {
      const res = await fetch(
        `${API}/transmisiones/entradas/${entrada.id_entrada}/aprobar`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}` },
        }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'No se pudo aprobar el pago.')
      }
      await cargarMetricas()
    } catch (err) {
      alert(err.message)
    } finally {
      setProcesandoEntradaId(null)
    }
  }

  // Revocar entrada
  const handleRevocarEntrada = async (entrada) => {
    if (
      !window.confirm(
        `¿Seguro que deseás revocar la entrada de ${entrada.nombre || entrada.email}?\nEl espectador perderá el acceso inmediatamente.`
      )
    ) {
      return
    }

    setProcesandoEntradaId(entrada.id_entrada)
    try {
      const res = await fetch(
        `${API}/transmisiones/entradas/${entrada.id_entrada}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'No se pudo revocar la entrada.')
      }
      await cargarMetricas()
    } catch (err) {
      alert(err.message)
    } finally {
      setProcesandoEntradaId(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden border border-gray-100">
        {/* ── HEADER MODAL ──────────────────────────────────────────────── */}
        <div className="bg-gray-900 text-white px-5 py-4 flex items-center justify-between gap-4 border-b border-gray-800">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                <Tv size={12} /> Transmisión PPV
              </span>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                {evento.titulo}
              </h2>
            </div>
            <p className="text-xs text-gray-400">
              {evento.rival ? `vs ${evento.rival} (${evento.condicion || 'partido'})` : 'Transmisión exclusiva'}
              {evento.transmision_precio ? ` • Entrada: $${Number(evento.transmision_precio).toLocaleString('es-AR')}` : ''}
              {evento.transmision_socio_gratis ? ' • Socios al día: GRATIS' : ' • Socios pagan'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={cargarMetricas}
              disabled={loadingMetricas}
              title="Refrescar métricas y espectadores"
              className="p-2 rounded-xl bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
            >
              <RefreshCw size={16} className={loadingMetricas ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── CONTROL DE ESTADO DEL STREAM + MÉTRICAS ────────────────────── */}
        <div className="bg-gray-50 px-5 py-3 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Selector de estado en vivo */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Estado del Stream:
              </span>
              <div className="inline-flex rounded-xl bg-white p-1 border border-gray-200 shadow-2xs">
                {[
                  { key: 'programada', label: 'Programada', color: 'text-gray-700' },
                  { key: 'en_vivo', label: '🔴 EN VIVO', color: 'text-red-600 font-bold' },
                  { key: 'pausada', label: '🟡 Pausada', color: 'text-amber-700 font-semibold' },
                  { key: 'finalizada', label: 'Finalizada', color: 'text-gray-500' },
                ].map((st) => (
                  <button
                    key={st.key}
                    disabled={cambiandoEstado}
                    onClick={() => cambiarEstadoTransmision(st.key)}
                    className={`px-2.5 py-1 text-xs rounded-lg transition-all ${
                      estadoStream === st.key
                        ? 'bg-gray-900 text-white font-bold shadow-xs'
                        : `${st.color} hover:bg-gray-100`
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Botón Ver Stream */}
            <a
              href={`/en-vivo/${evento.id_evento}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-100 text-purple-800 hover:bg-purple-200 font-semibold text-xs border border-purple-200 transition-colors self-start sm:self-auto"
            >
              <Eye size={13} />
              <span>Abrir Reproductor</span>
              <ExternalLink size={11} />
            </a>
          </div>

          {/* Tarjetas de métricas rápidas */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mt-3">
            <div className="bg-white rounded-xl p-2.5 border border-gray-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 font-medium">Espectadores Hoy</span>
                <span className="relative flex h-2 w-2">
                  {metricas.espectadores_activos > 0 && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  )}
                  <span
                    className={`relative inline-flex rounded-full h-2 w-2 ${
                      metricas.espectadores_activos > 0 ? 'bg-emerald-500' : 'bg-gray-300'
                    }`}
                  ></span>
                </span>
              </div>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-lg sm:text-xl font-black text-gray-900">
                  {metricas.espectadores_activos}
                </span>
                <span className="text-xs text-emerald-600 font-semibold">online</span>
              </div>
            </div>

            <div className="bg-white rounded-xl p-2.5 border border-gray-200 shadow-2xs">
              <span className="text-xs text-gray-500 font-medium">Entradas Emitidas</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-lg sm:text-xl font-black text-gray-900">
                  {metricas.total_espectadores_registrados}
                </span>
                <span className="text-xs text-gray-400 font-medium">totales</span>
              </div>
            </div>

            <div className="bg-white rounded-xl p-2.5 border border-gray-200 shadow-2xs">
              <span className="text-xs text-gray-500 font-medium">Recaudación Verificada</span>
              <div className="mt-1">
                <span className="text-lg sm:text-xl font-black text-emerald-700">
                  ${Number(metricas.recaudacion_verificada || 0).toLocaleString('es-AR')}
                </span>
              </div>
            </div>

            <div className="bg-white rounded-xl p-2.5 border border-gray-200 shadow-2xs">
              <span className="text-xs text-gray-500 font-medium">Pagos Pendientes</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span
                  className={`text-lg sm:text-xl font-black ${
                    cantidadPendientes > 0 ? 'text-amber-600' : 'text-gray-900'
                  }`}
                >
                  {cantidadPendientes}
                </span>
                {cantidadPendientes > 0 && (
                  <span className="text-2xs uppercase font-bold text-amber-600 bg-amber-50 px-1 rounded">
                    Revisar
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── SELECTOR DE PESTAÑAS ───────────────────────────────────────── */}
        <div className="flex border-b border-gray-200 px-5 pt-2 bg-white">
          <button
            onClick={() => setPestana('emitir')}
            className={`flex items-center gap-2 pb-3 px-3 text-sm font-semibold border-b-2 transition-colors ${
              pestana === 'emitir'
                ? 'border-roberts-600 text-roberts-600'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <Ticket size={16} />
            <span>Emitir Entrada Manual</span>
          </button>
          <button
            onClick={() => setPestana('espectadores')}
            className={`flex items-center gap-2 pb-3 px-3 text-sm font-semibold border-b-2 transition-colors ${
              pestana === 'espectadores'
                ? 'border-roberts-600 text-roberts-600'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <Users size={16} />
            <span>Accesos y Espectadores ({metricas.total_espectadores_registrados})</span>
            {cantidadPendientes > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-xs font-bold bg-amber-100 text-amber-800 animate-pulse">
                {cantidadPendientes}
              </span>
            )}
          </button>
        </div>

        {/* ── CUERPO DEL MODAL CON SCROLL ────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-5 bg-white space-y-6">
          {pestana === 'emitir' ? (
            <div className="space-y-5">
              {/* Selector de tipo de beneficiario */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setModoTipo('no_socio')
                    setErrorForm(null)
                  }}
                  className={`flex-1 flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${
                    modoTipo === 'no_socio'
                      ? 'border-roberts-600 bg-roberts-50/40 ring-1 ring-roberts-600'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div
                    className={`p-2 rounded-lg ${
                      modoTipo === 'no_socio'
                        ? 'bg-roberts-600 text-white'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    <UserPlus size={18} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gray-900">
                      Hincha No-Socio (Sin Cuenta)
                    </h4>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Para simpatizantes o personas que pagan en efectivo o transferencia.
                      Se genera un Magic Link con ticket único.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setModoTipo('socio')
                    setErrorForm(null)
                  }}
                  className={`flex-1 flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${
                    modoTipo === 'socio'
                      ? 'border-roberts-600 bg-roberts-50/40 ring-1 ring-roberts-600'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div
                    className={`p-2 rounded-lg ${
                      modoTipo === 'socio'
                        ? 'bg-roberts-600 text-white'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    <ShieldAlert size={18} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gray-900">
                      Socio del Club (Moroso o Sin Cuota)
                    </h4>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Asigna la entrada directo a la cuenta del socio para que ingrese con su login o link,
                      sin perdonar su deuda social.
                    </p>
                  </div>
                </button>
              </div>

              {/* Formulario según tipo */}
              <form onSubmit={handleEmitirAcceso} className="space-y-4">
                {modoTipo === 'no_socio' ? (
                  <div className="bg-gray-50/70 p-4 rounded-xl border border-gray-200 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                          Email del Hincha <span className="text-roberts-600">*</span>
                        </label>
                        <input
                          type="email"
                          required
                          value={formNoSocio.email}
                          onChange={(e) =>
                            setFormNoSocio({ ...formNoSocio, email: e.target.value })
                          }
                          placeholder="ejemplo@gmail.com"
                          className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-roberts-600 focus:border-roberts-600"
                        />
                        <span className="text-2xs text-gray-500 mt-1 block">
                          Obligatorio: es la llave que valida la entrada si actualiza el navegador.
                        </span>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                          Nombre y Apellido (Opcional)
                        </label>
                        <input
                          type="text"
                          value={formNoSocio.nombre}
                          onChange={(e) =>
                            setFormNoSocio({ ...formNoSocio, nombre: e.target.value })
                          }
                          placeholder="ej: Lucas Martínez"
                          className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-roberts-600 focus:border-roberts-600"
                        />
                        <span className="text-2xs text-gray-500 mt-1 block">
                          Para personalizar el mensaje de WhatsApp.
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                          Teléfono Celular (Para WhatsApp)
                        </label>
                        <input
                          type="text"
                          value={formNoSocio.telefono}
                          onChange={(e) =>
                            setFormNoSocio({ ...formNoSocio, telefono: e.target.value })
                          }
                          placeholder="ej: 2355 123456"
                          className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-roberts-600 focus:border-roberts-600"
                        />
                        <span className="text-2xs text-gray-500 mt-1 block">
                          Al emitir la entrada, podrás enviarle el link con un solo clic.
                        </span>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                          Motivo / Origen del Pago
                        </label>
                        <input
                          type="text"
                          value={formNoSocio.motivo}
                          onChange={(e) =>
                            setFormNoSocio({ ...formNoSocio, motivo: e.target.value })
                          }
                          placeholder="ej: Efectivo en cantina / Pase de prensa"
                          className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-roberts-600 focus:border-roberts-600"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-50/70 p-4 rounded-xl border border-gray-200 space-y-4">
                    {/* Buscador de socio */}
                    {!socioSeleccionado ? (
                      <div className="space-y-2">
                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                          Buscar Socio (Nombre, Apellido, DNI o Email){' '}
                          <span className="text-roberts-600">*</span>
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            value={busquedaSocio}
                            onChange={(e) => setBusquedaSocio(e.target.value)}
                            placeholder="Escribí al menos 2 letras para buscar..."
                            className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-roberts-600 focus:border-roberts-600"
                          />
                          <Search
                            size={16}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                          />
                          {buscandoSocios && (
                            <Loader2
                              size={16}
                              className="animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                            />
                          )}
                        </div>

                        {/* Resultados búsqueda */}
                        {resultadosSocios.length > 0 && (
                          <div className="max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg divide-y divide-gray-100">
                            {resultadosSocios.map((s) => (
                              <button
                                key={s.id_usuario}
                                type="button"
                                onClick={() => seleccionarSocio(s)}
                                className="w-full px-3 py-2.5 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
                              >
                                <div className="space-y-0.5">
                                  <span className="text-sm font-bold text-gray-900">
                                    {s.nombre_completo}
                                  </span>
                                  <div className="flex items-center gap-2 text-xs text-gray-500">
                                    <span>DNI {s.dni}</span>
                                    {s.email && <span>• {s.email}</span>}
                                  </div>
                                </div>
                                <div>
                                  {s.socio_al_dia ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                                      <ShieldCheck size={11} /> Al Día
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800">
                                      <ShieldAlert size={11} /> Moroso / Con deuda
                                    </span>
                                  )}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}

                        {busquedaSocio.trim().length >= 2 &&
                          !buscandoSocios &&
                          resultadosSocios.length === 0 && (
                            <p className="text-xs text-gray-500 py-1">
                              No se encontraron socios que coincidan con la búsqueda.
                            </p>
                          )}
                      </div>
                    ) : (
                      /* Socio seleccionado */
                      <div className="p-3.5 rounded-xl border border-roberts-200 bg-white space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-roberts-100 text-roberts-700 flex items-center justify-center font-bold text-sm">
                              {socioSeleccionado.nombre?.charAt(0)}
                              {socioSeleccionado.apellido?.charAt(0)}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-bold text-gray-900">
                                  {socioSeleccionado.nombre_completo}
                                </h4>
                                {socioSeleccionado.socio_al_dia ? (
                                  <span className="px-2 py-0.5 rounded-full text-2xs font-bold bg-emerald-100 text-emerald-800">
                                    Al Día
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full text-2xs font-bold bg-red-100 text-red-800">
                                    Moroso
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-500">
                                DNI: {socioSeleccionado.dni} • Email: {socioSeleccionado.email || 'Sin email'}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSocioSeleccionado(null)}
                            className="text-xs text-gray-400 hover:text-red-600 font-semibold p-1"
                          >
                            Cambiar
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-gray-100">
                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">
                              Teléfono (WhatsApp)
                            </label>
                            <input
                              type="text"
                              value={formSocio.telefono}
                              onChange={(e) =>
                                setFormSocio({ ...formSocio, telefono: e.target.value })
                              }
                              placeholder="ej: 2355 123456"
                              className="w-full px-3 py-1.5 rounded-lg border border-gray-300 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">
                              Motivo / Nota
                            </label>
                            <input
                              type="text"
                              value={formSocio.motivo}
                              onChange={(e) =>
                                setFormSocio({ ...formSocio, motivo: e.target.value })
                              }
                              className="w-full px-3 py-1.5 rounded-lg border border-gray-300 text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {errorForm && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                    <AlertCircle size={15} className="flex-shrink-0" />
                    <span>{errorForm}</span>
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={guardando || (modoTipo === 'socio' && !socioSeleccionado)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-roberts-600 text-white font-bold hover:bg-roberts-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-all text-sm"
                  >
                    {guardando ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Generando acceso...</span>
                      </>
                    ) : (
                      <>
                        <Ticket size={16} />
                        <span>Emitir Entrada y Generar Link</span>
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* ── TARJETA DE ÉXITO Y LINK LISTO PARA WHATSAPP ─────────────── */}
              {ultimoAccesoGenerado && (
                <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-4 sm:p-5 space-y-4 shadow-sm animate-fadeIn">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-emerald-600 text-white">
                        <CheckCircle2 size={20} />
                      </div>
                      <div>
                        <h4 className="text-sm sm:text-base font-bold text-emerald-950">
                          ¡Entrada emitida para {ultimoAccesoGenerado.nombre || ultimoAccesoGenerado.email}!
                        </h4>
                        <p className="text-xs text-emerald-800">
                          El acceso ya está desbloqueado en el sistema. Compartile el Magic Link para que mire sin tener que loguearse.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setUltimoAccesoGenerado(null)}
                      className="text-emerald-700 hover:text-emerald-900 p-1"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* Caja con el link */}
                  <div className="bg-white p-3 rounded-xl border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="font-mono text-xs text-gray-700 truncate select-all">
                      {ultimoAccesoGenerado.link_acceso}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() =>
                          copiarTexto(ultimoAccesoGenerado.link_acceso, 'ultimo_generado')
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold transition-colors"
                      >
                        {copiadoId === 'ultimo_generado' ? (
                          <>
                            <Check size={14} className="text-emerald-600" />
                            <span className="text-emerald-600">¡Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy size={14} />
                            <span>Copiar</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() =>
                          abrirWhatsApp(
                            ultimoAccesoGenerado.telefono,
                            ultimoAccesoGenerado.mensaje_whatsapp
                          )
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors shadow-xs"
                      >
                        <Send size={13} />
                        <span>Enviar por WhatsApp</span>
                      </button>
                    </div>
                  </div>

                  {/* Vista previa del mensaje de WhatsApp */}
                  <div className="bg-emerald-100/60 p-3 rounded-xl text-xs text-emerald-900 border border-emerald-200/70">
                    <span className="font-bold block mb-1">
                      📱 Mensaje pre-redactado para WhatsApp:
                    </span>
                    <p className="whitespace-pre-line text-emerald-800 font-sans">
                      {ultimoAccesoGenerado.mensaje_whatsapp}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ── TAB 2: LISTA DE ESPECTADORES Y CONTROL DE PAGOS ────────────── */
            <div className="space-y-4">
              {/* Barra de búsqueda y filtros rápidos */}
              <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                <div className="relative w-full sm:w-72">
                  <input
                    type="text"
                    value={busquedaFiltro}
                    onChange={(e) => setBusquedaFiltro(e.target.value)}
                    placeholder="Buscar por nombre, email o ticket..."
                    className="w-full pl-9 pr-4 py-1.5 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-roberts-600"
                  />
                  <Search
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
                  {[
                    { id: 'todos', label: 'Todos' },
                    { id: 'en_linea', label: '🟢 En Vivo' },
                    { id: 'pendiente', label: `⏳ Pendientes (${cantidadPendientes})` },
                    { id: 'verificado', label: 'Pagados' },
                    { id: 'cortesia', label: 'Cortesía' },
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setFiltroEstadoPago(f.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                        filtroEstadoPago === f.id
                          ? 'bg-gray-900 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Listado de entradas */}
              {espectadoresFiltrados.length === 0 ? (
                <div className="text-center py-10 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                  <Ticket size={28} className="mx-auto text-gray-400 mb-2" />
                  <h4 className="text-sm font-bold text-gray-700">
                    No se encontraron entradas
                  </h4>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {filtroEstadoPago === 'pendiente'
                      ? 'No hay transferencias pendientes de aprobación.'
                      : 'Todavía no hay espectadores registrados con este filtro.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {espectadoresFiltrados.map((esp) => {
                    const esPendiente = esp.estado_pago === 'pendiente'
                    const linkReal = construirLink(esp.ticket_token, evento.id_evento)
                    const rivalStr = evento.rival ? ` vs ${evento.rival}` : ''
                    const mensajeWA =
                      `¡Hola ${esp.nombre}! ⚽ Acá tenés tu entrada para ver Club Atlético Roberts${rivalStr} en vivo.\n\n` +
                      `Ingresá directamente desde este link en tu celular o Smart TV:\n${linkReal}\n\n` +
                      `¡Vamos CAR! 🔴⚪`

                    return (
                      <div
                        key={esp.id_entrada}
                        className={`p-3 sm:p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          esPendiente
                            ? 'bg-amber-50/60 border-amber-300'
                            : esp.en_linea
                            ? 'bg-emerald-50/40 border-emerald-200'
                            : 'bg-white border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        {/* Info usuario */}
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-gray-900">
                              {esp.nombre}
                            </span>
                            {esp.en_linea && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded-full text-2xs font-bold bg-emerald-100 text-emerald-800 animate-pulse">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                Mirando Ahora
                              </span>
                            )}
                            {esPendiente ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded-full text-2xs font-bold bg-amber-100 text-amber-900 border border-amber-200">
                                <Clock size={10} /> Transferencia Pendiente
                              </span>
                            ) : esp.estado_pago === 'verificado' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded-full text-2xs font-bold bg-emerald-100 text-emerald-800">
                                <Check size={10} /> Pago Verificado {esp.monto > 0 ? `($${esp.monto})` : ''}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded-full text-2xs font-bold bg-purple-100 text-purple-800">
                                Cortesía / Manual
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                            {esp.email && <span>{esp.email}</span>}
                            <span>• Origen: {esp.metodo_pago || 'manual'}</span>
                            {esp.ticket_token && (
                              <span className="font-mono text-2xs bg-gray-100 px-1 rounded text-gray-600">
                                Token: {esp.ticket_token.slice(0, 8)}…
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Acciones */}
                        <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
                          {esPendiente && (
                            <button
                              onClick={() => handleAprobarPago(esp)}
                              disabled={procesandoEntradaId === esp.id_entrada}
                              title="Aprobar pago de transferencia y dar acceso inmediato"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors shadow-xs"
                            >
                              {procesandoEntradaId === esp.id_entrada ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <Check size={13} />
                              )}
                              <span>Aprobar Pago</span>
                            </button>
                          )}

                          <button
                            onClick={() => copiarTexto(linkReal, `esp_${esp.id_entrada}`)}
                            title="Copiar link de acceso"
                            className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors"
                          >
                            {copiadoId === `esp_${esp.id_entrada}` ? (
                              <Check size={14} className="text-emerald-600" />
                            ) : (
                              <Copy size={14} />
                            )}
                          </button>

                          <button
                            onClick={() => abrirWhatsApp('', mensajeWA)}
                            title="Enviar por WhatsApp"
                            className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-colors"
                          >
                            <Send size={14} />
                          </button>

                          <button
                            onClick={() => handleRevocarEntrada(esp)}
                            disabled={procesandoEntradaId === esp.id_entrada}
                            title="Revocar acceso / eliminar entrada"
                            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── FOOTER MODAL ──────────────────────────────────────────────── */}
        <div className="bg-gray-100 px-5 py-3 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
          <span>
            Transmisión PPV • Club Atlético Roberts
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-gray-300 bg-white font-semibold text-gray-700 hover:bg-gray-50"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
