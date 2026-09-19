import { supabase } from '../lib/supabase'

export async function listCategories(restaurantId) {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  return { data: data ?? [], error }
}

export async function createCategory(restaurantId, name, sortOrder) {
  const { data, error } = await supabase
    .from('categories')
    .insert({ restaurant_id: restaurantId, name: name.trim(), sort_order: sortOrder })
    .select()
    .single()
  return { data, error }
}

export async function updateCategory(id, restaurantId, values) {
  const { data, error } = await supabase
    .from('categories')
    .update(values)
    .eq('id', id)
    .eq('restaurant_id', restaurantId)
    .select()
    .single()
  return { data, error }
}

export async function deleteCategory(id, restaurantId) {
  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', id)
    .eq('restaurant_id', restaurantId)
  return { error }
}

export async function reorderCategories(restaurantId, ordered) {
  const results = await Promise.all(
    ordered.map((item, index) =>
      supabase
        .from('categories')
        .update({ sort_order: index })
        .eq('id', item.id)
        .eq('restaurant_id', restaurantId),
    ),
  )
  return { error: results.find((result) => result.error)?.error || null }
}

export async function duplicateCategory(restaurantId, category, ordered) {
  const index = ordered.findIndex((item) => item.id === category.id)
  const { data, error } = await createCategory(restaurantId, `${category.name} Copy`, (category.sort_order ?? index) + 1)
  if (error) return { data: null, error }
  const next = [...ordered]
  next.splice(index + 1, 0, data)
  const reorder = await reorderCategories(restaurantId, next)
  return { data, error: reorder.error, ordered: next }
}
