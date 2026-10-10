import { buildBillDocument, billFlags, downloadBillPdf, printBillDocument, sampleBillDocument, skipAutoPrint } from '../lib/billPrint'
import { firstRelated } from '../lib/orderCart'
import { buildKotTicketHtml, printKotTickets } from '../lib/kotPrint'
import {
  backupBillPrinter,
  defaultBillPrinter,
  defaultKotPrinter,
  defaultReceiptPrinter,
  kotItemsWithMenu,
  normalizePrinters,
  normalizeRoutes,
  resolveOrderType,
  routeKotItems,
} from '../lib/printerRouting'
import { defaultBill, defaultKot } from '../lib/restaurantSettings'
import { supabase } from '../lib/supabase'
import { listCategories } from './categories'
import { markKotPrinted } from './kots'
import { listMenuItems } from './menuItems'
import { listSessionOrders } from './waiterOrders'

function friendlyPrintError(error, kind = 'kot') {
  if (!error) return error
  const text = String(error.message || '').toLowerCase()
  if (text.includes('does not exist') || text.includes('schema cache') || text.includes('could not find')) {
    if (kind === 'bill' || text.includes('bill_id')) {
      return { message: 'Bill printing is not ready. Run supabase/bill-printing.sql in the SQL Editor.' }
    }
    return { message: 'KOT printing is not ready. Run supabase/kot-printing.sql in the SQL Editor.' }
  }
  if (text.includes('row-level security') || text.includes('not allowed')) {
    return { message: 'Unable to record the print job. Please try again.' }
  }
  return { message: kind === 'bill' ? 'Unable to print bill. Please try again.' : 'Unable to print kitchen ticket. Please try again.' }
}

