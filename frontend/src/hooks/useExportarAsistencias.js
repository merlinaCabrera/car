// frontend/src/hooks/useExportarAsistencias.js
/**
 * Hook `useExportarAsistencias`
 *
 * Genera y descarga en el cliente un PDF con la planilla de presentismo real
 * de un evento (quién ingresó de verdad por la puerta, no quién estaba
 * convocado). A diferencia de `useExportarConvocatoria` — donde los datos ya
 * vienen embebidos en el objeto `evento` que fetchea TecnicoEventos.jsx —
 * acá la lista de asistencias NO está precargada: se pide en el momento a
 * GET /deportivo/eventos/{id_evento}/asistencias, porque cargarla para todos
 * los eventos de la lista de antemano sería un fetch por evento sin uso real
 * (la mayoría de las exportaciones se hacen una sola vez, después del cierre).
 *
 * Reusa el mismo jsPDF cargado por CDN (misma promesa cacheada si
 * useExportarConvocatoria ya se usó antes en la sesión).
 *
 * Diseño del PDF (mismo membrete/pie que la convocatoria, tabla distinta):
 *   ┌──────────────────────────────────────────────────────────┐
 *   │  CLUB ATLÉTICO ROBERTS                      [logo futuro] │
 *   │  ────────────────────────────────────────────────────── │
 *   │  PLANILLA DE ASISTENCIA                                  │
 *   │  Evento:    Partido vs San Pedro                         │
 *   │  Fecha:     sábado 12 de julio de 2025, 15:00            │
 *   │  Lugar:     Cancha principal                             │
 *   │  Categoría: Sub-15                                       │
 *   │  ────────────────────────────────────────────────────── │
 *   │  Nº Apellido y Nombre    DNI     Ingreso  Método Estado  │
 *   │  1  García, Martín       30123456 15:02   QR     Al día  │
 *   │  …                                                        │
 *   │  ────────────────────────────────────────────────────── │
 *   │  Total de ingresos: N                                    │
 *   │  Firma del DT: _______________                           │
 *   │  Generado el dd/mm/yyyy por Club Atlético Roberts        │
 *   └──────────────────────────────────────────────────────────┘
 */

import { useState, useCallback, useRef } from 'react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const JSPDF_CDN =
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'

const COLORES = {
  azulOscuro: [15, 30, 80],
  azulMedio:  [30, 80, 160],
  grisClaro:  [245, 246, 248],
  grisTexto:  [80, 80, 90],
  negro:      [20, 20, 20],
  verde:      [22, 130, 80],
  rojo:       [180, 40, 40],
}

const ESTADO_FINANCIERO_LABEL = {
  al_dia: 'Al día',
  moroso: 'Moroso',
}

const METODO_LABEL = {
  QR:  'QR',
  DNI: 'DNI (manual)',
}

// ─── Carga de jsPDF (cacheada — la comparte con useExportarConvocatoria si
// ya se disparó antes en la misma sesión, porque ambos usan el mismo CDN) ──

let jspdfPromise = null

function cargarJsPDF() {
  if (jspdfPromise) return jspdfPromise
  jspdfPromise = new Promise((resolve, reject) => {
    if (window.jspdf?.jsPDF) {
      resolve(window.jspdf.jsPDF)
      return
    }
    const script = document.createElement('script')
    script.src = JSPDF_CDN
    script.onload = () => {
      if (window.jspdf?.jsPDF) resolve(window.jspdf.jsPDF)
      else reject(new Error('jsPDF no se cargó correctamente.'))
    }
    script.onerror = () => reject(new Error('No se pudo cargar jsPDF desde la CDN.'))
    document.head.appendChild(script)
  })
  return jspdfPromise
}

// ─── Helpers de formato ──────────────────────────────────────────────────────

