// frontend/src/pages/SocioPerfil.jsx
/**
 * Mi Perfil — rutas `/perfil` y `/configuracion`.
 *
 * El socio solo puede editar: foto de perfil, teléfono y dirección.
 * Todo lo demás es solo lectura — lo administra el club desde /admin/socios.
 *
 * Backend consumido:
 *   GET   /usuarios/me
 *   PATCH /usuarios/{id_usuario}   (whitelist: telefono, direccion)
 *   POST  /usuarios/me/foto        (multipart)
 *   POST  /usuarios/me/password
 *
 * Mejoras aplicadas respecto a la versión anterior:
 *   1. resolverFotoUrl — normaliza URLs absolutas y relativas; funciona
 *      igual en localhost y en producción (Render + Vercel).
 *   2. AvatarUploader — muestra preview local inmediato antes de que
 *      termine la subida, evitando la sensación de que "no pasó nada".
 *   3. Validación de tipo MIME en cliente antes de hacer el fetch.
 *   4. Avisos con auto-dismiss (éxito desaparece a los 4 s).
 *   5. Indicador de fortaleza de contraseña nueva.
 *   6. Skeleton loader más fiel al layout real.
 *   7. Accesibilidad: aria-live en avisos, aria-label en botones icon-only.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  User, Camera, Phone, MapPin, Mail, IdCard, Cake,
  Save, Loader2, AlertCircle, CheckCircle2, KeyRound,
  Eye, EyeOff, ShieldCheck,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convierte cualquier valor que llega desde la BD en una URL usable por <img>.
 *
 * Casos que maneja:
 *   - null / undefined / ''          → null  (muestra iniciales)
 *   - 'https://...'  (ya absoluta)   → la misma, sin tocar
 *   - '/static/fotos/xxx.jpg'        → `${API}/static/fotos/xxx.jpg`
 *   - 'static/fotos/xxx.jpg'         → `${API}/static/fotos/xxx.jpg`
 *
 * El error anterior ocurría porque la foto se subía desde el celular
 * (que apuntaba a Render) y se guardaba como URL absoluta de Render.
 * En localhost, el componente le anteponía API otra vez, duplicando la base.
 * Esta función corta ese problema: si ya es absoluta, la devuelve tal cual.
 */
