import { downloadCsv } from './csv'
import { downloadXlsx } from './xlsx'
import { QA_TABS, tabMeta } from './qaCatalog'

function fileSlug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'readiness'
}

function stamp() {
  return new Date().toISOString().slice(0, 10)
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

export function reportFilename(restaurant, ext) {
  return `system-readiness-${fileSlug(restaurant?.slug || restaurant?.name || 'restaurant')}-${stamp()}.${ext}`
}

const COLUMNS = [
  { key: 'tab', label: 'Tab', value: (row) => tabMeta(row.tab).label },
  { key: 'title', label: 'Check' },
  { key: 'severity', label: 'Severity' },
  { key: 'status', label: 'Status' },
  { key: 'message', label: 'Result' },
  { key: 'evidence', label: 'Evidence' },
]

export function downloadQaCsv(restaurant, results, summary) {
  const rows = [
    { tab: 'summary', title: 'Production gate', severity: '', status: summary?.gate?.id || '', message: summary?.gate?.label || '', evidence: summary?.gate?.detail || '' },
    { tab: 'summary', title: 'Score', severity: '', status: `${summary?.score ?? 0}%`, message: `pass ${summary?.counts?.pass || 0} / fail ${summary?.counts?.fail || 0} / warn ${summary?.counts?.warn || 0} / manual ${summary?.counts?.manual || 0}`, evidence: summary?.ranAt || '' },
    ...(results || []),
  ]
  downloadCsv(reportFilename(restaurant, 'csv'), COLUMNS, rows)
}

export function downloadQaXlsx(restaurant, results, summary) {
  const counts = summary?.counts || {}
  const summaryRows = [
    [{ value: restaurant?.name || 'Restaurant', kind: 'text' }],
    [{ value: 'System Readiness', kind: 'text' }],
    [{ value: summary?.gate?.label || '', kind: 'text' }, { value: summary?.gate?.detail || '', kind: 'text' }],
    [{ value: `Score ${summary?.score ?? 0}%`, kind: 'text' }],
    [{ value: `Pass ${counts.pass || 0}`, kind: 'text' }, { value: `Fail ${counts.fail || 0}`, kind: 'text' }, { value: `Warn ${counts.warn || 0}`, kind: 'text' }, { value: `Manual ${counts.manual || 0}`, kind: 'text' }],
    [],
    QA_TABS.map((tab) => ({ value: `${tab.label} ${summary?.byTab?.[tab.id]?.score ?? 0}%`, kind: 'text' })),
  ]
  const header = COLUMNS.map((col) => ({ value: col.label, kind: 'text' }))
  const body = (results || []).map((row) => COLUMNS.map((col) => ({
    value: typeof col.value === 'function' ? col.value(row) : row[col.key] || '',
    kind: 'text',
  })))
  downloadXlsx(reportFilename(restaurant, 'xlsx'), [
    {
      name: 'Summary',
      rows: summaryRows,
    },
    {
      name: 'Checks',
      rows: [header, ...body],
    },
  ])
}

export async function downloadQaPdf(restaurant, results, summary) {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const marginX = 12
  const footerY = pageH - 10
  let y = 16
  const counts = summary?.counts || {}

  function footer() {
    const page = pdf.internal.getNumberOfPages()
    pdf.setDrawColor(196, 165, 116)
    pdf.setLineWidth(0.2)
    pdf.line(marginX, footerY - 4, pageW - marginX, footerY - 4)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.setTextColor(120, 113, 108)
    pdf.text('BSB Digital Menu — System Readiness', marginX, footerY)
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
  pdf.text('System Readiness', marginX, y)
  y += 6
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  pdf.setTextColor(31, 61, 50)
  pdf.text(pdfText(`${summary?.gate?.label || 'Not run'}: ${summary?.gate?.detail || ''}`), marginX, y, { maxWidth: pageW - marginX * 2 })
  y += 8
  pdf.setTextColor(87, 83, 78)
  pdf.setFontSize(9)
  pdf.text(pdfText(`Score ${summary?.score ?? 0}%  Pass ${counts.pass || 0}  Fail ${counts.fail || 0}  Warn ${counts.warn || 0}  Manual ${counts.manual || 0}`), marginX, y)
  y += 5
  pdf.text(pdfText(summary?.ranAt ? `Run ${summary.ranAt}` : 'Not run yet'), marginX, y)
  y += 8

  for (const tab of QA_TABS) {
    const rows = (results || []).filter((row) => row.tab === tab.id)
    if (!rows.length) continue
    ensure(12)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(11)
    pdf.setTextColor(28, 25, 23)
    pdf.text(pdfText(`${tab.label} — ${summary?.byTab?.[tab.id]?.score ?? 0}%`), marginX, y)
    y += 6
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    for (const row of rows) {
      ensure(10)
      pdf.setTextColor(28, 25, 23)
      pdf.text(pdfText(`${String(row.status || '').toUpperCase()}  ${row.title}`), marginX, y, { maxWidth: pageW - marginX * 2 })
      y += 4
      pdf.setTextColor(87, 83, 78)
      pdf.text(pdfText(row.message || ''), marginX, y, { maxWidth: pageW - marginX * 2 })
      y += 5
    }
    y += 2
  }

  footer()
  pdf.save(reportFilename(restaurant, 'pdf'))
}
