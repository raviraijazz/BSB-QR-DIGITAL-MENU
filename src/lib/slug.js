export function toSlug(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

export function withSuffix(slug) {
  const suffix = Math.random().toString(36).slice(2, 6)
  return slug ? `${slug}-${suffix}` : suffix
}
