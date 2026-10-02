import { useEffect, useMemo, useState } from 'react'
import Alert from './Alert'
import Button from './Button'
import { inputClass } from './Field'
import NavIcon from './NavIcon'
import { formatBillMoney, formatClock } from '../lib/orderCart'
import { sessionTablesLabel, tableHeading } from '../lib/tableToken'
import { listRestaurantBills } from '../services/bills'
import { listRestaurantPayments } from '../services/payments'
import { occupancyForTable, previewMerge, tablesForSession } from '../services/tableMoves'
import { isTableActive } from '../services/tables'

function DialogShell({ open, title, onClose, children }) {
  useEffect(() => {
    if (!open) return undefined
    function onKey(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-card p-5 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-2xl">{title}</h2>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl border border-line">
            <NavIcon name="close" className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function MergeTablesDialog({
  open,
  restaurantId,
  tables,
  sessions,
  orders,
  startTableId,
  busy,
  onClose,
  onConfirm,
}) {
  const [primaryId, setPrimaryId] = useState(startTableId || '')
  const [extraIds, setExtraIds] = useState([])
  const [bills, setBills] = useState([])
  const [payments, setPayments] = useState([])
  const [error, setError] = useState('')
  const [confirmMulti, setConfirmMulti] = useState(false)
  const [confirmPartial, setConfirmPartial] = useState(false)

  useEffect(() => {
    if (!open) return
    setPrimaryId(startTableId || '')
    setExtraIds([])
    setError('')
    setConfirmMulti(false)
    setConfirmPartial(false)
  }, [open, startTableId])

  useEffect(() => {
    if (!open || !restaurantId) return undefined
    let active = true
    async function load() {
      const [nextBills, nextPayments] = await Promise.all([
        listRestaurantBills(restaurantId),
        listRestaurantPayments(restaurantId),
      ])
      if (!active) return
      setBills(nextBills.data ?? [])
      setPayments(nextPayments.data ?? [])
      setError(nextBills.error?.message || nextPayments.error?.message || '')
    }
    load()
    return () => {
      active = false
    }
  }, [open, restaurantId])

  const preview = useMemo(
    () =>
      previewMerge({
        tables,
        sessions,
        orders,
        bills,
        payments,
        primaryTableId: primaryId,
        extraIds,
      }),
    [tables, sessions, orders, bills, payments, primaryId, extraIds],
  )

  const occupied = useMemo(
    () => (tables || []).filter((table) => occupancyForTable(sessions, table.id)),
    [tables, sessions],
  )
  const available = useMemo(
    () => (tables || []).filter((table) => isTableActive(table) && !occupancyForTable(sessions, table.id)),
    [tables, sessions],
  )

  function toggleExtra(id) {
    if (id === primaryId) return
    setExtraIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
    setConfirmMulti(false)
    setConfirmPartial(false)
  }

  function submit() {
    if (!primaryId || extraIds.length === 0) {
      setError('Select a primary table and at least one table to merge.')
      return
    }
    if (preview.settled) {
      setError('Cannot merge a settled bill.')
      return
    }
    if (preview.none) {
      setError('Start a session on the primary table first.')
      return
    }
    if (preview.multi && !confirmMulti) {
      setError('These tables have separate sessions. Confirm to combine them into one session and one bill.')
      return
    }
    if (preview.partial && !confirmPartial) {
      setError('This bill has a partial payment. Confirm to continue.')
      return
    }
    onConfirm({
      primaryTableId: primaryId,
      tableIds: preview.selectedIds,
      confirmMulti,
      confirmPartial,
    })
  }

  return (
    <DialogShell open={open} title="Merge Tables?" onClose={onClose}>
      <p className="mt-1 text-sm text-muted">One combined session. One running bill. Orders and KOTs stay intact.</p>
      <div className="mt-4 space-y-3">
        <Alert>{error}</Alert>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Primary table</span>
          <select
            className={inputClass}
            value={primaryId}
            onChange={(event) => {
              setPrimaryId(event.target.value)
              setExtraIds((current) => current.filter((id) => id !== event.target.value))
            }}
          >
            <option value="">Select table</option>
            {occupied.map((table) => (
              <option key={table.id} value={table.id}>
                {tableHeading(table)}
              </option>
            ))}
          </select>
        </label>
        <div>
          <p className="mb-1 text-sm font-medium">Merge with</p>
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-line bg-white p-2">
            {[...occupied, ...available]
              .filter((table) => table.id !== primaryId)
              .map((table) => {
                const session = occupancyForTable(sessions, table.id)
                return (
                  <label key={table.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-paper">
                    <input type="checkbox" checked={extraIds.includes(table.id)} onChange={() => toggleExtra(table.id)} />
                    <span className="min-w-0 flex-1 truncate">{tableHeading(table)}</span>
                    <span className="text-xs text-muted">{session ? session.session_number : 'Available'}</span>
                  </label>
                )
              })}
          </div>
        </div>
        {preview.selectedTables.length ? (
          <div className="rounded-2xl border border-line bg-paper/80 px-4 py-3 text-sm">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Result</p>
            <p className="mt-1 font-display text-xl">{sessionTablesLabel(preview.selectedTables, { compact: true })}</p>
            <p className="mt-2 text-muted">
              {preview.orderCount} {preview.orderCount === 1 ? 'order' : 'orders'} · Subtotal {formatBillMoney(preview.subtotal)}
            </p>
            <p className="text-muted">
              Discount {preview.discountAmount ? formatBillMoney(preview.discountAmount) : 'None'} · Payable {formatBillMoney(preview.payable)}
            </p>
            {preview.multi ? (
              <p className="mt-2 text-accent-dark">
                {preview.involved.length} sessions will become one session and one running bill.
              </p>
            ) : (
              <p className="mt-2 text-muted">Free tables attach to the existing session. No duplicate session is created.</p>
            )}
            {preview.involved.map((row) => (
              <p key={row.session.id} className="mt-1 text-xs text-muted">
                {sessionTablesLabel(row.tables, { compact: true })} · {row.session.session_number} · {row.orderCount} orders
                {row.bill?.bill_number ? ` · ${row.bill.bill_number}` : ''}
                {row.partial ? ' · partial payment' : ''}
              </p>
            ))}
          </div>
        ) : null}
        {preview.multi ? (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={confirmMulti} onChange={(event) => setConfirmMulti(event.target.checked)} />
            Combine these sessions into one session and one running bill. Orders, KOTs and payments stay.
          </label>
        ) : null}
        {preview.partial ? (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={confirmPartial} onChange={(event) => setConfirmPartial(event.target.checked)} />
            Continue with a partially paid bill. Payment history is not moved off this restaurant.
          </label>
        ) : null}
      </div>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={busy || preview.settled}>
          {busy ? 'Merging...' : 'Confirm Merge'}
        </Button>
      </div>
    </DialogShell>
  )
}

export function TransferTableDialog({
  open,
  restaurantId,
  tables,
  sessions,
  orders,
  startTableId,
  busy,
  onClose,
  onConfirm,
}) {
  const [fromId, setFromId] = useState(startTableId || '')
  const [toId, setToId] = useState('')
  const [bills, setBills] = useState([])
  const [payments, setPayments] = useState([])
  const [error, setError] = useState('')
  const [confirmPartial, setConfirmPartial] = useState(false)

  useEffect(() => {
    if (!open) return
    setFromId(startTableId || '')
    setToId('')
    setError('')
    setConfirmPartial(false)
  }, [open, startTableId])

  useEffect(() => {
    if (!open || !restaurantId) return undefined
    let active = true
    async function load() {
      const [nextBills, nextPayments] = await Promise.all([
        listRestaurantBills(restaurantId),
        listRestaurantPayments(restaurantId),
      ])
      if (!active) return
      setBills(nextBills.data ?? [])
      setPayments(nextPayments.data ?? [])
      setError(nextBills.error?.message || nextPayments.error?.message || '')
    }
    load()
    return () => {
      active = false
    }
  }, [open, restaurantId])

  const fromSession = occupancyForTable(sessions, fromId)
  const fromTables = tablesForSession(tables, fromSession)
  const fromOrders = (orders || []).filter((order) => order.session_id === fromSession?.id && order.status !== 'cancelled')
  const fromBill = (bills || []).find((row) => row.session_id === fromSession?.id && row.status !== 'cancelled')
  const fromPaid = (payments || []).filter((row) => row.bill_id === fromBill?.id).reduce((sum, row) => sum + (Number(row.amount) || 0), 0)
  const partial = Boolean(fromBill && fromBill.status !== 'paid' && (fromPaid > 0 || fromBill.status === 'payment_pending'))
  const settled = fromBill?.status === 'paid'
  const destinations = (tables || []).filter((table) => {
    if (table.id === fromId) return false
    if (!isTableActive(table)) return false
    return !occupancyForTable(sessions, table.id)
  })
  const toTable = (tables || []).find((table) => table.id === toId)

  function submit() {
    if (!fromId || !toId) {
      setError('Choose a current table and a destination table.')
      return
    }
    if (!fromSession) {
      setError('No active session on the current table.')
      return
    }
    if (settled) {
      setError('Cannot transfer a settled bill.')
      return
    }
    if (partial && !confirmPartial) {
      setError('This bill has a partial payment. Confirm to continue.')
      return
    }
    onConfirm({ fromTableId: fromId, toTableId: toId, confirmPartial })
  }

  return (
    <DialogShell open={open} title="Transfer Table?" onClose={onClose}>
      <p className="mt-1 text-sm text-muted">The same session, orders, KOTs, bill and payments move to the destination table.</p>
      <div className="mt-4 space-y-3">
        <Alert>{error}</Alert>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Current table</span>
          <select className={inputClass} value={fromId} onChange={(event) => setFromId(event.target.value)}>
            <option value="">Select table</option>
            {(tables || [])
              .filter((table) => occupancyForTable(sessions, table.id))
              .map((table) => (
                <option key={table.id} value={table.id}>
                  {tableHeading(table)}
                </option>
              ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Destination table</span>
          <select className={inputClass} value={toId} onChange={(event) => setToId(event.target.value)}>
            <option value="">Available table</option>
            {destinations.map((table) => (
              <option key={table.id} value={table.id}>
                {tableHeading(table)}
              </option>
            ))}
          </select>
        </label>
        {fromSession ? (
          <div className="rounded-2xl border border-line bg-paper/80 px-4 py-3 text-sm">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Result</p>
            <p className="mt-1">
              {sessionTablesLabel(fromTables.length ? fromTables : tables.filter((table) => table.id === fromId), { compact: true })}
              {' -> '}
              {toTable ? tableHeading(toTable) : 'Destination'}
            </p>
            <p className="mt-1 text-muted">
              {fromSession.session_number} stays the same · {fromOrders.length} {fromOrders.length === 1 ? 'order' : 'orders'}
              {fromBill?.bill_number ? ` · ${fromBill.bill_number}` : ''}
            </p>
            <p className="mt-1 text-xs text-muted">Started {formatClock(fromSession.started_at)}. Waiter assignment is unchanged.</p>
          </div>
        ) : null}
        {partial ? (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={confirmPartial} onChange={(event) => setConfirmPartial(event.target.checked)} />
            Continue with a partially paid bill. Payment history stays on this session.
          </label>
        ) : null}
      </div>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={busy || settled}>
          {busy ? 'Transferring...' : 'Confirm Transfer'}
        </Button>
      </div>
    </DialogShell>
  )
}