const resolverFotoUrl = (foto) => {
  if (!foto) return null
  if (/^https?:\/\//i.test(foto)) return foto          // ya es absoluta
  return `${API}${foto.startsWith('/') ? '' : '/'}${foto}` // relativa → absoluta
}

const iniciales = (nombre, apellido) =>
  `${nombre?.[0] ?? ''}${apellido?.[0] ?? ''}`.toUpperCase()

const formatoFechaLarga = (iso) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('es-AR', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

const TIPOS_ACEPTADOS = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE_BYTES  = 5 * 1024 * 1024 // 5 MB

/** Puntaje 0-4 de fortaleza de contraseña */
const fortalezaPassword = (pwd) => {
  if (!pwd) return 0
  let score = 0
  if (pwd.length >= 8)                    score++
  if (pwd.length >= 12)                   score++
  if (/[A-Z]/.test(pwd))                  score++
  if (/[0-9]/.test(pwd))                  score++
  if (/[^A-Za-z0-9]/.test(pwd))          score++
  return Math.min(score, 4)
}

const FORTALEZA_CONFIG = [
  { label: 'Muy débil', color: 'bg-red-500'    },
  { label: 'Débil',     color: 'bg-orange-400' },
  { label: 'Regular',   color: 'bg-yellow-400' },
  { label: 'Buena',     color: 'bg-blue-500'   },
  { label: 'Fuerte',    color: 'bg-emerald-500' },
]

// ─── Sub-componentes ──────────────────────────────────────────────────────────

/** Aviso de error o éxito con auto-dismiss configurable */
function Aviso({ tipo, mensaje, onCerrar, autoDismissMs }) {
  useEffect(() => {
    if (!mensaje || !autoDismissMs) return
    const t = setTimeout(() => onCerrar?.(), autoDismissMs)
    return () => clearTimeout(t)
  }, [mensaje, autoDismissMs, onCerrar])

  if (!mensaje) return null
  const esError = tipo === 'error'
  const Icon = esError ? AlertCircle : CheckCircle2
  return (
    <div
      role="alert"
      aria-live="polite"
      className={`flex items-center gap-3 p-4 rounded-xl border text-sm transition-all ${
        esError
          ? 'bg-red-50 border-red-200 text-red-700'
          : 'bg-emerald-50 border-emerald-200 text-emerald-700'
      }`}
    >
      <Icon size={18} className="flex-shrink-0" />
      <span className="flex-1">{mensaje}</span>
      {onCerrar && (
        <button
          onClick={onCerrar}
          aria-label="Cerrar aviso"
          className="text-xs font-semibold underline underline-offset-2 opacity-70 hover:opacity-100"
        >
          Cerrar
        </button>
      )}
    </div>
  )
}

function CampoSoloLectura({ icon: Icon, label, valor }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
        <Icon size={12} /> {label}
      </label>
      <p className="text-gray-700 mt-1 text-sm">{valor ?? '—'}</p>
    </div>
  )
}

/**
 * Avatar con preview local inmediato.
 * Cuando el usuario elige un archivo, se muestra un preview via
 * URL.createObjectURL() antes de que termine la subida al servidor.
 * Así el feedback es instantáneo y no parece que "no pasó nada".
 */
function AvatarUploader({ nombre, apellido, fotoUrl, subiendo, onSeleccionarArchivo }) {
  const inputRef              = useRef(null)
  const [preview, setPreview] = useState(null)

  // Limpiar el ObjectURL al desmontar para no generar memory leaks
  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview) }
  }, [preview])

  // Cuando la subida termina (fotoUrl cambia), descartar el preview local
  useEffect(() => {
    if (!subiendo && fotoUrl) setPreview(null)
  }, [subiendo, fotoUrl])

  const handleChange = (e) => {
    const archivo = e.target.files?.[0]
    if (!archivo) return
    // Preview local inmediato
    const localUrl = URL.createObjectURL(archivo)
    setPreview(localUrl)
    onSeleccionarArchivo(archivo)
    e.target.value = '' // permite volver a elegir el mismo archivo
  }

  const srcMostrar = preview ?? fotoUrl

  return (
    <div className="relative w-28 h-28 flex-shrink-0">
      <div className="w-28 h-28 rounded-full overflow-hidden bg-blue-100 text-blue-700 flex items-center justify-center text-3xl font-bold border-4 border-white shadow-md">
        {srcMostrar ? (
          <img
            src={srcMostrar}
            alt="Foto de perfil"
            className="w-full h-full object-cover"
            // Si la URL falla (foto borrada del servidor, etc.), caer a iniciales
            onError={e => { e.currentTarget.style.display = 'none' }}
          />
        ) : (
          <span>{iniciales(nombre, apellido)}</span>
        )}
      </div>

      {/* Overlay de carga */}
      {subiendo && (
        <div className="absolute inset-0 rounded-full bg-black/50 flex flex-col items-center justify-center gap-1">
          <Loader2 size={22} className="text-white animate-spin" />
          <span className="text-white text-[10px] font-semibold">Subiendo…</span>
        </div>
      )}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={subiendo}
        aria-label="Cambiar foto de perfil"
        className="absolute bottom-0 right-0 p-2 rounded-full bg-blue-600 text-white shadow-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        <Camera size={15} />
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={TIPOS_ACEPTADOS.join(',')}
        className="hidden"
        onChange={handleChange}
      />
    </div>
  )
}

