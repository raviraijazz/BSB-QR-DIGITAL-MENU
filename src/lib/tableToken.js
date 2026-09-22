export function createQrToken() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '')
  }
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function sanitizeTableName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 80)
}

export function sanitizeTableNumber(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 32)
}

export function tableNumberKey(value) {
  return sanitizeTableNumber(value).toLowerCase()
}

export function tableHeading(table) {
  if (!table) return ''
  const number = sanitizeTableNumber(table.table_number)
  const name = sanitizeTableName(table.name)
  const numberLabel = number ? (/^table(\s|$)/i.test(number) ? number : `Table ${number}`) : ''
  if (
    numberLabel &&
    name &&
    tableNumberKey(name) !== tableNumberKey(number) &&
    tableNumberKey(name) !== tableNumberKey(numberLabel)
  ) {
    return `${numberLabel} • ${name}`
  }
  return numberLabel || name || 'Table'
}

export function nextTableNumber(tables) {
  const used = new Set(
    (tables || [])
      .map((item) => Number.parseInt(item.table_number, 10))
      .filter((value) => Number.isFinite(value) && value > 0),
  )
  let n = 1
  while (used.has(n)) n += 1
  return String(n)
}

export function fileSafeTableName(value) {
  const raw = sanitizeTableName(value) || 'table'
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'table'
}
