import { downloadCsv } from './csv'
import { COLUMN_DEFS, MEASURES, GROUP_OPTIONS, reportMeta } from './analyticsCatalog'
import { cellText, formatMeasure, groupedRowValues } from './analyticsEngine'
import { downloadXlsx } from './xlsx'
import { rangeLabel } from './reportDates'

function fileSlug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'report'
}

function pdfText(value) {
  return String(value ?? '')
    .replace(/₹/g, 'Rs ')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, (ch) => {
      if (ch === '’' || ch === '‘') return "'"
      if (ch === '“' || ch === '”') return '"'
      if (ch === '–' || ch === '—') return '-'
      return ch
    })
}

export function exportFilename(restaurant, reportType, range, ext) {
  const slug = fileSlug(restaurant?.slug || restaurant?.name || 'restaurant')
  const type = fileSlug(reportType || 'report')
  const from = range?.from ? range.from.toISOString().slice(0, 10) : 'from'
  const to = range?.to ? new Date(range.to.getTime() - 86400000).toISOString().slice(0, 10) : 'to'
  return `${type}-${slug}-${from}-${to}.${ext}`
}

function listColumns(config) {
  if (config.groups?.length) {
    const groupCols = config.groups.map((id) => GROUP_OPTIONS.find((row) => row.id === id)).filter(Boolean)
    const measureCols = (config.measures || []).map((id) => MEASURES.find((row) => row.id === id)).filter(Boolean)
    return [...groupCols, ...measureCols]
  }
  return (config.columns || []).map((id) => COLUMN_DEFS[id]).filter(Boolean)
}

export function exportTable(analytics, config) {
  const cols = listColumns(config)
  if (config.groups?.length) {
    const rows = analytics.grouped.map((row) => groupedRowValues(row, config.groups))
    return {
      columns: cols.map((col) => ({
        id: col.id,
        label: col.label,
        kind: col.kind || (MEASURES.find((row) => row.id === col.id)?.kind) || 'text',
        value: (row) => (col.kind === 'money' || MEASURES.some((item) => item.id === col.id && item.kind === 'money')
          ? formatMeasure(col.id, row[col.id])
          : row[col.id] ?? ''),
      })),
      rows,
    }
  }
  return {
    columns: cols.map((col) => ({
      id: col.id,
      label: col.label,
      kind: col.kind,
      value: (row) => cellText(col.id, row),
    })),
    rows: analytics.facts,
  }
}

export function downloadReportCsv(restaurant, range, analytics, config) {
  const table = exportTable(analytics, config)
  downloadCsv(exportFilename(restaurant, config.reportType, range, 'csv'), table.columns, table.rows)
  return table.rows.length
}

export function downloadReportXlsx(restaurant, range, analytics, config) {
  const table = exportTable(analytics, config)
  const header = table.columns.map((col) => ({ value: col.label, kind: 'text' }))
  const body = table.rows.map((row) =>
    table.columns.map((col) => {
      const raw = typeof col.value === 'function' ? col.value(row) : row[col.id]
      const kind = col.kind === 'money' || col.kind === 'count' ? 'number' : 'text'
      const value = kind === 'number' ? Number(String(raw).replace(/,/g, '')) : raw
      return { value: Number.isFinite(value) && kind === 'number' ? value : raw, kind }
    }),
  )
  const summary = Object.entries(analytics.totals || {}).filter(([key]) => (config.measures || []).includes(key))
  downloadXlsx(exportFilename(restaurant, config.reportType, range, 'xlsx'), [
    {
      name: reportMeta(config.reportType).label.slice(0, 31),
      rows: [
        [{ value: restaurant?.name || 'Restaurant', kind: 'text' }],
        [{ value: reportMeta(config.reportType).label, kind: 'text' }],
        [{ value: rangeLabel(range), kind: 'text' }],
        [],
        header,
        ...body,
        [],
        ...summary.map(([key, value]) => [
          { value: MEASURES.find((row) => row.id === key)?.label || key, kind: 'text' },
          { value, kind: 'number' },
        ]),
      ],
    },
  ])
  return table.rows.length
}

