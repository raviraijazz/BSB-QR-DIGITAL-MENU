// Pure helpers for founder-only menu import. No Supabase imports so they can be
// unit tested with plain node.

export const SAMPLE_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1RTpREaNsEvUU-lvJGDfV2U7kJO6bytdjMFI6b9AiMBY/edit?pli=1&gid=0#gid=0'

export const IMPORT_FIELDS = [
  { key: 'name', label: 'Item name', required: true },
  { key: 'category', label: 'Category', required: true },
  { key: 'price', label: 'Price', required: false },
  { key: 'variant', label: 'Variant name', required: false },
  { key: 'description', label: 'Description', required: false },
  { key: 'food_type', label: 'Veg / Non-veg', required: false },
  { key: 'is_available', label: 'Available', required: false },
  { key: 'image_url', label: 'Image URL', required: false },
]

const HEADER_HINTS = {
  name: ['name', 'item', 'item name', 'dish', 'product', 'title'],
  category: ['category', 'cat', 'section', 'group'],
  price: ['price', 'rate', 'amount', 'mrp', 'cost'],
  variant: ['variant', 'size', 'portion', 'serving', 'variant name'],
  description: ['description', 'desc', 'details', 'about'],
  food_type: ['food type', 'food_type', 'type', 'veg/non-veg', 'veg / non-veg', 'foodtype'],
  is_available: ['available', 'availability', 'is_available', 'in stock', 'status'],
  image_url: ['image', 'image url', 'image_url', 'photo', 'img'],
}

const SIZE_ALIASES = new Map([
  ['quarter', 'Quarter'],
  ['qtr', 'Quarter'],
  ['1/4', 'Quarter'],
  ['1/4th', 'Quarter'],
  ['half', 'Half'],
  ['1/2', 'Half'],
  ['1/2th', 'Half'],
  ['full', 'Full'],
  ['small', 'Small'],
  ['sm', 'Small'],
  ['medium', 'Medium'],
  ['med', 'Medium'],
  ['large', 'Large'],
  ['lg', 'Large'],
  ['regular', 'Regular'],
  ['reg', 'Regular'],
  ['family', 'Family'],
  ['jumbo', 'Jumbo'],
  ['king', 'King'],
  ['single', 'Single'],
  ['double', 'Double'],
  ['pint', 'Pint'],
  ['glass', 'Glass'],
  ['bottle', 'Bottle'],
  ['plate', 'Plate'],
  ['piece', 'Piece'],
  ['pc', 'Piece'],
  ['pcs', 'Piece'],
])

const FOOD_TYPE_HEADERS = new Set([
  'veg',
  'non veg',
  'non-veg',
  'nonveg',
  'veg/non-veg',
  'veg / non-veg',
  'veg/non veg',
  'food type',
  'food_type',
  'foodtype',
  'type',
])

const INVALID_PRICE_WORDS = new Set(['free', 'n/a', 'na', 'nil', 'none', '-', '—', 'call', 'ask', 'tbd'])

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

export function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
}

const GENERIC_PRICE_LABELS = new Set([
  'price',
  'variant price',
  'unit price',
  'amount',
  'rate',
  'mrp',
  'cost',
  'notes',
  'note',
])

export function stripCurrencySuffix(value) {
  return normalizeHeader(value)
    .replace(/\s*\((inr|rs|inr\.|₹)\)\s*$/g, '')
    .replace(/\s+(inr|rs|₹)$/g, '')
    .trim()
}

export function sizeNameFromHeader(value) {
  const normalized = stripCurrencySuffix(value)
  if (!normalized || FOOD_TYPE_HEADERS.has(normalized) || GENERIC_PRICE_LABELS.has(normalized)) return ''
  if (SIZE_ALIASES.has(normalized)) return SIZE_ALIASES.get(normalized)
  for (const [alias, name] of SIZE_ALIASES) {
    if (
      normalized === `${alias} price` ||
      normalized === `price ${alias}` ||
      normalized === `${alias} (rs)` ||
      normalized.startsWith(`${alias} (`)
    ) {
      return name
    }
  }
  return ''
}

