import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Card from '../../components/Card'
import EmptyState from '../../components/EmptyState'
import Field, { inputClass } from '../../components/Field'
import SortableList, { SortHandle } from '../../components/SortableList'
import Spinner from '../../components/Spinner'
import { withSortOrder } from '../../lib/sort'
import {
  createCategory,
  deleteCategory,
  duplicateCategory,
  listCategories,
  reorderCategories,
  updateCategory,
} from '../../services/categories'

export default function Categories() {
  const { restaurant, loading } = useOutletContext()
  const [items, setItems] = useState([])
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)

  async function load() {
    if (!restaurant) {
      setItems([])
      return
    }
    const { data, error: nextError } = await listCategories(restaurant.id)
    if (nextError) setError(nextError.message)
    else setItems(data)
  }

  useEffect(() => {
    setItems([])
    setError('')
    load()
  }, [restaurant?.id])

  if (loading) return <Spinner />
  if (!restaurant) {
    return (
      <EmptyState
        title="Create your restaurant first"
        body="Categories belong to a restaurant."
        actionTo="/dashboard/restaurant"
        actionLabel="Restaurant setup"
      />
    )
  }

  async function onCreate(event) {
    event.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    setError('')
    const { error: nextError } = await createCategory(restaurant.id, name, items.length)
    setBusy(false)
    if (nextError) {
      setError(nextError.message)
      return
    }
    setName('')
    load()
  }

  async function rename(item, nextName) {
    const { error: nextError } = await updateCategory(item.id, restaurant.id, { name: nextName })
    if (nextError) setError(nextError.message)
    else load()
  }

  async function remove(item) {
    if (!window.confirm(`Delete category "${item.name}"? Menu items in it will also be removed.`)) return
    const { error: nextError } = await deleteCategory(item.id, restaurant.id)
    if (nextError) setError(nextError.message)
    else load()
  }

  async function duplicate(item) {
    if (saving || busy) return
    setSaving(true)
    setError('')
    const { error: nextError, ordered } = await duplicateCategory(restaurant.id, item, items)
    setSaving(false)
    if (nextError) {
      setError(nextError.message)
      load()
      return
    }
    setItems(withSortOrder(ordered))
  }

  async function onReorder(next, previous) {
    if (saving) return
    setSaving(true)
    setError('')
    setItems(withSortOrder(next))
    const { error: nextError } = await reorderCategories(restaurant.id, next)
    setSaving(false)
    if (nextError) {
      setError(nextError.message)
      setItems(previous)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-3xl">Categories</h1>
        <p className="mt-1 text-sm text-muted">
          {restaurant.name}: drag the handle to change the order shown on this restaurant's public menu.
        </p>
      </div>
      <Card title="Add category">
        <form onSubmit={onCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field label="Name">
              <input className={inputClass} placeholder="e.g. Starters" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          </div>
          <Button type="submit" disabled={busy || saving}>Add</Button>
        </form>
        <div className="mt-3">
          <Alert>{error}</Alert>
          {saving ? <p className="mt-2 text-xs text-muted">Saving order...</p> : null}
        </div>
      </Card>
      <Card title="Your categories">
        {items.length === 0 ? (
          <p className="text-sm text-muted">{restaurant.name} doesn't have any categories yet.</p>
        ) : (
          <SortableList
            items={items}
            getId={(item) => item.id}
            disabled={saving}
            onReorder={onReorder}
            className="space-y-3"
            renderItem={(item, { dragging, handleProps, disabled }) => (
              <div className={`flex flex-col gap-2 sm:flex-row sm:items-center ${dragging ? 'rounded-xl bg-white p-1 shadow-sm ring-1 ring-forest' : ''}`}>
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <SortHandle handleProps={handleProps} disabled={disabled} label={`Reorder ${item.name}`} />
                  <input
                    className={inputClass}
                    defaultValue={item.name}
                    key={`${item.id}-${item.name}`}
                    onBlur={(e) => {
                      if (e.target.value.trim() && e.target.value !== item.name) rename(item, e.target.value.trim())
                    }}
                  />
                </div>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <Button variant="secondary" disabled={saving} onClick={() => duplicate(item)}>
                    Duplicate
                  </Button>
                  <Button variant="danger" disabled={saving} onClick={() => remove(item)}>
                    Delete
                  </Button>
                </div>
              </div>
            )}
          />
        )}
      </Card>
    </div>
  )
}
