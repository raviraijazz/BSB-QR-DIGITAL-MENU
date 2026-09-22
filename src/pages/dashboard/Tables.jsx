import { useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Card from '../../components/Card'
import EmptyState from '../../components/EmptyState'
import Field, { inputClass } from '../../components/Field'
import NavIcon from '../../components/NavIcon'
import Spinner from '../../components/Spinner'
import { tableMenuUrl } from '../../lib/menuUrl'
import { nextTableNumber, tableHeading } from '../../lib/tableToken'
import {
  canvasToBlob,
  canvasToDataUrl,
  createQrCanvas,
  createQrMatrix,
  downloadBrandedPdf,
  downloadDataUrl,
  downloadPrintPdf,
  renderPrintCanvas,
} from '../../lib/qrStudio'
import {
  createTable,
  deleteTable,
  hasDuplicateTableNumber,
  isTableActive,
  listTables,
  updateTable,
} from '../../services/tables'

const emptyForm = { table_number: '', name: '', is_active: true }

async function copyText(value) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch {
    /* fallback below */
  }
  try {
    const field = document.createElement('textarea')
    field.value = value
    field.setAttribute('readonly', '')
    field.style.position = 'fixed'
    field.style.left = '-9999px'
    document.body.appendChild(field)
    field.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(field)
    return ok
  } catch {
    return false
  }
}

function tableUrl(restaurant, table) {
  if (!restaurant?.slug || !table?.qr_token) return ''
  return tableMenuUrl(restaurant.slug, table.qr_token)
}

