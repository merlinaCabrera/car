// frontend/src/pages/SocioPerfil.jsx
/**
 * Mi Perfil — rutas `/perfil` y `/configuracion`.
 *
 * El socio solo puede editar datos "de contacto": foto de perfil, teléfono
 * y dirección. Todo lo demás (DNI, email, roles, beca, estado financiero)
 * es de solo lectura acá — lo administra el club desde /admin/socios.
 * Esa restricción también se aplica en el backend (PATCH /usuarios/{id}),
 * esta pantalla solo evita que el socio intente tocar campos que de todos
 * modos el servidor le va a rechazar.
 *
 * Backend consumido:
 *   GET   /usuarios/me
 *   PATCH /usuarios/{id_usuario}   (whitelist: telefono, direccion, foto_perfil_url, push_token)
 *   POST  /usuarios/me/foto        (multipart, reemplaza la foto)
 *   POST  /usuarios/me/password    (cambio de contraseña)
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  User,
  Camera,
  Phone,
  MapPin,
  Mail,
  IdCard,
  Cake,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Eye,
  EyeOff,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

// foto_perfil_url puede venir como URL absoluta o como path relativo servido
// por el propio backend (ej. "/static/fotos_perfil/xxx.jpg").
const resolverFotoUrl = (foto) => {
  if (!foto) return null
  if (/^https?:\/\//i.test(foto)) return foto
  return `${API}${foto.startsWith('/') ? '' : '/'}${foto}`
}

const iniciales = (nombre, apellido) =>
  `${nombre?.[0] ?? ''}${apellido?.[0] ?? ''}`.toUpperCase()

const formatoFechaLarga = (iso) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function Aviso({ tipo, mensaje, onCerrar }) {
  if (!mensaje) return null
  const esError = tipo === 'error'
  const Icon = esError ? AlertCircle : CheckCircle2
  return (
    <div className={`flex items-center gap-3 p-4 rounded-xl border text-sm ${
      esError ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
    }`}>
      <Icon size={18} className="flex-shrink-0" />
      <span className="flex-1">{mensaje}</span>
      {onCerrar && (
        <button onClick={onCerrar} className="text-xs font-semibold underline underline-offset-2 opacity-70 hover:opacity-100">
          Cerrar
        </button>
      )}
    </div>
  )
}

// Campo de solo lectura — para dejar claro que DNI/email/etc no se editan acá.
function CampoSoloLectura({ icon: Icon, label, valor }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
        <Icon size={12} /> {label}
      </label>
      <p className="text-gray-700 mt-1">{valor ?? '—'}</p>
    </div>
  )
}

function AvatarUploader({ nombre, apellido, fotoUrl, subiendo, onSeleccionarArchivo }) {
  const inputRef = useRef(null)

  return (
    <div className="relative w-28 h-28 flex-shrink-0">
      <div className="w-28 h-28 rounded-full overflow-hidden bg-blue-100 text-blue-700 flex items-center justify-center text-3xl font-bold border-4 border-white shadow-md">
        {fotoUrl ? (
          <img src={fotoUrl} alt="Foto de perfil" className="w-full h-full object-cover" />
        ) : (
          <span>{iniciales(nombre, apellido)}</span>
        )}
        {subiendo && (
          <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
            <Loader2 size={22} className="text-white animate-spin" />
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={subiendo}
        className="absolute bottom-0 right-0 p-2 rounded-full bg-blue-600 text-white shadow-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
        title="Cambiar foto de perfil"
      >
        <Camera size={15} />
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={e => {
          const archivo = e.target.files?.[0]
          if (archivo) onSeleccionarArchivo(archivo)
          e.target.value = '' // permite volver a elegir el mismo archivo si hace falta
        }}
      />
    </div>
  )
}

// ─── Componente Principal ──────────────────────────────────────────────────────

export default function SocioPerfil() {
  const { user, token, actualizarUsuario } = useAuth()

  const [perfil, setPerfil] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [form, setForm] = useState({ telefono: '', direccion: '' })
  const [guardando, setGuardando] = useState(false)
  const [subiendoFoto, setSubiendoFoto] = useState(false)
  const [exito, setExito] = useState(null)

  // ── Cambio de contraseña ──────────────────────────────────────────────
  const [mostrarPassword, setMostrarPassword] = useState(false)
  const [passwordForm, setPasswordForm] = useState({
    password_actual: '', password_nuevo: '', password_nuevo_confirmacion: '',
  })
  const [verPasswords, setVerPasswords] = useState(false)
  const [cambiandoPassword, setCambiandoPassword] = useState(false)
  const [errorPassword, setErrorPassword] = useState(null)
  const [exitoPassword, setExitoPassword] = useState(null)

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

  const hayCambios = perfil && (
    (form.telefono || '') !== (perfil.telefono || '') ||
    (form.direccion || '') !== (perfil.direccion || '')
  )

  const handleGuardar = async (e) => {
    e.preventDefault()
    if (!token || !perfil) return
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

  const handleSubirFoto = async (archivo) => {
    if (!token) return
    if (archivo.size > 5 * 1024 * 1024) {
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

  if (loading) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <div className="h-8 bg-gray-100 rounded-lg animate-pulse w-48" />
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm h-40 animate-pulse" />
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm h-64 animate-pulse" />
      </div>
    )
  }

  if (error && !perfil) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Aviso tipo="error" mensaje={error} />
        <button
          onClick={fetchPerfil}
          className="mt-4 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
        >
          Reintentar
        </button>
      </div>
    )
  }

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

      {error && <Aviso tipo="error" mensaje={error} onCerrar={() => setError(null)} />}
      {exito && <Aviso tipo="exito" mensaje={exito} onCerrar={() => setExito(null)} />}

      {/* Card principal: foto + datos editables */}
      <form onSubmit={handleGuardar} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">

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
        <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t border-gray-50">
          <CampoSoloLectura icon={IdCard} label="DNI" valor={perfil.dni} />
          <CampoSoloLectura icon={Mail} label="Email" valor={perfil.email} />
          <CampoSoloLectura
            icon={Cake}
            label="Fecha de nacimiento"
            valor={perfil.fecha_nacimiento ? formatoFechaLarga(perfil.fecha_nacimiento) : null}
          />
        </div>

        {/* Datos editables */}
        <div className="grid sm:grid-cols-2 gap-4 pt-4 border-t border-gray-50">
          <div>
            <label htmlFor="telefono" className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
              <Phone size={12} /> Teléfono
            </label>
            <input
              id="telefono"
              type="tel"
              value={form.telefono}
              onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
              placeholder="Ej: 221 555-1234"
              className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
            />
          </div>
          <div>
            <label htmlFor="direccion" className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
              <MapPin size={12} /> Dirección
            </label>
            <input
              id="direccion"
              type="text"
              value={form.direccion}
              onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))}
              placeholder="Calle, número, localidad"
              className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
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

      {/* Card de contraseña */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <button
          type="button"
          onClick={() => setMostrarPassword(v => !v)}
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
          <form onSubmit={handleCambiarPassword} className="space-y-4 pt-2 border-t border-gray-50">
            {errorPassword && <Aviso tipo="error" mensaje={errorPassword} />}
            {exitoPassword && <Aviso tipo="exito" mensaje={exitoPassword} />}

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Contraseña actual
                </label>
                <input
                  type={verPasswords ? 'text' : 'password'}
                  required
                  value={passwordForm.password_actual}
                  onChange={e => setPasswordForm(f => ({ ...f, password_actual: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Contraseña nueva
                </label>
                <input
                  type={verPasswords ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={passwordForm.password_nuevo}
                  onChange={e => setPasswordForm(f => ({ ...f, password_nuevo: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Confirmar contraseña nueva
                </label>
                <input
                  type={verPasswords ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={passwordForm.password_nuevo_confirmacion}
                  onChange={e => setPasswordForm(f => ({ ...f, password_nuevo_confirmacion: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                />
              </div>
              <button
                type="button"
                onClick={() => setVerPasswords(v => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700"
              >
                {verPasswords ? <EyeOff size={13} /> : <Eye size={13} />}
                {verPasswords ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}
              </button>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={cambiandoPassword}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gray-900 rounded-lg hover:bg-gray-800 disabled:bg-gray-400 transition-colors"
              >
                {cambiandoPassword && <Loader2 size={16} className="animate-spin" />}
                Actualizar contraseña
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}