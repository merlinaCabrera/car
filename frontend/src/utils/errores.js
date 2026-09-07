// frontend/src/utils/errores.js

/**
 * Convierte el `detail` de una respuesta de error de FastAPI en un string
 * mostrable.
 *
 * POR QUÉ: `detail` no siempre es texto.
 *   - 422 (validación de Pydantic) → SIEMPRE un array de objetos:
 *       [{ loc: [...], msg: "field required", type: "..." }, ...]
 *   - Errores de negocio con payload estructurado → objeto:
 *       { tipo: "dado_de_baja", mensaje: "...", id_usuario: 12 }
 *       { tipo: "requiere_cambio_password", mensaje: "..." }
 *   - El resto → string plano.
 *
 * Antes se hacía `new Error(data.detail ?? 'fallback')` en ~66 lugares: cuando
 * el detail no era string, el usuario terminaba viendo "[object Object]" en
 * pantalla. Esto pasaba en CUALQUIER error de validación de formulario.
 */
export function textoError(detail, fallback = 'Ocurrió un error inesperado.') {
  if (detail == null) return fallback

  if (typeof detail === 'string') return detail.trim() || fallback

  // 422 de FastAPI: array de errores de validación
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((e) => {
        if (typeof e === 'string') return e
        const campo = Array.isArray(e?.loc)
          ? e.loc.filter((p) => p !== 'body' && p !== 'query').join('.')
          : null
        const msg = e?.msg ?? e?.message
        if (!msg) return null
        return campo ? `${campo}: ${msg}` : msg
      })
      .filter(Boolean)
    return msgs.length ? msgs.join(' · ') : fallback
  }

  if (typeof detail === 'object') {
    return detail.mensaje ?? detail.msg ?? detail.message ?? fallback
  }

  return fallback
}

/**
 * Azúcar para el caso más común: recibir la Response y devolver el texto ya
 * resuelto, tolerando cuerpos que no son JSON (502 de un proxy, HTML, vacío).
 *
 *   if (!res.ok) throw new Error(await mensajeDeRespuesta(res, 'No se pudo guardar.'))
 */
export async function mensajeDeRespuesta(res, fallback = 'Ocurrió un error inesperado.') {
  const body = await res.json().catch(() => null)
  if (body == null) {
    return res.status >= 500
      ? `Error del servidor (${res.status}). Probá de nuevo en un momento.`
      : fallback
  }
  return textoError(body.detail, fallback)
}
