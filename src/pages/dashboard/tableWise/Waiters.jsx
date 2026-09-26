import { useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import Alert from '../../../components/Alert'
import Button from '../../../components/Button'
import Card from '../../../components/Card'
import EmptyState from '../../../components/EmptyState'
import Field, { inputClass } from '../../../components/Field'
import NavIcon from '../../../components/NavIcon'
import Spinner from '../../../components/Spinner'
import { TABLE_WISE_HOME } from '../../../lib/tableWiseNav'
import { tableHeading } from '../../../lib/tableToken'
import { listTables } from '../../../services/tables'
import {
  assignedCountForWaiter,
  assignmentsByTableId,
  listAssignments,
  saveWaiterTableAssignments,
} from '../../../services/waiterAssignments'
import { provisionWaiter } from '../../../services/waiterAuth'
import {
  assignedTableCount,
  hasDuplicateWaiterId,
  listWaiters,
  setWaiterActive,
  updateWaiter,
  validateWaiterFields,
  validateWaiterPasswords,
  waiterHasLogin,
  waiterLoginLabel,
  waiterLoginStatus,
} from '../../../services/waiters'

const emptyForm = {
  full_name: '',
  waiter_id: '',
  password: '',
  confirm_password: '',
  is_active: true,
}

function formatDate(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return '—'
  }
}

function StatusBadge({ active }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
        active ? 'bg-forest/10 text-forest' : 'bg-paper text-muted'
      }`}
    >
      {active ? 'Active' : 'Disabled'}
    </span>
  )
}

function LoginBadge({ waiter }) {
  const status = waiterLoginStatus(waiter)
  const className =
    status === 'enabled'
      ? 'bg-forest/10 text-forest'
      : status === 'disabled'
        ? 'bg-paper text-muted'
        : 'bg-gold/15 text-ink'
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium ${className}`}>
      {waiterLoginLabel(waiter)}
    </span>
  )
}

function WaiterModal({ open, mode, form, onChange, onClose, onSubmit, busy, error, lockWaiterId }) {
  if (!open) return null
  const adding = mode === 'add'
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-4 sm:items-center" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <form onSubmit={onSubmit} className="relative z-10 w-full max-w-md rounded-2xl border border-line bg-card p-5 shadow-lg">
        <h2 className="font-display text-xl">{adding ? 'Add Waiter' : 'Edit waiter'}</h2>
        <p className="mt-1 text-sm text-muted">
          {adding
            ? 'Creates a waiter login for this restaurant. Password is stored only in Supabase Auth.'
            : 'Update name or status. Password is never shown.'}
        </p>
        <div className="mt-4 space-y-3">
          <Alert>{error}</Alert>
          <Field label="Full Name">
            <input
              className={inputClass}
              placeholder="e.g. Ravi Kumar"
              value={form.full_name}
              onChange={(e) => onChange('full_name', e.target.value)}
              autoComplete="name"
            />
          </Field>
          <Field
            label="Waiter ID / Username"
            hint={
              lockWaiterId
                ? 'Waiter ID cannot change after login is enabled.'
                : '3–24 letters, numbers or underscores. Unique. Example: RAVI01'
            }
          >
            <input
              className={inputClass}
              placeholder="e.g. RAVI01"
              value={form.waiter_id}
              onChange={(e) => onChange('waiter_id', e.target.value)}
              autoComplete="off"
              disabled={lockWaiterId}
            />
          </Field>
          {adding ? (
            <>
              <Field label="Password" hint="Stored in Supabase Auth only. The waiter signs in with Waiter ID + password.">
                <input
                  className={inputClass}
                  type="password"
                  placeholder="At least 6 characters"
                  value={form.password}
                  onChange={(e) => onChange('password', e.target.value)}
                  autoComplete="new-password"
                />
              </Field>
              <Field label="Confirm Password">
                <input
                  className={inputClass}
                  type="password"
                  placeholder="Repeat password"
                  value={form.confirm_password}
                  onChange={(e) => onChange('confirm_password', e.target.value)}
                  autoComplete="new-password"
                />
              </Field>
            </>
          ) : null}
          <label className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white px-3 py-2.5">
            <span className="text-sm font-medium">Status</span>
            <button
              type="button"
              role="switch"
              aria-checked={form.is_active}
              onClick={() => onChange('is_active', !form.is_active)}
              className={`relative h-7 w-12 shrink-0 rounded-full transition ${form.is_active ? 'bg-forest' : 'bg-stone-300'}`}
            >
              <span
                className="absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition"
                style={{ left: form.is_active ? '1.4rem' : '0.15rem' }}
              />
            </button>
          </label>
          <p className="text-xs text-muted">{form.is_active ? 'Active' : 'Disabled'}</p>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving...' : adding ? 'Add Waiter' : 'Save'}
          </Button>
        </div>
      </form>
    </div>
  )
}

