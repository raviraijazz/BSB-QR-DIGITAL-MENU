import { normalizeFoodType } from './foodType'
import { menuVariantRows } from './pricing'

function fileSlug(value) {
  const cleaned = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned || 'restaurant'
}

function pdfText(value) {
  return String(value || '')
    .replace(/₹/g, 'Rs ')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, (ch) => {
      if (ch === '’' || ch === '‘') return "'"
      if (ch === '“' || ch === '”') return '"'
      if (ch === '–' || ch === '—') return '-'
      return ch
    })
}

function groupedMenu(categories, items) {
  return (categories || [])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((category) => ({
      ...category,
      items: (items || [])
        .filter((item) => item.category_id === category.id)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    }))
    .filter((category) => category.items.length > 0)
}

function loadImage(url) {
  return new Promise((resolve) => {
    if (!url) {
      resolve(null)
      return
    }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

function imagePng(img, max = 256) {
  const ratio = img.width / (img.height || 1)
  let w = max
  let h = max
  if (ratio > 1) h = max / ratio
  else w = max * ratio
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w))
  canvas.height = Math.max(1, Math.round(h))
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return { data: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height }
}

function variantLine(item) {
  const rows = menuVariantRows(item)
  if (rows.length === 1 && !rows[0].name) {
    return [{ left: '', right: pdfText(rows[0].label), muted: item.is_available === false }]
  }
  return rows.map((row) => ({
    left: pdfText(row.name),
    right: pdfText(row.label),
    muted: row.is_available === false || item.is_available === false,
  }))
}

export function canBuildMenuPdf(items) {
  return Array.isArray(items) && items.length > 0
}

export async function downloadMenuPdf({ restaurant, categories, items }) {
  const groups = groupedMenu(categories, items)
  if (groups.length === 0) {
    throw new Error('Add menu items before generating your PDF.')
  }

  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const marginX = 16
  const marginTop = 16
  const footerY = pageH - 12
  const contentW = pageW - marginX * 2
  const name = pdfText(restaurant?.name || 'Restaurant')
  const filename = `${fileSlug(restaurant?.slug || restaurant?.name)}-menu.pdf`

  let logo = null
  const logoImg = await loadImage(restaurant?.logo_url)
  if (logoImg) {
    try {
      const png = imagePng(logoImg)
      const maxW = 22
      const maxH = 16
      const ratio = png.w / png.h
      let w = maxW
      let h = w / ratio
      if (h > maxH) {
        h = maxH
        w = h * ratio
      }
      logo = { data: png.data, w, h }
    } catch {
      logo = null
    }
  }

  function paintFooter() {
    const page = pdf.internal.getNumberOfPages()
    pdf.setDrawColor(196, 165, 116)
    pdf.setLineWidth(0.2)
    pdf.line(marginX, footerY - 5, pageW - marginX, footerY - 5)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.setTextColor(120, 113, 108)
    pdf.text('Powered by BSB Digital Menu', marginX, footerY)
    pdf.text(`Page ${page}`, pageW - marginX, footerY, { align: 'right' })
  }

  function newPage() {
    paintFooter()
    pdf.addPage()
    pdf.setFillColor(255, 253, 249)
    pdf.rect(0, 0, pageW, pageH, 'F')
    return marginTop
  }

  pdf.setFillColor(255, 253, 249)
  pdf.rect(0, 0, pageW, pageH, 'F')

  let y = marginTop
  if (logo) {
    pdf.addImage(logo.data, 'PNG', (pageW - logo.w) / 2, y, logo.w, logo.h)
    y += logo.h + 5
  }

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(20)
  pdf.setTextColor(28, 25, 23)
  const nameLines = pdf.splitTextToSize(name, contentW)
  pdf.text(nameLines, pageW / 2, y + 6, { align: 'center' })
  y += nameLines.length * 8 + 2

  pdf.setFont('times', 'italic')
  pdf.setFontSize(12)
  pdf.setTextColor(31, 61, 50)
  pdf.text('Menu', pageW / 2, y + 4, { align: 'center' })
  y += 8

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(120, 113, 108)
  if (restaurant?.address) {
    const addressLines = pdf.splitTextToSize(pdfText(restaurant.address), contentW)
    pdf.text(addressLines, pageW / 2, y, { align: 'center' })
    y += addressLines.length * 4.2 + 1
  }
  if (restaurant?.phone) {
    pdf.text(pdfText(restaurant.phone), pageW / 2, y, { align: 'center' })
    y += 5
  }

  pdf.setDrawColor(196, 165, 116)
  pdf.setLineWidth(0.35)
  pdf.line(marginX + 18, y + 1, pageW - marginX - 18, y + 1)
  y += 8

  const bottom = footerY - 10

  function ensureSpace(needed) {
    if (y + needed <= bottom) return
    y = newPage()
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(11)
    pdf.setTextColor(31, 61, 50)
    pdf.text(name, marginX, y + 4)
    pdf.setFont('times', 'italic')
    pdf.setFontSize(10)
    pdf.text('Menu', pageW - marginX, y + 4, { align: 'right' })
    y += 10
    pdf.setDrawColor(196, 165, 116)
    pdf.setLineWidth(0.25)
    pdf.line(marginX, y, pageW - marginX, y)
    y += 7
  }

  function drawMark(x, cy, veg) {
    const color = veg ? [21, 128, 61] : [154, 52, 18]
    pdf.setDrawColor(...color)
    pdf.setFillColor(...color)
    pdf.setLineWidth(0.35)
    pdf.roundedRect(x, cy - 2.2, 4.4, 4.4, 0.4, 0.4, 'S')
    pdf.circle(x + 2.2, cy, 1.15, 'F')
  }

  groups.forEach((category, categoryIndex) => {
    const heading = pdfText(category.name).toUpperCase()
    const headingLines = pdf.splitTextToSize(heading, contentW)
    ensureSpace(12 + headingLines.length * 5)
    if (categoryIndex > 0) y += 2
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(12)
    pdf.setTextColor(31, 61, 50)
    pdf.text(headingLines, marginX, y)
    y += headingLines.length * 5 + 1
    pdf.setDrawColor(31, 61, 50)
    pdf.setLineWidth(0.3)
    pdf.line(marginX, y, marginX + 28, y)
    y += 5

    category.items.forEach((item) => {
      const veg = normalizeFoodType(item.food_type) === 'veg'
      const itemName = pdfText(item.name || '')
      const description = pdfText(String(item.description || '').trim())
      const prices = variantLine(item)
      const soldOut = item.is_available === false
      const nameMax = contentW - 38
      const nameLines = pdf.splitTextToSize(itemName, nameMax)
      const descLines = description ? pdf.splitTextToSize(description, contentW - 8) : []
      const single = prices.length === 1 && !prices[0].left
      let needed = 3 + nameLines.length * 4.4
      if (descLines.length) needed += descLines.length * 3.8 + 0.6
      if (!single) needed += prices.length * 4.2 + 1
      if (soldOut) needed += 4.2
      needed += 3.5
      ensureSpace(needed)

      const nameY = y + 3.4
      drawMark(marginX, nameY - 1.2, veg)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(10.5)
      pdf.setTextColor(28, 25, 23)
      pdf.text(nameLines, marginX + 7, nameY)
      if (single) {
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(10)
        pdf.text(prices[0].right, pageW - marginX, nameY, { align: 'right' })
      }
      y = nameY + (nameLines.length - 1) * 4.4 + 1.2

      if (descLines.length) {
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(8.5)
        pdf.setTextColor(120, 113, 108)
        pdf.text(descLines, marginX + 7, y + 3.4)
        y += descLines.length * 3.8 + 0.8
      }

      if (!single) {
        prices.forEach((row) => {
          pdf.setFont('helvetica', 'normal')
          pdf.setFontSize(9)
          pdf.setTextColor(row.muted ? 120 : 28, row.muted ? 113 : 25, row.muted ? 108 : 23)
          const label = row.muted ? `${row.left}  Sold out` : row.left
          pdf.text(label, marginX + 7, y + 3.6)
          pdf.setFont('helvetica', 'bold')
          pdf.text(row.right, pageW - marginX, y + 3.6, { align: 'right' })
          y += 4.2
        })
      }

      if (soldOut) {
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(7.5)
        pdf.setTextColor(120, 113, 108)
        pdf.text('SOLD OUT', marginX + 7, y + 3.4)
        y += 4.4
      }

      y += 2.2
      pdf.setDrawColor(231, 223, 212)
      pdf.setLineWidth(0.2)
      pdf.line(marginX, y, pageW - marginX, y)
      y += 3.2
    })
  })

  const total = pdf.internal.getNumberOfPages()
  for (let i = 1; i <= total; i += 1) {
    pdf.setPage(i)
    const page = i
    pdf.setDrawColor(196, 165, 116)
    pdf.setLineWidth(0.2)
    pdf.line(marginX, footerY - 5, pageW - marginX, footerY - 5)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.setTextColor(120, 113, 108)
    pdf.text('Powered by BSB Digital Menu', marginX, footerY)
    pdf.text(`Page ${page} of ${total}`, pageW - marginX, footerY, { align: 'right' })
  }

  pdf.save(filename)
  return filename
}