function formatFechaLarga(isoString) {
  if (!isoString) return '—'
  return new Date(isoString).toLocaleString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatHora(isoString) {
  if (!isoString) return '—'
  return new Date(isoString).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

function formatFechaCorta(date) {
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function sanitizar(str) {
  return String(str ?? '').trim()
}

// ─── Constructor del PDF ─────────────────────────────────────────────────────

function construirPDF(JsPDF, evento, asistencias) {
  const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W  = doc.internal.pageSize.getWidth()
  const PL = 14
  const PR = W - 14
  let   y  = 14

  // ── Membrete ────────────────────────────────────────────────────────────
  doc.setFillColor(...COLORES.azulOscuro)
  doc.rect(0, 0, W, 22, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(255, 255, 255)
  doc.text('CLUB ATLÉTICO ROBERTS', PL, y + 6)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(180, 200, 230)
  doc.text('www.clubatleticoroberts.com.ar', PL, y + 12)

  doc.setDrawColor(100, 140, 200)
  doc.rect(PR - 18, 4, 16, 14)
  doc.setFontSize(6)
  doc.setTextColor(150, 170, 200)
  doc.text('LOGO', PR - 10, 12, { align: 'center' })

  y = 30

  // ── Título ──────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...COLORES.negro)
  doc.text('PLANILLA DE ASISTENCIA', W / 2, y, { align: 'center' })
  y += 8

  // ── Datos del evento ────────────────────────────────────────────────────
  doc.setDrawColor(200, 210, 230)
  doc.setLineWidth(0.3)
  doc.line(PL, y, PR, y)
  y += 6

  const camposEvento = [
    ['Evento',    sanitizar(evento.titulo)],
    ['Fecha',     formatFechaLarga(evento.fecha_inicio)],
    ['Lugar',     sanitizar(evento.ubicacion) || '(a confirmar)'],
    ['Categoría', sanitizar(evento.categoria?.nombre) || 'General'],
  ]

  doc.setFontSize(9)
  for (const [label, valor] of camposEvento) {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...COLORES.azulOscuro)
    doc.text(`${label}:`, PL, y)

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...COLORES.negro)
    doc.text(valor, PL + 28, y)
    y += 6
  }

  y += 2
  doc.line(PL, y, PR, y)
  y += 8

  // ── Tabla de asistencias ────────────────────────────────────────────────
  const filas = [...asistencias].sort((a, b) =>
    sanitizar(a.usuario?.apellido).localeCompare(sanitizar(b.usuario?.apellido))
  )

  const COL = {
    num:     { x: PL,       w: 8  },
    nombre:  { x: PL + 8,   w: 62 },
    dni:     { x: PL + 70,  w: 30 },
    ingreso: { x: PL + 100, w: 22 },
    metodo:  { x: PL + 122, w: 30 },
    estado:  { x: PL + 152, w: 30 },
  }
  const ROW_H = 7

  doc.setFillColor(...COLORES.azulMedio)
  doc.rect(PL, y - 5, PR - PL, ROW_H, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(255, 255, 255)
  doc.text('Nº',                 COL.num.x + 1,     y)
  doc.text('Apellido y Nombre',  COL.nombre.x,      y)
  doc.text('DNI',                COL.dni.x,         y)
  doc.text('Ingreso',            COL.ingreso.x,     y)
  doc.text('Método',             COL.metodo.x,      y)
  doc.text('Estado',             COL.estado.x,      y)
  y += ROW_H

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)

  filas.forEach((asis, idx) => {
    if (y + ROW_H > 270) {
      doc.addPage()
      y = 20
    }

    if (idx % 2 === 0) {
      doc.setFillColor(...COLORES.grisClaro)
      doc.rect(PL, y - 5, PR - PL, ROW_H, 'F')
    }

    const apellidoNombre = [asis.usuario?.apellido, asis.usuario?.nombre]
      .filter(Boolean).join(', ')
    const esMoroso = asis.estado_financiero_snapshot === 'moroso'

    doc.setTextColor(...COLORES.negro)
    doc.text(String(idx + 1),                     COL.num.x + 1,     y)
    doc.text(sanitizar(apellidoNombre) || '—',    COL.nombre.x,      y)
    doc.text(sanitizar(asis.usuario?.dni) || '—', COL.dni.x,         y)
    doc.text(formatHora(asis.fecha_hora_ingreso), COL.ingreso.x,     y)
    doc.text(METODO_LABEL[asis.metodo] ?? asis.metodo ?? '—', COL.metodo.x, y)

    doc.setTextColor(...(esMoroso ? COLORES.rojo : COLORES.verde))
    doc.text(ESTADO_FINANCIERO_LABEL[asis.estado_financiero_snapshot] ?? asis.estado_financiero_snapshot ?? '—', COL.estado.x, y)

    y += ROW_H
  })

  doc.setDrawColor(200, 210, 230)
  doc.line(PL, y, PR, y)
  y += 8

  // ── Resumen ─────────────────────────────────────────────────────────────
  const morosos = filas.filter(a => a.estado_financiero_snapshot === 'moroso').length
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...COLORES.grisTexto)
  doc.text(`Total de ingresos: ${filas.length}${morosos > 0 ? `  (${morosos} moroso${morosos !== 1 ? 's' : ''})` : ''}`, PL, y)
  y += 10

  // ── Pie de página ───────────────────────────────────────────────────────
  if (y + 30 > 270) { doc.addPage(); y = 20 }

  doc.setDrawColor(200, 210, 230)
  doc.line(PL, y, PR, y)
  y += 8

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...COLORES.negro)
  doc.text('Firma del Director Técnico:', PL, y + 5)
  doc.line(PL, y + 16, PL + 80, y + 16)
  doc.setFontSize(7)
  doc.setTextColor(...COLORES.grisTexto)
  doc.text('(Aclaración / sello del club)', PL, y + 21)

  const ahora = formatFechaCorta(new Date())
  doc.setFontSize(6.5)
  doc.setTextColor(160, 170, 190)
  doc.text(
    `Documento generado el ${ahora} — Club Atlético Roberts`,
    W / 2, 285, { align: 'center' }
  )

  return doc
}

// ─── Hook exportado ──────────────────────────────────────────────────────────

export function useExportarAsistencias(token) {
  const [exportando, setExportando]   = useState(false)
  const [errorExport, setErrorExport] = useState(null)
  const abortRef = useRef(false)

  const exportar = useCallback(async (evento) => {
    if (!evento) return
    setExportando(true)
    setErrorExport(null)
    abortRef.current = false

    try {
      const res = await fetch(`${API}/deportivo/eventos/${evento.id_evento}/asistencias`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? 'No se pudo obtener la planilla de asistencia.')
      }
      const asistencias = await res.json()
      if (abortRef.current) return

      if (asistencias.length === 0) {
        setErrorExport('Este evento todavía no tiene ningún ingreso registrado.')
        return
      }

      const JsPDF = await cargarJsPDF()
      if (abortRef.current) return

      const doc      = construirPDF(JsPDF, evento, asistencias)
      const titulo   = sanitizar(evento.titulo).replace(/\s+/g, '_').toLowerCase() || 'evento'
      const filename = `asistencia_${titulo}.pdf`

      doc.save(filename)
    } catch (err) {
      if (!abortRef.current) {
        console.error('[useExportarAsistencias]', err)
        setErrorExport(err.message ?? 'No se pudo generar el PDF.')
      }
    } finally {
      if (!abortRef.current) setExportando(false)
    }
  }, [token])

  const cancelar = useCallback(() => { abortRef.current = true }, [])

  return { exportar, exportando, errorExport, cancelar }
}