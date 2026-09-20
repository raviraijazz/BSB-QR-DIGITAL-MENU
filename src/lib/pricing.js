export function formatPrice(value) {
  const n = Number(value)
  if (Number.isNaN(n)) return ''
  return `₹${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`
}

export function emptyVariant() {
  return { name: '', price: '', is_available: true }
}

export function itemToFormPricing(item) {
  const stored = Array.isArray(item?.variants) ? item.variants : []
  if (stored.length > 0) {
    return {
      pricingMode: 'multiple',
      price: '',
      variants: stored.map((variant) => ({
        name: variant.name || '',
        price: variant.price === 0 || variant.price ? String(variant.price) : '',
        is_available: variant.is_available !== false,
      })),
    }
  }
  return {
    pricingMode: 'single',
    price: item?.price === 0 || item?.price ? String(item.price) : '',
    variants: [emptyVariant()],
  }
}

export function sanitizeVariants(variants) {
  return (variants || [])
    .map((variant) => ({
      name: String(variant.name || '').trim(),
      price: String(variant.price ?? '').trim(),
      is_available: variant.is_available !== false,
    }))
    .filter((variant) => variant.name || variant.price)
}

export function validatePricing({ pricingMode, price, variants }) {
  if (pricingMode === 'single') {
    if (price === '' || price === null || price === undefined) return 'Price required'
    const n = Number(price)
    if (Number.isNaN(n) || n < 0) return 'Enter a valid price'
    return ''
  }

  const rows = sanitizeVariants(variants)
  if (rows.length === 0) return 'Add at least one variant'
  for (const row of rows) {
    if (!row.name) return 'Variant name required'
    if (row.price === '') return 'Variant price required'
    const n = Number(row.price)
    if (Number.isNaN(n) || n < 0) return 'Enter a valid variant price'
  }
  return ''
}

export function pricingPayload({ pricingMode, price, variants }) {
  if (pricingMode === 'single') {
    const n = Number(price) || 0
    return { price: n, variants: [] }
  }

  const rows = sanitizeVariants(variants).map((row) => ({
    name: row.name,
    price: Number(row.price),
    is_available: row.is_available !== false,
  }))
  const firstAvailable = rows.find((row) => row.is_available) || rows[0]
  return {
    price: firstAvailable ? firstAvailable.price : 0,
    variants: rows,
  }
}

export function displayPrices(item) {
  const stored = Array.isArray(item?.variants) ? item.variants : []
  if (stored.length > 0) {
    return stored
      .filter((variant) => variant.is_available !== false)
      .map((variant) => ({
        name: variant.name,
        label: `${variant.name} ${formatPrice(variant.price)}`,
        price: variant.price,
      }))
  }
  return [{ name: '', label: formatPrice(item?.price), price: item?.price }]
}

export function menuVariantRows(item) {
  const stored = Array.isArray(item?.variants) ? item.variants : []
  if (stored.length > 0) {
    return stored.map((variant) => ({
      name: variant.name || '',
      label: formatPrice(variant.price),
      price: variant.price,
      is_available: variant.is_available !== false,
    }))
  }
  return [{ name: '', label: formatPrice(item?.price), price: item?.price, is_available: true }]
}

export function summaryPrice(item) {
  const rows = displayPrices(item)
  if (rows.length === 0) return 'No price'
  if (rows.length === 1 && !rows[0].name) return rows[0].label
  return rows.map((row) => row.label).join(' · ')
}