export function canonicalVariantName(value) {
  const sized = sizeNameFromHeader(value)
  if (sized) return sized
  const text = String(value || '').trim()
  if (!text) return ''
  const stripped = stripCurrencySuffix(text)
  const normalized = stripped.replace(/\s+(price|rate|mrp|cost)$/g, '').trim()
  if (GENERIC_PRICE_LABELS.has(stripped) || GENERIC_PRICE_LABELS.has(normalized)) return ''
  if (SIZE_ALIASES.has(normalized)) return SIZE_ALIASES.get(normalized)
  for (const [alias, name] of SIZE_ALIASES) {
    if (normalized === alias || normalized.startsWith(`${alias} `) || normalized.startsWith(`${alias}(`)) {
      return name
    }
  }
  return text
}

export function looksLikeHeaderRow(cells = []) {
  const values = (cells || []).map((cell) => normalizeHeader(cell)).filter(Boolean)
  if (values.length < 2) return false
  let hits = 0
  for (const value of values) {
    const stripped = stripCurrencySuffix(value)
    if (sizeNameFromHeader(value) || GENERIC_PRICE_LABELS.has(stripped)) {
      hits += 1
      continue
    }
    if (FOOD_TYPE_HEADERS.has(value) || value === 'notes' || value === 'note' || value === 'variant name') {
      hits += 1
      continue
    }
    const hinted = Object.values(HEADER_HINTS).some((hints) => hints.some((hint) => value === hint || value.startsWith(`${hint} `)))
    if (hinted || value.includes('price') || value.includes('item name')) hits += 1
  }
  return hits >= 3 && hits >= Math.ceil(values.length * 0.5)
}

export function headerRowScore(cells = []) {
  const mapping = guessMapping(cells)
  let score = 0
  if ((mapping.name ?? -1) >= 0) score += 6
  if ((mapping.category ?? -1) >= 0) score += 5
  if ((mapping.price ?? -1) >= 0) score += 2
  if ((mapping.variant ?? -1) >= 0) score += 2
  if ((mapping.food_type ?? -1) >= 0) score += 2
  score += Array.isArray(mapping.variantColumns) ? mapping.variantColumns.length : 0
  if (looksLikeHeaderRow(cells)) score += 4
  return score
}

export function detectHeaderRow(grid = []) {
  let bestIndex = 0
  let bestScore = -1
  const limit = Math.min(grid.length, 6)
  for (let i = 0; i < limit; i += 1) {
    const score = headerRowScore(grid[i] || [])
    if (score > bestScore) {
      bestScore = score
      bestIndex = i
    }
  }
  return bestIndex
}

export function detectVariantPriceColumn(headers = [], mapping = {}) {
  const reserved = reservedIndexes(mapping)
  return headers.findIndex((header, index) => {
    if (reserved.has(index) || sizeNameFromHeader(header)) return false
    const normalized = stripCurrencySuffix(header)
    return normalized === 'variant price' || normalized === 'size price' || normalized === 'variant rate'
  })
}

function reservedIndexes(mapping) {
  const reserved = new Set()
  for (const field of IMPORT_FIELDS) {
    const idx = mapping?.[field.key]
    if (Number.isInteger(idx) && idx >= 0) reserved.add(idx)
  }
  return reserved
}

export function detectVariantColumns(headers, mapping = {}) {
  const reserved = reservedIndexes(mapping)
  const cols = []
  const seen = new Set()
  ;(headers || []).forEach((header, index) => {
    if (reserved.has(index)) return
    const name = sizeNameFromHeader(header)
    if (!name || seen.has(name.toLowerCase())) return
    seen.add(name.toLowerCase())
    cols.push({ index, name })
  })
  return cols
}

