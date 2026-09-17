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
      description: values.description.trim(),
      price: Number(values.price) || 0,
      image_url: values.image_url || null,
      is_available: values.is_available !== false,
      sort_order: values.sort_order || 0,
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

export async function getPublicMenu(restaurantId) {
  const [{ data: categories, error: catError }, { data: items, error: itemError }] = await Promise.all([
    supabase
      .from('categories')
      .select('id, name, sort_order')
      .eq('restaurant_id', restaurantId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('menu_items')
      .select('id, category_id, name, description, price, image_url, is_available, sort_order')
      .eq('restaurant_id', restaurantId)
      .order('sort_order', { ascending: true }),
  ])

  return {
    categories: categories ?? [],
    items: items ?? [],
    error: catError || itemError,
  }
}
