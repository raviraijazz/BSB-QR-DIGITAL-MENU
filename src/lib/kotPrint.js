import { formatClock, formatQty, kotTypeLabel } from './orderCart'
import { tableHeading } from './tableToken'
import { defaultKot } from './restaurantSettings'
import { orderTypeLabel } from './printerRouting'

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function kotItems(kot) {
  return kot?.kot_items || []
}

function paperWidthMm(paper) {
  if (paper === '58mm') return 48
  if (paper === 'a4') return 140
  return 72
}

function kotFlags(settings) {
  return { ...defaultKot(), ...(settings?.kot || {}) }
}

function itemDisplay(item, flags) {
  const raw = String(item.item_name || 'Item')
  const variant = String(item.variant_name || '').trim()
  let name = raw
  let shownVariant = variant
  if (!shownVariant) {
    const match = raw.match(/^(.*)\s+\(([^)]+)\)\s*$/)
    if (match) {
      name = match[1]
      shownVariant = match[2]
    }
  }
  const parts = []
  if (flags.showQuantity) parts.push(`${formatQty(item.quantity)} x`)
  if (flags.showItemName) parts.push(name)
  else parts.push('Item')
  if (flags.showVariant && shownVariant) parts.push(`(${shownVariant})`)
  return {
    line: parts.join(' '),
    code: flags.showItemCode && item.item_code ? String(item.item_code) : '',
    notes: flags.showNotes ? String(item.notes || '').trim() : '',
  }
}

export function buildKotTicketHtml({
  restaurant,
  kot,
  items,
  table,
  tableLabel,
  waiter,
  order,
  printer,
  settings,
  reprint = false,
}) {
  const flags = kotFlags(settings)
  const resolvedTable = tableLabel || (table ? tableHeading(table) : '—')
  const rows = (items && items.length ? items : kotItems(kot)).map((item) => itemDisplay(item, flags))
  const width = paperWidthMm(printer?.paper_width)
  const waiterName = waiter?.full_name && waiter?.waiter_id
    ? `${waiter.full_name} · ${waiter.waiter_id}`
    : waiter?.waiter_id || waiter?.full_name || '—'
  const orderType = orderTypeLabel(order?.order_type || settings?.orders?.defaultOrderType || 'dine_in')
  const addon = flags.showAddonLabel && kot?.kot_type === 'add_on'
  const reprintLabel = flags.showReprintLabel && reprint
  const logo = flags.showLogo ? (restaurant?.logo_url || settings?.logo_url || '') : ''
  const headerBits = [
    flags.showKotNumber ? `KOT #${escapeHtml(kot?.kot_number || '')}` : '',
    reprintLabel ? 'REPRINT' : '',
    addon ? 'ADD-ON' : '',
  ].filter(Boolean)

  const meta = []
  if (flags.showTable) meta.push(`Table: ${escapeHtml(resolvedTable)}`)
  if (flags.showWaiter) meta.push(`Waiter: ${escapeHtml(waiterName)}`)
  if (flags.showOrderTime) meta.push(`Time: ${escapeHtml(formatClock(kot?.created_at || order?.created_at))}`)
  if (flags.showOrderType) meta.push(`Type: ${escapeHtml(orderType)}`)
  if (flags.showCustomerName) meta.push('Guest: Walk-in')
  if (order?.order_number) meta.push(`Order #${escapeHtml(order.order_number)}`)
  if (printer?.name) meta.push(`Printer: ${escapeHtml(printer.name)}`)

  const itemHtml = rows.length
    ? rows
      .map((row) => {
        const extra = [
          row.code ? `<div class="note">#${escapeHtml(row.code)}</div>` : '',
          row.notes ? `<div class="note">${escapeHtml(row.notes)}</div>` : '',
        ].join('')
        return `<div class="item"><div>${escapeHtml(row.line)}</div>${extra}</div>`
      })
      .join('')
    : '<div class="item">No items</div>'

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>KOT ${escapeHtml(kot?.kot_number || '')}</title>
  <style>
    @page { margin: 6mm; size: ${width}mm auto; }
    body { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; color: #1c1917; margin: 0; padding: 8px; width: ${width}mm; }
    h1 { font-size: 13px; margin: 0 0 2px; letter-spacing: 0.14em; text-align: center; }
    .sub { text-align: center; font-size: 11px; margin: 0 0 2px; }
    .meta { font-size: 12px; margin: 0 0 3px; }
    hr { border: 0; border-top: 1px dashed #a8a29e; margin: 8px 0; }
    .item { font-size: 13px; margin: 0 0 6px; }
    .note { font-size: 11px; margin-top: 2px; }
    .logo { display: block; height: 28px; margin: 0 auto 6px; }
    .foot { text-align: center; font-size: 11px; margin-top: 8px; }
  </style>
</head>
<body>
  ${logo ? `<img class="logo" src="${escapeHtml(logo)}" alt="" />` : ''}
  ${flags.showRestaurantName ? `<h1>${escapeHtml(restaurant?.name || settings?.name || 'KITCHEN')}</h1>` : '<h1>KITCHEN ORDER</h1>'}
  ${flags.header ? `<p class="sub">${escapeHtml(flags.header)}</p>` : ''}
  <p class="sub">KITCHEN ORDER</p>
  ${headerBits.length ? `<p class="sub">${headerBits.join(' · ')}</p>` : ''}
  ${kot?.kot_type && !addon ? `<p class="sub">${escapeHtml(kotTypeLabel(kot.kot_type))}</p>` : ''}
  <hr />
  ${meta.map((line) => `<p class="meta">${line}</p>`).join('')}
  <hr />
  ${itemHtml}
  <hr />
  ${flags.footer ? `<p class="foot">${escapeHtml(flags.footer)}</p>` : ''}
</body>
</html>`
}

export function openPrintHtml(html) {
  return new Promise((resolve, reject) => {
    try {
      const frame = document.createElement('iframe')
      frame.setAttribute('aria-hidden', 'true')
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
      const cleanup = () => {
        if (frame.parentNode) frame.parentNode.removeChild(frame)
      }
      const run = () => {
        try {
          frame.contentWindow.focus()
          frame.contentWindow.print()
          window.setTimeout(() => {
            cleanup()
            resolve(true)
          }, 400)
        } catch (error) {
          cleanup()
          reject(error)
        }
      }
      if (frame.contentWindow.document.readyState === 'complete') run()
      else frame.onload = run
    } catch (error) {
      reject(error)
    }
  })
}

export async function printKotTickets(tickets) {
  const results = []
  for (const ticket of tickets || []) {
    try {
      await openPrintHtml(ticket.html)
      results.push({ ...ticket, ok: true, error: null })
    } catch (error) {
      results.push({ ...ticket, ok: false, error })
    }
  }
  return results
}

export function printKot({ restaurant, kot, table, tableLabel, waiter, order, items, printer, settings, reprint }) {
  if (!kot) return Promise.resolve(false)
  const html = buildKotTicketHtml({
    restaurant,
    kot,
    items,
    table,
    tableLabel,
    waiter,
    order,
    printer,
    settings,
    reprint,
  })
  return openPrintHtml(html)
}
