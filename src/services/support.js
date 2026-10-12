import { supabase } from '../lib/supabase'
import { OPEN_TICKET_STATUSES, RESOLVED_TICKET_STATUSES } from '../lib/supportCatalog'

function missingSchema(error) {
  const text = String(error?.message || '').toLowerCase()
  return text.includes('does not exist') || text.includes('schema cache') || text.includes('could not find')
}

function friendlySupportError(error, kind = 'ticket') {
  if (!error) return error
  if (missingSchema(error)) {
    return { message: 'Support & Maintenance is not ready. Run supabase/restaurant-support.sql in the SQL Editor.' }
  }
  if (String(error.message || '').toLowerCase().includes('row-level security') || String(error.message || '').toLowerCase().includes('not allowed')) {
    if (kind === 'ticket') return { message: 'Unable to save this ticket for the selected restaurant.' }
    if (kind === 'reply') return { message: 'Unable to save this reply for the selected restaurant.' }
    if (kind === 'reminder') return { message: 'Unable to save this reminder for the selected restaurant.' }
    if (kind === 'feedback') return { message: 'Unable to save this feedback for the selected restaurant.' }
    return { message: 'Unable to complete this action for the selected restaurant.' }
  }
  return { message: error.message || 'Unable to complete this action. Please try again.' }
}

export function isSupportSchemaMissing(error) {
  return missingSchema(error)
}

export async function countRestaurantRows(table, restaurantId) {
  if (!restaurantId) return { count: 0, error: null, missing: false }
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId)
  if (error) {
    return { count: 0, error: error.message, missing: missingSchema(error) }
  }
  return { count: count || 0, error: null, missing: false }
}

export async function countRowsSince(table, restaurantId, column, fromISO, toISO) {
  if (!restaurantId) return { count: 0, error: null, missing: false }
  let query = supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId)
  if (fromISO) query = query.gte(column, fromISO)
  if (toISO) query = query.lt(column, toISO)
  const { count, error } = await query
  if (error) return { count: 0, error: error.message, missing: missingSchema(error) }
  return { count: count || 0, error: null, missing: false }
}

export async function listSupportTickets(restaurantId) {
  if (!restaurantId) return { data: [], error: null }
  const { data, error } = await supabase
    .from('support_tickets')
    .select('id, restaurant_id, ticket_number, subject, category, description, priority, status, created_at, updated_at')
    .eq('restaurant_id', restaurantId)
    .order('updated_at', { ascending: false })
  if (error) return { data: [], error: friendlySupportError(error) }
  return { data: data || [], error: null }
}

export async function getSupportTicket(restaurantId, ticketId) {
  if (!restaurantId || !ticketId) return { data: null, error: null }
  const { data, error } = await supabase
    .from('support_tickets')
    .select('id, restaurant_id, ticket_number, subject, category, description, priority, status, created_at, updated_at')
    .eq('restaurant_id', restaurantId)
    .eq('id', ticketId)
    .maybeSingle()
  if (error) return { data: null, error: friendlySupportError(error) }
  return { data, error: null }
}

export async function createSupportTicket(restaurantId, userId, values) {
  const subject = String(values.subject || '').trim()
  const description = String(values.description || '').trim()
  if (!subject) return { data: null, error: { message: 'Subject is required.' } }
  if (!description) return { data: null, error: { message: 'Description is required.' } }
  const { data, error } = await supabase
    .from('support_tickets')
    .insert({
      restaurant_id: restaurantId,
      subject,
      category: values.category || 'other',
      description,
      priority: values.priority || 'medium',
      status: 'open',
      created_by: userId || null,
    })
    .select('id, restaurant_id, ticket_number, subject, category, description, priority, status, created_at, updated_at')
    .single()
  if (error) return { data: null, error: friendlySupportError(error) }
  return { data, error: null }
}

