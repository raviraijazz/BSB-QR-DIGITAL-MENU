import QRCode from 'qrcode'

export const QUIET_ZONE = 4

export const LOGO_SCALE = {
  small: 0.14,
  medium: 0.18,
  large: 0.22,
}

export const FG_PRESETS = [
  { id: 'black', label: 'Black', value: '#1c1917' },
  { id: 'forest', label: 'Forest Green', value: '#1f3d32' },
  { id: 'blue', label: 'Dark Blue', value: '#1e3a5f' },
  { id: 'red', label: 'Dark Red', value: '#7f1d1d' },
  { id: 'brown', label: 'Brown', value: '#5c3d2e' },
  { id: 'custom', label: 'Custom', value: null },
]

export const BG_PRESETS = [
  { id: 'white', label: 'White', value: '#ffffff' },
  { id: 'cream', label: 'Cream', value: '#f6f1ea' },
  { id: 'custom', label: 'Custom', value: null },
]

export const QR_STYLES = [
  { id: 'square', label: 'Classic Square' },
  { id: 'rounded', label: 'Rounded' },
  { id: 'dots', label: 'Dots' },
]

export const PRINT_FORMATS = [
  { id: 'a4', label: 'A4 Poster', hint: 'Wall or standee print' },
  { id: 'tent', label: 'Table Tent', hint: 'Folded table card' },
  { id: 'counter', label: 'Counter QR', hint: 'Compact counter sign' },
  { id: 'simple', label: 'Simple QR', hint: 'Logo, code and name' },
]

export function createQrMatrix(url) {
  if (!url) return null
  const qr = QRCode.create(url, { errorCorrectionLevel: 'H' })
  const size = qr.modules.size
  const modules = []
  for (let y = 0; y < size; y += 1) {
    const row = []
    for (let x = 0; x < size; x += 1) {
      row.push(Boolean(qr.modules.get(y, x)))
    }
    modules.push(row)
  }
  return { size, modules, url }
}

