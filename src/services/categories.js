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
