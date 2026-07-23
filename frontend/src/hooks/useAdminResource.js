// frontend/src/hooks/useAdminResource.js
/**
 * Hook genérico para pantallas de admin: pega un GET autenticado a la API,
 * maneja loading/error/refetch con el mismo patrón que ya se repetía a mano
 * en AdminInicio, AdminSolicitudes, AdminReservas, etc.
 *
 * Uso:
 *   const { data, loading, error, refetch } = useAdminResource('/admin/usuarios/pendientes')
 *   const { data: resumen } = useAdminResource('/admin/dashboard/resumen', { transform: r => r })
 *
 * - `path` puede ser null/undefined para desactivar el fetch (por ejemplo,
 *   mientras se arma un query param dependiente de otro estado).
 * - `transform` es opcional: se aplica al JSON antes de guardarlo en `data`,
 *   útil para endpoints que devuelven un array pero solo interesa el length,
 *   o para normalizar shapes distintos ({ total } vs array).
 * - `intervalMs` permite refrescos periódicos (ej: escáneres con turnos en vivo).
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../context/AuthContext'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export function useAdminResource(path, { transform, intervalMs, initialData = null } = {}) {
  const { token } = useAuth()
  const [data, setData] = useState(initialData)
  const [loading, setLoading] = useState(!!path)
  const [error, setError] = useState(null)

  // Evita recrear fetchData en cada render solo porque `transform` es una
  // arrow function inline nueva; el consumidor no necesita memoizarla.
  const transformRef = useRef(transform)
  transformRef.current = transform

  const fetchData = useCallback(async () => {
    if (!token || !path) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail ?? `Error ${res.status} al cargar ${path}.`)
      }
      const json = await res.json()
      setData(transformRef.current ? transformRef.current(json) : json)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token, path])

  useEffect(() => {
    fetchData()
    if (!intervalMs) return
    const t = setInterval(fetchData, intervalMs)
    return () => clearInterval(t)
  }, [fetchData, intervalMs])

  return { data, loading, error, refetch: fetchData }
}