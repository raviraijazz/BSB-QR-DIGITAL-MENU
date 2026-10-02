function csvEscape(value) {
  const text = value == null ? '' : String(value)
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function toCsv(columns, rows) {
  const head = (columns || []).map((column) => csvEscape(column.label)).join(',')
  const body = (rows || [])
    .map((row) =>
      (columns || [])
        .map((column) => csvEscape(typeof column.value === 'function' ? column.value(row) : row?.[column.key]))
        .join(','),
    )
    .join('\n')
  return body ? `${head}\n${body}` : head
}

export function downloadCsv(filename, columns, rows) {
  const csv = `\ufeff${toCsv(columns, rows)}`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(href), 1500)
}
