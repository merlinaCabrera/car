import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { PlusCircle, Edit, Trash2, RefreshCw, AlertCircle, Users, UserX, UserCheck, Eye, EyeOff, Undo2 } from 'lucide-react';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

// Componente del Modal para Crear/Editar
function SocioFormModal({ socio, onClose, onSave }) {
  const [formData, setFormData] = useState({
    dni: socio?.dni ?? '',
    nombre: socio?.nombre ?? '',
    apellido: socio?.apellido ?? '',
    email: socio?.email ?? '',
    telefono: socio?.telefono ?? '',
    direccion: socio?.direccion ?? '',
    password: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [formErrors, setFormErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);

  const isEditMode = !!socio;

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const validate = () => {
    const newErrors = {};

    // Validaciones para Creación y Edición
    if (!formData.nombre.trim()) newErrors.nombre = 'El nombre es obligatorio.';
    if (!formData.apellido.trim()) newErrors.apellido = 'El apellido es obligatorio.';
    if (!formData.email) newErrors.email = 'El email es obligatorio.';
    else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = 'El formato del email no es válido.';

    // Validaciones solo para Creación
    if (!isEditMode) {
      if (!formData.dni) newErrors.dni = 'El DNI es obligatorio.';
      else if (!/^\d{7,10}$/.test(formData.dni)) newErrors.dni = 'El DNI debe tener entre 7 y 10 dígitos numéricos.';

      if (!formData.password) newErrors.password = 'La contraseña es obligatoria.';
      else if (formData.password.length < 8) newErrors.password = 'La contraseña debe tener al menos 8 caracteres.';
      else if (/^\d+$/.test(formData.password)) newErrors.password = 'La contraseña no puede ser solo números.';
    }

    // Validaciones para la contraseña en modo Edición (si se ha escrito algo)
    if (isEditMode && formData.password) {
      if (formData.password.length < 8) {
        newErrors.password = 'La nueva contraseña debe tener al menos 8 caracteres.';
      } else if (/^\d+$/.test(formData.password)) {
        newErrors.password = 'La contraseña no puede ser solo números.';
      }
    }

    setFormErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setApiError(null);

    if (!validate()) {
      setIsSubmitting(false);
      return;
    }

    // En modo edición, no enviamos campos con string vacío para no blanquearlos en el backend
    const payload = isEditMode
      ? Object.fromEntries(Object.entries(formData).filter(([, value]) => value !== ''))
      : formData;

    // No enviar password en edición si está vacío
    if (isEditMode && !payload.password) {
      delete payload.password;
    }

    try {
      await onSave(payload, socio?.id_usuario);
      onClose();
    } catch (err) {
      setApiError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center items-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <form onSubmit={handleSubmit}>
          <div className="p-6 border-b">
            <h2 className="text-xl font-bold text-gray-800">{isEditMode ? 'Editar Socio' : 'Nuevo Socio'}</h2>
            <p className="text-sm text-gray-500 mt-1">
              {isEditMode ? `Editando a ${socio.nombre} ${socio.apellido}` : 'Completa los datos para crear un nuevo socio.'}
            </p>
          </div>
          <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
            {apiError && <p className="text-red-500 text-sm bg-red-50 p-3 rounded-lg">{apiError}</p>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <input name="nombre" value={formData.nombre} onChange={handleChange} placeholder="Nombre" required className={`form-input ${formErrors.nombre ? 'border-red-500' : ''}`} aria-invalid={!!formErrors.nombre} />
                {formErrors.nombre && <p className="text-red-600 text-sm mt-1">{formErrors.nombre}</p>}
              </div>
              <div>
                <input name="apellido" value={formData.apellido} onChange={handleChange} placeholder="Apellido" required className={`form-input ${formErrors.apellido ? 'border-red-500' : ''}`} aria-invalid={!!formErrors.apellido} />
                {formErrors.apellido && <p className="text-red-600 text-sm mt-1">{formErrors.apellido}</p>}
              </div>
            </div>
            <div>
              <input name="dni" value={formData.dni} onChange={handleChange} placeholder="DNI (sin puntos)" required disabled={isEditMode} className={`form-input disabled:bg-gray-100 disabled:cursor-not-allowed ${formErrors.dni ? 'border-red-500' : ''}`} aria-invalid={!!formErrors.dni} />
              {formErrors.dni && <p className="text-red-600 text-sm mt-1">{formErrors.dni}</p>}
            </div>
            <div>
              <input type="email" name="email" value={formData.email} onChange={handleChange} placeholder="Email" required className={`form-input ${formErrors.email ? 'border-red-500' : ''}`} aria-invalid={!!formErrors.email} />
              {formErrors.email && <p className="text-red-600 text-sm mt-1">{formErrors.email}</p>}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input name="telefono" value={formData.telefono} onChange={handleChange} placeholder="Teléfono" className="form-input" />
              <input name="direccion" value={formData.direccion} onChange={handleChange} placeholder="Dirección" className="form-input" />
            </div>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} name="password" value={formData.password} onChange={handleChange} placeholder={isEditMode ? 'Nueva contraseña (opcional)' : 'Contraseña'} required={!isEditMode} className={`form-input pr-10 ${formErrors.password ? 'border-red-500' : ''}`} aria-invalid={!!formErrors.password} />
              <button
                type="button"
                onClick={() => setShowPassword(prev => !prev)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
              {formErrors.password && <p className="text-red-600 text-sm mt-1">{formErrors.password}</p>}
            </div>
          </div>
          <div className="p-4 bg-gray-50 rounded-b-2xl flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-gray-600 bg-gray-200 hover:bg-gray-300 font-semibold">Cancelar</button>
            <button type="submit" disabled={isSubmitting} className="px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700 font-semibold disabled:opacity-50">
              {isSubmitting ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


export default function AdminSocios() {
  const { token } = useAuth();
  const [socios, setSocios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSocio, setEditingSocio] = useState(null);

  const fetchSocios = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/admin/usuarios/`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Error ${res.status}: No se pudo cargar la lista de socios.`);
      setSocios(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchSocios();
  }, [fetchSocios]);

  const handleSaveSocio = async (data, id) => {
    const isEdit = !!id;
    const url = isEdit ? `${API}/admin/usuarios/${id}` : `${API}/admin/usuarios/`;
    const method = isEdit ? 'PATCH' : 'POST';

    const res = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.detail ?? `Error al ${isEdit ? 'actualizar' : 'crear'} el socio.`);
    }

    fetchSocios(); // La forma más simple de asegurar consistencia
  };

  const handleDeleteSocio = async (socio) => {
    if (!window.confirm(`¿Estás seguro de que quieres dar de baja a ${socio.nombre} ${socio.apellido}? Esta acción es lógica y no borra el historial.`)) return;

    try {
      const res = await fetch(`${API}/admin/usuarios/${socio.id_usuario}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail ?? 'Error al dar de baja al socio.');
      }
      
      fetchSocios();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleReactivateSocio = async (socio) => {
    if (!window.confirm(`¿Estás seguro de que quieres reactivar a ${socio.nombre} ${socio.apellido}?`)) return;

    try {
      const res = await fetch(`${API}/admin/usuarios/${socio.id_usuario}/reactivar`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail ?? 'Error al reactivar al socio.');
      }
      
      fetchSocios();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const openModalForCreate = () => {
    setEditingSocio(null);
    setIsModalOpen(true);
  };

  const openModalForEdit = (socio) => {
    setEditingSocio(socio);
    setIsModalOpen(true);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {isModalOpen && <SocioFormModal socio={editingSocio} onClose={() => setIsModalOpen(false)} onSave={handleSaveSocio} />}

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Users size={24} className="text-gray-500" />
            Gestión de Socios
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Crear, editar y dar de baja a los socios del club.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 mt-1">
          <button onClick={openModalForCreate} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors shadow-sm">
            <PlusCircle size={16} />
            Nuevo Socio
          </button>
          <button onClick={fetchSocios} disabled={loading} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 transition-colors" title="Actualizar lista">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle size={18} className="flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={fetchSocios} className="underline underline-offset-2 font-medium hover:text-red-900">Reintentar</button>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              {['Socio', 'DNI', 'Email', 'Estado', 'Acciones'].map(h => (
                <th key={h} className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading && [...Array(5)].map((_, i) => (
              <tr key={i} className="animate-pulse"><td colSpan="5" className="px-6 py-4"><div className="h-4 bg-gray-200 rounded-md"></div></td></tr>
            ))}
            {!loading && socios.map(socio => (
              <tr key={socio.id_usuario} className="hover:bg-gray-50/70">
                <td className="px-6 py-4">
                  <div className="font-medium text-gray-900">{socio.apellido}, {socio.nombre}</div>
                </td>
                <td className="px-6 py-4 font-mono text-sm text-gray-600">{socio.dni}</td>
                <td className="px-6 py-4 text-sm text-gray-500">{socio.email ?? '—'}</td>
                <td className="px-6 py-4">
                  {socio.fecha_baja ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                      <UserX size={12} /> Inactivo
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      <UserCheck size={12} /> Activo
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-right space-x-2 whitespace-nowrap">
                  {socio.fecha_baja ? (
                    <>
                      <button onClick={() => openModalForEdit(socio)} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-100 rounded-lg transition-colors" title="Editar Socio">
                        <Edit size={16} />
                      </button>
                      <button onClick={() => handleReactivateSocio(socio)} className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-100 rounded-lg transition-colors" title="Reactivar Socio">
                        <Undo2 size={16} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => openModalForEdit(socio)} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-100 rounded-lg transition-colors" title="Editar Socio">
                        <Edit size={16} />
                      </button>
                      <button onClick={() => handleDeleteSocio(socio)} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-100 rounded-lg transition-colors" title="Dar de baja">
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {!loading && socios.length === 0 && (
              <tr><td colSpan="5" className="text-center py-12 text-gray-500">No se encontraron socios.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* NOTA: Para que los inputs del formulario modal funcionen, asegúrate de tener una clase 'form-input' 
   definida en tu archivo CSS global (ej. src/index.css), por ejemplo:
   
   @layer components {
     .form-input {
       @apply block w-full px-3 py-2 bg-white border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm;
     }
   }
*/