function AssignTablesModal({
  open,
  waiter,
  restaurant,
  tables,
  waiters,
  assignments,
  selected,
  onToggle,
  onClose,
  onSave,
  busy,
  error,
}) {
  if (!open || !waiter) return null
  const ownerByTable = assignmentsByTableId(assignments)
  const waiterById = new Map((waiters || []).map((item) => [item.id, item]))
  const selectedCount = selected.length
  const waiterActive = waiter.is_active !== false

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-4 sm:items-center" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <form
        onSubmit={onSave}
        className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-line bg-card p-5 shadow-lg"
      >
        <h2 className="font-display text-xl">Manage Tables — {waiter.full_name}</h2>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
          <span className="font-mono text-[13px] text-ink">{waiter.waiter_id}</span>
          <span>{waiterActive ? 'Active' : 'Disabled'}</span>
          <span>{restaurant?.name}</span>
        </div>
        <p className="mt-2 text-xs text-muted">
          One table can belong to one waiter. Assigned: {selectedCount} {selectedCount === 1 ? 'table' : 'tables'}.
        </p>
        <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          <Alert>{error}</Alert>
          {tables.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line bg-white/70 px-4 py-8 text-center text-sm text-muted">
              Add tables from Floor / Tables first.
            </p>
          ) : (
            tables.map((table) => {
              const checked = selected.includes(table.id)
              const current = ownerByTable.get(table.id)
              const currentWaiter = current ? waiterById.get(current.waiter_id) : null
              const assignedToOther = Boolean(currentWaiter && currentWaiter.id !== waiter.id)
              const blocked = assignedToOther && !waiterActive
              return (
                <label
                  key={table.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 ${
                    checked ? 'border-forest bg-forest/5' : 'border-line bg-white'
                  } ${blocked ? 'cursor-not-allowed opacity-70' : ''}`}
                >
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-[#1f3d32]"
                    checked={checked}
                    disabled={blocked}
                    onChange={() => onToggle(table.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{tableHeading(table)}</span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {assignedToOther
                        ? `Currently assigned to ${currentWaiter.full_name} (${currentWaiter.waiter_id})`
                        : checked
                          ? `Assigned to ${waiter.full_name}`
                          : 'Unassigned'}
                    </span>
                  </span>
                </label>
              )
            })
          )}
        </div>
        {!waiterActive ? (
          <p className="mt-3 text-xs text-muted">Disabled waiters can unassign tables, but cannot receive new assignments.</p>
        ) : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || tables.length === 0}>
            {busy ? 'Saving...' : 'Save Assignments'}
          </Button>
        </div>
      </form>
    </div>
  )
}

function EnableLoginModal({ open, waiter, form, onChange, onClose, onSubmit, busy, error }) {
  if (!open || !waiter) return null
  const reactivate = waiterHasLogin(waiter)
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-4 sm:items-center" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <form onSubmit={onSubmit} className="relative z-10 w-full max-w-md rounded-2xl border border-line bg-card p-5 shadow-lg">
        <h2 className="font-display text-xl">Enable Login</h2>
        <p className="mt-1 text-sm text-muted">
          {reactivate
            ? `Reactivate login for ${waiter.full_name} (${waiter.waiter_id}). History stays. They can sign in again at /waiter/login with the existing password.`
            : `Create a sign-in for ${waiter.full_name} (${waiter.waiter_id}). They will use Waiter ID and this password at /waiter/login.`}
        </p>
        <div className="mt-4 space-y-3">
          <Alert>{error}</Alert>
          {reactivate ? null : (
            <>
              <Field label="Password">
                <input
                  className={inputClass}
                  type="password"
                  placeholder="At least 6 characters"
                  value={form.password}
                  onChange={(e) => onChange('password', e.target.value)}
                  autoComplete="new-password"
                />
              </Field>
              <Field label="Confirm Password">
                <input
                  className={inputClass}
                  type="password"
                  placeholder="Repeat password"
                  value={form.confirm_password}
                  onChange={(e) => onChange('confirm_password', e.target.value)}
                  autoComplete="new-password"
                />
              </Field>
            </>
          )}
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving...' : 'Enable Login'}
          </Button>
        </div>
      </form>
    </div>
  )
}

function ConfirmDisable({ waiter, busy, onClose, onConfirm }) {
  if (!waiter) return null
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-4 sm:items-center" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-line bg-card p-5 shadow-lg">
        <h2 className="font-display text-xl">Disable waiter</h2>
        <p className="mt-2 text-sm text-muted">
          Disable {waiter.full_name} ({waiter.waiter_id})? The record stays for history. Login is also disabled until you enable it again.
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>
            {busy ? 'Saving...' : 'Disable Waiter'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function ConfirmDisableLogin({ waiter, busy, onClose, onConfirm }) {
  if (!waiter) return null
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-4 sm:items-center" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-line bg-card p-5 shadow-lg">
        <h2 className="font-display text-xl">Disable Login</h2>
        <p className="mt-2 text-sm text-muted">
          Disable login for {waiter.full_name} ({waiter.waiter_id})? Waiter history stays. They cannot sign in until you enable login again. No Auth user is deleted.
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>
            {busy ? 'Saving...' : 'Disable Login'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function Waiters() {
  const { restaurant, loading } = useOutletContext()
  const [items, setItems] = useState([])
  const [tables, setTables] = useState([])
  const [assignments, setAssignments] = useState([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [loadingList, setLoadingList] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [modal, setModal] = useState('')
  const [editing, setEditing] = useState(null)
  const [formError, setFormError] = useState('')
  const [pendingDisable, setPendingDisable] = useState(null)
  const [pendingDisableLogin, setPendingDisableLogin] = useState(null)
  const [assigning, setAssigning] = useState(null)
  const [selectedTableIds, setSelectedTableIds] = useState([])
  const [assignError, setAssignError] = useState('')
  const [enablingLogin, setEnablingLogin] = useState(null)

  async function load() {
    if (!restaurant) {
      setItems([])
      setTables([])
      setAssignments([])
      return
    }
    setLoadingList(true)
    const [waitersResult, tablesResult, assignmentsResult] = await Promise.all([
      listWaiters(restaurant.id),
      listTables(restaurant.id),
      listAssignments(restaurant.id),
    ])
    setLoadingList(false)
    const nextError = waitersResult.error || tablesResult.error || assignmentsResult.error
    if (nextError) setError(nextError.message)
    else setError('')
    setItems(waitersResult.data ?? [])
    setTables(tablesResult.data ?? [])
    setAssignments(assignmentsResult.data ?? [])
  }

  useEffect(() => {
    setItems([])
    setTables([])
    setAssignments([])
    setError('')
    setNotice('')
    setModal('')
    setEditing(null)
    setPendingDisable(null)
    setPendingDisableLogin(null)
    setAssigning(null)
    setEnablingLogin(null)
    setSelectedTableIds([])
    load()
  }, [restaurant?.id])

  const tableCountByWaiter = useMemo(() => {
    const map = new Map()
    for (const waiter of items) {
      map.set(waiter.id, assignedCountForWaiter(assignments, waiter.id) || assignedTableCount(waiter))
    }
    return map
  }, [items, assignments])

  function setFormField(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function openAdd() {
    setForm({ ...emptyForm })
    setFormError('')
    setEditing(null)
    setModal('add')
  }

  function openEdit(item) {
    setForm({
      full_name: item.full_name || '',
      waiter_id: item.waiter_id || '',
      password: '',
      confirm_password: '',
      is_active: item.is_active !== false,
    })
    setFormError('')
    setEditing(item)
    setModal('edit')
  }

  function closeModal() {
    if (busy) return
    setModal('')
    setEditing(null)
    setFormError('')
  }

  async function onSave(event) {
    event.preventDefault()
    const fieldError = validateWaiterFields({ fullName: form.full_name, waiterId: form.waiter_id })
    if (fieldError) {
      setFormError(fieldError)
      return
    }
    if (modal === 'add') {
      const passwordError = validateWaiterPasswords({
        password: form.password,
        confirmPassword: form.confirm_password,
      })
      if (passwordError) {
        setFormError(passwordError)
        return
      }
    }
    if (hasDuplicateWaiterId(items, form.waiter_id, editing?.id)) {
      setFormError('This waiter ID is already in use.')
      return
    }
    setBusy(true)
    setFormError('')
    const result =
      modal === 'edit'
        ? await updateWaiter(editing.id, restaurant.id, {
            full_name: form.full_name,
            waiter_id: editing.auth_user_id ? undefined : form.waiter_id,
            is_active: form.is_active,
          })
        : await provisionWaiter({
            restaurant_id: restaurant.id,
            full_name: form.full_name,
            waiter_id: form.waiter_id,
            password: form.password,
            is_active: form.is_active,
          })
    setBusy(false)
    if (result.error) {
      setFormError(result.error.message)
      return
    }
    setModal('')
    setEditing(null)
    setForm(emptyForm)
    setNotice(modal === 'edit' ? `${result.data.full_name} updated.` : `${result.data.full_name} added.`)
    load()
  }

  async function enableWaiter(item) {
    setBusy(true)
    const { error: nextError } = await setWaiterActive(item.id, restaurant.id, true)
    setBusy(false)
    if (nextError) setError(nextError.message)
    else {
      setNotice(`${item.full_name} enabled.`)
      load()
    }
  }

  async function confirmDisable() {
    if (!pendingDisable) return
    setBusy(true)
    const { error: nextError } = await setWaiterActive(pendingDisable.id, restaurant.id, false)
    setBusy(false)
    if (nextError) setError(nextError.message)
    else {
      setNotice(`${pendingDisable.full_name} disabled.`)
      setPendingDisable(null)
      load()
    }
  }

  function openAssign(item) {
    setAssignError('')
    setAssigning(item)
    setSelectedTableIds(
      assignments.filter((row) => row.waiter_id === item.id).map((row) => row.table_id),
    )
  }

  function closeAssign() {
    if (busy) return
    setAssigning(null)
    setAssignError('')
    setSelectedTableIds([])
  }

  function openEnableLogin(item) {
    setFormError('')
    setForm({
      ...emptyForm,
      full_name: item.full_name || '',
      waiter_id: item.waiter_id || '',
      is_active: item.is_active !== false,
    })
    setEnablingLogin(item)
  }

  function closeEnableLogin() {
    if (busy) return
    setEnablingLogin(null)
    setFormError('')
    setForm(emptyForm)
  }

  async function onEnableLogin(event) {
    event.preventDefault()
    if (!enablingLogin) return
    if (waiterHasLogin(enablingLogin)) {
      setBusy(true)
      setFormError('')
      const { error: nextError } = await setWaiterActive(enablingLogin.id, restaurant.id, true)
      setBusy(false)
      if (nextError) {
        setFormError(nextError.message)
        return
      }
      setNotice(`Login enabled for ${enablingLogin.full_name}.`)
      setEnablingLogin(null)
      setForm(emptyForm)
      load()
      return
    }
    const passwordError = validateWaiterPasswords({
      password: form.password,
      confirmPassword: form.confirm_password,
    })
    if (passwordError) {
      setFormError(passwordError)
      return
    }
    setBusy(true)
    setFormError('')
    const result = await provisionWaiter({
      restaurant_id: restaurant.id,
      waiter_record_id: enablingLogin.id,
      password: form.password,
    })
    setBusy(false)
    if (result.error) {
      setFormError(result.error.message)
      return
    }
    setNotice(`Login enabled for ${enablingLogin.full_name}.`)
    setEnablingLogin(null)
    setForm(emptyForm)
    load()
  }

  async function confirmDisableLogin() {
    if (!pendingDisableLogin) return
    setBusy(true)
    const { error: nextError } = await setWaiterActive(pendingDisableLogin.id, restaurant.id, false)
    setBusy(false)
    if (nextError) setError(nextError.message)
    else {
      setNotice(`Login disabled for ${pendingDisableLogin.full_name}. History kept.`)
      setPendingDisableLogin(null)
      load()
    }
  }

  function toggleTable(tableId) {
    setSelectedTableIds((current) =>
      current.includes(tableId) ? current.filter((id) => id !== tableId) : [...current, tableId],
    )
  }

  async function onSaveAssignments(event) {
    event.preventDefault()
    if (!assigning) return
    setBusy(true)
    setAssignError('')
    const result = await saveWaiterTableAssignments(restaurant.id, assigning, selectedTableIds, tables)
    setBusy(false)
    if (result.error) {
      setAssignError(result.error.message)
      return
    }
    setNotice(`Tables updated for ${assigning.full_name}.`)
    setAssigning(null)
    setSelectedTableIds([])
    load()
  }

  if (loading) return <Spinner />
  if (!restaurant) {
    return (
      <EmptyState
        title="Create your restaurant first"
        body="Waiters belong to the restaurant you select."
        actionTo="/dashboard/restaurant"
        actionLabel="Restaurant setup"
      />
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link to={TABLE_WISE_HOME} className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted hover:text-ink">
            Table-wise order
          </Link>
          <h1 className="mt-1 font-display text-3xl">Waiters</h1>
          <p className="mt-1 text-sm text-muted">Staff sign in at /waiter/login with Waiter ID and password. Restaurant is assigned automatically.</p>
        </div>
        <Button onClick={openAdd}>
          <NavIcon name="plus" className="h-4 w-4" />
          Add Waiter
        </Button>
      </div>

      <Alert>{error}</Alert>
      <Alert type="success">{notice}</Alert>

      {loadingList && items.length === 0 ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState
          title="No waiters yet"
          body="Create waiter logins here. Staff sign in at /waiter/login with Waiter ID and password."
          actionLabel="+ Add Waiter"
          onAction={openAdd}
        />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-2xl border border-line bg-card md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-paper text-[11px] uppercase tracking-[0.12em] text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Waiter</th>
                  <th className="px-4 py-3 font-medium">Waiter ID</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Assigned Tables</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const active = item.is_active !== false
                  const assigned = tableCountByWaiter.get(item.id) || 0
                  const loginStatus = waiterLoginStatus(item)
                  return (
                    <tr key={item.id} className="border-t border-line">
                      <td className="px-4 py-3 font-medium">{item.full_name}</td>
                      <td className="px-4 py-3 font-mono text-[13px]">{item.waiter_id}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <StatusBadge active={active} />
                          <LoginBadge waiter={item} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {assigned} {assigned === 1 ? 'table' : 'tables'}
                      </td>
                      <td className="px-4 py-3 text-muted">{formatDate(item.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Button variant="secondary" className="h-9 px-3 py-0 text-[13px]" onClick={() => openAssign(item)}>
                            Manage Tables
                          </Button>
                          {loginStatus === 'enabled' ? (
                            <Button variant="secondary" className="h-9 px-3 py-0 text-[13px]" onClick={() => setPendingDisableLogin(item)}>
                              Disable Login
                            </Button>
                          ) : (
                            <Button variant="secondary" className="h-9 px-3 py-0 text-[13px]" onClick={() => openEnableLogin(item)}>
                              Enable Login
                            </Button>
                          )}
                          <Button variant="secondary" className="h-9 px-3 py-0 text-[13px]" onClick={() => openEdit(item)}>
                            Edit
                          </Button>
                          {active ? (
                            <Button variant="secondary" className="h-9 px-3 py-0 text-[13px]" onClick={() => setPendingDisable(item)}>
                              Disable
                            </Button>
                          ) : (
                            <Button variant="secondary" className="h-9 px-3 py-0 text-[13px]" onClick={() => enableWaiter(item)}>
                              Enable
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {items.map((item) => {
              const active = item.is_active !== false
              const assigned = tableCountByWaiter.get(item.id) || 0
              const loginStatus = waiterLoginStatus(item)
              return (
                <Card key={item.id} compact className="!p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{item.full_name}</p>
                      <p className="mt-0.5 font-mono text-sm text-muted">{item.waiter_id}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <StatusBadge active={active} />
                      <LoginBadge waiter={item} />
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-muted">
                    Assigned Tables: {assigned} {assigned === 1 ? 'table' : 'tables'}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{formatDate(item.created_at)}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="secondary" className="h-9 px-3 py-0 text-[13px]" onClick={() => openAssign(item)}>
                      Manage Tables
                    </Button>
                    {loginStatus === 'enabled' ? (
                      <Button variant="secondary" className="h-9 px-3 py-0 text-[13px]" onClick={() => setPendingDisableLogin(item)}>
                        Disable Login
                      </Button>
                    ) : (
                      <Button variant="secondary" className="h-9 px-3 py-0 text-[13px]" onClick={() => openEnableLogin(item)}>
                        Enable Login
                      </Button>
                    )}
                    <Button variant="secondary" className="h-9 px-3 py-0 text-[13px]" onClick={() => openEdit(item)}>
                      Edit
                    </Button>
                    {active ? (
                      <Button variant="secondary" className="h-9 px-3 py-0 text-[13px]" onClick={() => setPendingDisable(item)}>
                        Disable
                      </Button>
                    ) : (
                      <Button variant="secondary" className="h-9 px-3 py-0 text-[13px]" onClick={() => enableWaiter(item)}>
                        Enable
                      </Button>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
        </>
      )}

      <WaiterModal
        open={modal === 'add' || modal === 'edit'}
        mode={modal}
        form={form}
        onChange={setFormField}
        onClose={closeModal}
        onSubmit={onSave}
        busy={busy}
        error={formError}
        lockWaiterId={Boolean(editing?.auth_user_id)}
      />
      <EnableLoginModal
        open={Boolean(enablingLogin)}
        waiter={enablingLogin}
        form={form}
        onChange={setFormField}
        onClose={closeEnableLogin}
        onSubmit={onEnableLogin}
        busy={busy}
        error={formError}
      />
      <AssignTablesModal
        open={Boolean(assigning)}
        waiter={assigning}
        restaurant={restaurant}
        tables={tables}
        waiters={items}
        assignments={assignments}
        selected={selectedTableIds}
        onToggle={toggleTable}
        onClose={closeAssign}
        onSave={onSaveAssignments}
        busy={busy}
        error={assignError}
      />
      <ConfirmDisable
        waiter={pendingDisable}
        busy={busy}
        onClose={() => (busy ? null : setPendingDisable(null))}
        onConfirm={confirmDisable}
      />
      <ConfirmDisableLogin
        waiter={pendingDisableLogin}
        busy={busy}
        onClose={() => (busy ? null : setPendingDisableLogin(null))}
        onConfirm={confirmDisableLogin}
      />
    </div>
  )
}
