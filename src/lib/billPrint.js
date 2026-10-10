import { jsPDF } from 'jspdf'
import { aggregateOrderItems, billBalance, calculateBill, restaurantTaxSettings } from './billing'
import { formatBillMoney, formatQty, paymentMethodLabel } from './orderCart'
import { billSnapshotRows, itemVariant } from './orderHistory'
import { defaultBill, formatMoneyPreview } from './restaurantSettings'
import { tableHeading } from './tableToken'
import { openPrintHtml } from './kotPrint'

export const BILL_TEMPLATES = [
  { id: 'thermal', label: 'Thermal Receipt' },
  { id: 'a5', label: 'A5 Bill' },
  { id: 'pdf', label: 'PDF Bill' },
]

export const BILL_FONT_SIZES = [
  { id: 'small', label: 'Small' },
  { id: 'normal', label: 'Normal' },
  { id: 'large', label: 'Large' },
]

export const BILL_ALIGNMENTS = [
  { id: 'left', label: 'Left' },
  { id: 'center', label: 'Center' },
  { id: 'right', label: 'Right' },
]

export function billFlags(settings) {
  return { ...defaultBill(), ...(settings?.bill || {}) }
}

export function skipAutoPrint(auto, settings) {
  return Boolean(auto) && billFlags(settings).autoPrintOnSettle === false
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
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

function fileSlug(value) {
  const cleaned = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned || 'bill'
}

function moneyText(value, currency = 'INR') {
  if (currency && currency !== 'INR') return formatMoneyPreview(value, currency)
  return formatBillMoney(value)
}

function paperWidthMm(paper) {
  if (paper === '58mm') return 48
  if (paper === 'a5') return 148
  if (paper === 'a4') return 140
  return 72
}

function fontPx(size) {
  if (size === 'small') return { title: 13, body: 11, meta: 10, note: 9 }
  if (size === 'large') return { title: 18, body: 14, meta: 13, note: 12 }
  return { title: 15, body: 12, meta: 11, note: 10 }
}

function formatStamp(value, timeZone) {
  if (!value) return { date: '', time: '' }
  try {
    const date = new Date(value)
    const options = timeZone ? { timeZone } : {}
    return {
      date: date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', ...options }),
      time: date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', ...options }),
    }
  } catch {
    return { date: '', time: '' }
  }
}

function splitItemName(item) {
  const raw = String(item.item_name || item.name || 'Item')
  const variant = String(item.variant_name || item.variant || itemVariant(item) || '').trim()
  if (variant) return { name: raw.replace(/\s+\([^)]+\)\s*$/, ''), variant }
  const match = raw.match(/^(.*)\s+\(([^)]+)\)\s*$/)
  if (match) return { name: match[1], variant: match[2] }
  return { name: raw, variant: '' }
}

export function billLineItems(orders) {
  const rows = []
  for (const order of orders || []) {
    if (order.status === 'cancelled') continue
    for (const item of order.order_items || []) {
      const split = splitItemName(item)
      rows.push({
        id: item.id,
        name: split.name,
        variant: split.variant,
        code: item.item_code || '',
        notes: String(item.notes || '').trim(),
        qty: Number(item.quantity) || 0,
        rate: Number(item.unit_price) || 0,
        amount: Number(item.line_total) || 0,
      })
    }
  }
  if (rows.length) return rows
  const aggregated = aggregateOrderItems(orders)
  return aggregated.rows.map((row, index) => ({
    id: `agg-${index}`,
    name: row.name,
    variant: '',
    code: '',
    notes: '',
    qty: row.qty,
    rate: row.rate,
    amount: row.amount,
  }))
}

