import { firstRelated } from '../lib/orderCart'
import { buildKotTicketHtml, printKotTickets } from '../lib/kotPrint'
import {
  defaultKotPrinter,
  kotItemsWithMenu,
  normalizePrinters,
  normalizeRoutes,
  resolveOrderType,
  routeKotItems,
} from '../lib/printerRouting'
import { defaultKot } from '../lib/restaurantSettings'
import { supabase } from '../lib/supabase'
import { listCategories } from './categories'
import { markKotPrinted } from './kots'
import { listMenuItems } from './menuItems'

function friendlyPrintError(error) {
  if (!error) return error
  const text = String(error.message || '').toLowerCase()
  if (text.includes('does not exist') || text.includes('schema cache') || text.includes('could not find')) {
    return { message: 'KOT printing is not ready. Run supabase/kot-printing.sql in the SQL Editor.' }
  }
  if (text.includes('row-level security') || text.includes('not allowed')) {
    return { message: 'Unable to record the print job. Please try again.' }
  }
  return { message: 'Unable to print kitchen ticket. Please try again.' }
}

export async function loadPrintConfig(restaurantId) {
  if (!restaurantId) {
    return { printers: [], routes: [], kot: defaultKot(), orders: {}, error: null }
  }
  const [printers, routes, settings] = await Promise.all([
    supabase.from('restaurant_printer_profiles').select('*').eq('restaurant_id', restaurantId).order('created_at'),
    supabase.from('restaurant_printer_routes').select('*').eq('restaurant_id', restaurantId).order('created_at'),
    supabase.from('restaurant_settings').select('kot, orders').eq('restaurant_id', restaurantId).maybeSingle(),
  ])
  const missing = [printers.error, routes.error, settings.error].find((error) => {
    const text = String(error?.message || '').toLowerCase()
    return text.includes('does not exist') || text.includes('schema cache')
  })
  return {
    printers: normalizePrinters(printers.data || []),
    routes: routes.error ? [] : normalizeRoutes(routes.data || []),
    kot: { ...defaultKot(), ...(settings.data?.kot || {}) },
    orders: settings.data?.orders || {},
    error: missing ? friendlyPrintError(missing) : null,
  }
}

export async function listRestaurantPrintJobs(restaurantId) {
  if (!restaurantId) return { data: [], error: null }
  const { data, error } = await supabase
    .from('restaurant_print_jobs')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) {
    const text = String(error.message || '').toLowerCase()
    if (text.includes('does not exist') || text.includes('schema cache')) return { data: [], error: null }
    return { data: [], error: friendlyPrintError(error) }
  }
  return { data: data ?? [], error: null }
}

async function insertJob(row) {
  const { data, error } = await supabase.from('restaurant_print_jobs').insert(row).select('*').maybeSingle()
  return { data, error }
}

async function updateJob(id, restaurantId, values) {
  const { data, error } = await supabase
    .from('restaurant_print_jobs')
    .update(values)
    .eq('id', id)
    .eq('restaurant_id', restaurantId)
    .select('*')
    .maybeSingle()
  return { data, error }
}

function duplicateJob(error) {
  const text = String(error?.message || '').toLowerCase()
  const code = String(error?.code || '')
  return code === '23505' || text.includes('duplicate') || text.includes('unique')
}

async function findExistingKotJob(restaurantId, kotId, printerId) {
  const { data, error } = await supabase
    .from('restaurant_print_jobs')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('kot_id', kotId)
    .eq('print_type', 'kot')
    .eq('is_reprint', false)
    .order('created_at', { ascending: false })
    .limit(8)
  if (error) return null
  return (data || []).find((row) => !printerId || row.printer_id === printerId) || data?.[0] || null
}

async function queueKotJob({ restaurantId, kot, printer, reprint, payload }) {
  const row = {
    restaurant_id: restaurantId,
    kot_id: kot.id,
    printer_id: printer?.id || null,
    print_type: 'kot',
    status: 'queued',
    is_reprint: Boolean(reprint),
    copies: 1,
    payload: payload || {},
  }
  if (!reprint) {
    const existing = await findExistingKotJob(restaurantId, kot.id, printer?.id || null)
    if (existing?.status === 'printed') return { data: existing, skipped: true, error: null }
    if (existing?.id && existing.status !== 'printed') {
      const updated = await updateJob(existing.id, restaurantId, {
        status: 'queued',
        error_message: '',
        payload: payload || existing.payload || {},
      })
      return { data: updated.data || existing, skipped: false, error: null }
    }
  }
  const inserted = await insertJob(row)
  if (!inserted.error) return { data: inserted.data, skipped: false, error: null }
  if (!reprint && duplicateJob(inserted.error)) {
    const existing = await findExistingKotJob(restaurantId, kot.id, printer?.id || null)
    if (existing?.status === 'printed') return { data: existing, skipped: true, error: null }
    if (existing?.id) return { data: existing, skipped: false, error: null }
    return { data: null, skipped: true, error: null }
  }
  const text = String(inserted.error.message || '').toLowerCase()
  if (text.includes('does not exist') || text.includes('schema cache')) {
    return { data: { ...row, id: null }, skipped: false, error: null }
  }
  return { data: null, skipped: false, error: friendlyPrintError(inserted.error) }
}