function hexToRgb(hex) {
  const raw = String(hex || '').replace('#', '').trim()
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return { r: 0, g: 0, b: 0 }
  const n = parseInt(full, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function channel(c) {
  const v = c / 255
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

function luminance(hex) {
  const { r, g, b } = hexToRgb(hex)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrastRatio(fg, bg) {
  const a = luminance(fg)
  const b = luminance(bg)
  const hi = Math.max(a, b)
  const lo = Math.min(a, b)
  return (hi + 0.05) / (lo + 0.05)
}

export function contrastIssue(fg, bg) {
  if (luminance(fg) >= luminance(bg)) {
    return 'Use a dark QR color on a light background so the code stays scannable.'
  }
  if (contrastRatio(fg, bg) < 4.5) {
    return 'This color combination does not have enough contrast. Choose a darker QR color or a lighter background.'
  }
  return ''
}

function isFinder(x, y, size) {
  const inBox = (fx, fy) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7
  return inBox(0, 0) || inBox(size - 7, 0) || inBox(0, size - 7)
}

function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function paintModule(ctx, x, y, cell, style) {
  if (style === 'dots') {
    ctx.beginPath()
    ctx.arc(x + cell / 2, y + cell / 2, cell * 0.42, 0, Math.PI * 2)
    ctx.fill()
    return
  }
  if (style === 'rounded') {
    roundedRect(ctx, x + cell * 0.08, y + cell * 0.08, cell * 0.84, cell * 0.84, cell * 0.28)
    ctx.fill()
    return
  }
  ctx.fillRect(x, y, cell, cell)
}

function paintFinder(ctx, originX, originY, cell, fg, bg) {
  ctx.fillStyle = fg
  ctx.fillRect(originX, originY, 7 * cell, 7 * cell)
  ctx.fillStyle = bg
  ctx.fillRect(originX + cell, originY + cell, 5 * cell, 5 * cell)
  ctx.fillStyle = fg
  ctx.fillRect(originX + 2 * cell, originY + 2 * cell, 3 * cell, 3 * cell)
}

function paintQrModules(ctx, x, y, sizePx, { matrix, fg, bg, style }) {
  const moduleCount = matrix.size
  const n = moduleCount + QUIET_ZONE * 2
  const cell = sizePx / n

  ctx.fillStyle = bg
  ctx.fillRect(x, y, sizePx, sizePx)

  ctx.fillStyle = fg
  for (let my = 0; my < moduleCount; my += 1) {
    for (let mx = 0; mx < moduleCount; mx += 1) {
      if (!matrix.modules[my][mx] || isFinder(mx, my, moduleCount)) continue
      paintModule(
        ctx,
        x + (mx + QUIET_ZONE) * cell,
        y + (my + QUIET_ZONE) * cell,
        cell,
        style,
      )
    }
  }

  const finders = [
    [QUIET_ZONE, QUIET_ZONE],
    [QUIET_ZONE + moduleCount - 7, QUIET_ZONE],
    [QUIET_ZONE, QUIET_ZONE + moduleCount - 7],
  ]
  finders.forEach(([fx, fy]) => {
    paintFinder(ctx, x + fx * cell, y + fy * cell, cell, fg, bg)
  })
}

function paintLogo(ctx, x, y, sizePx, logoImg, logoSize, padColor = '#ffffff') {
  const frac = LOGO_SCALE[logoSize] || LOGO_SCALE.medium
  const box = sizePx * frac
  const pad = box * 0.14
  const left = x + (sizePx - box) / 2
  const top = y + (sizePx - box) / 2

  ctx.fillStyle = padColor
  roundedRect(ctx, left - pad, top - pad, box + pad * 2, box + pad * 2, pad)
  ctx.fill()

  ctx.save()
  roundedRect(ctx, left, top, box, box, pad * 0.5)
  ctx.clip()
  const scale = Math.min(box / logoImg.width, box / logoImg.height)
  const dw = logoImg.width * scale
  const dh = logoImg.height * scale
  ctx.drawImage(logoImg, left + (box - dw) / 2, top + (box - dh) / 2, dw, dh)
  ctx.restore()
}

export function paintQr(canvas, options) {
  const ctx = canvas.getContext('2d')
  const size = canvas.width
  ctx.clearRect(0, 0, size, size)
  paintQrModules(ctx, 0, 0, size, options)
  if (options.showLogo && options.logoImg) {
    paintLogo(ctx, 0, 0, size, options.logoImg, options.logoSize)
  }
}

export function createQrCanvas(pixelSize, options) {
  const canvas = document.createElement('canvas')
  canvas.width = pixelSize
  canvas.height = pixelSize
  paintQr(canvas, options)
  return canvas
}

function svgEsc(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

export function qrToSvg(matrix, { fg, bg, style, size = 1024, showLogo, logoDataUrl, logoSize }) {
  const moduleCount = matrix.size
  const n = moduleCount + QUIET_ZONE * 2
  const cell = size / n
  const parts = [`<rect width="${size}" height="${size}" fill="${svgEsc(bg)}"/>`]

  const finders = [
    [QUIET_ZONE, QUIET_ZONE],
    [QUIET_ZONE + moduleCount - 7, QUIET_ZONE],
    [QUIET_ZONE, QUIET_ZONE + moduleCount - 7],
  ]

  for (let my = 0; my < moduleCount; my += 1) {
    for (let mx = 0; mx < moduleCount; mx += 1) {
      if (!matrix.modules[my][mx] || isFinder(mx, my, moduleCount)) continue
      const x = (mx + QUIET_ZONE) * cell
      const y = (my + QUIET_ZONE) * cell
      if (style === 'dots') {
        parts.push(
          `<circle cx="${x + cell / 2}" cy="${y + cell / 2}" r="${cell * 0.42}" fill="${svgEsc(fg)}"/>`,
        )
      } else if (style === 'rounded') {
        parts.push(
          `<rect x="${x + cell * 0.08}" y="${y + cell * 0.08}" width="${cell * 0.84}" height="${cell * 0.84}" rx="${cell * 0.28}" fill="${svgEsc(fg)}"/>`,
        )
      } else {
        parts.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${svgEsc(fg)}"/>`)
      }
    }
  }

  finders.forEach(([fx, fy]) => {
    const x = fx * cell
    const y = fy * cell
    parts.push(`<rect x="${x}" y="${y}" width="${7 * cell}" height="${7 * cell}" fill="${svgEsc(fg)}"/>`)
    parts.push(`<rect x="${x + cell}" y="${y + cell}" width="${5 * cell}" height="${5 * cell}" fill="${svgEsc(bg)}"/>`)
    parts.push(`<rect x="${x + 2 * cell}" y="${y + 2 * cell}" width="${3 * cell}" height="${3 * cell}" fill="${svgEsc(fg)}"/>`)
  })

  if (showLogo && logoDataUrl) {
    const frac = LOGO_SCALE[logoSize] || LOGO_SCALE.medium
    const box = size * frac
    const pad = box * 0.14
    const left = (size - box) / 2
    const top = (size - box) / 2
    parts.push(
      `<rect x="${left - pad}" y="${top - pad}" width="${box + pad * 2}" height="${box + pad * 2}" rx="${pad}" fill="#ffffff"/>`,
    )
    parts.push(
      `<image href="${svgEsc(logoDataUrl)}" x="${left}" y="${top}" width="${box}" height="${box}" preserveAspectRatio="xMidYMid meet"/>`,
    )
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${parts.join('')}</svg>`
}

export function loadLogoImage(url) {
  return new Promise((resolve, reject) => {
    if (!url) {
      reject(new Error('No logo'))
      return
    }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load restaurant logo'))
    img.src = url
  })
}

export async function toDataUrl(url) {
  if (!url) return ''
  if (url.startsWith('data:')) return url
  const res = await fetch(url)
  if (!res.ok) return ''
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Could not read logo'))
    reader.readAsDataURL(blob)
  })
}

export function canvasToDataUrl(canvas) {
  try {
    return canvas.toDataURL('image/png')
  } catch {
    throw new Error('Could not export the QR image. Try turning the logo off, then download again.')
  }
}

export async function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('Could not create the PNG file.'))
      else resolve(blob)
    }, 'image/png')
  })
}

export function downloadDataUrl(filename, href) {
  const link = document.createElement('a')
  link.href = href
  link.download = filename
  link.click()
}

export function downloadTextFile(filename, text, type) {
  const blob = new Blob([text], { type })
  const href = URL.createObjectURL(blob)
  downloadDataUrl(filename, href)
  setTimeout(() => URL.revokeObjectURL(href), 1500)
}

function fitText(ctx, text, maxWidth, maxSize, minSize, weight, family) {
  let size = maxSize
  while (size > minSize) {
    ctx.font = `${weight} ${size}px ${family}`
    if (ctx.measureText(text).width <= maxWidth) return size
    size -= 2
  }
  return minSize
}

function containDraw(ctx, img, x, y, w, h) {
  const scale = Math.min(w / img.width, h / img.height)
  const dw = img.width * scale
  const dh = img.height * scale
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
}

export function renderPrintCanvas(format, { restaurantName, logoImg, matrix, fg, bg, style, showLogo, logoSize }) {
  const sizes = {
    a4: [1240, 1754],
    tent: [900, 1300],
    counter: [900, 1100],
    simple: [900, 1120],
  }
  const [width, height] = sizes[format] || sizes.simple
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  const paper = format === 'simple' ? '#ffffff' : '#f6f1ea'
  ctx.fillStyle = paper
  ctx.fillRect(0, 0, width, height)

  const name = restaurantName || 'Restaurant'
  const qrOptions = { matrix, fg, bg, style, showLogo: showLogo && Boolean(logoImg), logoImg, logoSize }

  if (format === 'a4') {
    roundedRect(ctx, 70, 70, width - 140, height - 140, 36)
    ctx.fillStyle = '#fffdf9'
    ctx.fill()
    ctx.strokeStyle = '#e7dfd4'
    ctx.lineWidth = 2
    ctx.stroke()

    if (logoImg) {
      containDraw(ctx, logoImg, width / 2 - 70, 120, 140, 140)
    }

    const nameSize = fitText(ctx, name, width - 240, 64, 28, '650', 'Fraunces, Georgia, serif')
    ctx.fillStyle = '#1c1917'
    ctx.font = `650 ${nameSize}px Fraunces, Georgia, serif`
    ctx.textAlign = 'center'
    ctx.fillText(name, width / 2, logoImg ? 310 : 220)

    const qrSize = 780
    const qrY = logoImg ? 360 : 280
    const qrCanvas = createQrCanvas(qrSize, qrOptions)
    ctx.drawImage(qrCanvas, (width - qrSize) / 2, qrY, qrSize, qrSize)

    ctx.fillStyle = '#1f3d32'
    ctx.font = '600 36px Outfit, sans-serif'
    ctx.fillText('Scan to View Menu', width / 2, qrY + qrSize + 70)
    ctx.fillStyle = '#78716c'
    ctx.font = '400 22px Outfit, sans-serif'
    ctx.fillText('Open your camera and point it at this code.', width / 2, qrY + qrSize + 112)
    return canvas
  }

  if (format === 'tent') {
    ctx.fillStyle = '#fffdf9'
    roundedRect(ctx, 48, 48, width - 96, height - 96, 28)
    ctx.fill()
    ctx.strokeStyle = '#e7dfd4'
    ctx.lineWidth = 2
    roundedRect(ctx, 48, 48, width - 96, height - 96, 28)
    ctx.stroke()

    if (logoImg) containDraw(ctx, logoImg, width / 2 - 56, 90, 112, 112)

    const nameSize = fitText(ctx, name, width - 180, 48, 24, '650', 'Fraunces, Georgia, serif')
    ctx.fillStyle = '#1c1917'
    ctx.textAlign = 'center'
    ctx.font = `650 ${nameSize}px Fraunces, Georgia, serif`
    ctx.fillText(name, width / 2, logoImg ? 250 : 170)

    const qrSize = 620
    const qrY = logoImg ? 290 : 220
    const qrCanvas = createQrCanvas(qrSize, qrOptions)
    ctx.drawImage(qrCanvas, (width - qrSize) / 2, qrY)
    ctx.fillStyle = '#1f3d32'
    ctx.font = '600 32px Outfit, sans-serif'
    ctx.fillText('Scan to View Menu', width / 2, qrY + qrSize + 64)
    ctx.fillStyle = '#78716c'
    ctx.font = '400 20px Outfit, sans-serif'
    ctx.fillText('Place this card on the table.', width / 2, qrY + qrSize + 100)
    return canvas
  }

  if (format === 'counter') {
    ctx.fillStyle = '#fffdf9'
    roundedRect(ctx, 40, 40, width - 80, height - 80, 24)
    ctx.fill()

    const nameSize = fitText(ctx, name, width - 160, 42, 22, '650', 'Fraunces, Georgia, serif')
    ctx.fillStyle = '#1c1917'
    ctx.textAlign = 'center'
    ctx.font = `650 ${nameSize}px Fraunces, Georgia, serif`
    ctx.fillText(name, width / 2, 130)

    const qrSize = 680
    const qrCanvas = createQrCanvas(qrSize, qrOptions)
    ctx.drawImage(qrCanvas, (width - qrSize) / 2, 170)
    ctx.fillStyle = '#1f3d32'
    ctx.font = '600 30px Outfit, sans-serif'
    ctx.fillText('Scan to View Menu', width / 2, 170 + qrSize + 60)
    return canvas
  }

  if (logoImg) containDraw(ctx, logoImg, width / 2 - 52, 70, 104, 104)
  const qrSize = 680
  const qrY = logoImg ? 200 : 120
  const qrCanvas = createQrCanvas(qrSize, qrOptions)
  ctx.drawImage(qrCanvas, (width - qrSize) / 2, qrY)
  const nameSize = fitText(ctx, name, width - 140, 40, 22, '650', 'Fraunces, Georgia, serif')
  ctx.fillStyle = '#1c1917'
  ctx.textAlign = 'center'
  ctx.font = `650 ${nameSize}px Fraunces, Georgia, serif`
  ctx.fillText(name, width / 2, qrY + qrSize + 70)
  return canvas
}

export async function downloadPrintPdf(format, canvas, filename) {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const img = canvasToDataUrl(canvas)
  const imgRatio = canvas.width / canvas.height

  let drawW
  let drawH
  let marginX
  let marginY

  if (format === 'a4') {
    drawW = pageW
    drawH = pageH
    marginX = 0
    marginY = 0
  } else {
    const maxW = pageW - 24
    const maxH = pageH - 24
    if (maxW / maxH > imgRatio) {
      drawH = maxH
      drawW = maxH * imgRatio
    } else {
      drawW = maxW
      drawH = maxW / imgRatio
    }
    marginX = (pageW - drawW) / 2
    marginY = (pageH - drawH) / 2
  }

  pdf.addImage(img, 'PNG', marginX, marginY, drawW, drawH)
  pdf.save(filename)
}

export async function downloadBrandedPdf({ name, url, qrCanvas, logoImg, filename }) {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const pageW = pdf.internal.pageSize.getWidth()

  pdf.setFillColor(246, 241, 234)
  pdf.rect(0, 0, pageW, 297, 'F')
  pdf.setFillColor(255, 253, 249)
  pdf.roundedRect(12, 12, pageW - 24, 273, 4, 4, 'F')

  let cursorY = 28
  if (logoImg) {
    const logoCanvas = document.createElement('canvas')
    logoCanvas.width = 256
    logoCanvas.height = 256
    const lctx = logoCanvas.getContext('2d')
    lctx.fillStyle = '#ffffff'
    lctx.fillRect(0, 0, 256, 256)
    containDraw(lctx, logoImg, 16, 16, 224, 224)
    pdf.addImage(canvasToDataUrl(logoCanvas), 'PNG', pageW / 2 - 14, cursorY, 28, 28)
    cursorY += 34
  }

  pdf.setTextColor(28, 25, 23)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(22)
  pdf.text(name || 'Restaurant', pageW / 2, cursorY + 8, { align: 'center', maxWidth: pageW - 40 })

  const qrSize = 118
  const qrY = cursorY + 18
  pdf.addImage(canvasToDataUrl(qrCanvas), 'PNG', (pageW - qrSize) / 2, qrY, qrSize, qrSize)

  pdf.setTextColor(31, 61, 50)
  pdf.setFontSize(16)
  pdf.text('Scan to View Menu', pageW / 2, qrY + qrSize + 14, { align: 'center' })

  pdf.setTextColor(120, 113, 108)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(11)
  pdf.text('Open your camera and point it at this code.', pageW / 2, qrY + qrSize + 22, { align: 'center' })
  pdf.setFontSize(9)
  pdf.text(url, pageW / 2, qrY + qrSize + 32, { align: 'center', maxWidth: pageW - 40 })

  pdf.save(filename)
}

export function downloadSafetyError({ url, matrix, contrastMessage }) {
  if (!url) return 'Your menu URL is missing. Finish restaurant setup first.'
  if (!matrix) return 'The QR code could not be generated. Refresh and try again.'
  if (contrastMessage) return contrastMessage
  return ''
}

export function whatsappShareUrl(menuLink) {
  const text = `View our digital menu:\n${menuLink}`
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}