export function resolveVariantColumns(headers, mapping = {}) {
  if (Array.isArray(mapping.variantColumns)) {
    const reserved = reservedIndexes(mapping)
    const seen = new Set()
    const cols = []
    for (const column of mapping.variantColumns) {
      const index = Number(column)
      if (!Number.isInteger(index) || index < 0 || reserved.has(index) || seen.has(index)) continue
      seen.add(index)
      const header = headers?.[index]
      const sized = sizeNameFromHeader(header)
      const label = String(header || '').trim()
      if (sized) {
        cols.push({ index, name: sized })
        continue
      }
      if (!label || GENERIC_PRICE_LABELS.has(stripCurrencySuffix(label))) continue
      cols.push({ index, name: label })
    }
    return cols
  }
  return detectVariantColumns(headers, mapping)
}

function findHeaderIndex(lowered, hints, used) {
  for (const hint of hints) {
    const idx = lowered.findIndex((h, i) => !used.has(i) && h === hint)
    if (idx !== -1) return idx
  }
  for (const hint of hints) {
    const idx = lowered.findIndex(
      (h, i) =>
        !used.has(i) &&
        h.includes(hint) &&
        !sizeNameFromHeader(h) &&
        !FOOD_TYPE_HEADERS.has(h) &&
        !GENERIC_PRICE_LABELS.has(stripCurrencySuffix(h)),
    )
    if (idx !== -1) return idx
  }
  return -1
}

export function guessMapping(headers) {
  const mapping = {}
  const lowered = (headers || []).map((h) => normalizeHeader(h))
  const used = new Set()
  for (const field of IMPORT_FIELDS) {
    const hints = HEADER_HINTS[field.key] || []
    let found = -1
    if (field.key === 'food_type') {
      found = findHeaderIndex(lowered, hints, used)
      if (found === -1) {
        found = lowered.findIndex((h, i) => !used.has(i) && (h === 'veg' || h === 'type' || h.includes('food type')))
      }
    } else if (field.key === 'price') {
      found = lowered.findIndex(
        (h, i) => !used.has(i) && stripCurrencySuffix(h) === 'price' && !sizeNameFromHeader(headers[i]),
      )
      if (found === -1) {
        for (const hint of hints) {
          const idx = lowered.findIndex((h, i) => !used.has(i) && h === hint && !sizeNameFromHeader(headers[i]))
          if (idx !== -1) {
            found = idx
            break
          }
        }
      }
    } else if (field.key === 'variant') {
      found = lowered.findIndex(
        (h, i) =>
          !used.has(i) &&
          ['variant', 'variant name', 'size', 'portion', 'serving'].includes(stripCurrencySuffix(h)) &&
          !sizeNameFromHeader(headers[i]) &&
          !GENERIC_PRICE_LABELS.has(stripCurrencySuffix(h)),
      )
      if (found === -1) found = findHeaderIndex(lowered, hints, used)
    } else {
      found = findHeaderIndex(lowered, hints, used)
    }
    mapping[field.key] = found
    if (found >= 0) used.add(found)
  }
  mapping.variantColumns = detectVariantColumns(headers, mapping).map((col) => col.index)
  mapping.variantPrice = detectVariantPriceColumn(headers, mapping)
  return mapping
}