export function sampleBillDocument(form) {
  const flags = billFlags(form)
  const items = [
    { id: '1', name: 'Veg Biryani', variant: 'Full', code: 'VB01', notes: 'Less spicy', qty: 1, rate: 240, amount: 240 },
    { id: '2', name: 'Paneer Tikka', variant: '', code: 'PT02', notes: '', qty: 1, rate: 250, amount: 250 },
  ]
  const subtotal = items.reduce((sum, item) => sum + item.amount, 0)
  const tax = restaurantTaxSettings({
    tax_enabled: form.tax_enabled,
    tax_mode: form.tax_mode,
    tax_rate: (form.taxRates || []).find((row) => row.is_enabled !== false)?.rate || 0,
    service_charge_rate: (form.serviceCharges || []).find((row) => row.is_enabled)?.value || 0,
  })
  const charge = (form.serviceCharges || []).find((row) => row.is_enabled)
  if (charge?.charge_type === 'fixed') tax.serviceRate = 0
  const totals = calculateBill({ subtotal, discountType: 'amount', discountValue: 40, tax })
  const service = charge?.charge_type === 'fixed' ? Number(charge.value) || 0 : totals.serviceCharge
  const payable = charge?.charge_type === 'fixed' ? totals.payable - totals.serviceCharge + service : totals.payable
  const payments = [
    { id: 'p1', payment_method: 'cash', amount: 200 },
    { id: 'p2', payment_method: 'upi', amount: Math.max(0, payable - 200) },
  ]
  const upi = (form.payments || []).find((row) => row.method === 'upi' && row.is_enabled)
  return {
    sample: true,
    flags,
    restaurantName: form.name || 'Restaurant',
    legalName: form.owner_name || '',
    address: form.address || 'Address',
    phone: form.phone || '',
    email: form.email || '',
    gstin: form.gstin || '',
    logoUrl: form.logo_url || '',
    currency: form.currency || 'INR',
    header: flags.header,
    footer: flags.footer,
    thankYou: flags.thankYou || form.thank_you_message || '',
    refundText: flags.refundText,
    billNumber: 'B002',
    dateLabel: '07 Oct 2026',
    timeLabel: '10:45 AM',
    tableLabel: 'Table 4',
    waiterLabel: 'Vijay Pandey',
    guestCount: 2,
    items,
    subtotal: totals.subtotal,
    discount: totals.discountAmount,
    taxable: totals.taxable,
    tax: totals.taxAmount,
    taxRate: totals.taxRate,
    taxLabel: totals.taxRate ? `GST (${totals.taxRate}%)` : 'Tax',
    cgst: totals.cgstAmount,
    sgst: totals.sgstAmount,
    service,
    payable,
    paid: payable,
    remaining: 0,
    payments,
    upiId: upi?.upi_id || '',
    upiName: upi?.display_name || '',
    reprint: false,
    template: flags.template || 'thermal',
    fontSize: flags.fontSize || 'normal',
    alignment: flags.alignment || 'center',
    paperWidth: '80mm',
  }
}

export function buildBillDocument({
  restaurant,
  settings,
  bill,
  orders,
  payments,
  table,
  tableLabel,
  waiter,
  reprint = false,
  paperWidth,
  template,
}) {
  const flags = billFlags(settings || restaurant)
  const stamp = formatStamp(bill?.updated_at || bill?.created_at || new Date().toISOString(), restaurant?.timezone || settings?.timezone)
  const stored = billSnapshotRows(bill, payments)
  const settled = bill?.status === 'paid'
  const remaining = settled ? 0 : stored.remaining
  const waiterName = waiter?.full_name && waiter?.waiter_id
    ? `${waiter.full_name} · ${waiter.waiter_id}`
    : waiter?.waiter_id || waiter?.full_name || ''
  const upi = (settings?.payments || restaurant?.payments || []).find((row) => row.method === 'upi' && row.is_enabled)
  const address = [settings?.address || restaurant?.address, settings?.city || restaurant?.city, settings?.state || restaurant?.state, settings?.pin || restaurant?.pin]
    .filter(Boolean)
    .join(', ')
  return {
    sample: false,
    flags,
    restaurantName: settings?.name || restaurant?.name || 'Restaurant',
    legalName: settings?.owner_name || restaurant?.owner_name || '',
    address,
    phone: settings?.phone || restaurant?.phone || '',
    email: settings?.email || restaurant?.email || '',
    gstin: settings?.gstin || restaurant?.gstin || '',
    logoUrl: settings?.logo_url || restaurant?.logo_url || '',
    currency: settings?.currency || restaurant?.currency || 'INR',
    header: flags.header,
    footer: flags.footer,
    thankYou: flags.thankYou || settings?.thank_you_message || restaurant?.thank_you_message || '',
    refundText: flags.refundText,
    billNumber: bill?.bill_number || '',
    dateLabel: stamp.date,
    timeLabel: stamp.time,
    tableLabel: tableLabel || (table ? tableHeading(table) : ''),
    waiterLabel: waiterName,
    guestCount: bill?.guest_count || restaurant?.guest_count || '',
    items: billLineItems(orders),
    subtotal: stored.subtotal,
    discount: stored.discount,
    taxable: stored.taxable,
    tax: stored.tax,
    taxRate: stored.taxLabel?.match(/(\d+)/)?.[1] || '',
    taxLabel: stored.taxLabel || 'Tax',
    cgst: Number(bill?.cgst_amount) || 0,
    sgst: Number(bill?.sgst_amount) || 0,
    service: stored.service,
    payable: stored.payable,
    paid: stored.paid,
    remaining,
    payments: payments || [],
    upiId: upi?.upi_id || '',
    upiName: upi?.display_name || '',
    reprint: Boolean(reprint),
    template: template || flags.template || 'thermal',
    fontSize: flags.fontSize || 'normal',
    alignment: flags.alignment || 'center',
    paperWidth: paperWidth || '80mm',
  }
}

