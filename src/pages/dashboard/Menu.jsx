import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Card from '../../components/Card'
import EmptyState from '../../components/EmptyState'
import Field, { inputClass } from '../../components/Field'
import Spinner from '../../components/Spinner'
import { uploadAsset } from '../../lib/upload'
import { listCategories } from '../../services/categories'
import { createMenuItem, deleteMenuItem, listMenuItems, updateMenuItem } from '../../services/menuItems'

const empty = { category_id: '', name: '', description: '', price: '', image_url: '', is_available: true }

export default function Menu() {
  const { user, restaurant, loading } = useOutletContext()
  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  const [form, setForm] = useState(empty)
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    if (!restaurant) return
    const [cats, menu] = await Promise.all([listCategories(restaurant.id), listMenuItems(restaurant.id)])
    setCategories(cats.data)
    setItems(menu.data)
    setError(cats.error?.message || menu.error?.message || '')
    setForm((current) => ({ ...current, category_id: current.category_id || cats.data[0]?.id || '' }))
  }

  useEffect(() => {
    load()
  }, [restaurant])

  if (loading) return <Spinner />
  if (!restaurant) {
    return (
      <EmptyState
        title="Create your restaurant first"
        body="Menu items belong to a restaurant."
        actionTo="/dashboard/restaurant"
        actionLabel="Restaurant setup"
      />
    )
  }
  if (categories.length === 0) {
    return (
      <EmptyState
        title="Add a category first"
        body="Create at least one category, then add dishes to it."
        actionTo="/dashboard/categories"
        actionLabel="Add categories"
      />
    )
  }

  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function onUpload(event) {
    const file = event.target.files?.[0]
    if (!file) return
    const { url, error: uploadError } = await uploadAsset(user.id, file, `item-${Date.now()}`)
    if (uploadError) setError(uploadError)
    else set('image_url', url)
  }

  async function onSubmit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const payload = {
      category_id: form.category_id,
      name: form.name,
      description: form.description,
      price: form.price,
      image_url: form.image_url,
      is_available: form.is_available,
    }
    const result = editing
      ? await updateMenuItem(editing.id, restaurant.id, payload)
      : await createMenuItem(restaurant.id, { ...payload, sort_order: items.length })
    setBusy(false)
    if (result.error) {
      setError(result.error.message)
      return
    }
    setForm({ ...empty, category_id: form.category_id })
    setEditing(null)
    load()
  }

  function startEdit(item) {
    setEditing(item)
    setForm({
      category_id: item.category_id,
      name: item.name,
      description: item.description || '',
      price: String(item.price ?? ''),
      image_url: item.image_url || '',
      is_available: item.is_available,
    })
  }

  async function toggle(item) {
    await updateMenuItem(item.id, restaurant.id, { is_available: !item.is_available })
    load()
  }

  async function remove(item) {
    if (!window.confirm(`Delete "${item.name}"?`)) return
    await deleteMenuItem(item.id, restaurant.id)
    load()
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-display text-3xl">Menu items</h1>
      <Card title={editing ? 'Edit item' : 'Add item'}>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Category">
            <select className={inputClass} value={form.category_id} onChange={(e) => set('category_id', e.target.value)}>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Name">
            <input className={inputClass} required value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Price (₹)">
            <input className={inputClass} type="number" min="0" step="0.01" required value={form.price} onChange={(e) => set('price', e.target.value)} />
          </Field>
          <Field label="Available">
            <select className={inputClass} value={form.is_available ? 'yes' : 'no'} onChange={(e) => set('is_available', e.target.value === 'yes')}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Description">
              <textarea className={inputClass} rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} />
            </Field>
          </div>
          <Field label="Photo" hint="Optional. Max 2MB.">
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onUpload} />
          </Field>
          {form.image_url ? <img src={form.image_url} alt="" className="h-16 w-16 rounded-xl object-cover" /> : null}
          <div className="sm:col-span-2 flex gap-3">
            <Button type="submit" disabled={busy}>{busy ? 'Saving...' : editing ? 'Update item' : 'Add item'}</Button>
            {editing ? (
              <Button variant="secondary" onClick={() => { setEditing(null); setForm({ ...empty, category_id: categories[0]?.id || '' }) }}>
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
        <div className="mt-4"><Alert>{error}</Alert></div>
      </Card>
      <Card title="All items">
        {items.length === 0 ? <p className="text-sm text-muted">No items yet.</p> : (
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-4 rounded-xl border border-line p-3">
                {item.image_url ? <img src={item.image_url} alt="" className="h-14 w-14 rounded-lg object-cover" /> : <div className="h-14 w-14 rounded-lg bg-paper" />}
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{item.name}</p>
                  <p className="text-sm text-muted">₹{Number(item.price).toFixed(0)} · {item.is_available ? 'Available' : 'Hidden'}</p>
                </div>
                <Button variant="secondary" onClick={() => toggle(item)}>{item.is_available ? 'Disable' : 'Enable'}</Button>
                <Button variant="secondary" onClick={() => startEdit(item)}>Edit</Button>
                <Button variant="danger" onClick={() => remove(item)}>Delete</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