export async function loadPrintConfig(restaurantId) {
  if (!restaurantId) {
    return { printers: [], routes: [], kot: defaultKot(), bill: defaultBill(), settings: {}, payments: [], orders: {}, error: null }
  }
  const [printers, routes, settings, payments] = await Promise.all([
    supabase.from('restaurant_printer_profiles').select('*').eq('restaurant_id', restaurantId).order('created_at'),
    supabase.from('restaurant_printer_routes').select('*').eq('restaurant_id', restaurantId).order('created_at'),
    supabase.from('restaurant_settings').select('kot, orders, bill, gstin, owner_name, email, city, state, pin, thank_you_message, timezone, currency').eq('restaurant_id', restaurantId).maybeSingle(),
    supabase.from('restaurant_payment_methods').select('method, is_enabled, upi_id, display_name').eq('restaurant_id', restaurantId),
  ])
  const missing = [printers.error, routes.error, settings.error].find((error) => {
    const text = String(error?.message || '').toLowerCase()
    return text.includes('does not exist') || text.includes('schema cache')
  })
  const kind = String(missing?.message || '').toLowerCase().includes('bill') ? 'bill' : 'kot'
  return {
    printers: normalizePrinters(printers.data || []),
    routes: routes.error ? [] : normalizeRoutes(routes.data || []),
    kot: { ...defaultKot(), ...(settings.data?.kot || {}) },
    bill: { ...defaultBill(), ...(settings.data?.bill || {}) },
    settings: settings.data || {},
    payments: payments.error ? [] : (payments.data || []),
    orders: settings.data?.orders || {},
    error: missing ? friendlyPrintError(missing, kind) : null,
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

async function findExistingBillJob(restaurantId, billId, printerId, printType) {
  const { data, error } = await supabase
    .from('restaurant_print_jobs')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('bill_id', billId)
    .eq('print_type', printType)
    .eq('is_reprint', false)
    .order('created_at', { ascending: false })
    .limit(8)
  if (error) return { data: null, error }
  return { data: (data || []).find((row) => !printerId || row.printer_id === printerId) || data?.[0] || null, error: null }
}

async function queueBillJob({ restaurantId, bill, printer, reprint, printType, payload }) {
  const row = {
    restaurant_id: restaurantId,
    kot_id: null,
    bill_id: bill.id,
    printer_id: printer?.id || null,
    print_type: printType,
    status: 'queued',
    is_reprint: Boolean(reprint),
    copies: 1,
    payload: payload || {},
  }
  if (!reprint) {
    const existing = await findExistingBillJob(restaurantId, bill.id, printer?.id || null, printType)
    if (existing.error) {
      const text = String(existing.error.message || '').toLowerCase()
      if (text.includes('bill_id') && (text.includes('does not exist') || text.includes('schema cache'))) {
        return { data: { ...row, id: null }, skipped: false, error: null }
      }
    }
    if (existing.data?.status === 'printed') return { data: existing.data, skipped: true, error: null }
    if (existing.data?.id && existing.data.status !== 'printed') {
      const updated = await updateJob(existing.data.id, restaurantId, {
        status: 'queued',
        error_message: '',
        payload: payload || existing.data.payload || {},
      })
      return { data: updated.data || existing.data, skipped: false, error: null }
    }
  }
  const inserted = await insertJob(row)
  if (!inserted.error) return { data: inserted.data, skipped: false, error: null }
  if (!reprint && duplicateJob(inserted.error)) {
    const existing = await findExistingBillJob(restaurantId, bill.id, printer?.id || null, printType)
    if (existing.data?.status === 'printed') return { data: existing.data, skipped: true, error: null }
    if (existing.data?.id) return { data: existing.data, skipped: false, error: null }
    return { data: null, skipped: true, error: null }
  }
  const text = String(inserted.error.message || '').toLowerCase()
  if (text.includes('does not exist') || text.includes('schema cache')) {
    return { data: { ...row, id: null }, skipped: false, error: null }
  }
  return { data: null, skipped: false, error: friendlyPrintError(inserted.error, 'bill') }
}

function printModeFor(doc, printer) {
  const template = doc.template || 'thermal'
  if (template === 'a5' || template === 'pdf' || printer?.paper_width === 'a4') return 'a5'
  return 'thermal'
}

function mergePrintSettings(restaurant, config) {
  return {
    name: restaurant?.name,
    logo_url: restaurant?.logo_url,
    address: restaurant?.address,
    phone: restaurant?.phone,
    timezone: restaurant?.timezone || config.settings?.timezone,
    currency: restaurant?.currency || config.settings?.currency,
    gstin: config.settings?.gstin,
    owner_name: config.settings?.owner_name,
    email: config.settings?.email,
    city: config.settings?.city,
    state: config.settings?.state,
    pin: config.settings?.pin,
    thank_you_message: config.settings?.thank_you_message,
    bill: config.bill,
    payments: config.payments || restaurant?.payments,
  }
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
  const isBill = printer.use_for === 'bill' || printer.use_for === 'receipt' || printer.is_default_bill || printer.is_default_receipt
  if (restaurant?.id && printer.id) {
    await insertJob({
      restaurant_id: restaurant.id,
      kot_id: null,
      printer_id: printer.id,
      print_type: 'test',
      status: 'queued',
      is_reprint: false,
      copies: 1,
      payload: { sample: true, kind: isBill ? 'bill' : 'kot' },
    })
  }
  try {
    if (isBill) {
      const doc = sampleBillDocument({
        ...settings,
        name: settings?.name || restaurant?.name,
        logo_url: settings?.logo_url || restaurant?.logo_url,
        address: settings?.address || restaurant?.address,
        phone: settings?.phone || restaurant?.phone,
      })
      doc.paperWidth = printer.paper_width || '80mm'
      doc.template = printer.use_for === 'receipt' ? 'thermal' : (billFlags(settings).template || 'thermal')
      const mode = doc.template === 'a5' || printer.paper_width === 'a4' ? 'a5' : 'thermal'
      await printBillDocument(doc, mode)
      return { error: null }
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

export function latestJobForKot(jobs, kotId) {
  return (jobs || []).find((job) => job.kot_id === kotId && job.print_type === 'kot') || null
}

export function latestJobForBill(jobs, billId) {
  return (jobs || []).find((job) => job.bill_id === billId && (job.print_type === 'bill' || job.print_type === 'receipt')) || null
}

export async function printSettledBill({
  restaurant,
  bill,
  orders,
  payments,
  table,
  tableLabel,
  waiter,
  reprint = false,
  auto = false,
}) {
  if (!restaurant?.id || !bill?.id) return { printed: false, skipped: true, error: null, jobs: [] }
  let sessionOrders = orders
  if (bill.session_id) {
    const loaded = await listSessionOrders(restaurant.id, bill.session_id)
    if (!loaded.error && loaded.data?.length) sessionOrders = loaded.data
  }
  const config = await loadPrintConfig(restaurant.id)
  const flags = billFlags({ bill: config.bill })
  if (skipAutoPrint(auto, { bill: config.bill })) {
    return { printed: false, skipped: true, error: null, jobs: [], reason: 'auto-off' }
  }
  const settings = mergePrintSettings(restaurant, config)
  const printers = config.printers
  const billPrinter = defaultBillPrinter(printers)
  const receiptPrinter = defaultReceiptPrinter(printers)
  const backup = backupBillPrinter(printers, billPrinter)
  const targets = []
  if (billPrinter) targets.push({ printer: billPrinter, printType: 'bill' })
  const wantReceipt = flags.printSplitReceipt !== false && (payments || []).length > 1
  const wantMerchant = Boolean(flags.printMerchantCopy)
  if ((wantReceipt || wantMerchant) && receiptPrinter && receiptPrinter.id !== billPrinter?.id) {
    targets.push({ printer: receiptPrinter, printType: 'receipt' })
  }
  if (!targets.length && backup) targets.push({ printer: backup, printType: 'bill' })
  if (!targets.length) {
    const fallback = {
      name: 'Browser print',
      connection_type: 'browser',
      paper_width: '80mm',
      use_for: 'bill',
    }
    targets.push({ printer: fallback, printType: 'bill' })
  }

  const tickets = []
  const jobs = []
  for (const target of targets) {
    const queued = await queueBillJob({
      restaurantId: restaurant.id,
      bill,
      printer: target.printer,
      reprint,
      printType: target.printType,
      payload: {
        bill_number: bill.bill_number,
        printer_name: target.printer?.name || '',
      },
    })
    if (queued.skipped) continue
    if (queued.error) return { printed: false, skipped: false, error: queued.error, jobs }
    const doc = buildBillDocument({
      restaurant,
      settings,
      bill,
      orders: sessionOrders,
      payments,
      table,
      tableLabel,
      waiter,
      reprint,
      paperWidth: target.printer?.paper_width || '80mm',
      template: target.printType === 'receipt' ? 'thermal' : flags.template,
    })
    tickets.push({ doc, printer: target.printer, job: queued.data, mode: printModeFor(doc, target.printer) })
    jobs.push(queued.data)
  }

  if (!tickets.length) return { printed: true, skipped: true, error: null, jobs }

  let anyOk = false
  let lastError = null
  for (const ticket of tickets) {
    try {
      await printBillDocument(ticket.doc, ticket.mode)
      anyOk = true
      await finishJob(ticket.job, restaurant.id, true)
    } catch (error) {
      lastError = error
      await finishJob(ticket.job, restaurant.id, false, error?.message)
    }
  }
  return {
    printed: anyOk,
    skipped: false,
    error: anyOk ? null : { message: lastError?.message || 'Unable to open the print dialog.' },
    jobs,
  }
}

export function reprintBillArgs(args) {
  return { ...args, reprint: true, auto: false }
}

export async function reprintBill(args) {
  return printSettledBill(reprintBillArgs(args))
}

export async function downloadBillPdfFile({ restaurant, bill, orders, payments, table, tableLabel, waiter, reprint = false }) {
  if (!bill) return { error: { message: 'No bill to download.' } }
  let sessionOrders = orders
  if (restaurant?.id && bill.session_id) {
    const loaded = await listSessionOrders(restaurant.id, bill.session_id)
    if (!loaded.error && loaded.data?.length) sessionOrders = loaded.data
  }
  const config = restaurant?.id ? await loadPrintConfig(restaurant.id) : { bill: defaultBill(), settings: {}, printers: [] }
  const settings = mergePrintSettings(restaurant, config)
  const flags = billFlags({ bill: config.bill })
  const doc = buildBillDocument({
    restaurant,
    settings,
    bill,
    orders: sessionOrders,
    payments,
    table,
    tableLabel,
    waiter,
    reprint,
    paperWidth: 'a5',
    template: 'pdf',
  })
  doc.flags = { ...flags, ...doc.flags }
  try {
    const filename = await downloadBillPdf(doc)
    return { filename, error: null }
  } catch (error) {
    return { error: { message: error?.message || 'Unable to download PDF.' } }
  }
}

export async function retryPrintJob({ restaurant, job, order, kot, table, tableLabel, waiter, bill, orders, payments }) {
  if (!job) return { error: { message: 'Print job not found.' } }
  if (job.print_type === 'bill' || job.print_type === 'receipt') {
    return printSettledBill({
      restaurant,
      bill,
      orders,
      payments,
      table,
      tableLabel,
      waiter,
      reprint: Boolean(job.is_reprint) || job.status === 'printed' || job.status === 'failed',
      auto: false,
    })
  }
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