function tableFileBase(restaurant, table) {
  const slug = restaurant?.slug || 'menu'
  const number = String(table?.table_number || table?.name || 'table')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${slug}-table-${number || 'qr'}`
}

function qrOptions(url) {
  const matrix = url ? createQrMatrix(url) : null
  return {
    matrix,
    fg: '#1c1917',
    bg: '#ffffff',
    style: 'square',
    showLogo: false,
    logoImg: null,
    logoSize: 'medium',
  }
}

function TableModal({ open, title, form, onChange, onClose, onSubmit, busy, error, submitLabel }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-4 sm:items-center" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <form onSubmit={onSubmit} className="relative z-10 w-full max-w-md rounded-2xl border border-line bg-card p-5 shadow-lg">
        <h2 className="font-display text-xl">{title}</h2>
        <div className="mt-4 space-y-3">
          <Alert>{error}</Alert>
          <Field label="Table Number" hint="Required. Must be unique for this restaurant.">
            <input
              className={inputClass}
              placeholder="e.g. 1 or 01"
              value={form.table_number}
              onChange={(e) => onChange('table_number', e.target.value)}
            />
          </Field>
          <Field label="Table Name" hint="Optional. Example: Window Seat, Patio">
            <input
              className={inputClass}
              placeholder="e.g. Window Seat"
              value={form.name}
              onChange={(e) => onChange('name', e.target.value)}
            />
          </Field>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white px-3 py-2.5">
            <span className="text-sm font-medium">Active</span>
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
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving...' : submitLabel}
          </Button>
        </div>
      </form>
    </div>
  )
}

function QrModal({ open, restaurant, table, onClose, onDownload, onPrint, busy }) {
  const url = tableUrl(restaurant, table)
  const options = useMemo(() => qrOptions(url), [url])
  const preview = useMemo(() => {
    if (!options.matrix) return ''
    try {
      return canvasToDataUrl(createQrCanvas(280, options))
    } catch {
      return ''
    }
  }, [options])

  if (!open || !table) return null
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-4 sm:items-center" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0" aria-label="Close QR" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-line bg-card p-5 text-center shadow-lg">
        <p className="font-display text-xl">{restaurant?.name}</p>
        <p className="mt-1 text-sm font-medium text-forest">{tableHeading(table)}</p>
        <div className="mx-auto my-4 grid h-56 w-56 place-items-center rounded-2xl border border-line bg-white p-3">
          {preview ? <img src={preview} alt="" className="h-full w-full" /> : <NavIcon name="qr" className="h-10 w-10 text-muted" />}
        </div>
        <p className="break-all text-[11px] text-muted">{url}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button variant="secondary" onClick={onDownload} disabled={Boolean(busy)}>
            {busy === 'png' ? 'Preparing...' : 'Download QR'}
          </Button>
          <Button onClick={onPrint} disabled={Boolean(busy)}>
            {busy === 'print' ? 'Preparing...' : 'Print'}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function Tables() {
  const { restaurant, loading } = useOutletContext()
  const [items, setItems] = useState([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [modal, setModal] = useState('')
  const [editing, setEditing] = useState(null)
  const [qrTable, setQrTable] = useState(null)
  const [formError, setFormError] = useState('')
  const [qrBusy, setQrBusy] = useState('')

  async function load() {
    if (!restaurant) {
      setItems([])
      return
    }
    const { data, error: nextError } = await listTables(restaurant.id)
    if (nextError) setError(nextError.message)
    else {
      setError('')
      setItems(data)
    }
  }

  useEffect(() => {
    setItems([])
    setError('')
    setNotice('')
    setModal('')
    setEditing(null)
    setQrTable(null)
    load()
  }, [restaurant?.id])

  function setFormField(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function openAdd() {
    setForm({ ...emptyForm, table_number: nextTableNumber(items), is_active: true })
    setFormError('')
    setEditing(null)
    setModal('add')
  }

  function openEdit(item) {
    setForm({
      table_number: item.table_number || item.name || '',
      name: item.name && item.name !== item.table_number ? item.name : '',
      is_active: isTableActive(item),
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
    if (!form.table_number.trim()) {
      setFormError('Table number required')
      return
    }
    if (hasDuplicateTableNumber(items, form.table_number, editing?.id)) {
      setFormError('This table number already exists for this restaurant.')
      return
    }
    setBusy(true)
    setFormError('')
    const payload = {
      table_number: form.table_number,
      name: form.name,
      is_active: form.is_active,
    }
    const result = editing
      ? await updateTable(editing.id, restaurant.id, payload)
      : await createTable(restaurant.id, payload, items.length)
    setBusy(false)
    if (result.error) {
      setFormError(result.error.message)
      return
    }
    setModal('')
    setEditing(null)
    setNotice(editing ? `${tableHeading(result.data)} updated.` : `${tableHeading(result.data)} added.`)
    load()
  }

  async function toggleActive(item) {
    const next = !isTableActive(item)
    setItems((current) => current.map((row) => (row.id === item.id ? { ...row, is_active: next } : row)))
    const { error: nextError } = await updateTable(item.id, restaurant.id, { is_active: next })
    if (nextError) {
      setError(nextError.message)
      setItems((current) => current.map((row) => (row.id === item.id ? { ...row, is_active: item.is_active } : row)))
      return
    }
    setNotice(`${tableHeading(item)} ${next ? 'activated' : 'deactivated'}.`)
  }

  async function remove(item) {
    if (!window.confirm(`Delete ${tableHeading(item)}? Its table QR will stop working.`)) return
    const { error: nextError } = await deleteTable(item.id, restaurant.id)
    if (nextError) setError(nextError.message)
    else {
      setNotice(`${tableHeading(item)} deleted.`)
      load()
    }
  }

  async function downloadQr(table) {
    const url = tableUrl(restaurant, table)
    const options = qrOptions(url)
    if (!options.matrix) {
      setError('The QR code could not be generated.')
      return
    }
    setQrBusy('png')
    setError('')
    try {
      const blob = await canvasToBlob(createQrCanvas(1024, options))
      const href = URL.createObjectURL(blob)
      downloadDataUrl(`${tableFileBase(restaurant, table)}.png`, href)
      setTimeout(() => URL.revokeObjectURL(href), 1500)
    } catch (err) {
      setError(err.message)
    }
    setQrBusy('')
  }

  async function printQr(table) {
    const url = tableUrl(restaurant, table)
    const options = qrOptions(url)
    if (!options.matrix) {
      setError('The QR code could not be generated.')
      return
    }
    setQrBusy('print')
    setError('')
    try {
      const canvas = renderPrintCanvas('tent', {
        restaurantName: restaurant.name,
        tableName: tableHeading(table),
        ...options,
      })
      await downloadPrintPdf('tent', canvas, `${tableFileBase(restaurant, table)}-print.pdf`)
    } catch (err) {
      try {
        await downloadBrandedPdf({
          name: restaurant.name,
          tableName: tableHeading(table),
          url,
          qrCanvas: createQrCanvas(1024, options),
          filename: `${tableFileBase(restaurant, table)}.pdf`,
        })
      } catch (next) {
        setError(next.message || err.message)
      }
    }
    setQrBusy('')
  }

  async function copyLink(table) {
    const ok = await copyText(tableUrl(restaurant, table))
    setNotice(ok ? `${tableHeading(table)} link copied.` : 'Could not copy the link.')
  }

  if (loading) return <Spinner />
  if (!restaurant) {
    return (
      <EmptyState
        title="Create your restaurant first"
        body="Tables belong to a restaurant and each gets its own QR."
        actionTo="/dashboard/restaurant"
        actionLabel="Restaurant setup"
      />
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl">Tables</h1>
          <p className="mt-1 text-sm text-muted">Create and manage table-wise QR codes for your restaurant.</p>
        </div>
        <Button onClick={openAdd}>
          <NavIcon name="plus" className="h-4 w-4" />
          Add Table
        </Button>
      </div>

      <Alert>{error}</Alert>
      <Alert type="success">{notice}</Alert>

      {items.length === 0 ? (
        <EmptyState
          title="No tables added yet"
          body="Create table-wise QR codes so each table can have its own menu QR."
          actionLabel="+ Add Table"
          onAction={openAdd}
        />
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const active = isTableActive(item)
            return (
              <Card key={item.id} compact className="!p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium">{tableHeading(item)}</p>
                    <p className="mt-0.5 text-sm text-muted">
                      Table {item.table_number || item.name}
                      {item.name && item.name !== item.table_number ? ` · ${item.name}` : ''}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                          active ? 'bg-forest/10 text-forest' : 'bg-paper text-muted'
                        }`}
                      >
                        {active ? 'Active' : 'Inactive'}
                      </span>
                      <span className="rounded-full bg-paper px-2.5 py-0.5 text-[11px] font-medium text-muted">
                        {item.qr_token ? 'QR ready' : 'QR missing'}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" className="h-9 px-3 py-0 text-[13px]" onClick={() => setQrTable(item)}>
                      View QR
                    </Button>
                    <Button variant="secondary" className="h-9 px-3 py-0 text-[13px]" onClick={() => downloadQr(item)}>
                      Download QR
                    </Button>
                    <Button variant="secondary" className="h-9 px-3 py-0 text-[13px]" onClick={() => printQr(item)}>
                      Print
                    </Button>
                    <Button variant="secondary" className="h-9 px-3 py-0 text-[13px]" onClick={() => copyLink(item)}>
                      Copy link
                    </Button>
                    <Button variant="secondary" className="h-9 px-3 py-0 text-[13px]" onClick={() => openEdit(item)}>
                      Edit
                    </Button>
                    <Button variant="secondary" className="h-9 px-3 py-0 text-[13px]" onClick={() => toggleActive(item)}>
                      {active ? 'Deactivate' : 'Activate'}
                    </Button>
                    <Button variant="danger" className="h-9 px-3 py-0 text-[13px]" onClick={() => remove(item)}>
                      Delete
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {items.length > 0 ? (
        <p className="text-xs text-muted">
          Brand, bulk print, and table QR studio live in{' '}
          <Link className="underline" to="/dashboard/qr">
            QR Studio
          </Link>
          . Editing a table never regenerates its QR token.
        </p>
      ) : null}

      <TableModal
        open={modal === 'add' || modal === 'edit'}
        title={modal === 'edit' ? 'Edit table' : 'Add Table'}
        form={form}
        onChange={setFormField}
        onClose={closeModal}
        onSubmit={onSave}
        busy={busy}
        error={formError}
        submitLabel={modal === 'edit' ? 'Save' : 'Add Table'}
      />
      <QrModal
        open={Boolean(qrTable)}
        restaurant={restaurant}
        table={qrTable}
        onClose={() => setQrTable(null)}
        onDownload={() => downloadQr(qrTable)}
        onPrint={() => printQr(qrTable)}
        busy={qrBusy}
      />
    </div>
  )
}
