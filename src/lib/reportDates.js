export const REPORT_RANGE_PRESETS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'custom', label: 'Custom' },
]

export function tzOffsetMinutes(value = new Date()) {
  return -new Date(value).getTimezoneOffset()
}

export function startOfLocalDay(value = new Date()) {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

export function addDays(value, days) {
  const date = new Date(value)
  date.setDate(date.getDate() + days)
  return date
}

export function startOfWeek(value = new Date()) {
  const date = startOfLocalDay(value)
  const day = date.getDay()
  const diff = (day + 6) % 7
  return addDays(date, -diff)
}

export function startOfMonth(value = new Date()) {
  const date = startOfLocalDay(value)
  date.setDate(1)
  return date
}

export function localDateKey(value) {
  const date = new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseLocalDate(key) {
  const [year, month, day] = String(key || '').split('-').map(Number)
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return new Date()
  return new Date(year, month - 1, day)
}

function range(id, label, from, to) {
  return { id, label, from, to }
}

export function buildRange(preset, custom = {}) {
  const now = new Date()
  if (preset === 'yesterday') {
    const from = addDays(startOfLocalDay(now), -1)
    return range('yesterday', 'Yesterday', from, addDays(from, 1))
  }
  if (preset === 'week') {
    const from = startOfWeek(now)
    return range('week', 'This Week', from, addDays(startOfLocalDay(now), 1))
  }
  if (preset === 'month') {
    const from = startOfMonth(now)
    return range('month', 'This Month', from, addDays(startOfLocalDay(now), 1))
  }
  if (preset === 'custom') {
    const from = startOfLocalDay(custom.from ? parseLocalDate(custom.from) : now)
    const endDay = custom.to ? parseLocalDate(custom.to) : parseLocalDate(custom.from || localDateKey(now))
    const safeEnd = endDay < from ? from : endDay
    return range('custom', 'Custom', from, addDays(safeEnd, 1))
  }
  const from = startOfLocalDay(now)
  return range('today', 'Today', from, addDays(from, 1))
}

export function rangeParams(value) {
  return {
    fromISO: value.from.toISOString(),
    toISO: value.to.toISOString(),
    tzOffsetMinutes: tzOffsetMinutes(value.from),
  }
}

export function rangeDays(value) {
  return Math.max(1, Math.round((value.to.getTime() - value.from.getTime()) / 86400000))
}

function shortDate(date) {
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function rangeLabel(value) {
  const last = addDays(value.to, -1)
  if (localDateKey(value.from) === localDateKey(last)) return shortDate(value.from)
  return `${shortDate(value.from)} – ${shortDate(last)}`
}

export function formatReportDate(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return '—'
  }
}

export function formatReportTime(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
  } catch {
    return '—'
  }
}

export function formatReportDateTime(value) {
  if (!value) return '—'
  return `${formatReportDate(value)} · ${formatReportTime(value)}`
}

export function formatDayLabel(dayKey) {
  if (!dayKey) return '—'
  try {
    return parseLocalDate(dayKey).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  } catch {
    return String(dayKey)
  }
}

export function localDayKeyFromInstant(value, offsetMinutes = tzOffsetMinutes()) {
  const shifted = new Date(new Date(value).getTime() + Number(offsetMinutes || 0) * 60000)
  return shifted.toISOString().slice(0, 10)
}

export function localMonthKeyFromInstant(value, offsetMinutes = tzOffsetMinutes()) {
  return localDayKeyFromInstant(value, offsetMinutes).slice(0, 7)
}

export function formatMonthLabel(monthKey) {
  if (!monthKey) return '—'
  const [year, month] = String(monthKey).split('-').map(Number)
  if (!year || !month) return String(monthKey)
  return new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
}

export function hourLabel(hour) {
  const n = Number(hour)
  if (!Number.isFinite(n)) return '—'
  return `${String(n).padStart(2, '0')}:00`
}
