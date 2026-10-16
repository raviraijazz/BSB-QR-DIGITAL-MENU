// Pure helpers for founder-only menu import. No Supabase imports so they can be
// unit tested with plain node.

export const IMPORT_FIELDS = [
  { key: 'name', label: 'Item name', required: true },
  { key: 'category', label: 'Category', required: true },
  { key: 'price', label: 'Price', required: true },
  { key: 'description', label: 'Description', required: false },
  { key: 'food_type', label: 'Veg / Non-veg', required: false },
  { key: 'is_available', label: 'Available', required: false },
  { key: 'image_url', label: 'Image URL', required: false },
]

export function parseCsvText(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  const source = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]
    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((cell) => String(cell).trim() !== ''))
}

const HEADER_HINTS = {
  name: ['name', 'item', 'item name', 'dish', 'product', 'title'],
  category: ['category', 'cat', 'section', 'group'],
  price: ['price', 'rate', 'amount', 'mrp', 'cost'],
  description: ['description', 'desc', 'details', 'about'],
  food_type: ['food type', 'food_type', 'type', 'veg', 'veg/non-veg', 'foodtype'],
  is_available: ['available', 'availability', 'is_available', 'in stock', 'status'],
  image_url: ['image', 'image url', 'image_url', 'photo', 'img'],
}

export function guessMapping(headers) {
  const mapping = {}
  const lowered = (headers || []).map((h) => String(h || '').trim().toLowerCase())
  for (const field of IMPORT_FIELDS) {
    const hints = HEADER_HINTS[field.key] || []
    let found = -1
    for (const hint of hints) {
      const idx = lowered.findIndex((h) => h === hint)
      if (idx !== -1) {
        found = idx
        break
      }
    }
    if (found === -1) {
      for (const hint of hints) {
        const idx = lowered.findIndex((h) => h.includes(hint))
        if (idx !== -1) {
          found = idx
          break
        }
      }
    }
    mapping[field.key] = found
  }
  return mapping
}

function parsePrice(raw) {
  const cleaned = String(raw ?? '').replace(/[^0-9.-]/g, '')
  if (cleaned === '') return NaN
  return Number(cleaned)
}

function parseBool(raw) {
  const value = String(raw ?? '').trim().toLowerCase()
  if (['', '1', 'true', 'yes', 'y', 'available'].includes(value)) return true
  if (['0', 'false', 'no', 'n', 'out of stock', 'sold'].includes(value)) return false
  return true
}

function parseFoodType(raw) {
  const value = String(raw ?? '').trim().toLowerCase().replace(/[\s-]/g, '')
  if (value.startsWith('non') || value === 'nonveg' || value === 'meat' || value === 'egg') return 'non_veg'
  return 'veg'
}

// Build rows from the grid using a column mapping. Returns { rows, errors }.
export function buildRows(grid, mapping, { headerRow = 0, defaultCategory = '' } = {}) {
  const errors = []
  const rows = []
  const dataRows = (grid || []).slice(headerRow + 1)
  const seen = new Set()

  dataRows.forEach((cells, index) => {
    const rowNumber = headerRow + index + 2 // 1-based sheet row
    const get = (key) => {
      const idx = mapping[key]
      return idx == null || idx < 0 ? '' : String(cells[idx] ?? '').trim()
    }

    const name = get('name')
    const category = get('category') || defaultCategory
    const price = parsePrice(get('price'))

    if (!name && !category && !String(get('price'))) return // skip empty rows

    const rowErrors = []
    if (!name) rowErrors.push('Missing item name')
    if (!category) rowErrors.push('Missing category')
    if (!Number.isFinite(price) || price < 0) rowErrors.push('Invalid price')

    const key = `${category.toLowerCase()}::${name.toLowerCase()}`
    if (name && category) {
      if (seen.has(key)) rowErrors.push('Duplicate row in this import')
      seen.add(key)
    }

    const row = {
      rowNumber,
      name,
      category,
      price: Number.isFinite(price) ? price : 0,
      description: get('description'),
      food_type: parseFoodType(get('food_type')),
      is_available: parseBool(get('is_available')),
      image_url: get('image_url') || null,
      variants: [],
    }

    if (rowErrors.length) errors.push({ rowNumber, name, messages: rowErrors })
    else rows.push(row)
  })

  return { rows, errors }
}

export function summarizeImport({ rows = [], errors = [] } = {}) {
  return {
    valid: rows.length,
    invalid: errors.length,
    categories: new Set(rows.map((r) => r.category)).size,
  }
}