async function finishJob(job, restaurantId, ok, message) {
  if (!job?.id) return
  await updateJob(job.id, restaurantId, {
    status: ok ? 'printed' : 'failed',
    printed_at: ok ? new Date().toISOString() : null,
    error_message: ok ? '' : String(message || 'Print failed'),
  })
}

export async function printTestTicket({ restaurant, printer, settings }) {
  if (!printer) return { error: { message: 'Select a printer first.' } }
  if (printer.use_for === 'bill' || printer.use_for === 'receipt') {
    return { error: { message: 'Bill and receipt printing is not enabled yet.' } }
  }
  const sampleKot = {
    kot_number: '104',
    kot_type: 'new',
    created_at: new Date().toISOString(),
  }
  const items = [
    { item_name: 'Veg Biryani (Full)', quantity: 1, notes: 'Less spicy', variant_name: 'Full' },
    { item_name: 'Paneer Tikka', quantity: 1, notes: '' },
  ]
  const html = buildKotTicketHtml({
    restaurant,
    kot: sampleKot,
    items,
    tableLabel: 'Table 4',
    waiter: { full_name: 'Vijay Pandey', waiter_id: 'W01' },
    order: { order_number: '003', order_type: 'dine_in' },
    printer,
    settings,
    reprint: false,
  })
  if (restaurant?.id && printer.id) {
    await insertJob({
      restaurant_id: restaurant.id,
      kot_id: null,
      printer_id: printer.id,
      print_type: 'test',
      status: 'queued',
      is_reprint: false,
      copies: 1,
      payload: { sample: true },
    })
  }
  try {
    await printKotTickets([{ html, printer }])
    return { error: null }
  } catch (error) {
    return { error: { message: error?.message || 'Unable to open the print dialog.' } }
  }
}

async function loadMenuIndex(restaurantId) {
  const [items, categories] = await Promise.all([listMenuItems(restaurantId), listCategories(restaurantId)])
  return {
    menuById: Object.fromEntries((items.data || []).map((item) => [item.id, item])),
    categories: categories.data || [],
  }
}

export async function printCommittedKot({
  restaurant,
  order,
  kot: kotArg,
  table,
  tableLabel,
  waiter,
  reprint = false,
}) {
  const kot = kotArg || firstRelated(order?.kots)
  if (!restaurant?.id || !kot?.id) return { printed: false, skipped: true, error: null, jobs: [] }
  const config = await loadPrintConfig(restaurant.id)
  const settings = {
    name: restaurant.name,
    logo_url: restaurant.logo_url,
    kot: config.kot,
    orders: config.orders,
  }
  const printers = config.printers
  const fallback = defaultKotPrinter(printers)
  const { menuById } = await loadMenuIndex(restaurant.id)
  const items = kotItemsWithMenu(kot, order)
  const orderType = resolveOrderType(order, settings)
  const groups = routeKotItems({
    items,
    printers,
    routes: config.routes,
    menuById,
    orderType,
  })

  if (!groups.length) {
    if (!fallback) return { printed: false, skipped: true, error: { message: 'No printer assigned' }, jobs: [] }
    groups.push({ printer: fallback, items })
  }

  const tickets = []
  const jobs = []
  for (const group of groups) {
    const queued = await queueKotJob({
      restaurantId: restaurant.id,
      kot,
      printer: group.printer,
      reprint,
      payload: {
        kot_number: kot.kot_number,
        printer_name: group.printer?.name || '',
        item_ids: group.items.map((item) => item.id),
      },
    })
    if (queued.skipped) continue
    if (queued.error) return { printed: false, skipped: false, error: queued.error, jobs }
    const html = buildKotTicketHtml({
      restaurant,
      kot,
      items: group.items,
      table,
      tableLabel,
      waiter,
      order: { ...order, order_type: orderType },
      printer: group.printer,
      settings,
      reprint,
    })
    tickets.push({ html, printer: group.printer, job: queued.data, items: group.items })
    jobs.push(queued.data)
  }

  if (!tickets.length) return { printed: Boolean(kot.printed_at), skipped: true, error: null, jobs }

  const results = await printKotTickets(tickets)
  let anyOk = false
  let lastError = null
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index]
    const job = tickets[index].job
    if (result.ok) {
      anyOk = true
      await finishJob(job, restaurant.id, true)
    } else {
      lastError = result.error
      await finishJob(job, restaurant.id, false, result.error?.message)
    }
  }
  if (anyOk) await markKotPrinted(kot.id, restaurant.id)
  return {
    printed: anyOk,
    skipped: false,
    error: anyOk ? null : { message: lastError?.message || 'Print failed' },
    jobs,
  }
}

export async function retryPrintJob({ restaurant, job, order, kot, table, tableLabel, waiter }) {
  if (!job) return { error: { message: 'Print job not found.' } }
  const reprint = Boolean(job.is_reprint) || job.status === 'printed'
  return printCommittedKot({
    restaurant,
    order,
    kot,
    table,
    tableLabel,
    waiter,
    reprint: reprint || job.status === 'failed',
  })
}

export function latestJobForKot(jobs, kotId) {
  return (jobs || []).find((job) => job.kot_id === kotId && job.print_type === 'kot') || null
}
