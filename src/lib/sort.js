export function moveItem(list, fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return list
  if (fromIndex >= list.length || toIndex >= list.length) return list
  const next = [...list]
  const [item] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, item)
  return next
}

export function withSortOrder(list) {
  return list.map((item, index) => ({ ...item, sort_order: index }))
}