function headerBlock(doc) {
  const flags = doc.flags
  const align = flags.alignment || 'center'
  const bits = []
  if (flags.showLogo && doc.logoUrl) bits.push(`<img class="logo" src="${escapeHtml(doc.logoUrl)}" alt="" />`)
  if (flags.showRestaurantName) bits.push(`<h1>${escapeHtml(doc.restaurantName)}</h1>`)
  if (flags.showLegalName && doc.legalName) bits.push(`<p class="sub">${escapeHtml(doc.legalName)}</p>`)
  if (doc.header) bits.push(`<p class="sub">${escapeHtml(doc.header)}</p>`)
  if (flags.showAddress && doc.address) bits.push(`<p class="sub">${escapeHtml(doc.address)}</p>`)
  if (flags.showPhone && doc.phone) bits.push(`<p class="sub">${escapeHtml(doc.phone)}</p>`)
  if (flags.showEmail && doc.email) bits.push(`<p class="sub">${escapeHtml(doc.email)}</p>`)
  if (flags.showGstin && doc.gstin) bits.push(`<p class="sub">GSTIN ${escapeHtml(doc.gstin)}</p>`)
  return `<div class="head" style="text-align:${align}">${bits.join('')}</div>`
}

function metaLines(doc) {
  const flags = doc.flags
  const lines = []
  if (flags.showBillNumber && doc.billNumber) lines.push(`Bill #${escapeHtml(doc.billNumber)}`)
  if (flags.showDateTime) lines.push([doc.dateLabel, doc.timeLabel].filter(Boolean).join(' · '))
  if (flags.showTable && doc.tableLabel) lines.push(`Table: ${escapeHtml(doc.tableLabel)}`)
  if (flags.showWaiter && doc.waiterLabel) lines.push(`Waiter: ${escapeHtml(doc.waiterLabel)}`)
  if (flags.showGuestCount && doc.guestCount) lines.push(`Guests: ${escapeHtml(doc.guestCount)}`)
  if (flags.showReprintLabel && doc.reprint) lines.push('REPRINT / DUPLICATE')
  if (doc.sample) lines.push('SAMPLE PREVIEW')
  return lines.filter(Boolean)
}

function itemRowsHtml(doc, wide) {
  const flags = doc.flags
  return (doc.items || []).map((item) => {
    const name = flags.showItemName ? item.name : 'Item'
    const variant = flags.showVariants && item.variant ? ` (${escapeHtml(item.variant)})` : ''
    const code = flags.showItemCode && item.code ? `<div class="note">#${escapeHtml(item.code)}</div>` : ''
    const notes = flags.showItemNotes && item.notes ? `<div class="note">${escapeHtml(item.notes)}</div>` : ''
    if (wide) {
      return `<tr>
        <td>${escapeHtml(name)}${variant}${code}${notes}</td>
        <td class="num">${formatQty(item.qty)}</td>
        <td class="num">${escapeHtml(moneyText(item.rate, doc.currency))}</td>
        <td class="num">${escapeHtml(moneyText(item.amount, doc.currency))}</td>
      </tr>`
    }
    return `<div class="item">
      <div class="row"><span>${escapeHtml(formatQty(item.qty))} x ${escapeHtml(name)}${variant}</span><span>${escapeHtml(moneyText(item.amount, doc.currency))}</span></div>
      ${code}${notes}
    </div>`
  }).join('')
}

