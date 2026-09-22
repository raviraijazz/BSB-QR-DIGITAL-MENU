export function menuPath(slug) {
  return `/menu/${slug}`
}

export function menuUrl(slug) {
  return `${window.location.origin}${menuPath(slug)}`
}

export function tableMenuUrl(slug, qrToken) {
  const token = String(qrToken || '').trim()
  if (!token) return menuUrl(slug)
  return `${menuUrl(slug)}?table=${encodeURIComponent(token)}`
}