function parsePrice(raw) {
  const text = String(raw ?? '').trim()
  if (!text) return NaN
  if (INVALID_PRICE_WORDS.has(text.toLowerCase())) return NaN
  const cleaned = text.replace(/[^0-9.-]/g, '')
  if (cleaned === '' || cleaned === '-' || cleaned === '.' || cleaned === '-.') return NaN
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : NaN
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

function cell(cells, index) {
  if (index == null || index < 0) return ''
  return String(cells[index] ?? '').trim()
}

function itemKey(category, name) {
  return `${String(category || '').trim().toLowerCase()}::${String(name || '').trim().toLowerCase()}`
}

function variantKey(name) {
  return variantMatchKey(name)
}

function toStoredVariants(collected) {
  const named = collected.filter((row) => row.name)
  if (named.length === 0) return []
  return named.map((row) => ({
    name: row.name,
    price: row.price,
    is_available: true,
  }))
}

function basePrice(collected) {
  const first = collected.find((row) => Number.isFinite(row.price) && row.price >= 0)
  return first ? first.price : NaN
}

export function formatVariantsPreview(row) {
  const variants = Array.isArray(row?.variants) ? row.variants : []
  if (!variants.length) return Number.isFinite(row?.price) ? String(row.price) : ''
  return variants.map((variant) => `${variant.name} ${variant.price}`).join(' · ')
}

export function buildRows(grid, mapping, { headerRow = 0, defaultCategory = '' } = {}) {
  const errors = []
  const rows = []
  const dataRows = (grid || []).slice(headerRow + 1)
  const headers = (grid || [])[headerRow] || []
  const variantCols = resolveVariantColumns(headers, mapping)
  const grouped = new Map()
  let lastName = ''
  let lastCategory = defaultCategory

  const variantPriceIndex =
    Number.isInteger(mapping.variantPrice) && mapping.variantPrice >= 0
      ? mapping.variantPrice
      : detectVariantPriceColumn(headers, mapping)

  dataRows.forEach((cells, index) => {
    const rowNumber = headerRow + index + 2
    if (looksLikeHeaderRow(cells)) return
    const get = (key) => cell(cells, mapping[key])
    let name = get('name')
    let category = get('category')
    const rawPrice = get('price')
    const variantName = canonicalVariantName(get('variant'))
    const description = get('description')
    const foodRaw = get('food_type')
    const availableRaw = get('is_available')
    const imageUrl = get('image_url')

    const collected = []
    const rowErrors = []

    for (const col of variantCols) {
      const raw = cell(cells, col.index)
      if (!raw) continue
      const price = parsePrice(raw)
      if (!Number.isFinite(price) || price < 0) {
        rowErrors.push(`Invalid price for ${col.name}`)
        continue
      }
      collected.push({ name: col.name, price })
    }

    const namedVariantPrice = parsePrice(cell(cells, variantPriceIndex))
    if (variantName) {
      let price = Number.isFinite(namedVariantPrice) ? namedVariantPrice : NaN
      if (!Number.isFinite(price) && rawPrice !== '') price = parsePrice(rawPrice)
      if (!Number.isFinite(price) || price < 0) {
        rowErrors.push('Invalid price')
      } else {
        collected.push({ name: variantName, price })
      }
    } else if (rawPrice !== '') {
      const price = parsePrice(rawPrice)
      if (!Number.isFinite(price) || price < 0) {
        rowErrors.push('Invalid price')
      } else if (collected.length === 0) {
        collected.push({ name: '', price })
      }
    } else if (Number.isFinite(namedVariantPrice)) {
      rowErrors.push('Missing variant name')
    }

    const hasContent =
      name ||
      category ||
      rawPrice ||
      variantName ||
      description ||
      foodRaw ||
      imageUrl ||
      collected.length ||
      rowErrors.length
    if (!hasContent) return

    const continuation = !name && (Boolean(variantName) || collected.some((row) => row.name))
    if (continuation) {
      if (!name) name = lastName
      if (!category) category = lastCategory || defaultCategory
    } else if (!category) {
      category = defaultCategory
    }
    if (name) lastName = name
    if (category) lastCategory = category

    if (!name) rowErrors.push('Missing item name')
    if (!category) rowErrors.push('Missing category')

    const validCollected = collected.filter((row) => Number.isFinite(row.price) && row.price >= 0)
    if (!validCollected.length && !rowErrors.some((msg) => msg.toLowerCase().includes('price'))) {
      rowErrors.push('Missing price')
    }

    if (rowErrors.length) {
      errors.push({ rowNumber, name, messages: rowErrors })
      return
    }

    const key = itemKey(category, name)
    const storedVariants = toStoredVariants(validCollected)
    const price = basePrice(validCollected)
    const next = grouped.get(key)

    if (!next) {
      grouped.set(key, {
        rowNumber,
        name,
        category,
        price,
        description,
        food_type: parseFoodType(foodRaw),
        is_available: parseBool(availableRaw),
        image_url: imageUrl || null,
        variants: storedVariants,
        seenVariants: new Map(validCollected.map((row) => [variantKey(row.name), row.price])),
      })
      return
    }

    for (const row of validCollected) {
      const vKey = variantKey(row.name)
      if (next.seenVariants.has(vKey)) {
        if (next.seenVariants.get(vKey) === row.price) {
          errors.push({ rowNumber, name, messages: ['Duplicate row in this import'] })
        } else {
          errors.push({
            rowNumber,
            name,
            messages: [`Conflicting price for ${row.name || 'item'}`],
          })
        }
        return
      }
      next.seenVariants.set(vKey, row.price)
      if (row.name) {
        next.variants.push({ name: row.name, price: row.price, is_available: true })
      }
    }
    if (!Number.isFinite(next.price) || next.price < 0) next.price = price
    if (!next.description && description) next.description = description
    if (!next.image_url && imageUrl) next.image_url = imageUrl
  })

  for (const row of grouped.values()) {
    const variants = row.variants || []
    rows.push({
      rowNumber: row.rowNumber,
      name: row.name,
      category: row.category,
      price: row.price,
      description: row.description || '',
      food_type: row.food_type,
      is_available: row.is_available,
      image_url: row.image_url,
      variants,
    })
  }

  rows.sort((a, b) => a.rowNumber - b.rowNumber)
  return { rows, errors }
}

export function summarizeImport({ rows = [], errors = [] } = {}) {
  return {
    valid: rows.length,
    invalid: errors.length,
    categories: new Set(rows.map((r) => r.category)).size,
  }
}

export function normalizeImportName(value) {
  return String(value || '').trim().toLowerCase()
}

export function moneyAmount(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100) / 100
}

