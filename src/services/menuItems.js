import { supabase } from '../lib/supabase'

export async function listMenuItems(restaurantId) {
  const { data, error } = await supabase
    .from('menu_items')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  return { data: data ?? [], error }
}

export async function createMenuItem(restaurantId, values) {
  const { data, error } = await supabase
    .from('menu_items')
    .insert({
      restaurant_id: restaurantId,
      category_id: values.category_id,
      name: values.name.trim(),
      description: String(values.description || '').trim(),
      price: Number(values.price) || 0,
      variants: values.variants || [],
      image_url: values.image_url || null,
      is_available: values.is_available !== false,
      sort_order: values.sort_order ?? 0,
    })
    .select()
    .single()
  return { data, error }
}

export async function updateMenuItem(id, restaurantId, values) {
  const { data, error } = await supabase
    .from('menu_items')
    .update(values)
    .eq('id', id)
    .eq('restaurant_id', restaurantId)
    .select()
    .single()
  return { data, error }
}

export async function deleteMenuItem(id, restaurantId) {
  const { error } = await supabase
    .from('menu_items')
    .delete()
    .eq('id', id)
    .eq('restaurant_id', restaurantId)
  return { error }
}

export async function reorderMenuItems(restaurantId, categoryId, ordered) {
  const results = await Promise.all(
    ordered.map((item, index) =>
      supabase
        .from('menu_items')
        .update({ sort_order: index })
        .eq('id', item.id)
        .eq('restaurant_id', restaurantId)
        .eq('category_id', categoryId),
    ),
  )
  return { error: results.find((result) => result.error)?.error || null }
}

export async function duplicateMenuItem(restaurantId, item, orderedInCategory) {
  const index = orderedInCategory.findIndex((row) => row.id === item.id)
  const variants = Array.isArray(item.variants) ? item.variants.map((variant) => ({ ...variant })) : []
  const { data, error } = await createMenuItem(restaurantId, {
    category_id: item.category_id,
    name: `${item.name} Copy`,
    description: item.description || '',
    price: item.price,
    variants,
    image_url: item.image_url || null,
    is_available: item.is_available !== false,
    sort_order: (item.sort_order ?? index) + 1,
  })
  if (error) return { data: null, error }
  const next = [...orderedInCategory]
  next.splice(index + 1, 0, data)
  const reorder = await reorderMenuItems(restaurantId, item.category_id, next)
  return { data, error: reorder.error, ordered: next }
}

export async function getPublicMenu(restaurantId) {
  const [{ data: categories, error: catError }, { data: items, error: itemError }] = await Promise.all([
    supabase
      .from('categories')
      .select('id, name, sort_order')
      .eq('restaurant_id', restaurantId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('menu_items')
      .select('id, category_id, name, description, price, variants, image_url, is_available, sort_order')
      .eq('restaurant_id', restaurantId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
  ])

  return {
    categories: categories ?? [],
    items: items ?? [],
    error: catError || itemError,
  }
}
