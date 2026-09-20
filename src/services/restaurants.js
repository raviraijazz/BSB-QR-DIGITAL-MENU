import { supabase } from '../lib/supabase'
import { toSlug, withSuffix } from '../lib/slug'

export async function listMyRestaurants(userId) {
  const { data, error } = await supabase
    .from('restaurants')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  return { data: data ?? [], error }
}

export async function getPublicRestaurant(slug) {
  const { data, error } = await supabase
    .from('restaurants')
    .select('id, name, phone, address, logo_url, slug')
    .eq('slug', slug)
    .maybeSingle()
  return { data, error }
}

export async function uniqueSlug(base, excludeId) {
  let slug = toSlug(base) || 'restaurant'
  for (let i = 0; i < 6; i += 1) {
    let query = supabase.from('restaurants').select('id').eq('slug', slug)
    if (excludeId) query = query.neq('id', excludeId)
    const { data } = await query.maybeSingle()
    if (!data) return slug
    slug = withSuffix(toSlug(base) || 'restaurant')
  }
  return withSuffix(toSlug(base) || 'restaurant')
}

export async function saveRestaurant(userId, restaurant, values) {
  const payload = {
    user_id: userId,
    name: values.name.trim(),
    phone: values.phone.trim(),
    address: values.address.trim(),
    logo_url: values.logo_url || null,
  }

  if (restaurant?.id) {
    const { data, error } = await supabase
      .from('restaurants')
      .update(payload)
      .eq('id', restaurant.id)
      .eq('user_id', userId)
      .select()
      .single()
    return { data, error }
  }

  payload.slug = await uniqueSlug(payload.name)
  const { data, error } = await supabase.from('restaurants').insert(payload).select().single()
  return { data, error }
}

export async function updateSlug(restaurantId, userId, nameOrSlug) {
  const slug = await uniqueSlug(nameOrSlug, restaurantId)
  const { data, error } = await supabase
    .from('restaurants')
    .update({ slug })
    .eq('id', restaurantId)
    .eq('user_id', userId)
    .select()
    .single()
  return { data, error }
}

export function activeRestaurantKey(userId) {
  return `bsb-active-restaurant:${userId}`
}

export function readActiveRestaurantId(userId) {
  try {
    return localStorage.getItem(activeRestaurantKey(userId)) || ''
  } catch {
    return ''
  }
}

export function writeActiveRestaurantId(userId, restaurantId) {
  try {
    if (restaurantId) localStorage.setItem(activeRestaurantKey(userId), restaurantId)
  } catch {
    /* ignore */
  }
}
