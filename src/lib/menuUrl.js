export function menuPath(slug) {
  return `/menu/${slug}`
}

export function menuUrl(slug) {
  return `${window.location.origin}${menuPath(slug)}`
}
