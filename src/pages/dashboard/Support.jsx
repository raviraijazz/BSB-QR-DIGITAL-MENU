import { useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Card from '../../components/Card'
import EmptyState from '../../components/EmptyState'
import Field, { inputClass } from '../../components/Field'
import Spinner from '../../components/Spinner'
import TicketDrawer from '../../components/support/TicketDrawer'
import { downloadCsv } from '../../lib/csv'
import { menuUrl } from '../../lib/menuUrl'
import { healthSummary, runRestaurantHealth } from '../../lib/restaurantHealth'
import {
  FEEDBACK_MODULES,
  FEEDBACK_TYPES,
  HELP_CATEGORIES,
  REMINDER_RECURRENCE,
  REMINDER_STATUSES,
  SUPPORT_TABS,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  USAGE_RANGES,
  catalogLabel,
  healthLabel,
  healthTone,
  emptyFeedbackForm,
  emptyReminderForm,
  emptyTicketForm,
  formatSupportDate,
  formatSupportDateTime,
  localDateInput,
  monthRange,
  priorityTone,
  statusTone,
  supportRange,
} from '../../lib/supportCatalog'
import { printTestTicket, loadPrintConfig } from '../../services/printJobs'
import { exportOrderHistory } from '../../services/orderHistory'
import {
  cancelMaintenanceReminder,
  completeMaintenanceReminder,
  createMaintenanceReminder,
  createSupportTicket,
  listDataExports,
  listMaintenanceReminders,
  listReleaseNotes,
  listRestaurantFeedback,
  logDataExport,
  loadUsageCounts,
  submitRestaurantFeedback,
  ticketSummary,
  updateMaintenanceReminder,
} from '../../services/support'

const selectClass = inputClass

function KpiCard({ label, value, hint }) {
  return (
    <div className="rounded-[16px] border border-line bg-white p-4 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-2 font-display text-3xl leading-none">{value}</p>
      {hint ? <p className="mt-2 text-[12px] text-muted">{hint}</p> : null}
    </div>
  )
}

function Pill({ className, children }) {
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${className}`}>{children}</span>
}

function Metric({ label, value }) {
  return (
    <div className="rounded-2xl border border-line bg-paper px-3 py-3">
      <p className="text-[11px] uppercase tracking-[0.12em] text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl">{value ?? 'Not available'}</p>
    </div>
  )
}

export default function Support() {
  const { restaurant, user, loading } = useOutletContext()
  const [tab, setTab] = useState('dashboard')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [tickets, setTickets] = useState([])
  const [openCount, setOpenCount] = useState(0)
  const [resolvedMonth, setResolvedMonth] = useState(0)
  const [reminders, setReminders] = useState([])
  const [releases, setReleases] = useState([])
  const [exports, setExports] = useState([])
  const [feedback, setFeedback] = useState([])
  const [health, setHealth] = useState([])
  const [healthBusy, setHealthBusy] = useState(false)
  const [printers, setPrinters] = useState([])
  const [printNotice, setPrintNotice] = useState('')
  const [printError, setPrintError] = useState('')
  const [printBusy, setPrintBusy] = useState('')
  const [usage, setUsage] = useState(null)
  const [usagePreset, setUsagePreset] = useState('today')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [ticketForm, setTicketForm] = useState(emptyTicketForm())
  const [ticketOpen, setTicketOpen] = useState(false)
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [reminderForm, setReminderForm] = useState(emptyReminderForm())
  const [editingReminder, setEditingReminder] = useState(null)
  const [feedbackForm, setFeedbackForm] = useState(emptyFeedbackForm())
  const [helpQuery, setHelpQuery] = useState('')
  const [schemaMissing, setSchemaMissing] = useState(false)

  const timeZone = restaurant?.timezone || 'Asia/Kolkata'
  const restaurantId = restaurant?.id

  const helpResults = useMemo(() => {
    const q = helpQuery.trim().toLowerCase()
    return HELP_CATEGORIES.map((category) => ({
      ...category,
      articles: category.articles.filter((article) => {
        if (!q) return true
        return `${category.label} ${article.title} ${article.body}`.toLowerCase().includes(q)
      }),
    })).filter((category) => category.articles.length)
  }, [helpQuery])

  async function loadCore() {
    if (!restaurantId) {
      setTickets([])
      setReminders([])
      setExports([])
      setFeedback([])
      setOpenCount(0)
      setResolvedMonth(0)
      return
    }
    setBusy(true)
    setError('')
    const month = monthRange(timeZone)
    const [ticketResult, reminderResult, exportResult, feedbackResult, releaseResult] = await Promise.all([
      ticketSummary(restaurantId, month.from.toISOString(), month.to.toISOString()),
      listMaintenanceReminders(restaurantId),
      listDataExports(restaurantId),
      listRestaurantFeedback(restaurantId),
      listReleaseNotes(),
    ])
    const schemaError = [ticketResult.error, reminderResult.error, exportResult.error, feedbackResult.error, releaseResult.error]
      .find((row) => String(row?.message || '').includes('restaurant-support.sql'))
    setSchemaMissing(Boolean(schemaError))
    setError(schemaError?.message || ticketResult.error?.message || reminderResult.error?.message || '')
    setTickets(ticketResult.tickets || [])
    setOpenCount(ticketResult.open || 0)
    setResolvedMonth(ticketResult.resolvedMonth || 0)
    setReminders(reminderResult.data || [])
    setExports(exportResult.data || [])
    setFeedback(feedbackResult.data || [])
    setReleases(releaseResult.data || [])
    setBusy(false)
  }

  async function loadUsage() {
    if (!restaurantId) {
      setUsage(null)
      return
    }
    const range = supportRange(usagePreset, { from: customFrom, to: customTo }, timeZone)
    const result = await loadUsageCounts(restaurantId, range.from.toISOString(), range.to.toISOString())
    setUsage(result)
  }

  useEffect(() => {
    loadCore()
  }, [restaurantId])

  useEffect(() => {
    loadUsage()
  }, [restaurantId, usagePreset, customFrom, customTo, timeZone])

  useEffect(() => {
    let active = true
    async function loadPrinters() {
      if (!restaurantId) {
        setPrinters([])
        return
      }
      const result = await loadPrintConfig(restaurantId)
      if (!active) return
      setPrinters(result.printers || [])
    }
    loadPrinters()
    return () => {
      active = false
    }
  }, [restaurantId])

  const lastExport = exports.find((row) => row.status === 'generated')
  const moduleHealth = healthSummary(health)
  const recentActivity = [
    ...tickets.slice(0, 4).map((row) => ({
      id: `t-${row.id}`,
      label: `${row.ticket_number} · ${row.subject}`,
      at: row.updated_at,
      kind: 'Ticket',
    })),
    ...reminders.slice(0, 4).map((row) => ({
      id: `r-${row.id}`,
      label: row.task,
      at: row.updated_at || row.due_at,
      kind: 'Reminder',
    })),
    ...exports.slice(0, 3).map((row) => ({
      id: `e-${row.id}`,
      label: `${row.export_type.replace('_', ' ')} export`,
      at: row.created_at,
      kind: 'Export',
    })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 8)

  async function onCreateTicket() {
    setError('')
    setNotice('')
    const result = await createSupportTicket(restaurantId, user?.id, ticketForm)
    if (result.error) {
      setError(result.error.message)
      return
    }
    setTicketForm(emptyTicketForm())
    setTicketOpen(false)
    setNotice(`Ticket ${result.data.ticket_number} created.`)
    setSelectedTicket(result.data)
    await loadCore()
  }

  async function onSaveReminder() {
    setError('')
    setNotice('')
    const payload = editingReminder
      ? await updateMaintenanceReminder(restaurantId, editingReminder, reminderForm)
      : await createMaintenanceReminder(restaurantId, reminderForm)
    if (payload.error) {
      setError(payload.error.message)
      return
    }
    setReminderForm(emptyReminderForm())
    setEditingReminder(null)
    setNotice(editingReminder ? 'Reminder updated.' : 'Reminder added.')
    await loadCore()
  }

  async function onFeedback() {
    setError('')
    setNotice('')
    const result = await submitRestaurantFeedback(restaurantId, feedbackForm)
    if (result.error) {
      setError(result.error.message)
      return
    }
    setFeedbackForm(emptyFeedbackForm())
    setNotice('Feedback saved for this restaurant.')
    await loadCore()
  }

  async function runHealth() {
    setHealthBusy(true)
    setError('')
    const rows = await runRestaurantHealth({ restaurant, user })
    setHealth(rows)
    setHealthBusy(false)
  }

  async function testPrint(printer) {
    setPrintBusy(printer.id || printer.name)
    setPrintError('')
    setPrintNotice('')
    const result = await printTestTicket({ restaurant, printer, settings: { name: restaurant?.name } })
    setPrintBusy('')
    if (result.error) {
      setPrintError(result.error.message)
      return
    }
    setPrintNotice(`Browser/system print dialog opened for ${printer.name}. This does not confirm hardware is online.`)
  }

  async function exportHistory() {
    setError('')
    setNotice('')
    const range = supportRange('30d', {}, timeZone)
    const result = await exportOrderHistory({
      restaurantId,
      fromISO: range.from.toISOString(),
      toISO: range.to.toISOString(),
    })
    if (result.error) {
      await logDataExport(restaurantId, 'order_history', 'failed', 0)
      setError(result.error.message || 'Unable to export order history.')
      await loadCore()
      return
    }
    const rows = result.data || []
    downloadCsv(`order-history-${restaurant?.slug || 'restaurant'}.csv`, [
      { key: 'order_number', label: 'Order' },
      { key: 'status', label: 'Status' },
      { key: 'created_at', label: 'Created' },
    ], rows.map((row) => ({
      order_number: row.order_number || row.id,
      status: row.status,
      created_at: row.created_at,
    })))
    await logDataExport(restaurantId, 'order_history', 'generated', rows.length)
    setNotice(`Exported ${rows.length} order history row${rows.length === 1 ? '' : 's'}. This is a data extract, not a database backup.`)
    await loadCore()
  }

  if (loading) return <Spinner />
  if (!restaurant) {
    return (
      <EmptyState
        title="Select a restaurant"
        body="Support tickets, health, reminders and usage are scoped to the selected restaurant."
        actionTo="/dashboard/restaurant"
        actionLabel="Set up restaurant"
      />
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-3xl">Support & Maintenance</h1>
          <p className="mt-1 text-sm text-muted">Get help, review restaurant system health, track updates and manage maintenance.</p>
        </div>
        <Button onClick={() => { setTab('tickets'); setTicketOpen(true) }}>Create Support Ticket</Button>
      </div>

      <Alert>{error}</Alert>
      <Alert type="success">{notice}</Alert>
      {schemaMissing ? (
        <Alert type="info">Run supabase/restaurant-support.sql once in the Supabase SQL Editor to enable tickets, reminders, feedback and export history.</Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Open Support Tickets" value={openCount} hint="Open, in progress or waiting" />
        <KpiCard label="Resolved This Month" value={resolvedMonth} hint="Resolved or closed this month" />
        <KpiCard
          label="Last Successful Export"
          value={lastExport ? formatSupportDateTime(lastExport.created_at, timeZone) : 'Not available'}
          hint={lastExport ? `${lastExport.export_type.replace('_', ' ')} · ${lastExport.row_count} rows` : 'No verified export yet'}
        />
        <KpiCard
          label="Restaurant Module Health"
          value={health.length ? healthLabel(moduleHealth) : 'Not Checked'}
          hint={health.length ? `${health.filter((row) => row.status === 'operational').length} operational checks` : 'Run available checks'}
        />
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {SUPPORT_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm ${tab === item.id ? 'bg-forest text-[#f5ead8]' : 'border border-line bg-white text-ink hover:bg-paper'}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'dashboard' ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card title="Recent tickets" action={<Button variant="secondary" onClick={() => setTab('tickets')}>View all</Button>}>
            {busy && !tickets.length ? <Spinner label="Loading tickets..." /> : null}
            {!tickets.length ? <p className="text-sm text-muted">No tickets for this restaurant yet.</p> : null}
            <div className="space-y-2">
              {tickets.slice(0, 5).map((row) => (
                <button key={row.id} type="button" className="flex w-full items-start justify-between gap-3 rounded-2xl border border-line bg-white px-3 py-2 text-left" onClick={() => setSelectedTicket(row)}>
                  <span>
                    <span className="block text-sm font-medium">{row.ticket_number} · {row.subject}</span>
                    <span className="text-[12px] text-muted">{catalogLabel(TICKET_CATEGORIES, row.category)} · {formatSupportDateTime(row.updated_at, timeZone)}</span>
                  </span>
                  <Pill className={statusTone(row.status)}>{catalogLabel(TICKET_STATUSES, row.status)}</Pill>
                </button>
              ))}
            </div>
          </Card>
          <Card title="Recent activity">
            {!recentActivity.length ? <p className="text-sm text-muted">No recent restaurant support activity.</p> : null}
            <ul className="space-y-2 text-sm">
              {recentActivity.map((row) => (
                <li key={row.id} className="flex justify-between gap-3">
                  <span><span className="text-muted">{row.kind}</span> · {row.label}</span>
                  <span className="shrink-0 text-[12px] text-muted">{formatSupportDateTime(row.at, timeZone)}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Maintenance reminders" action={<Button variant="secondary" onClick={() => setTab('maintenance')}>Manage</Button>}>
            {reminders.filter((row) => row.status === 'open').slice(0, 4).map((row) => (
              <p key={row.id} className="border-b border-line/70 py-2 text-sm last:border-b-0">{row.task} · due {formatSupportDate(row.due_at, timeZone)}</p>
            ))}
            {!reminders.filter((row) => row.status === 'open').length ? <p className="text-sm text-muted">No open reminders.</p> : null}
          </Card>
          <Card title="Help resources">
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setTab('help')}>Help & Guides</Button>
              <Button variant="secondary" onClick={() => setTab('health')}>Run health checks</Button>
              <Link to="/dashboard/settings"><Button variant="secondary">Printer Settings</Button></Link>
              <Link to="/dashboard/table-wise/history"><Button variant="secondary">Order History</Button></Link>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === 'tickets' ? (
        <Card
          title="Support tickets"
          action={<Button onClick={() => setTicketOpen((open) => !open)}>{ticketOpen ? 'Hide form' : 'Create Support Ticket'}</Button>}
        >
          {ticketOpen ? (
            <div className="mb-5 grid gap-3 rounded-[16px] border border-line bg-paper p-4 sm:grid-cols-2">
              <Field label="Subject">
                <input className={inputClass} value={ticketForm.subject} onChange={(e) => setTicketForm({ ...ticketForm, subject: e.target.value })} />
              </Field>
              <Field label="Category">
                <select className={selectClass} value={ticketForm.category} onChange={(e) => setTicketForm({ ...ticketForm, category: e.target.value })}>
                  {TICKET_CATEGORIES.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                </select>
              </Field>
              <Field label="Priority">
                <select className={selectClass} value={ticketForm.priority} onChange={(e) => setTicketForm({ ...ticketForm, priority: e.target.value })}>
                  {TICKET_PRIORITIES.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                </select>
              </Field>
              <div className="sm:col-span-2">
                <Field label="Description">
                  <textarea className={inputClass} rows={4} value={ticketForm.description} onChange={(e) => setTicketForm({ ...ticketForm, description: e.target.value })} />
                </Field>
              </div>
              <p className="sm:col-span-2 text-[12px] text-muted">Attachments are not configured. A private storage bucket is required before ticket files can be accepted.</p>
              <div className="sm:col-span-2">
                <Button onClick={onCreateTicket}>Submit ticket</Button>
              </div>
            </div>
          ) : null}
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.12em] text-muted">
                  <th className="px-2 py-2">Ticket</th>
                  <th className="px-2 py-2">Subject</th>
                  <th className="px-2 py-2">Category</th>
                  <th className="px-2 py-2">Priority</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Created</th>
                  <th className="px-2 py-2">Updated</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {tickets.map((row) => (
                  <tr key={row.id} className="border-t border-line">
                    <td className="px-2 py-2 font-medium">{row.ticket_number}</td>
                    <td className="px-2 py-2">{row.subject}</td>
                    <td className="px-2 py-2">{catalogLabel(TICKET_CATEGORIES, row.category)}</td>
                    <td className="px-2 py-2"><Pill className={priorityTone(row.priority)}>{catalogLabel(TICKET_PRIORITIES, row.priority)}</Pill></td>
                    <td className="px-2 py-2"><Pill className={statusTone(row.status)}>{catalogLabel(TICKET_STATUSES, row.status)}</Pill></td>
                    <td className="px-2 py-2">{formatSupportDate(row.created_at, timeZone)}</td>
                    <td className="px-2 py-2">{formatSupportDateTime(row.updated_at, timeZone)}</td>
                    <td className="px-2 py-2"><Button variant="secondary" className="h-8 px-3 py-0" onClick={() => setSelectedTicket(row)}>View</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!tickets.length ? <p className="px-2 py-6 text-sm text-muted">No tickets for {restaurant.name}.</p> : null}
          </div>
        </Card>
      ) : null}

      {tab === 'health' ? (
        <div className="space-y-4">
          <Card title="Restaurant system health" action={<Button onClick={runHealth} disabled={healthBusy}>{healthBusy ? 'Checking...' : 'Run Available Checks'}</Button>}>
            <p className="mb-3 text-sm text-muted">These checks query modules this restaurant already uses. They do not show platform uptime, other restaurants, secrets or stack traces.</p>
            <div className="grid gap-3 md:grid-cols-2">
              {(health.length ? health : [
                { id: 'access', title: 'Application access', status: 'not-checked', message: 'Not checked' },
                { id: 'data', title: 'Restaurant data access', status: 'not-checked', message: 'Not checked' },
                { id: 'menu', title: 'Menu availability', status: 'not-checked', message: 'Not checked' },
                { id: 'tables', title: 'Table/session workflow', status: 'not-checked', message: 'Not checked' },
                { id: 'orders', title: 'Order submission', status: 'not-checked', message: 'Not checked' },
                { id: 'kot', title: 'KOT/Kitchen', status: 'not-checked', message: 'Not checked' },
                { id: 'bills', title: 'Bill/payment workflow', status: 'not-checked', message: 'Not checked' },
                { id: 'printers', title: 'Printer configuration', status: 'not-checked', message: 'Not checked' },
                { id: 'qr', title: 'QR/Public Menu availability', status: 'not-checked', message: 'Not checked' },
              ]).map((row) => (
                <div key={row.id} className={`rounded-[16px] border p-3 ${healthTone(row.status)}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{row.title}</p>
                    <Pill className={healthTone(row.status)}>{healthLabel(row.status)}</Pill>
                  </div>
                  <p className="mt-1 text-[12px] opacity-80">{row.message}</p>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Printer diagnostics" action={<Link to="/dashboard/settings"><Button variant="secondary">Printer Settings</Button></Link>}>
            <Alert>{printError}</Alert>
            <Alert type="success">{printNotice}</Alert>
            {!printers.length ? <p className="text-sm text-muted">No printer profiles configured. Browser/system print may still be available from KOT and bill screens.</p> : null}
            <div className="space-y-2">
              {printers.map((printer) => (
                <div key={printer.id || printer.name} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{printer.name}</p>
                    <p className="text-[12px] text-muted">
                      Profile {printer.is_active === false ? 'inactive' : 'configured'} · {printer.connection_type} · {printer.use_for}
                    </p>
                    <p className="text-[12px] text-muted">
                      Browser/system print: {typeof window !== 'undefined' ? 'available' : 'unknown'}. Hardware connection: not verified.
                    </p>
                  </div>
                  <Button variant="secondary" disabled={Boolean(printBusy)} onClick={() => testPrint(printer)}>
                    {printBusy === (printer.id || printer.name) ? 'Opening...' : 'Test print'}
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      {tab === 'releases' ? (
        <Card title="Updates & Releases">
          <p className="mb-3 text-sm text-muted">
            Restaurant owners cannot publish platform-wide releases. Published notes appear here when the separate Platform Admin Panel adds them. App version in this bundle is 1.0.0.
          </p>
          {!releases.length ? (
            <EmptyState title="No published release notes" body="This is a read-only foundation. When notes are published they will list version, date, features, bug fixes and maintenance notices." />
          ) : (
            <div className="space-y-3">
              {releases.map((row) => (
                <article key={row.id} className="rounded-[16px] border border-line bg-white p-4">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted">{row.version} · {formatSupportDate(row.released_at, timeZone)}</p>
                  <h3 className="mt-1 font-display text-xl">{row.title}</h3>
                  {row.features ? <p className="mt-2 whitespace-pre-wrap text-sm">{row.features}</p> : null}
                  {row.bug_fixes ? <p className="mt-2 text-sm"><span className="font-medium">Bug fixes.</span> {row.bug_fixes}</p> : null}
                  {row.maintenance_notices ? <p className="mt-2 text-sm"><span className="font-medium">Maintenance.</span> {row.maintenance_notices}</p> : null}
                </article>
              ))}
            </div>
          )}
        </Card>
      ) : null}

      {tab === 'maintenance' ? (
        <div className="space-y-4">
          <Card title="Restaurant maintenance reminders">
            <p className="mb-3 text-sm text-muted">These are restaurant reminders, not platform backup or log-cleanup jobs. Database backup/restore is managed separately and is not available here.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Task">
                <input className={inputClass} value={reminderForm.task} onChange={(e) => setReminderForm({ ...reminderForm, task: e.target.value })} />
              </Field>
              <Field label="Due">
                <input type="datetime-local" className={inputClass} value={reminderForm.due_at} onChange={(e) => setReminderForm({ ...reminderForm, due_at: e.target.value })} />
              </Field>
              <Field label="Recurrence">
                <select className={selectClass} value={reminderForm.recurrence} onChange={(e) => setReminderForm({ ...reminderForm, recurrence: e.target.value })}>
                  {REMINDER_RECURRENCE.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                </select>
              </Field>
              <div className="sm:col-span-2">
                <Field label="Description">
                  <textarea className={inputClass} rows={3} value={reminderForm.description} onChange={(e) => setReminderForm({ ...reminderForm, description: e.target.value })} />
                </Field>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={onSaveReminder}>{editingReminder ? 'Save task' : 'Add Task'}</Button>
                {editingReminder ? <Button variant="secondary" onClick={() => { setEditingReminder(null); setReminderForm(emptyReminderForm()) }}>Cancel edit</Button> : null}
              </div>
            </div>
          </Card>
          <Card title="Scheduled tasks">
            <div className="space-y-2">
              {reminders.map((row) => (
                <div key={row.id} className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-line bg-white px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{row.task}</p>
                    <p className="text-[12px] text-muted">{row.description || 'No description'} · due {formatSupportDateTime(row.due_at, timeZone)} · {catalogLabel(REMINDER_RECURRENCE, row.recurrence)}</p>
                    {row.completed_at ? <p className="text-[12px] text-muted">Completed {formatSupportDateTime(row.completed_at, timeZone)}</p> : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill className={statusTone(row.status)}>{catalogLabel(REMINDER_STATUSES, row.status)}</Pill>
                    {row.status === 'open' ? (
                      <>
                        <Button variant="secondary" className="h-8 px-3 py-0" onClick={() => {
                          setEditingReminder(row.id)
                          setReminderForm({
                            task: row.task,
                            description: row.description || '',
                            due_at: row.due_at ? new Date(new Date(row.due_at).getTime() - new Date(row.due_at).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '',
                            recurrence: row.recurrence || 'none',
                          })
                        }}>Edit</Button>
                        <Button variant="secondary" className="h-8 px-3 py-0" onClick={async () => { await completeMaintenanceReminder(restaurantId, row.id); loadCore() }}>Mark Complete</Button>
                        <Button variant="secondary" className="h-8 px-3 py-0" onClick={async () => { await cancelMaintenanceReminder(restaurantId, row.id); loadCore() }}>Cancel</Button>
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
              {!reminders.length ? <p className="text-sm text-muted">No reminders yet.</p> : null}
            </div>
          </Card>
          <Card title="Backup & data export">
            <p className="text-sm text-muted">
              Database backup and restore are not available in the restaurant owner panel. CSV and PDF downloads from Order History and Collections are data extracts, not backups, and cannot restore production data.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={exportHistory}>Export order history CSV</Button>
              <Link to="/dashboard/table-wise/collections"><Button variant="secondary">Open Collections exports</Button></Link>
              <Link to="/dashboard/table-wise/history"><Button variant="secondary">Open Order History</Button></Link>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-[0.12em] text-muted">
                    <th className="px-2 py-2">Export</th>
                    <th className="px-2 py-2">Date</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Rows</th>
                  </tr>
                </thead>
                <tbody>
                  {exports.map((row) => (
                    <tr key={row.id} className="border-t border-line">
                      <td className="px-2 py-2">{row.export_type.replace('_', ' ')}</td>
                      <td className="px-2 py-2">{formatSupportDateTime(row.created_at, timeZone)}</td>
                      <td className="px-2 py-2"><Pill className={statusTone(row.status)}>{row.status}</Pill></td>
                      <td className="px-2 py-2">{row.row_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!exports.length ? <p className="px-2 py-4 text-sm text-muted">No export history recorded yet.</p> : null}
            </div>
          </Card>
        </div>
      ) : null}

      {tab === 'usage' ? (
        <Card title={`Usage analytics · ${restaurant.name}`}>
          <div className="mb-4 flex flex-wrap gap-2">
            {USAGE_RANGES.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setUsagePreset(row.id)}
                className={`rounded-xl px-3 py-1.5 text-sm ${usagePreset === row.id ? 'bg-forest text-[#f5ead8]' : 'border border-line bg-white'}`}
              >
                {row.label}
              </button>
            ))}
            {usagePreset === 'custom' ? (
              <div className="flex flex-wrap gap-2">
                <input type="date" className={inputClass} value={customFrom || localDateInput(new Date(), timeZone)} onChange={(e) => setCustomFrom(e.target.value)} />
                <input type="date" className={inputClass} value={customTo || customFrom || localDateInput(new Date(), timeZone)} onChange={(e) => setCustomTo(e.target.value)} />
              </div>
            ) : null}
          </div>
          <p className="mb-3 text-sm text-muted">Counts use restaurant-scoped head queries in {timeZone}. Other restaurants are not included.</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Metric label="Orders in period" value={usage?.orders} />
            <Metric label="Sessions in period" value={usage?.sessions} />
            <Metric label="Bills generated" value={usage?.bills} />
            <Metric label="KOT activity" value={usage?.kots} />
            <Metric label="Menu items" value={usage?.items} />
            <Metric label="Waiters" value={usage?.waiters} />
            <Metric label="Tables" value={usage?.tables} />
          </div>
        </Card>
      ) : null}

      {tab === 'help' ? (
        <Card title="Help & Guides">
          <Field label="Search">
            <input className={inputClass} value={helpQuery} onChange={(e) => setHelpQuery(e.target.value)} placeholder="Search guides" />
          </Field>
          <div className="mt-4 space-y-4">
            {helpResults.map((category) => (
              <section key={category.id}>
                <h3 className="font-display text-xl">{category.label}</h3>
                <div className="mt-2 space-y-2">
                  {category.articles.map((article) => (
                    <article key={article.id} className="rounded-2xl border border-line bg-white p-3">
                      <h4 className="text-sm font-medium">{article.title}</h4>
                      <p className="mt-1 text-sm text-muted">{article.body}</p>
                    </article>
                  ))}
                </div>
              </section>
            ))}
            {!helpResults.length ? <p className="text-sm text-muted">No matching guides.</p> : null}
          </div>
        </Card>
      ) : null}

      {tab === 'feedback' ? (
        <Card title="Feedback">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Type">
              <select className={selectClass} value={feedbackForm.feedback_type} onChange={(e) => setFeedbackForm({ ...feedbackForm, feedback_type: e.target.value })}>
                {FEEDBACK_TYPES.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
              </select>
            </Field>
            <Field label="Related module">
              <select className={selectClass} value={feedbackForm.related_module} onChange={(e) => setFeedbackForm({ ...feedbackForm, related_module: e.target.value })}>
                {FEEDBACK_MODULES.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
              </select>
            </Field>
            <Field label="Rating" hint="Optional, 1 to 5">
              <select className={selectClass} value={feedbackForm.rating} onChange={(e) => setFeedbackForm({ ...feedbackForm, rating: e.target.value })}>
                <option value="">No rating</option>
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Message">
                <textarea className={inputClass} rows={4} value={feedbackForm.message} onChange={(e) => setFeedbackForm({ ...feedbackForm, message: e.target.value })} />
              </Field>
            </div>
            <Button onClick={onFeedback}>Submit feedback</Button>
          </div>
          <div className="mt-5 space-y-2">
            {feedback.map((row) => (
              <div key={row.id} className="rounded-2xl border border-line bg-paper px-3 py-2">
                <p className="text-[12px] text-muted">{catalogLabel(FEEDBACK_TYPES, row.feedback_type)} · {formatSupportDateTime(row.created_at, timeZone)}{row.rating ? ` · ${row.rating}/5` : ''}</p>
                <p className="text-sm">{row.message}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {restaurant.slug ? (
        <p className="text-[12px] text-muted">Public menu: {menuUrl(restaurant.slug)}</p>
      ) : null}

      {selectedTicket ? (
        <TicketDrawer
          ticket={selectedTicket}
          restaurant={{ ...restaurant, timezone: timeZone }}
          user={user}
          onClose={() => setSelectedTicket(null)}
          onUpdated={(next) => {
            if (next) setSelectedTicket(next)
            loadCore()
          }}
        />
      ) : null}
    </div>
  )
}
