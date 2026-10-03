import { supabase } from '../lib/supabase'

function friendlySavedError(error, kind = 'load') {
  if (!error) return error
  const text = String(error.message || '').toLowerCase()
  if (text.includes('saved_reports') && (text.includes('does not exist') || text.includes('schema cache') || text.includes('could not find'))) {
    return { message: 'Saved reports are not ready. Run supabase/saved-reports.sql in the SQL Editor.' }
  }
  if (text.includes('duplicate') || text.includes('saved_reports_restaurant_name')) {
    return { message: 'A saved report with this name already exists.' }
  }
  if (text.includes('not allowed') || text.includes('row-level security')) {
    return { message: 'Only the restaurant owner can manage saved reports.' }
  }
  if (kind === 'save') return { message: 'Unable to save this report. Please try again.' }
  if (kind === 'delete') return { message: 'Unable to delete this saved report. Please try again.' }
  return { message: 'Unable to load saved reports. Please try again.' }
}

export async function listSavedReports(restaurantId) {
  if (!restaurantId) return { data: [], error: null }
  const { data, error } = await supabase
    .from('saved_reports')
    .select('id, restaurant_id, name, report_type, is_favorite, config, created_at, updated_at')
    .eq('restaurant_id', restaurantId)
    .order('is_favorite', { ascending: false })
    .order('updated_at', { ascending: false })
  if (error) return { data: [], error: friendlySavedError(error) }
  return { data: data || [], error: null }
}

export async function saveReport(restaurantId, values) {
  if (!restaurantId) return { data: null, error: { message: 'Restaurant required.' } }
  const name = String(values.name || '').trim()
  if (!name) return { data: null, error: { message: 'Enter a report name.' } }
  const payload = {
    restaurant_id: restaurantId,
    name,
    report_type: values.report_type || values.config?.reportType || 'collections',
    is_favorite: Boolean(values.is_favorite),
    config: values.config || {},
  }
  const { data, error } = await supabase.from('saved_reports').insert(payload).select().single()
  if (error) return { data: null, error: friendlySavedError(error, 'save') }
  return { data, error: null }
}

export async function updateSavedReport(id, restaurantId, values) {
  if (!id || !restaurantId) return { data: null, error: { message: 'Saved report not found.' } }
  const { data, error } = await supabase
    .from('saved_reports')
    .update(values)
    .eq('id', id)
    .eq('restaurant_id', restaurantId)
    .select()
    .single()
  if (error) return { data: null, error: friendlySavedError(error, 'save') }
  return { data, error: null }
}

export async function deleteSavedReport(id, restaurantId) {
  if (!id || !restaurantId) return { error: { message: 'Saved report not found.' } }
  const { error } = await supabase.from('saved_reports').delete().eq('id', id).eq('restaurant_id', restaurantId)
  if (error) return { error: friendlySavedError(error, 'delete') }
  return { error: null }
}
