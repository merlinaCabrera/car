// frontend/src/components/admin/SponsorsBlock.jsx
/**
 * Bloque de gestión de Sponsors — pensado para vivir DENTRO de otra página
 * admin (ej: AdminComercios.jsx), no como ruta propia. Self-contained:
 * maneja su propio fetch/estado, solo necesita el token del padre... en
 * realidad ni eso, usa useAuth() directamente.
 *
 * Backend consumido:
 *   GET    /admin/sponsors
 *   POST   /admin/sponsors                  (multipart: nombre, url_destino, orden, imagen)
 *   PATCH  /admin/sponsors/{id}              (JSON: SponsorUpdate)
 *   POST   /admin/sponsors/{id}/imagen       (multipart: imagen)
 *   DELETE /admin/sponsors/{id}
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  PlusCircle,
  Pencil,
  Trash2,
  RefreshCw,
  AlertCircle,
  Loader2,
  X,
  Save,
  ExternalLink,
  EyeOff,
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-slate-800">
            {isEditMode ? 'Editar sponsor' : 'Nuevo sponsor'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nombre</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
              maxLength={150}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Ej: Adidas"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Link (al hacer click)</label>
            <input
              type="url"
              value={urlDestino}
              onChange={(e) => setUrlDestino(e.target.value)}
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="https://..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Orden</label>
            <input
              type="number"
              value={orden}
              onChange={(e) => setOrden(e.target.value)}
              className="w-24 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-slate-400 mt-1">Menor número aparece primero en el carrusel.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Imagen {isEditMode && <span className="text-slate-400 font-normal">(opcional — dejá vacío para no cambiarla)</span>}
            </label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={handleFileChange}
              className="w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:text-sm file:font-medium hover:file:bg-blue-100"
            />
            {preview && (
              <div className="mt-3 bg-blue-900 rounded-lg p-4 w-28 h-28 flex items-center justify-center">
                <img src={preview} alt="Vista previa" className="max-w-full max-h-full object-contain" />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-900 hover:bg-blue-950 rounded-lg transition-colors disabled:opacity-60"
            >
              {guardando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Bloque exportado ───────────────────────────────────────────────────────

export default function SponsorsBlock() {
  const { token } = useAuth();
  const [sponsors, setSponsors] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [sponsorEnEdicion, setSponsorEnEdicion] = useState(null);
  const [eliminandoId, setEliminandoId] = useState(null);

  const cargarSponsors = useCallback(async () => {
    if (!token) return;
    setCargando(true);
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
      setCargando(false);
    }
  }, [token]);

  useEffect(() => {
    cargarSponsors();
  }, [cargarSponsors]);

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
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs sm:text-sm text-gray-500">
          Sponsors del carrusel de la landing. Los inactivos no se muestran pero quedan guardados.
        </p>
        <button
          onClick={abrirCrear}
          className="flex items-center gap-2 bg-blue-900 hover:bg-blue-950 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors flex-shrink-0"
        >
          <PlusCircle size={16} />
          Nuevo
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button onClick={cargarSponsors} className="ml-auto flex items-center gap-1 font-medium hover:underline">
            <RefreshCw size={14} /> Reintentar
          </button>
        </div>
      )}

      {cargando ? (
        <div className="flex items-center justify-center py-10 text-slate-400">
          <Loader2 className="animate-spin" size={24} />
        </div>
      ) : sponsors.length === 0 ? (
        <div className="text-center py-10 text-slate-400 text-sm">
          Todavía no hay sponsors cargados.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-3">Logo</th>
                <th className="text-left px-4 py-3">Nombre</th>
                <th className="text-left px-4 py-3">Link</th>
                <th className="text-left px-4 py-3">Orden</th>
                <th className="text-left px-4 py-3">Estado</th>
                <th className="text-right px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sponsors.map((sponsor) => (
                <tr key={sponsor.id_sponsor} className={sponsor.activo ? '' : 'opacity-50'}>
                  <td className="px-4 py-3">
                    <div className="bg-blue-900 rounded-md w-12 h-12 flex items-center justify-center p-1.5">
                      <img src={sponsor.imagen_url} alt={sponsor.nombre} className="max-w-full max-h-full object-contain" />
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">{sponsor.nombre}</td>
                  <td className="px-4 py-3">
                    <a
                      href={sponsor.url_destino}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-blue-700 hover:underline max-w-[220px] truncate"
                    >
                      {sponsor.url_destino} <ExternalLink size={12} className="flex-shrink-0" />
                    </a>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{sponsor.orden}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActivo(sponsor)}
                      className={`text-xs font-medium px-2 py-1 rounded-full transition-colors ${
                        sponsor.activo
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                      }`}
                    >
                      {sponsor.activo ? 'Activo' : 'Inactivo'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => abrirEditar(sponsor)}
                        className="p-2 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Editar"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => toggleActivo(sponsor)}
                        className="p-2 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                        title={sponsor.activo ? 'Ocultar' : 'Mostrar'}
                      >
                        <EyeOff size={16} />
                      </button>
                      <button
                        onClick={() => eliminarSponsor(sponsor)}
                        disabled={eliminandoId === sponsor.id_sponsor}
                        className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        title="Eliminar"
                      >
                        {eliminandoId === sponsor.id_sponsor ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <Trash2 size={16} />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalAbierto && (
        <SponsorFormModal
          sponsor={sponsorEnEdicion}
          token={token}
          onClose={() => setModalAbierto(false)}
          onSaved={cargarSponsors}
        />
      )}
    </div>
  );
}