export async function downloadReportPdf(restaurant, range, analytics, config) {
  const { jsPDF } = await import('jspdf')
  const table = exportTable(analytics, config)
  const landscape = table.columns.length > 6
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: landscape ? 'landscape' : 'portrait' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const marginX = 12
  const footerY = pageH - 10
  let y = 16

  function footer() {
    const page = pdf.internal.getNumberOfPages()
    pdf.setDrawColor(196, 165, 116)
    pdf.setLineWidth(0.2)
    pdf.line(marginX, footerY - 4, pageW - marginX, footerY - 4)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.setTextColor(120, 113, 108)
    pdf.text('Powered by BSB Digital Menu', marginX, footerY)
    pdf.text(`Page ${page}`, pageW - marginX, footerY, { align: 'right' })
  }

  function ensure(space) {
    if (y + space < footerY - 6) return
    footer()
    pdf.addPage()
    y = 16
  }

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(16)
  pdf.setTextColor(28, 25, 23)
  pdf.text(pdfText(restaurant?.name || 'Restaurant'), marginX, y)
  y += 7
  pdf.setFontSize(12)
  pdf.text(pdfText(reportMeta(config.reportType).label), marginX, y)
  y += 6
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(87, 83, 78)
  pdf.text(pdfText(rangeLabel(range)), marginX, y)
  y += 8

  const measures = config.measures || []
  if (measures.length) {
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(28, 25, 23)
    pdf.text('Summary', marginX, y)
    y += 5
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    for (const id of measures) {
      ensure(5)
      const label = MEASURES.find((row) => row.id === id)?.label || id
      pdf.text(`${pdfText(label)}: ${pdfText(formatMeasure(id, analytics.totals?.[id]))}`, marginX, y)
      y += 5
    }
    y += 3
  }

  const colW = (pageW - marginX * 2) / Math.max(table.columns.length, 1)
  function paintHeader() {
    pdf.setFillColor(245, 240, 230)
    pdf.rect(marginX, y - 4, pageW - marginX * 2, 7, 'F')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(7.5)
    pdf.setTextColor(87, 83, 78)
    table.columns.forEach((col, index) => {
      pdf.text(pdfText(col.label), marginX + index * colW + 1, y, { maxWidth: colW - 2 })
    })
    y += 6
  }

  ensure(12)
  paintHeader()
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7.5)
  pdf.setTextColor(28, 25, 23)

  for (const row of table.rows.slice(0, 400)) {
    ensure(8)
    if (y < 22) paintHeader()
    table.columns.forEach((col, index) => {
      const value = typeof col.value === 'function' ? col.value(row) : row[col.id]
      const align = col.kind === 'money' || col.kind === 'count' ? { align: 'right' } : {}
      const x = align.align === 'right' ? marginX + (index + 1) * colW - 1 : marginX + index * colW + 1
      pdf.text(pdfText(value), x, y, { maxWidth: colW - 2, ...align })
    })
    y += 5
  }

  footer()
  pdf.save(exportFilename(restaurant, config.reportType, range, 'pdf'))
  return table.rows.length
}

export function printReport(restaurant, range, analytics, config) {
  const table = exportTable(analytics, config)
  const title = `${restaurant?.name || 'Restaurant'} · ${reportMeta(config.reportType).label}`
  const rowsHtml = table.rows
    .map(
      (row) =>
        `<tr>${table.columns
          .map((col) => `<td>${String(typeof col.value === 'function' ? col.value(row) : row[col.id] ?? '').replace(/</g, '&lt;')}</td>`)
          .join('')}</tr>`,
    )
    .join('')
  const summaryHtml = (config.measures || [])
    .map((id) => `<div><strong>${MEASURES.find((row) => row.id === id)?.label || id}:</strong> ${formatMeasure(id, analytics.totals?.[id])}</div>`)
    .join('')
  const html = `<!DOCTYPE html><html><head><title>${title}</title><style>
    body{font-family:ui-sans-serif,system-ui,sans-serif;color:#1c1917;padding:24px;background:#faf7f2}
    h1{font-size:22px;margin:0 0 4px}p{margin:0 0 16px;color:#57534e}
    table{width:100%;border-collapse:collapse;font-size:12px;background:#fff}
    th,td{border:1px solid #e7e0d6;padding:6px 8px;text-align:left}
    th{background:#f5f0e6;font-size:11px;text-transform:uppercase;letter-spacing:.06em}
    .sum{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px}
    @media print{body{padding:0;background:#fff}}
  </style></head><body>
    <h1>${title.replace(/</g, '&lt;')}</h1>
    <p>${rangeLabel(range)}</p>
    <div class="sum">${summaryHtml}</div>
    <table><thead><tr>${table.columns.map((col) => `<th>${col.label}</th>`).join('')}</tr></thead>
    <tbody>${rowsHtml || '<tr><td colspan="99">No rows</td></tr>'}</tbody></table>
  </body></html>`
  const frame = document.createElement('iframe')
  frame.style.position = 'fixed'
  frame.style.right = '0'
  frame.style.bottom = '0'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'
  document.body.appendChild(frame)
  const doc = frame.contentDocument
  doc.open()
  doc.write(html)
  doc.close()
  setTimeout(() => {
    frame.contentWindow.focus()
    frame.contentWindow.print()
    setTimeout(() => frame.remove(), 1500)
  }, 250)
  return table.rows.length
}

export function whatsappShareUrl(restaurant, range, analytics, config) {
  const title = reportMeta(config.reportType).label
  const lines = [
    restaurant?.name || 'Restaurant',
    title,
    rangeLabel(range),
    '',
    ...(config.measures || []).map((id) => `${MEASURES.find((row) => row.id === id)?.label || id}: ${formatMeasure(id, analytics.totals?.[id])}`),
    '',
    'Summary text only. Download Excel, CSV or PDF from Collections to share the full table.',
  ]
  return `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`
}
