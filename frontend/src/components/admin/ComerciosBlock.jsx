// frontend/src/components/admin/ComerciosBlock.jsx
/**
 * Bloque de gestión de Comercios Asociados (beneficios para socios).
 * Extraído para vivir dentro de AdminProductos.jsx.
 *
 * Backend consumido:
 *   GET /admin/comercios
 *   POST /admin/comercios
 *   PATCH /admin/comercios/{id}
 *   DELETE /admin/comercios/{id}
 *   POST /admin/comercios/{id}/imagen
 *   GET /admin/usuarios/ (para selector de cuenta vinculada)
 */

import { textoError } from '../../utils/errores';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  PlusCircle,
  Edit,
  Trash2,
  RefreshCw,
  AlertCircle,
  Store,
  UserCheck,
  UserX,
  Undo2,
  Loader2,
  Link2,
  Link2Off,
  Search,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

// ─── Modal principal ──────────────────────────────────────────────────────────

function ComercioFormModal({ comercio, onClose, onSave, usuarios, token }) {
  const [formData, setFormData] = useState({
    nombre_fantasia:     comercio?.nombre_fantasia     ?? '',
    rubro:               comercio?.rubro               ?? '',
    beneficio_ofrecido:  comercio?.beneficio_ofrecido  ?? '',
    es_activo:           comercio?.es_activo           ?? true,
    id_usuario_acceso:   comercio?.id_usuario_acceso   != null
      ? String(comercio.id_usuario_acceso)
      : '',
  });
  const [imagenFile, setImagenFile] = useState(null);
  const [preview,    setPreview]    = useState(comercio?.imagen_url ?? null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError,     setApiError]     = useState(null);
  const [formErrors,   setFormErrors]   = useState({});

  const isEditMode = !!comercio;

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImagenFile(file);
    setPreview(URL.createObjectURL(file));
  };

  const usuariosOrdenados = useMemo(() => {
    const esInvitado = (u) => (u.roles_asignados ?? []).some(r => r.rol?.nombre === 'invitado');
    return [...usuarios].sort((a, b) => Number(esInvitado(b)) - Number(esInvitado(a)));
  }, [usuarios]);

  const validate = () => {
    const errs = {};
    if (!formData.nombre_fantasia.trim())    errs.nombre_fantasia    = 'El nombre de fantasía es obligatorio.';
    if (!formData.beneficio_ofrecido.trim()) errs.beneficio_ofrecido = 'Describí el beneficio ofrecido.';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setApiError(null);

    const payload = {
      nombre_fantasia:    formData.nombre_fantasia.trim(),
      rubro:              formData.rubro.trim() || null,
      beneficio_ofrecido: formData.beneficio_ofrecido.trim(),
      es_activo:          formData.es_activo,
      id_usuario_acceso:  formData.id_usuario_acceso ? Number(formData.id_usuario_acceso) : null,
    };

    try {
      const saved = await onSave(payload, comercio?.id_comercio ?? null);
      if (imagenFile) {
        const id = comercio?.id_comercio ?? saved?.id_comercio;
        const formDataImg = new FormData();
        formDataImg.append('imagen', imagenFile);
        const resImg = await fetch(`${API}/admin/comercios/${id}/imagen`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formDataImg,
        });
        if (!resImg.ok) throw new Error((await resImg.json().catch(() => ({}))).detail || 'El comercio se guardó, pero la foto no se pudo subir.');
      }
      onClose();
    } catch (err) {
      setApiError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center items-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[92dvh]">
        <div className="p-6 border-b flex-shrink-0">
          <h2 className="font-display text-xl font-semibold text-gray-800">
            {isEditMode ? 'Editar Comercio' : 'Nuevo Comercio Asociado'}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {isEditMode
              ? `Editando a ${comercio.nombre_fantasia}`
              : 'Completá los datos del comercio y su beneficio para los socios.'
            }
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            {apiError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                <span>{apiError}</span>
              </div>
            )}

            <div>
              <input
                name="nombre_fantasia" value={formData.nombre_fantasia}
                onChange={e => setFormData({ ...formData, nombre_fantasia: e.target.value })}
                placeholder="Nombre de Fantasía" required
                className={`form-input ${formErrors.nombre_fantasia ? 'border-red-500' : ''}`}
              />
              {formErrors.nombre_fantasia && <p className="text-red-600 text-xs mt-1">{formErrors.nombre_fantasia}</p>}
            </div>

            <div>
              <input
                name="rubro" value={formData.rubro}
                onChange={e => setFormData({ ...formData, rubro: e.target.value })}
                placeholder="Rubro (ej: Indumentaria deportiva)"
                className="form-input"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
                Foto (opcional — sin foto no aparece en Beneficios de la landing)
              </label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFileChange}
                className="w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:text-sm file:font-medium hover:file:bg-blue-100"
              />
              {preview && (
                <img src={preview} alt="Vista previa" className="mt-3 w-28 h-28 object-cover rounded-lg border border-gray-200" />
              )}
            </div>

            <div>
              <textarea
                name="beneficio_ofrecido" value={formData.beneficio_ofrecido}
                onChange={e => setFormData({ ...formData, beneficio_ofrecido: e.target.value })}
                placeholder="Beneficio ofrecido (ej: 15% de descuento presentando el carnet)"
                required rows={3}
                className={`form-input resize-none ${formErrors.beneficio_ofrecido ? 'border-red-500' : ''}`}
              />
              {formErrors.beneficio_ofrecido && <p className="text-red-600 text-xs mt-1">{formErrors.beneficio_ofrecido}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                <Link2 size={13} />
                Cuenta de acceso (escáner)
              </label>
              <select
                value={formData.id_usuario_acceso}
                onChange={e => setFormData({ ...formData, id_usuario_acceso: e.target.value })}
                className="form-input"
              >
                <option value="">— Sin vincular —</option>
                {usuariosOrdenados.map(u => {
                  const roles = (u.roles_asignados ?? []).map(r => r.rol?.nombre).filter(Boolean);
                  const esInvitado = roles.includes('invitado');
                  return (
                    <option key={u.id_usuario} value={u.id_usuario}>
                      {u.apellido}, {u.nombre} — DNI {u.dni}{esInvitado ? ' (invitado)' : ''}
                    </option>
                  );
                })}
              </select>
              <p className="text-xs text-gray-400">
                La cuenta vinculada podrá usar el escáner de control de acceso para validar beneficios.
              </p>
            </div>

            <label className="flex items-center gap-3 p-3 rounded-xl border-2 border-gray-200 bg-white cursor-pointer select-none">
              <input
                type="checkbox"
                checked={formData.es_activo}
                onChange={e => setFormData({ ...formData, es_activo: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600"
              />
              <span className="text-sm font-semibold text-gray-700">Comercio activo</span>
            </label>
          </div>

          <div className="p-4 bg-gray-50 rounded-b-2xl border-t flex justify-end gap-3 flex-shrink-0">
            <button
              type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg text-gray-600 bg-gray-200 hover:bg-gray-300 font-semibold transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit" disabled={isSubmitting}
              className="px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700 font-semibold disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {isSubmitting && <Loader2 size={14} className="animate-spin" />}
              {isSubmitting ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Tarjeta de Comercio — mobile ───────────────────────────────────────────

function TarjetaComercioMobile({ comercio, onEditar, onReactivar, onDarBaja }) {
  const [expandido, setExpandido] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpandido(e => !e)}
        className="w-full text-left p-4 flex items-center justify-between gap-3 hover:bg-gray-50 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="font-medium text-gray-900 truncate">{comercio.nombre_fantasia}</div>
          <div className="text-xs text-gray-500 mt-0.5">{comercio.rubro ?? '—'}</div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {comercio.es_activo ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
              <UserCheck size={11} /> Activo
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
              <UserX size={11} /> Inactivo
            </span>
          )}
          {expandido ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </div>
      </button>

      {expandido && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-200 pt-3">
          <p className="text-sm text-gray-600">{comercio.beneficio_ofrecido}</p>

          <div className="text-sm">
            {comercio.usuario_acceso ? (
              <span className="inline-flex items-center gap-1.5 text-gray-700">
                <Link2 size={13} className="text-blue-500 flex-shrink-0" />
                {comercio.usuario_acceso.apellido}, {comercio.usuario_acceso.nombre}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-gray-400">
                <Link2Off size={13} />
                Sin vincular
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 pt-1 border-t border-gray-200 -mx-1">
            <button
              onClick={(e) => { e.stopPropagation(); onEditar(comercio); }}
              className="flex-1 inline-flex items-center justify-center gap-1.5 p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-100 rounded-lg transition-colors text-xs font-medium"
              title="Editar Comercio"
            >
              <Edit size={16} /> Editar
            </button>
            {comercio.es_activo ? (
              <button
                onClick={(e) => { e.stopPropagation(); onDarBaja(comercio); }}
                className="flex-1 inline-flex items-center justify-center gap-1.5 p-2 text-gray-500 hover:text-red-600 hover:bg-red-100 rounded-lg transition-colors text-xs font-medium"
                title="Dar de baja"
              >
                <Trash2 size={16} /> Baja
              </button>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); onReactivar(comercio); }}
                className="flex-1 inline-flex items-center justify-center gap-1.5 p-2 text-gray-500 hover:text-green-600 hover:bg-green-100 rounded-lg transition-colors text-xs font-medium"
                title="Reactivar Comercio"
              >
                <Undo2 size={16} /> Reactivar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Componente Principal de Bloque ──────────────────────────────────────────

export default function ComerciosBlock() {
  const { token } = useAuth();

  const [comercios,        setComercios]        = useState([]);
  const [loading,          setLoading]           = useState(true);
  const [error,            setError]             = useState(null);
  const [isModalOpen,      setIsModalOpen]       = useState(false);
  const [editingComercio,  setEditingComercio]   = useState(null);
  const [searchTerm,       setSearchTerm]        = useState('');
  const [usuarios,         setUsuarios]          = useState([]);

  useEffect(() => {
    if (!token) return;
    fetch(`${API}/admin/usuarios/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : [])
      .then(data => setUsuarios(data))
      .catch(() => setUsuarios([]));
  }, [token]);

  const fetchComercios = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/admin/comercios`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Error ${res.status}: No se pudo cargar la lista de comercios.`);
      setComercios(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchComercios(); }, [fetchComercios]);

  const handleSaveComercio = async (data, id) => {
    const isEdit = !!id;
    const url    = isEdit ? `${API}/admin/comercios/${id}` : `${API}/admin/comercios`;
    const method = isEdit ? 'PATCH' : 'POST';

    const res = await fetch(url, {
      method,
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(textoError(err?.detail, `Error al ${isEdit ? 'actualizar' : 'crear'} el comercio.`));
    }

    const saved = await res.json();
    fetchComercios();
    return saved;
  };

  const handleDeleteComercio = async (comercio) => {
    if (!window.confirm(
      `¿Dar de baja a "${comercio.nombre_fantasia}"? Esta acción es lógica y no borra el historial.`
    )) return;

    try {
      const res = await fetch(`${API}/admin/comercios/${comercio.id_comercio}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(textoError(err?.detail, 'Error al dar de baja el comercio.'));
      }
      fetchComercios();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleReactivarComercio = async (comercio) => {
    try {
      const res = await fetch(`${API}/admin/comercios/${comercio.id_comercio}`, {
        method: 'PATCH',
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ es_activo: true }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(textoError(err?.detail, 'Error al reactivar el comercio.'));
      }
      fetchComercios();
    } catch (err) {
      alert(err.message);
    }
  };

  const comerciosFiltrados = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return comercios;
    return comercios.filter(c =>
      c.nombre_fantasia.toLowerCase().includes(q) ||
      (c.rubro ?? '').toLowerCase().includes(q)
    );
  }, [comercios, searchTerm]);

  const openModalForCreate = () => {
    setEditingComercio(null);
    setIsModalOpen(true);
  };

  const openModalForEdit = (comercio) => {
    setEditingComercio(comercio);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {isModalOpen && (
        <ComercioFormModal
          comercio={editingComercio}
          usuarios={usuarios}
          token={token}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSaveComercio}
        />
      )}

      <div className="flex flex-nowrap items-center gap-1.5 sm:gap-3 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 sm:overflow-visible">
        <button
          onClick={openModalForCreate}
          className="flex-shrink-0 inline-flex items-center gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-green-600 text-white font-semibold hover:bg-green-700 transition-colors shadow-sm text-sm"
          title="Nuevo Comercio"
        >
          <PlusCircle size={16} />
          <span className="hidden sm:inline">Nuevo Comercio</span>
        </button>
        <button
          onClick={fetchComercios} disabled={loading}
          className="flex-shrink-0 p-1.5 sm:p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 transition-colors"
          title="Actualizar lista"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="relative">
        <Search size={13} className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="Buscar por nombre del comercio…"
          className="form-input pl-7 sm:pl-8 pr-4 py-1.5 sm:py-2 text-xs sm:text-sm w-full"
        />
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle size={18} className="flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={fetchComercios} className="underline underline-offset-2 font-medium hover:text-red-900">
            Reintentar
          </button>
        </div>
      )}

      {/* Tarjetas — mobile */}
      {loading && (
        <div className="md:hidden bg-white rounded-2xl shadow-sm border border-gray-200 divide-y divide-gray-50">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="p-4 animate-pulse space-y-2">
              <div className="h-4 bg-gray-200 rounded-md w-2/3" />
              <div className="h-3 bg-gray-100 rounded-md w-1/2" />
            </div>
          ))}
        </div>
      )}

      {!loading && (
        <div className="md:hidden bg-white rounded-2xl shadow-sm border border-gray-200 divide-y divide-gray-50">
          {comerciosFiltrados.map(comercio => (
            <TarjetaComercioMobile
              key={comercio.id_comercio}
              comercio={comercio}
              onEditar={openModalForEdit}
              onReactivar={handleReactivarComercio}
              onDarBaja={handleDeleteComercio}
            />
          ))}

          {comerciosFiltrados.length === 0 && (
            <div className="text-center py-12 text-gray-500 text-sm px-4">
              {searchTerm
                ? 'Ningún comercio coincide con la búsqueda.'
                : 'No hay comercios asociados cargados todavía.'}
            </div>
          )}
        </div>
      )}

      {/* Tabla — desktop */}
      <div className="hidden md:block bg-white rounded-2xl border border-gray-200 shadow-sm overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {['Nombre', 'Rubro', 'Beneficio', 'Cuenta de acceso', 'Estado', 'Acciones'].map(h => (
                <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading && [...Array(5)].map((_, i) => (
              <tr key={i} className="animate-pulse">
                <td colSpan="6" className="px-6 py-4"><div className="h-4 bg-gray-200 rounded-md w-3/4" /></td>
              </tr>
            ))}

            {!loading && comerciosFiltrados.map(comercio => (
              <tr key={comercio.id_comercio} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{comercio.nombre_fantasia}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded-md">
                    {comercio.rubro ?? 'Sin rubro'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm text-gray-600 max-w-xs truncate" title={comercio.beneficio_ofrecido}>
                    {comercio.beneficio_ofrecido}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {comercio.usuario_acceso ? (
                    <span className="inline-flex items-center gap-1.5 text-gray-900 font-medium">
                      <Link2 size={14} className="text-blue-600" />
                      {comercio.usuario_acceso.apellido}, {comercio.usuario_acceso.nombre}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-gray-400">
                      <Link2Off size={14} />
                      Sin vincular
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {comercio.es_activo ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      <UserCheck size={12} /> Activo
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                      <UserX size={12} /> Inactivo
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-1">
                  <button
                    onClick={() => openModalForEdit(comercio)}
                    className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                    title="Editar Comercio"
                  >
                    <Edit size={16} />
                  </button>
                  {comercio.es_activo ? (
                    <button
                      onClick={() => handleDeleteComercio(comercio)}
                      className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                      title="Dar de baja"
                    >
                      <Trash2 size={16} />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleReactivarComercio(comercio)}
                      className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-100 rounded-lg transition-colors"
                      title="Reactivar Comercio"
                    >
                      <Undo2 size={16} />
                    </button>
                  )}
                </td>
              </tr>
            ))}

            {!loading && comerciosFiltrados.length === 0 && (
              <tr>
                <td colSpan="6" className="text-center py-12 text-gray-500">
                  {searchTerm
                    ? 'Ningún comercio coincide con la búsqueda.'
                    : 'No hay comercios asociados cargados todavía.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