function totalsHtml(doc) {
  const flags = doc.flags
  const money = (value) => escapeHtml(moneyText(value, doc.currency))
  const rows = [`<div class="row"><span>Subtotal</span><span>${money(doc.subtotal)}</span></div>`]
  if (flags.showDiscount) rows.push(`<div class="row"><span>Discount</span><span>${doc.discount ? `− ${money(doc.discount)}` : 'None'}</span></div>`)
  rows.push(`<div class="row"><span>Taxable Value</span><span>${money(doc.taxable)}</span></div>`)
  if (flags.showTax) {
    rows.push(`<div class="row"><span>${escapeHtml(doc.taxLabel || 'Tax')}</span><span>${doc.tax ? money(doc.tax) : 'None'}</span></div>`)
    if (flags.showTaxBreakdown && (doc.cgst || doc.sgst)) {
      rows.push(`<div class="row muted"><span>CGST</span><span>${money(doc.cgst)}</span></div>`)
      rows.push(`<div class="row muted"><span>SGST</span><span>${money(doc.sgst)}</span></div>`)
    }
  }
  if (flags.showServiceCharge) rows.push(`<div class="row"><span>Service Charge</span><span>${doc.service ? money(doc.service) : 'None'}</span></div>`)
  rows.push(`<div class="row strong"><span>Grand Total</span><span>${money(doc.payable)}</span></div>`)
  rows.push(`<div class="row"><span>Paid</span><span>${money(doc.paid)}</span></div>`)
  rows.push(`<div class="row"><span>Remaining</span><span>${money(doc.remaining)}</span></div>`)
  return rows.join('')
}

function paymentsHtml(doc) {
  const flags = doc.flags
  if (!flags.showPaymentMethod && !flags.showSplitPayments && !flags.showUpiInfo) return ''
  const money = (value) => escapeHtml(moneyText(value, doc.currency))
  const rows = []
  if (flags.showSplitPayments && (doc.payments || []).length > 1) {
    rows.push('<p class="meta">Payment Details</p>')
    for (const payment of doc.payments) {
      rows.push(`<div class="row"><span>${escapeHtml(paymentMethodLabel(payment.payment_method))}</span><span>${money(payment.amount)}</span></div>`)
    }
    rows.push(`<div class="row strong"><span>Total Paid</span><span>${money(doc.paid)}</span></div>`)
  } else if (flags.showPaymentMethod && (doc.payments || []).length) {
    const labels = [...new Set(doc.payments.map((row) => paymentMethodLabel(row.payment_method)))]
    rows.push(`<p class="meta">Paid: ${escapeHtml(labels.join(' + '))}</p>`)
  }
  if (flags.showUpiInfo && doc.upiId) {
    rows.push(`<p class="meta">UPI ${escapeHtml(doc.upiName || doc.upiId)}</p>`)
  }
  return rows.join('')
}

