import { formatClock, formatQty, kotTypeLabel } from './orderCart'
import { tableHeading } from './tableToken'

export function kotItems(kot) {
  return kot?.kot_items || []
}

export function printKot({ restaurant, kot, table, waiter, order }) {
  if (!kot) return
  const items = kotItems(kot)
  const lines = items
    .map((item) => {
      const note = String(item.notes || '').trim()
      return `${formatQty(item.quantity)} x ${item.item_name}${note ? `\n   ${note}` : ''}`
    })
    .join('\n')
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>KOT ${kot.kot_number || ''}</title>
  <style>
    body { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; color: #1c1917; padding: 24px; }
    h1 { font-size: 18px; margin: 0 0 4px; letter-spacing: 0.12em; }
    p { margin: 0 0 4px; font-size: 13px; }
    hr { border: 0; border-top: 1px dashed #a8a29e; margin: 12px 0; }
    pre { margin: 0; font: inherit; white-space: pre-wrap; }
  </style>
</head>
<body>
  <h1>BSB KITCHEN</h1>
  <p>KOT #${kot.kot_number || ''}</p>
  <p>Table: ${table ? tableHeading(table) : '—'}</p>
  <p>Waiter: ${waiter?.waiter_id || waiter?.full_name || '—'}</p>
  <p>Time: ${formatClock(kot.created_at)}</p>
  <p>Type: ${kotTypeLabel(kot.kot_type)}</p>
  ${order?.order_number ? `<p>Order #${order.order_number}</p>` : ''}
  ${restaurant?.name ? `<p>${restaurant.name}</p>` : ''}
  <hr />
  <pre>${lines || 'No items'}</pre>
  <hr />
</body>
</html>`
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
  const run = () => {
    frame.contentWindow.focus()
    frame.contentWindow.print()
    setTimeout(() => {
      if (frame.parentNode) frame.parentNode.removeChild(frame)
    }, 500)
  }
  if (frame.contentWindow.document.readyState === 'complete') run()
  else frame.onload = run
}