export async function updateSupportTicketStatus(restaurantId, ticketId, status) {
  const { data, error } = await supabase
    .from('support_tickets')
    .update({ status })
    .eq('restaurant_id', restaurantId)
    .eq('id', ticketId)
    .select('id, restaurant_id, ticket_number, subject, category, description, priority, status, created_at, updated_at')
    .single()
  if (error) return { data: null, error: friendlySupportError(error) }
  return { data, error: null }
}

export async function listTicketReplies(restaurantId, ticketId) {
  if (!restaurantId || !ticketId) return { data: [], error: null }
  const { data, error } = await supabase
    .from('support_ticket_replies')
    .select('id, ticket_id, restaurant_id, author_role, body, created_at')
    .eq('restaurant_id', restaurantId)
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true })
  if (error) return { data: [], error: friendlySupportError(error, 'reply') }
  return { data: data || [], error: null }
}

export async function addTicketReply(restaurantId, ticketId, userId, body) {
  const text = String(body || '').trim()
  if (!text) return { data: null, error: { message: 'Reply cannot be empty.' } }
  const { data, error } = await supabase
    .from('support_ticket_replies')
    .insert({
      ticket_id: ticketId,
      restaurant_id: restaurantId,
      author_role: 'owner',
      author_user_id: userId || null,
      body: text,
    })
    .select('id, ticket_id, restaurant_id, author_role, body, created_at')
    .single()
  if (error) return { data: null, error: friendlySupportError(error, 'reply') }
  return { data, error: null }
}

export async function ticketSummary(restaurantId, monthFromISO, monthToISO) {
  if (!restaurantId) return { open: 0, resolvedMonth: 0, error: null }
  const tickets = await listSupportTickets(restaurantId)
  if (tickets.error) return { open: 0, resolvedMonth: 0, error: tickets.error }
  const open = (tickets.data || []).filter((row) => OPEN_TICKET_STATUSES.includes(row.status)).length
  const resolvedMonth = (tickets.data || []).filter((row) => {
    if (!RESOLVED_TICKET_STATUSES.includes(row.status)) return false
    const at = new Date(row.updated_at).getTime()
    return at >= new Date(monthFromISO).getTime() && at < new Date(monthToISO).getTime()
  }).length
  return { open, resolvedMonth, tickets: tickets.data || [], error: null }
}

export async function listMaintenanceReminders(restaurantId) {
  if (!restaurantId) return { data: [], error: null }
  const { data, error } = await supabase
    .from('maintenance_reminders')
    .select('id, restaurant_id, task, description, due_at, recurrence, status, completed_at, created_at, updated_at')
    .eq('restaurant_id', restaurantId)
    .order('due_at', { ascending: true })
  if (error) return { data: [], error: friendlySupportError(error, 'reminder') }
  return { data: data || [], error: null }
}

export async function createMaintenanceReminder(restaurantId, values) {
  const task = String(values.task || '').trim()
  if (!task) return { data: null, error: { message: 'Task is required.' } }
  if (!values.due_at) return { data: null, error: { message: 'Due date is required.' } }
  const due = new Date(values.due_at)
  if (Number.isNaN(due.getTime())) return { data: null, error: { message: 'Due date is invalid.' } }
  const { data, error } = await supabase
    .from('maintenance_reminders')
    .insert({
      restaurant_id: restaurantId,
      task,
      description: String(values.description || '').trim(),
      due_at: due.toISOString(),
      recurrence: values.recurrence || 'none',
      status: 'open',
    })
    .select('id, restaurant_id, task, description, due_at, recurrence, status, completed_at, created_at, updated_at')
    .single()
  if (error) return { data: null, error: friendlySupportError(error, 'reminder') }
  return { data, error: null }
}

export async function updateMaintenanceReminder(restaurantId, id, values) {
  const payload = { ...values }
  if (payload.task != null) payload.task = String(payload.task).trim()
  if (payload.description != null) payload.description = String(payload.description).trim()
  if (payload.due_at) payload.due_at = new Date(payload.due_at).toISOString()
  const { data, error } = await supabase
    .from('maintenance_reminders')
    .update(payload)
    .eq('restaurant_id', restaurantId)
    .eq('id', id)
    .select('id, restaurant_id, task, description, due_at, recurrence, status, completed_at, created_at, updated_at')
    .single()
  if (error) return { data: null, error: friendlySupportError(error, 'reminder') }
  return { data, error: null }
}

