// frontend/src/hooks/useExportarConvocatoria.js
/**
 * Hook `useExportarConvocatoria`
 *
 * Genera y descarga en el cliente un PDF con la lista de convocados para un
 * evento deportivo. No requiere ningún endpoint nuevo en el backend: toda la
 * información ya viene en el objeto `evento` que fetchea TecnicoEventos.jsx.
 *
 * Usa jsPDF cargado dinámicamente desde jsDelivr la primera vez que se llama
 * (CDN, ~200 KB gzip). Si la carga falla (sin internet, bloqueador, etc.),
 * el error queda en `errorExport` y el usuario ve un banner amarillo.
 *
 * Diseño del PDF:
 *   ┌──────────────────────────────────────────────────┐
 *   │  CLUB ATLÉTICO ROBERTS              [logo futuro] │
 *   │  ─────────────────────────────────────────────── │
 *   │  LISTA DE CONVOCADOS                             │
 *   │  Evento:    Partido vs San Pedro                 │
 *   │  Fecha:     sábado 12 de julio de 2025, 15:00    │
 *   │  Lugar:     Cancha principal                     │
 *   │  Categoría: Sub-15                               │
 *   │  ─────────────────────────────────────────────── │
 *   │  Nº  Apellido y Nombre          DNI      Estado  │
 *   │  1   García, Martín             30123456 Citado  │
 *   │  …                                               │
 *   │  ─────────────────────────────────────────────── │
 *   │  Espacio reservado para QR del evento [futuro]   │
 *   │  Firma del DT: _______________                   │
 *   │  Generado el dd/mm/yyyy por Club Atlético Roberts│
 *   └──────────────────────────────────────────────────┘
 *
 * Zona horaria: toda la fecha/hora se formatea con `toLocaleString('es-AR')`
 * usando la zona local del navegador — coherente con cómo el frontend ya
 * muestra las fechas en el resto de la app.
 * (El backend almacena UTC, pero el socio ve la hora local — son la misma
 * perspectiva que ve el técnico al imprimir la lista.)
 */

import { useState, useCallback, useRef } from 'react'

const JSPDF_CDN =
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'

const COLORES = {
  azulOscuro: [15, 30, 80],    // #0F1E50 — membrete
  azulMedio:  [30, 80, 160],   // #1E50A0 — encabezado tabla
  grisClaro:  [245, 246, 248], // #F5F6F8 — filas alternas
  grisTexto:  [80, 80, 90],    // texto secundario
  negro:      [20, 20, 20],
}

const ESTADOS_LABEL = {
  citado:     'Citado',
  confirmado: 'Confirmado',
  rechazado:  'Rechazado',
}

// ─── Función que carga jsPDF bajo demanda ─────────────────────────────────────

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
    script.onload  = () => {
      if (window.jspdf?.jsPDF) resolve(window.jspdf.jsPDF)
      else reject(new Error('jsPDF no se cargó correctamente.'))
    }
    script.onerror = () => reject(new Error('No se pudo cargar jsPDF desde la CDN.'))
    document.head.appendChild(script)
  })
  return jspdfPromise
}

// ─── Helpers de formato ────────────────────────────────────────────────────────

function formatFechaLarga(isoString) {
  if (!isoString) return '—'
  return new Date(isoString).toLocaleString('es-AR', {
    weekday: 'long',
    day:     'numeric',
    month:   'long',
    year:    'numeric',
    hour:    '2-digit',
    minute:  '2-digit',
  })
}

