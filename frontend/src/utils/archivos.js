// frontend/src/utils/archivos.js
const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

/**
 * Normaliza la URL de un archivo que vino del backend.
 *
 * El backend ya devuelve los archivos privados (comprobantes, fotos de perfil)
 * como Presigned URL absoluta de S3 — ver PagoResponse._firmar_comprobante y
 * utils/s3.resolver_url_archivo. Lo único que puede llegar relativo son las
 * rutas locales legacy (`/uploads/...`) de filas viejas, que sí cuelgan del
 * backend.
 *
 * Antes varias pantallas hacían `${API}${url}` a secas sobre el object key de
 * S3 y armaban links inexistentes tipo `https://api.../comprobantes/146/x.jpeg`
 * → pestaña en blanco (BUG-05 de la QA del 08-09).
 */
export function resolverUrlArchivo(url) {
  if (!url) return null
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  return `${API_BASE_URL}${url}`
}