export async function completeMaintenanceReminder(restaurantId, id) {
  return updateMaintenanceReminder(restaurantId, id, {
    status: 'completed',
    completed_at: new Date().toISOString(),
  })
}

export async function cancelMaintenanceReminder(restaurantId, id) {
  return updateMaintenanceReminder(restaurantId, id, { status: 'cancelled' })
}

export async function submitRestaurantFeedback(restaurantId, values) {
  const message = String(values.message || '').trim()
  if (!message) return { data: null, error: { message: 'Feedback message is required.' } }
  const rating = values.rating === '' || values.rating == null ? null : Number(values.rating)
  const { data, error } = await supabase
    .from('restaurant_feedback')
    .insert({
      restaurant_id: restaurantId,
      feedback_type: values.feedback_type || 'suggestion',
      rating: Number.isFinite(rating) ? rating : null,
      message,
      related_module: values.related_module || 'other',
    })
    .select('id, created_at')
    .single()
  if (error) return { data: null, error: friendlySupportError(error, 'feedback') }
  return { data, error: null }
}

export async function listRestaurantFeedback(restaurantId) {
  if (!restaurantId) return { data: [], error: null }
  const { data, error } = await supabase
    .from('restaurant_feedback')
    .select('id, feedback_type, rating, message, related_module, created_at')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) return { data: [], error: friendlySupportError(error, 'feedback') }
  return { data: data || [], error: null }
}

export async function listReleaseNotes() {
  const { data, error } = await supabase
    .from('release_notes')
    .select('id, version, released_at, title, features, bug_fixes, maintenance_notices, created_at')
    .eq('is_published', true)
    .order('released_at', { ascending: false })
  if (error) return { data: [], error: friendlySupportError(error, 'release') }
  return { data: data || [], error: null }
}

export async function listDataExports(restaurantId) {
  if (!restaurantId) return { data: [], error: null }
  const { data, error } = await supabase
    .from('restaurant_data_exports')
    .select('id, export_type, status, row_count, created_at')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) return { data: [], error: friendlySupportError(error, 'export') }
  return { data: data || [], error: null }
}

export async function logDataExport(restaurantId, exportType, status, rowCount) {
  if (!restaurantId) return { error: null }
  const { error } = await supabase.from('restaurant_data_exports').insert({
    restaurant_id: restaurantId,
    export_type: exportType,
    status,
    row_count: rowCount || 0,
  })
  if (error) return { error: friendlySupportError(error, 'export') }
  return { error: null }
}

export async function loadUsageCounts(restaurantId, fromISO, toISO) {
  const [orders, sessions, bills, kots, items, waiters, tables] = await Promise.all([
    countRowsSince('orders', restaurantId, 'created_at', fromISO, toISO),
    countRowsSince('table_sessions', restaurantId, 'started_at', fromISO, toISO),
    countRowsSince('bills', restaurantId, 'created_at', fromISO, toISO),
    countRowsSince('kots', restaurantId, 'created_at', fromISO, toISO),
    countRestaurantRows('menu_items', restaurantId),
    countRestaurantRows('waiters', restaurantId),
    countRestaurantRows('restaurant_tables', restaurantId),
  ])
  const firstError = [orders, sessions, bills, kots, items, waiters, tables].find((row) => row.error && !row.missing)?.error
  return {
    orders: orders.missing ? null : orders.count,
    sessions: sessions.missing ? null : sessions.count,
    bills: bills.missing ? null : bills.count,
    kots: kots.missing ? null : kots.count,
    items: items.missing ? null : items.count,
    waiters: waiters.missing ? null : waiters.count,
    tables: tables.missing ? null : tables.count,
    missing: {
      orders: orders.missing,
      sessions: sessions.missing,
      bills: bills.missing,
      kots: kots.missing,
    },
    error: firstError ? { message: firstError } : null,
  }
}
