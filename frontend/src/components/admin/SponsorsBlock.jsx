// frontend/src/components/admin/SponsorsBlock.jsx
/**
 * Bloque de gestión de Sponsors — vive DENTRO de AdminComercios.jsx.
 * Mismo lenguaje visual que el bloque de Comercios a propósito: mismos
 * colores, mismo patrón mobile-card + tabla desktop, mismos badges y
 * botones de acción. La idea es que sean intercambiables visualmente,
 * aunque son entidades totalmente distintas.
 *
 * Backend: GET/POST /admin/sponsors, PATCH/DELETE /admin/sponsors/{id},
 *          POST /admin/sponsors/{id}/imagen
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  PlusCircle,
  Pencil,
  Trash2,
  Undo2,
  RefreshCw,
  AlertCircle,
  Loader2,
  X,
  Save,
  ExternalLink,
  UserCheck,
  UserX,
  Search,
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

// ─── Modal: crear / editar ──────────────────────────────────────────────────

function SponsorFormModal({ sponsor, onClose, onSaved, token }) {
  const isEditMode = !!sponsor;
  const [nombre, setNombre] = useState(sponsor?.nombre ?? '');
  const [urlDestino, setUrlDestino] = useState(sponsor?.url_destino ?? '');
  const [orden, setOrden] = useState(sponsor?.orden ?? 0);
  const [imagenFile, setImagenFile] = useState(null);
  const [preview, setPreview] = useState(sponsor?.imagen_url ?? null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImagenFile(file);
    setPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!isEditMode && !imagenFile) {
      setError('La imagen es obligatoria para crear un sponsor.');
      return;
    }

    setGuardando(true);
    try {
      if (isEditMode) {
        const res = await fetch(`${API}/admin/sponsors/${sponsor.id_sponsor}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ nombre, url_destino: urlDestino, orden: Number(orden) }),
        });
        if (!res.ok) throw new Error((await res.json()).detail || 'No se pudo guardar.');

        if (imagenFile) {
          const formData = new FormData();
          formData.append('imagen', imagenFile);
          const resImg = await fetch(`${API}/admin/sponsors/${sponsor.id_sponsor}/imagen`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          });
          if (!resImg.ok) throw new Error((await resImg.json()).detail || 'No se pudo actualizar la imagen.');
        }
      } else {
        const formData = new FormData();
        formData.append('nombre', nombre);
        formData.append('url_destino', urlDestino);
        formData.append('orden', String(orden));
        formData.append('imagen', imagenFile);
        const res = await fetch(`${API}/admin/sponsors`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        if (!res.ok) throw new Error((await res.json()).detail || 'No se pudo crear el sponsor.');
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center items-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[92dvh]">
        <div className="p-6 border-b flex-shrink-0 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-800">
              {isEditMode ? 'Editar Sponsor' : 'Nuevo Sponsor'}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {isEditMode ? `Editando a ${sponsor.nombre}` : 'Completá el nombre, el link y subí el logo.'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                required
                maxLength={150}
                placeholder="Nombre del sponsor"
                className="form-input"
              />
            </div>

            <div>
              <input
                type="url"
                value={urlDestino}
                onChange={(e) => setUrlDestino(e.target.value)}
                required
                placeholder="Link (https://...)"
                className="form-input"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Orden</label>
              <input
                type="number"
                value={orden}
                onChange={(e) => setOrden(e.target.value)}
                className="form-input w-24"
              />
              <p className="text-xs text-gray-400 mt-1">Menor número aparece primero en el carrusel.</p>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
                Logo {isEditMode && <span className="text-gray-400 font-normal normal-case">(opcional — dejá vacío para no cambiarlo)</span>}
              </label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={handleFileChange}
                className="w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:text-sm file:font-medium hover:file:bg-blue-100"
              />
              {preview && (
                <div className="mt-3 bg-blue-900 rounded-lg p-4 w-28 h-28 flex items-center justify-center">
                  <img src={preview} alt="Vista previa" className="max-w-full max-h-full object-contain" />
                </div>
              )}
            </div>
          </div>

          <div className="p-4 bg-gray-50 rounded-b-2xl border-t flex justify-end gap-3 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-gray-600 bg-gray-200 hover:bg-gray-300 font-semibold transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700 font-semibold disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {guardando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Tarjeta mobile ──────────────────────────────────────────────────────────

function TarjetaSponsorMobile({ sponsor, onEditar, onToggleActivo, onEliminar }) {
  return (
    <div className="p-4 flex items-center gap-3">
      <div className="bg-blue-900 rounded-lg w-12 h-12 flex-shrink-0 flex items-center justify-center p-1.5">
        <img src={sponsor.imagen_url} alt={sponsor.nombre} className="max-w-full max-h-full object-contain" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-gray-900 truncate">{sponsor.nombre}</div>
        <a href={sponsor.url_destino} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline truncate flex items-center gap-1">
          {sponsor.url_destino} <ExternalLink size={10} className="flex-shrink-0" />
        </a>
        <div className="mt-1">
          {sponsor.activo ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
              <UserCheck size={12} /> Activo
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
              <UserX size={12} /> Inactivo
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1 flex-shrink-0">
        <button onClick={() => onEditar(sponsor)} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-100 rounded-lg transition-colors" title="Editar">
          <Pencil size={16} />
        </button>
        {sponsor.activo ? (
          <button onClick={() => onEliminar(sponsor)} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-100 rounded-lg transition-colors" title="Eliminar">
            <Trash2 size={16} />
          </button>
        ) : (
          <button onClick={() => onToggleActivo(sponsor)} className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-100 rounded-lg transition-colors" title="Reactivar">
            <Undo2 size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Bloque exportado ───────────────────────────────────────────────────────

export default function SponsorsBlock() {
  const { token } = useAuth();
  const [sponsors, setSponsors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [modalAbierto, setModalAbierto] = useState(false);
  const [sponsorEnEdicion, setSponsorEnEdicion] = useState(null);
  const [eliminandoId, setEliminandoId] = useState(null);

  const cargarSponsors = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/admin/sponsors`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('No se pudieron cargar los sponsors.');
      setSponsors(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    cargarSponsors();
  }, [cargarSponsors]);

  const sponsorsFiltrados = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return sponsors;
    return sponsors.filter((s) => s.nombre.toLowerCase().includes(q));
  }, [sponsors, searchTerm]);

  const toggleActivo = async (sponsor) => {
    try {
      const res = await fetch(`${API}/admin/sponsors/${sponsor.id_sponsor}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ activo: !sponsor.activo }),
      });
      if (!res.ok) throw new Error('No se pudo actualizar.');
      cargarSponsors();
    } catch (err) {
      alert(err.message);
    }
  };

  const eliminarSponsor = async (sponsor) => {
    if (!window.confirm(`¿Eliminar "${sponsor.nombre}"? Esta acción no se puede deshacer.`)) return;
    setEliminandoId(sponsor.id_sponsor);
    try {
      const res = await fetch(`${API}/admin/sponsors/${sponsor.id_sponsor}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok && res.status !== 204) throw new Error('No se pudo eliminar.');
      cargarSponsors();
    } catch (err) {
      alert(err.message);
    } finally {
      setEliminandoId(null);
    }
  };

  const abrirCrear = () => {
    setSponsorEnEdicion(null);
    setModalAbierto(true);
  };

  const abrirEditar = (sponsor) => {
    setSponsorEnEdicion(sponsor);
    setModalAbierto(true);
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {modalAbierto && (
        <SponsorFormModal
          sponsor={sponsorEnEdicion}
          token={token}
          onClose={() => setModalAbierto(false)}
          onSaved={cargarSponsors}
        />
      )}

      {/* Barra de acción — mismo patrón que Comercios */}
      <div className="flex flex-nowrap items-center gap-1.5 sm:gap-3 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 sm:overflow-visible">
        <button
          onClick={abrirCrear}
          className="flex-shrink-0 inline-flex items-center gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-green-600 text-white font-semibold hover:bg-green-700 transition-colors shadow-sm text-sm"
          title="Nuevo Sponsor"
        >
          <PlusCircle size={16} />
          <span className="hidden sm:inline">Nuevo Sponsor</span>
        </button>
        <button
          onClick={cargarSponsors}
          disabled={loading}
          className="flex-shrink-0 p-1.5 sm:p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 transition-colors"
          title="Actualizar lista"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Buscador */}
      <div className="relative">
        <Search size={13} className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar por nombre del sponsor…"
          className="form-input pl-7 sm:pl-8 pr-4 py-1.5 sm:py-2 text-xs sm:text-sm w-full"
        />
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle size={18} className="flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={cargarSponsors} className="flex items-center gap-1 font-medium hover:underline flex-shrink-0">
            <RefreshCw size={14} /> Reintentar
          </button>
        </div>
      )}

      {/* Tarjetas — mobile */}
      <div className="md:hidden bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-50">
        {loading
          ? [...Array(3)].map((_, i) => (
              <div key={i} className="p-4 animate-pulse space-y-2">
                <div className="h-4 bg-gray-200 rounded-md w-2/3" />
                <div className="h-3 bg-gray-100 rounded-md w-1/2" />
              </div>
            ))
          : sponsorsFiltrados.map((sponsor) => (
              <TarjetaSponsorMobile
                key={sponsor.id_sponsor}
                sponsor={sponsor}
                onEditar={abrirEditar}
                onToggleActivo={toggleActivo}
                onEliminar={eliminarSponsor}
              />
            ))}

        {!loading && sponsorsFiltrados.length === 0 && (
          <div className="text-center py-12 text-gray-500 text-sm px-4">
            {searchTerm ? 'Ningún sponsor coincide con la búsqueda.' : 'Todavía no hay sponsors cargados.'}
          </div>
        )}
      </div>

      {/* Tabla — desktop */}
      <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              {['Logo', 'Nombre', 'Link', 'Orden', 'Estado', 'Acciones'].map((h) => (
                <th key={h} className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading &&
              [...Array(3)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan="6" className="px-6 py-4">
                    <div className="h-4 bg-gray-200 rounded-md" />
                  </td>
                </tr>
              ))}

            {!loading &&
              sponsorsFiltrados.map((sponsor) => (
                <tr key={sponsor.id_sponsor} className="hover:bg-gray-50/70 transition-colors">
                  <td className="px-6 py-4">
                    <div className="bg-blue-900 rounded-md w-12 h-12 flex items-center justify-center p-1.5">
                      <img src={sponsor.imagen_url} alt={sponsor.nombre} className="max-w-full max-h-full object-contain" />
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{sponsor.nombre}</div>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <a
                      href={sponsor.url_destino}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-blue-600 hover:underline max-w-[220px] truncate"
                    >
                      {sponsor.url_destino} <ExternalLink size={12} className="flex-shrink-0" />
                    </a>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{sponsor.orden}</td>
                  <td className="px-6 py-4">
                    {sponsor.activo ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <UserCheck size={12} /> Activo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        <UserX size={12} /> Inactivo
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right space-x-1 whitespace-nowrap">
                    <button
                      onClick={() => abrirEditar(sponsor)}
                      className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                      title="Editar Sponsor"
                    >
                      <Pencil size={16} />
                    </button>
                    {sponsor.activo ? (
                      <button
                        onClick={() => eliminarSponsor(sponsor)}
                        disabled={eliminandoId === sponsor.id_sponsor}
                        className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50"
                        title="Eliminar"
                      >
                        {eliminandoId === sponsor.id_sponsor ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                      </button>
                    ) : (
                      <button
                        onClick={() => toggleActivo(sponsor)}
                        className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-100 rounded-lg transition-colors"
                        title="Reactivar"
                      >
                        <Undo2 size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}

            {!loading && sponsorsFiltrados.length === 0 && (
              <tr>
                <td colSpan="6" className="text-center py-12 text-gray-500">
                  {searchTerm ? 'Ningún sponsor coincide con la búsqueda.' : 'Todavía no hay sponsors cargados.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}