export function buildBillTicketHtml(doc, mode = 'thermal') {
  const flags = doc.flags || billFlags()
  const wide = mode === 'a5' || mode === 'pdf'
  const width = wide ? 148 : paperWidthMm(doc.paperWidth)
  const fonts = fontPx(flags.fontSize)
  const items = wide
    ? `<table class="items"><thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amt</th></tr></thead><tbody>${itemRowsHtml(doc, true)}</tbody></table>`
    : itemRowsHtml(doc, false)
  const title = wide ? 'TAX INVOICE' : 'RECEIPT'
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Bill ${escapeHtml(doc.billNumber || '')}</title>
  <style>
    @page { margin: ${wide ? '10mm' : '6mm'}; size: ${wide ? 'A5' : `${width}mm auto`}; }
    body { font-family: ui-sans-serif, system-ui, sans-serif; color: #1c1917; margin: 0; padding: ${wide ? '12px' : '8px'}; width: ${width}mm; font-size: ${fonts.body}px; }
    h1 { font-size: ${fonts.title}px; margin: 0 0 2px; }
    h2 { font-size: ${fonts.body}px; margin: 8px 0 4px; letter-spacing: 0.12em; text-align: center; }
    .sub, .meta, .note, .muted { font-size: ${fonts.note}px; margin: 0 0 2px; color: #57534e; }
    .logo { display: block; height: ${wide ? 36 : 28}px; margin: 0 auto 6px; }
    hr { border: 0; border-top: 1px dashed #a8a29e; margin: 8px 0; }
    .row { display: flex; justify-content: space-between; gap: 8px; margin: 0 0 3px; }
    .strong { font-weight: 700; }
    .item { margin: 0 0 6px; }
    table.items { width: 100%; border-collapse: collapse; font-size: ${fonts.body}px; }
    table.items th, table.items td { text-align: left; padding: 4px 0; border-bottom: 1px dashed #d6d3d1; }
    table.items .num, table.items th:nth-child(n+2) { text-align: right; }
    .foot { text-align: center; font-size: ${fonts.note}px; margin-top: 10px; }
  </style>
</head>
<body>
  ${headerBlock(doc)}
  <h2>${title}</h2>
  ${metaLines(doc).map((line) => `<p class="meta">${line}</p>`).join('')}
  <hr />
  ${items || '<p class="meta">No items</p>'}
  <hr />
  ${totalsHtml(doc)}
  <hr />
  ${paymentsHtml(doc)}
  ${flags.showFooter && (doc.footer || doc.thankYou) ? `<p class="foot">${escapeHtml(doc.footer || doc.thankYou)}</p>` : ''}
  ${doc.refundText ? `<p class="foot">${escapeHtml(doc.refundText)}</p>` : ''}
</body>
</html>`
}

export async function printBillDocument(doc, mode = 'thermal') {
  const html = buildBillTicketHtml(doc, mode === 'pdf' ? 'a5' : mode)
  return openPrintHtml(html)
}

function wrapPdf(pdf, text, width) {
  return pdf.splitTextToSize(pdfText(text || ''), width)
}

export async function downloadBillPdf(doc) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'portrait' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 12
  const width = pageW - margin * 2
  let y = 14
  const flags = doc.flags || billFlags()
  const money = (value) => pdfText(moneyText(value, doc.currency))

  function line(text, opts = {}) {
    const size = opts.size || 10
    pdf.setFont('helvetica', opts.bold ? 'bold' : 'normal')
    pdf.setFontSize(size)
    pdf.setTextColor(opts.muted ? 87 : 28, opts.muted ? 83 : 25, opts.muted ? 78 : 23)
    const rows = wrapPdf(pdf, text, width)
    pdf.text(rows, opts.right ? pageW - margin : margin, y, { align: opts.right ? 'right' : (opts.align || 'left') })
    y += rows.length * (size * 0.4) + 1.2
  }

  function pair(left, right, bold = false) {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal')
    pdf.setFontSize(10)
    pdf.setTextColor(28, 25, 23)
    pdf.text(pdfText(left), margin, y)
    pdf.text(money(right).replace(/^Rs /, 'Rs '), pageW - margin, y, { align: 'right' })
    y += 5
  }

  if (flags.showRestaurantName) line(doc.restaurantName, { size: 14, bold: true, align: flags.alignment })
  if (flags.showLegalName && doc.legalName) line(doc.legalName, { size: 9, muted: true, align: flags.alignment })
  if (doc.header) line(doc.header, { size: 9, muted: true, align: flags.alignment })
  if (flags.showAddress && doc.address) line(doc.address, { size: 9, muted: true, align: flags.alignment })
  if (flags.showPhone && doc.phone) line(doc.phone, { size: 9, muted: true, align: flags.alignment })
  if (flags.showEmail && doc.email) line(doc.email, { size: 9, muted: true, align: flags.alignment })
  if (flags.showGstin && doc.gstin) line(`GSTIN ${doc.gstin}`, { size: 9, muted: true, align: flags.alignment })
  y += 2
  line('TAX INVOICE', { size: 11, bold: true, align: 'center' })
  if (flags.showReprintLabel && doc.reprint) line('REPRINT / DUPLICATE', { size: 9, muted: true, align: 'center' })
  if (doc.sample) line('SAMPLE PREVIEW', { size: 9, muted: true, align: 'center' })
  for (const meta of metaLines(doc).filter((item) => item !== 'REPRINT / DUPLICATE' && item !== 'SAMPLE PREVIEW')) {
    line(meta, { size: 9, muted: true })
  }
  y += 2
  pdf.setDrawColor(168, 162, 158)
  pdf.line(margin, y, pageW - margin, y)
  y += 6
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9)
  pdf.text('Item', margin, y)
  pdf.text('Qty', margin + width * 0.55, y)
  pdf.text('Rate', margin + width * 0.7, y)
  pdf.text('Amt', pageW - margin, y, { align: 'right' })
  y += 5
  pdf.setFont('helvetica', 'normal')
  for (const item of doc.items || []) {
    if (y > pageH - 28) {
      pdf.addPage()
      y = 14
    }
    const name = `${flags.showItemName ? item.name : 'Item'}${flags.showVariants && item.variant ? ` (${item.variant})` : ''}`
    const nameRows = wrapPdf(pdf, name, width * 0.52)
    pdf.text(nameRows, margin, y)
    pdf.text(String(formatQty(item.qty)), margin + width * 0.55, y)
    pdf.text(money(item.rate), margin + width * 0.7, y)
    pdf.text(money(item.amount), pageW - margin, y, { align: 'right' })
    y += Math.max(5, nameRows.length * 4)
    if (flags.showItemNotes && item.notes) {
      pdf.setFontSize(8)
      pdf.setTextColor(87, 83, 78)
      pdf.text(pdfText(item.notes), margin, y)
      pdf.setFontSize(9)
      pdf.setTextColor(28, 25, 23)
      y += 4
    }
  }
  y += 2
  pdf.line(margin, y, pageW - margin, y)
  y += 6
  pair('Subtotal', doc.subtotal)
  if (flags.showDiscount) pair('Discount', doc.discount)
  pair('Taxable Value', doc.taxable)
  if (flags.showTax) pair(doc.taxLabel || 'Tax', doc.tax)
  if (flags.showTax && flags.showTaxBreakdown && (doc.cgst || doc.sgst)) {
    pair('CGST', doc.cgst)
    pair('SGST', doc.sgst)
  }
  if (flags.showServiceCharge) pair('Service Charge', doc.service)
  pair('Grand Total', doc.payable, true)
  pair('Paid', doc.paid)
  pair('Remaining', doc.remaining)
  if (flags.showSplitPayments && (doc.payments || []).length > 1) {
    y += 2
    line('Payment Details', { size: 10, bold: true })
    for (const payment of doc.payments) pair(paymentMethodLabel(payment.payment_method), payment.amount)
  } else if (flags.showPaymentMethod && (doc.payments || []).length) {
    line(`Paid: ${[...new Set(doc.payments.map((row) => paymentMethodLabel(row.payment_method)))].join(' + ')}`, { size: 9, muted: true })
  }
  if (flags.showUpiInfo && doc.upiId) line(`UPI ${doc.upiName || doc.upiId}`, { size: 9, muted: true })
  if (flags.showFooter && (doc.footer || doc.thankYou)) {
    y += 4
    line(doc.footer || doc.thankYou, { size: 9, muted: true, align: 'center' })
  }
  if (doc.refundText) line(doc.refundText, { size: 8, muted: true, align: 'center' })
  const filename = `${fileSlug(doc.restaurantName)}-bill-${fileSlug(doc.billNumber || 'preview')}.pdf`
  pdf.save(filename)
  return filename
}

export async function shareBillText(doc) {
  const money = (value) => moneyText(value, doc.currency)
  const lines = [
    doc.restaurantName,
    doc.billNumber ? `Bill #${doc.billNumber}` : '',
    doc.tableLabel ? `Table: ${doc.tableLabel}` : '',
    `Grand Total: ${money(doc.payable)}`,
    `Paid: ${money(doc.paid)}`,
    doc.thankYou || doc.footer || '',
  ].filter(Boolean)
  const text = lines.join('\n')
  if (navigator.share) {
    try {
      await navigator.share({ title: `${doc.restaurantName} bill`, text })
      return { shared: true, error: null }
    } catch (error) {
      if (error?.name === 'AbortError') return { shared: false, error: null }
    }
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return { shared: false, copied: true, error: null }
    }
  } catch {
    /* ignore */
  }
  return { shared: false, copied: false, error: { message: 'Sharing is not available in this browser.' } }
}

export { billBalance }