/** Barra de fortaleza de contraseña */
function IndicadorFortaleza({ password }) {
  const score  = fortalezaPassword(password)
  const config = FORTALEZA_CONFIG[score] ?? FORTALEZA_CONFIG[0]
  if (!password) return null
  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map(i => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i <= score ? config.color : 'bg-gray-200'
            }`}
          />
        ))}
      </div>
      <p className={`text-[11px] font-semibold ${
        score <= 1 ? 'text-red-500' : score <= 2 ? 'text-yellow-600' : 'text-emerald-600'
      }`}>
        {config.label}
      </p>
    </div>
  )
}

/** Skeleton fiel al layout real */
function PerfilSkeleton() {
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6 animate-pulse">
      <div className="h-7 bg-gray-100 rounded-lg w-36" />
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
        <div className="flex items-center gap-5">
          <div className="w-28 h-28 rounded-full bg-gray-100 flex-shrink-0" />
          <div className="space-y-2">
            <div className="h-5 bg-gray-100 rounded w-40" />
            <div className="h-4 bg-gray-100 rounded w-24" />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4 pt-4 border-t border-gray-50">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="h-3 bg-gray-100 rounded w-16" />
              <div className="h-4 bg-gray-100 rounded w-32" />
            </div>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 h-24" />
    </div>
  )
}

// ─── Componente Principal ──────────────────────────────────────────────────────

export default function SocioPerfil() {
  const { token, actualizarUsuario } = useAuth()

  const [perfil,       setPerfil]       = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(null)
  const [form,         setForm]         = useState({ telefono: '', direccion: '' })
  const [guardando,    setGuardando]    = useState(false)
  const [subiendoFoto, setSubiendoFoto] = useState(false)
  const [exito,        setExito]        = useState(null)

  // Contraseña
  const [mostrarPassword,   setMostrarPassword]   = useState(false)
  const [passwordForm,      setPasswordForm]      = useState({
    password_actual: '', password_nuevo: '', password_nuevo_confirmacion: '',
  })
  const [verPasswords,      setVerPasswords]      = useState(false)
  const [cambiandoPassword, setCambiandoPassword] = useState(false)
  const [errorPassword,     setErrorPassword]     = useState(null)
  const [exitoPassword,     setExitoPassword]     = useState(null)

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchPerfil = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/usuarios/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`Error ${res.status}: No se pudo cargar tu perfil.`)
      const data = await res.json()
      setPerfil(data)
      setForm({ telefono: data.telefono ?? '', direccion: data.direccion ?? '' })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { fetchPerfil() }, [fetchPerfil])

  // ── Guardar datos de contacto ──────────────────────────────────────────────
  const hayCambios = perfil && (
    (form.telefono || '') !== (perfil.telefono || '') ||
    (form.direccion || '') !== (perfil.direccion || '')
  )

  const handleGuardar = async (e) => {
    e.preventDefault()
    if (!token || !perfil || !hayCambios) return
    setGuardando(true)
    setError(null)
    setExito(null)
    try {
      const res = await fetch(`${API}/usuarios/${perfil.id_usuario}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          telefono: form.telefono || null,
          direccion: form.direccion || null,
        }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => null)
        throw new Error(errData?.detail || 'No se pudieron guardar los cambios.')
      }
      const actualizado = await res.json()
      setPerfil(actualizado)
      actualizarUsuario?.(actualizado)
      setExito('Tus datos se guardaron correctamente.')
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  // ── Subir foto ─────────────────────────────────────────────────────────────
  const handleSubirFoto = async (archivo) => {
    if (!token) return

    // Validaciones en cliente antes de hacer el fetch
    if (!TIPOS_ACEPTADOS.includes(archivo.type)) {
      setError('Solo se aceptan imágenes JPG, PNG o WEBP.')
      return
    }
    if (archivo.size > MAX_SIZE_BYTES) {
      setError('La imagen no puede pesar más de 5 MB.')
      return
    }

    setSubiendoFoto(true)
    setError(null)
    setExito(null)
    try {
      const formData = new FormData()
      formData.append('archivo', archivo)
      const res = await fetch(`${API}/usuarios/me/foto`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => null)
        throw new Error(errData?.detail || 'No se pudo subir la foto.')
      }
      const actualizado = await res.json()
      setPerfil(actualizado)
      actualizarUsuario?.(actualizado)
      setExito('Foto de perfil actualizada.')
    } catch (err) {
      setError(err.message)
    } finally {
      setSubiendoFoto(false)
    }
  }

  // ── Cambiar contraseña ─────────────────────────────────────────────────────
  const handleCambiarPassword = async (e) => {
    e.preventDefault()
    if (!token) return
    setErrorPassword(null)
    setExitoPassword(null)

    if (passwordForm.password_nuevo !== passwordForm.password_nuevo_confirmacion) {
      setErrorPassword('Las contraseñas nuevas no coinciden.')
      return
    }
    if (passwordForm.password_nuevo.length < 8) {
      setErrorPassword('La contraseña nueva debe tener al menos 8 caracteres.')
      return
    }
    if (fortalezaPassword(passwordForm.password_nuevo) < 2) {
      setErrorPassword('La contraseña es muy débil. Agregá números o mayúsculas.')
      return
    }

    setCambiandoPassword(true)
    try {
      const res = await fetch(`${API}/usuarios/me/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(passwordForm),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => null)
        throw new Error(errData?.detail || 'No se pudo cambiar la contraseña.')
      }
      setExitoPassword('Contraseña actualizada correctamente.')
      setPasswordForm({ password_actual: '', password_nuevo: '', password_nuevo_confirmacion: '' })
      setMostrarPassword(false)
    } catch (err) {
      setErrorPassword(err.message)
    } finally {
      setCambiandoPassword(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) return <PerfilSkeleton />

  if (error && !perfil) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        <Aviso tipo="error" mensaje={error} />
        <button
          onClick={fetchPerfil}
          className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
        >
          Reintentar
        </button>
      </div>
    )
  }

  const L = "text-xs font-semibold text-gray-400 uppercase tracking-wide"
  const INPUT = "mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-shadow"

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
          <User size={24} className="text-gray-500" />
          Mi Perfil
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Tu foto y datos de contacto. Para cambiar DNI, email u otros datos del socio, contactá al club.
        </p>
      </div>

      {/* Avisos globales — éxito se auto-descarta a los 4 s */}
      {error  && <Aviso tipo="error" mensaje={error}  onCerrar={() => setError(null)} />}
      {exito  && <Aviso tipo="exito" mensaje={exito}  onCerrar={() => setExito(null)} autoDismissMs={4000} />}

      {/* ── Card principal ──────────────────────────────────────────────── */}
      <form onSubmit={handleGuardar} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">

        {/* Foto + nombre */}
        <div className="flex items-center gap-5">
          <AvatarUploader
            nombre={perfil.nombre}
            apellido={perfil.apellido}
            fotoUrl={resolverFotoUrl(perfil.foto_perfil_url)}
            subiendo={subiendoFoto}
            onSeleccionarArchivo={handleSubirFoto}
          />
          <div>
            <h2 className="text-lg font-bold text-gray-900">{perfil.apellido}, {perfil.nombre}</h2>
            <p className="text-sm text-gray-500">DNI {perfil.dni}</p>
            <p className="text-xs text-gray-400 mt-1">JPG, PNG o WEBP · máximo 5 MB</p>
          </div>
        </div>

        {/* Datos de solo lectura */}
        <div className="grid sm:grid-cols-2 gap-y-4 gap-x-6 pt-4 border-t border-gray-50">
          <CampoSoloLectura icon={IdCard} label="DNI"   valor={perfil.dni} />
          <CampoSoloLectura icon={Mail}   label="Email" valor={perfil.email} />
          <CampoSoloLectura
            icon={Cake}
            label="Fecha de nacimiento"
            valor={perfil.fecha_nacimiento ? formatoFechaLarga(perfil.fecha_nacimiento) : null}
          />
        </div>

        {/* Datos editables */}
        <div className="grid sm:grid-cols-2 gap-4 pt-4 border-t border-gray-50">
          <div>
            <label htmlFor="telefono" className={L + " flex items-center gap-1.5"}>
              <Phone size={12} /> Teléfono
            </label>
            <input
              id="telefono"
              type="tel"
              value={form.telefono}
              onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
              placeholder="Ej: 221 555-1234"
              className={INPUT}
            />
          </div>
          <div>
            <label htmlFor="direccion" className={L + " flex items-center gap-1.5"}>
              <MapPin size={12} /> Dirección
            </label>
            <input
              id="direccion"
              type="text"
              value={form.direccion}
              onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))}
              placeholder="Calle, número, localidad"
              className={INPUT}
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={!hayCambios || guardando}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors"
          >
            {guardando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Guardar cambios
          </button>
        </div>
      </form>

      {/* ── Card contraseña ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <button
          type="button"
          onClick={() => {
            setMostrarPassword(v => !v)
            setErrorPassword(null)
            setExitoPassword(null)
          }}
          className="w-full flex items-center justify-between"
        >
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <KeyRound size={16} className="text-gray-400" />
            Cambiar contraseña
          </h2>
          <span className="text-xs font-medium text-blue-600">
            {mostrarPassword ? 'Cancelar' : 'Cambiar'}
          </span>
        </button>

        {mostrarPassword && (
          <form onSubmit={handleCambiarPassword} className="space-y-4 pt-4 border-t border-gray-50">
            {errorPassword && <Aviso tipo="error" mensaje={errorPassword} onCerrar={() => setErrorPassword(null)} />}
            {exitoPassword && <Aviso tipo="exito" mensaje={exitoPassword} autoDismissMs={4000} onCerrar={() => setExitoPassword(null)} />}

            <div className="space-y-3">
              {/* Contraseña actual */}
              <div>
                <label className={L}>Contraseña actual</label>
                <input
                  type={verPasswords ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={passwordForm.password_actual}
                  onChange={e => setPasswordForm(f => ({ ...f, password_actual: e.target.value }))}
                  className={INPUT}
                />
              </div>

              {/* Contraseña nueva */}
              <div>
                <label className={L}>Contraseña nueva</label>
                <input
                  type={verPasswords ? 'text' : 'password'}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={passwordForm.password_nuevo}
                  onChange={e => setPasswordForm(f => ({ ...f, password_nuevo: e.target.value }))}
                  className={INPUT}
                />
                <div className="mt-2">
                  <IndicadorFortaleza password={passwordForm.password_nuevo} />
                </div>
              </div>

              {/* Confirmación */}
              <div>
                <label className={L}>Confirmar contraseña nueva</label>
                <input
                  type={verPasswords ? 'text' : 'password'}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={passwordForm.password_nuevo_confirmacion}
                  onChange={e => setPasswordForm(f => ({ ...f, password_nuevo_confirmacion: e.target.value }))}
                  className={`${INPUT} ${
                    passwordForm.password_nuevo_confirmacion &&
                    passwordForm.password_nuevo !== passwordForm.password_nuevo_confirmacion
                      ? 'border-red-300 focus:ring-red-200 focus:border-red-400'
                      : ''
                  }`}
                />
                {passwordForm.password_nuevo_confirmacion &&
                  passwordForm.password_nuevo !== passwordForm.password_nuevo_confirmacion && (
                  <p className="text-xs text-red-500 mt-1">Las contraseñas no coinciden.</p>
                )}
              </div>

              {/* Toggle ver/ocultar */}
              <button
                type="button"
                onClick={() => setVerPasswords(v => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700"
              >
                {verPasswords ? <EyeOff size={13} /> : <Eye size={13} />}
                {verPasswords ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}
              </button>
            </div>

            <div className="flex items-center justify-between flex-wrap gap-3 pt-2">
              {/* Indicador visual de seguridad */}
              {fortalezaPassword(passwordForm.password_nuevo) >= 3 && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                  <ShieldCheck size={14} />
                  Contraseña segura
                </span>
              )}
              <div className="ml-auto">
                <button
                  type="submit"
                  disabled={cambiandoPassword}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gray-900 rounded-lg hover:bg-gray-800 disabled:bg-gray-400 transition-colors"
                >
                  {cambiandoPassword && <Loader2 size={16} className="animate-spin" />}
                  Actualizar contraseña
                </button>
              </div>
            </div>
          </form>
        )}
      </div>

    </div>
  )
}