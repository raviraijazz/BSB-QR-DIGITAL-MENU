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

function tableSortValue(table) {
  const n = Number.parseInt(String(table?.table_number || table?.name || ''), 10)
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY
}

export function sortTables(tables) {
  return (tables || []).slice().sort((a, b) => {
    const diff = tableSortValue(a) - tableSortValue(b)
    if (diff) return diff
    return tableHeading(a).localeCompare(tableHeading(b))
  })
}

export function uniqueTables(tables) {
  const seen = new Set()
  const rows = []
  for (const table of tables || []) {
    if (!table?.id || seen.has(table.id)) continue
    seen.add(table.id)
    rows.push(table)
  }
  return sortTables(rows)
}

export function compactTableLabel(table) {
  if (!table) return ''
  const number = sanitizeTableNumber(table.table_number)
  if (number) return /^table(\s|$)/i.test(number) ? number.replace(/^table\s*/i, '') || number : number
  return sanitizeTableName(table.name) || 'Table'
}

export function sessionTablesLabel(tables, { compact = false } = {}) {
  const rows = uniqueTables(tables)
  if (!rows.length) return compact ? 'Table' : 'Table'
  if (rows.length === 1) return tableHeading(rows[0])
  if (compact) return `Tables ${rows.map((table) => compactTableLabel(table)).join(' + ')}`
  return rows.map((table) => tableHeading(table)).join(', ')
}

export function mergedTablesHint(tables) {
  const count = uniqueTables(tables).length
  if (count < 2) return ''
  return `Merged: ${count} tables`
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