function formatFechaCorta(date) {
  return date.toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function sanitizar(str) {
  return String(str ?? '').trim()
}

// ─── Constructor del PDF ────────────────────────────────────────────────────────

function construirPDF(JsPDF, evento) {
  const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W  = doc.internal.pageSize.getWidth()
  const PL = 14          // padding left
  const PR = W - 14      // padding right
  let   y  = 14          // cursor vertical

  // ── Membrete ────────────────────────────────────────────────────────────────
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

  // Espacio reservado para logo (futuro: doc.addImage(...))
  doc.setDrawColor(100, 140, 200)
  doc.rect(PR - 18, 4, 16, 14)
  doc.setFontSize(6)
  doc.setTextColor(150, 170, 200)
  doc.text('LOGO', PR - 10, 12, { align: 'center' })

  y = 30

  // ── Título del documento ─────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...COLORES.negro)
  doc.text('LISTA DE CONVOCADOS', W / 2, y, { align: 'center' })
  y += 8

  // ── Datos del evento ─────────────────────────────────────────────────────────
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

  // ── Tabla de convocados ───────────────────────────────────────────────────────
  const convocados = [...(evento.convocatorias ?? [])].sort((a, b) =>
    sanitizar(a.usuario?.apellido).localeCompare(sanitizar(b.usuario?.apellido))
  )

  const COL = {
    num:    { x: PL,       w: 10  },
    nombre: { x: PL + 10,  w: 90  },
    dni:    { x: PL + 100, w: 40  },
    estado: { x: PL + 140, w: 50  },
  }
  const ROW_H = 7

  // Encabezado
  doc.setFillColor(...COLORES.azulMedio)
  doc.rect(PL, y - 5, PR - PL, ROW_H, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(255, 255, 255)
  doc.text('Nº',              COL.num.x + 1,    y)
  doc.text('Apellido y Nombre', COL.nombre.x,   y)
  doc.text('DNI',              COL.dni.x,        y)
  doc.text('Estado',           COL.estado.x,     y)
  y += ROW_H

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)

  convocados.forEach((conv, idx) => {
    // Salto de página si no entra una fila más
    if (y + ROW_H > 270) {
      doc.addPage()
      y = 20
    }

    // Fila alterna
    if (idx % 2 === 0) {
      doc.setFillColor(...COLORES.grisClaro)
      doc.rect(PL, y - 5, PR - PL, ROW_H, 'F')
    }

    doc.setTextColor(...COLORES.negro)
    const apellidoNombre = [conv.usuario?.apellido, conv.usuario?.nombre]
      .filter(Boolean).join(', ')

    doc.text(String(idx + 1),                          COL.num.x + 1,    y)
    doc.text(sanitizar(apellidoNombre) || '—',         COL.nombre.x,     y)
    doc.text(sanitizar(conv.usuario?.dni) || '—',      COL.dni.x,        y)
    doc.text(ESTADOS_LABEL[conv.estado] ?? conv.estado ?? '—', COL.estado.x, y)
    y += ROW_H
  })

  // Borde inferior de la tabla
  doc.setDrawColor(200, 210, 230)
  doc.line(PL, y, PR, y)
  y += 8

  // Resumen
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...COLORES.grisTexto)
  doc.text(`Total de convocados: ${convocados.length}`, PL, y)
  y += 10

  // ── Pie de página con firma y QR reservado ─────────────────────────────────
  if (y + 30 > 270) { doc.addPage(); y = 20 }

  doc.setDrawColor(200, 210, 230)
  doc.line(PL, y, PR, y)
  y += 8

  // Espacio para QR del evento (futuro)
  doc.setDrawColor(180, 200, 230)
  doc.setLineDash([1.5, 1.5], 0)
  doc.rect(PR - 32, y - 4, 30, 26)
  doc.setLineDash([], 0)
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(6.5)
  doc.setTextColor(160, 170, 190)
  doc.text('QR del evento', PR - 17, y + 7, { align: 'center' })
  doc.text('(próximamente)',  PR - 17, y + 13, { align: 'center' })

  // Firma
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...COLORES.negro)
  doc.text('Firma del Director Técnico:', PL, y + 5)
  doc.line(PL, y + 16, PL + 80, y + 16)
  doc.setFontSize(7)
  doc.setTextColor(...COLORES.grisTexto)
  doc.text('(Aclaración para portero del club visitante)', PL, y + 21)

  // Generado el
  const ahora = formatFechaCorta(new Date())
  doc.setFontSize(6.5)
  doc.setTextColor(160, 170, 190)
  doc.text(
    `Documento generado el ${ahora} — Club Atlético Roberts`,
    W / 2,
    285,
    { align: 'center' }
  )

  return doc
}

// ─── Hook exportado ────────────────────────────────────────────────────────────

export function useExportarConvocatoria() {
  const [exportando, setExportando]   = useState(false)
  const [errorExport, setErrorExport] = useState(null)
  const abortRef = useRef(false)

  const exportar = useCallback(async (evento) => {
    if (!evento) return
    if ((evento.convocatorias?.length ?? 0) === 0) {
      setErrorExport('Este evento no tiene convocados todavía.')
      return
    }

    setExportando(true)
    setErrorExport(null)
    abortRef.current = false

    try {
      const JsPDF = await cargarJsPDF()
      if (abortRef.current) return

      const doc      = construirPDF(JsPDF, evento)
      const titulo   = sanitizar(evento.titulo).replace(/\s+/g, '_').toLowerCase() || 'evento'
      const filename = `convocatoria_${titulo}.pdf`

      doc.save(filename)
    } catch (err) {
      if (!abortRef.current) {
        console.error('[useExportarConvocatoria]', err)
        setErrorExport(err.message ?? 'No se pudo generar el PDF.')
      }
    } finally {
      if (!abortRef.current) setExportando(false)
    }
  }, [])

  // Para cancelar si el componente se desmonta en medio de la carga del CDN
  const cancelar = useCallback(() => { abortRef.current = true }, [])

  return { exportar, exportando, errorExport, cancelar }
}