export function newImportRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `import-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function variantList(value) {
  return Array.isArray(value) ? value : []
}

export function variantMatchKey(name) {
  return normalizeImportName(canonicalVariantName(name) || name)
}

function findVariantIndex(variants, name) {
  const key = variantMatchKey(name)
  if (!key) return -1
  return variantList(variants).findIndex((row) => variantMatchKey(row?.name) === key)
}

export function mergeImportedVariants(existingVariants, incomingVariants) {
  const next = variantList(existingVariants).map((row) => ({ ...row }))
  let created = 0
  let skipped = 0
  const conflicts = []
  for (const incoming of variantList(incomingVariants)) {
    const name = canonicalVariantName(incoming?.name) || String(incoming?.name || '').trim()
    if (!name || !variantMatchKey(name)) continue
    const price = moneyAmount(incoming.price)
    if (price == null) continue
    const index = findVariantIndex(next, name)
    if (index === -1) {
      next.push({
        name,
        price,
        is_available: incoming.is_available !== false,
      })
      created += 1
      continue
    }
    const current = moneyAmount(next[index].price)
    if (current === price) skipped += 1
    else conflicts.push({ name, existing: current, incoming: price })
  }
  return { variants: next, created, skipped, conflicts }
}

export function applyImportedItem(existing, incoming) {
  const incomingVariants = variantList(incoming?.variants).filter((row) => variantMatchKey(row?.name))
  if (!existing) {
    return {
      action: 'create',
      item: {
        ...incoming,
        variants: incomingVariants,
      },
      createdItems: 1,
      skippedItems: 0,
      createdVariants: incomingVariants.length,
      skippedVariants: 0,
      conflicts: [],
    }
  }
  const merged = mergeImportedVariants(existing.variants, incomingVariants)
  const conflicts = merged.conflicts.slice()
  if (!incomingVariants.length) {
    const existingHasVariants = variantList(existing.variants).some((row) => String(row?.name || '').trim())
    if (!existingHasVariants) {
      const existingPrice = moneyAmount(existing.price)
      const incomingPrice = moneyAmount(incoming.price)
      if (existingPrice != null && incomingPrice != null && existingPrice !== incomingPrice) {
        conflicts.push({ name: incoming.name || 'item', existing: existingPrice, incoming: incomingPrice })
      }
    }
  }
  return {
    action: merged.created ? 'update' : 'skip',
    item: {
      ...existing,
      variants: merged.variants,
    },
    createdItems: 0,
    skippedItems: 1,
    createdVariants: merged.created,
    skippedVariants: merged.skipped,
    conflicts,
  }
}

export function applyImportBatch(catalog, incomingRows) {
  const categories = new Map((catalog?.categories || []).map((row) => [normalizeImportName(row.name), { ...row }]))
  const items = (catalog?.items || []).map((row) => ({
    ...row,
    variants: variantList(row.variants).map((variant) => ({ ...variant })),
  }))
  let createdCategories = 0
  let createdItems = 0
  let skippedItems = 0
  let createdVariants = 0
  let skippedVariants = 0
  let failedRows = 0
  const conflicts = []

  for (const incoming of incomingRows || []) {
    const categoryName = String(incoming?.category || '').trim()
    const name = String(incoming?.name || '').trim()
    const price = moneyAmount(incoming?.price)
    if (!categoryName || !name || price == null) {
      failedRows += 1
      continue
    }
    const catKey = normalizeImportName(categoryName)
    if (!categories.has(catKey)) {
      categories.set(catKey, { name: categoryName })
      createdCategories += 1
    }
    const index = items.findIndex(
      (row) =>
        normalizeImportName(row.category) === catKey && normalizeImportName(row.name) === normalizeImportName(name),
    )
    const result = applyImportedItem(index === -1 ? null : items[index], {
      ...incoming,
      name,
      category: categoryName,
      price,
    })
    createdItems += result.createdItems
    skippedItems += result.skippedItems
    createdVariants += result.createdVariants
    skippedVariants += result.skippedVariants
    conflicts.push(...result.conflicts)
    if (index === -1) items.push(result.item)
    else items[index] = result.item
  }

  return {
    catalog: { categories: [...categories.values()], items },
    result: {
      created_categories: createdCategories,
      created_items: createdItems,
      created_variants: createdVariants,
      skipped_items: skippedItems,
      skipped_variants: skippedVariants,
      skipped: skippedItems + failedRows,
      conflicts: conflicts.length,
      failed_rows: failedRows,
    },
  }
}

export function importRowsFingerprint(rows = []) {
  const normalized = (rows || []).map((row) => ({
    c: normalizeImportName(row.category),
    n: normalizeImportName(row.name),
    p: moneyAmount(row.price),
    v: variantList(row.variants)
      .map((variant) => ({
        n: variantMatchKey(variant.name),
        p: moneyAmount(variant.price),
      }))
      .filter((variant) => variant.n)
      .sort((a, b) => a.n.localeCompare(b.n)),
  }))
  normalized.sort((a, b) => `${a.c}::${a.n}`.localeCompare(`${b.c}::${b.n}`))
  return JSON.stringify(normalized)
}

export function hashFingerprint(value) {
  const text = String(value || '')
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

export function formatImportSuccess(result, { restaurantName, completedAt } = {}) {
  const createdItems = Number(result?.created_items) || 0
  const createdVariants = Number(result?.created_variants) || 0
  const createdCategories = Number(result?.created_categories) || 0
  const skippedItems = Number(result?.skipped_items) || 0
  const skippedVariants = Number(result?.skipped_variants) || 0
  const conflicts = Number(result?.conflicts) || 0
  const failedRows = Number(result?.failed_rows) || 0
  const when = completedAt || result?.completed_at || ''
  const restaurant = restaurantName || result?.restaurant_name || 'selected restaurant'
  const unchanged =
    result?.no_changes ||
    (createdItems === 0 && createdVariants === 0 && createdCategories === 0 && conflicts === 0)
  if (unchanged) {
    return `No changes detected — this menu is already imported for ${restaurant}.${when ? ` Checked ${when}.` : ''}`
  }
  return `Menu import completed successfully for ${restaurant}. ${createdItems} items created, ${createdVariants} variants inserted now, ${skippedItems} existing items skipped, ${skippedVariants} existing variants skipped, ${conflicts} conflicts, ${failedRows} failed rows.${when ? ` Completed ${when}.` : ''}`
}
