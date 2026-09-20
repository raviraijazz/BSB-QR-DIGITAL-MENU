import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Card from '../../components/Card'
import EmptyState from '../../components/EmptyState'
import Field, { inputClass } from '../../components/Field'
import SortableList, { SortHandle } from '../../components/SortableList'
import Spinner from '../../components/Spinner'
import FoodTypeMark, { FoodTypeText } from '../../components/FoodTypeMark'
import { FOOD_TYPES, normalizeFoodType } from '../../lib/foodType'
import { emptyVariant, itemToFormPricing, pricingPayload, summaryPrice, validatePricing } from '../../lib/pricing'
import { withSortOrder } from '../../lib/sort'
import { uploadAsset } from '../../lib/upload'
import { listCategories } from '../../services/categories'
import {
  createMenuItem,
  deleteMenuItem,
  duplicateMenuItem,
  listMenuItems,
  reorderMenuItems,
  updateMenuItem,
} from '../../services/menuItems'

const empty = {
  category_id: '',
  name: '',
  description: '',
  pricingMode: 'single',
  price: '',
  variants: [emptyVariant()],
  image_url: '',
  is_available: true,
  food_type: 'veg',
}

export default function Menu() {
  const { user, restaurant, loading } = useOutletContext()
  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  const [form, setForm] = useState(empty)
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [togglingId, setTogglingId] = useState('')

  async function load() {
    if (!restaurant) {
      setCategories([])
      setItems([])
      return
    }
    const [cats, menu] = await Promise.all([listCategories(restaurant.id), listMenuItems(restaurant.id)])
    setCategories(cats.data)
    setItems(menu.data)
    setError(cats.error?.message || menu.error?.message || '')
    setEditing(null)
    setForm({ ...empty, category_id: cats.data[0]?.id || '' })
  }

  useEffect(() => {
    setCategories([])
    setItems([])
    setError('')
    load()
  }, [restaurant?.id])

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
        title={`${restaurant.name} doesn't have any categories yet.`}
        body="Create at least one category, then add dishes to it."
        actionTo="/dashboard/categories"
        actionLabel="Add categories"
      />
    )
  }

  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function setVariant(index, key, value) {
    setForm((current) => ({
      ...current,
      variants: current.variants.map((variant, i) => (i === index ? { ...variant, [key]: value } : variant)),
    }))
  }

  function addVariant() {
    setForm((current) => ({ ...current, variants: [...current.variants, emptyVariant()] }))
  }

  function removeVariant(index) {
    setForm((current) => {
      const next = current.variants.filter((_, i) => i !== index)
      return { ...current, variants: next.length ? next : [emptyVariant()] }
    })
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
    const pricingError = validatePricing(form)
    if (pricingError) {
      setError(pricingError)
      return
    }

    setBusy(true)
    setError('')
    const pricing = pricingPayload(form)
    const payload = {
      category_id: form.category_id,
      name: form.name,
      description: form.description,
      price: pricing.price,
      variants: pricing.variants,
      image_url: form.image_url,
      is_available: form.is_available,
      food_type: normalizeFoodType(form.food_type),
    }
    const result = editing
      ? await updateMenuItem(editing.id, restaurant.id, payload)
      : await createMenuItem(restaurant.id, {
          ...payload,
          sort_order: items.filter((item) => item.category_id === form.category_id).length,
        })
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
      image_url: item.image_url || '',
      is_available: item.is_available,
      food_type: normalizeFoodType(item.food_type),
      ...itemToFormPricing(item),
    })
  }

  function cancelEdit() {
    setEditing(null)
    setForm({ ...empty, category_id: categories[0]?.id || '' })
  }

  function itemsInCategory(categoryId) {
    return items.filter((item) => item.category_id === categoryId)
  }

  function replaceCategory(categoryId, nextCategoryItems) {
    const others = items.filter((item) => item.category_id !== categoryId)
    return [...others, ...withSortOrder(nextCategoryItems)]
  }

  async function setAvailability(item, next) {
    if (togglingId || saving || next === item.is_available) return
    const previous = item.is_available
    setTogglingId(item.id)
    setError('')
    setItems((current) => current.map((row) => (row.id === item.id ? { ...row, is_available: next } : row)))
    const { error: nextError } = await updateMenuItem(item.id, restaurant.id, { is_available: next })
    setTogglingId('')
    if (nextError) {
      setError(nextError.message)
      setItems((current) => current.map((row) => (row.id === item.id ? { ...row, is_available: previous } : row)))
    }
  }

  async function remove(item) {
    if (!window.confirm(`Delete "${item.name}"?`)) return
    await deleteMenuItem(item.id, restaurant.id)
    load()
  }

  async function duplicate(item) {
    if (saving || busy) return
    const current = itemsInCategory(item.category_id)
    setSaving(true)
    setError('')
    const { error: nextError, ordered } = await duplicateMenuItem(restaurant.id, item, current)
    setSaving(false)
    if (nextError) {
      setError(nextError.message)
      load()
      return
    }
    setItems(replaceCategory(item.category_id, ordered))
  }

  async function onReorder(categoryId, next, previous) {
    if (saving) return
    setSaving(true)
    setError('')
    setItems(replaceCategory(categoryId, next))
    const { error: nextError } = await reorderMenuItems(restaurant.id, categoryId, next)
    setSaving(false)
    if (nextError) {
      setError(nextError.message)
      setItems(replaceCategory(categoryId, previous))
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-3xl">Menu items</h1>
        <p className="mt-1 text-sm text-muted">
          {restaurant.name}: drag the handle to change the order shown on this restaurant's public menu.
        </p>
      </div>
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
          <div className="sm:col-span-2 space-y-3 rounded-2xl border border-line bg-paper/60 p-4">
            <p className="text-sm font-medium">Pricing</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={`rounded-xl px-3 py-2 text-sm ${form.pricingMode === 'single' ? 'bg-ink text-white' : 'bg-white border border-line'}`}
                onClick={() => set('pricingMode', 'single')}
              >
                Single price
              </button>
              <button
                type="button"
                className={`rounded-xl px-3 py-2 text-sm ${form.pricingMode === 'multiple' ? 'bg-ink text-white' : 'bg-white border border-line'}`}
                onClick={() => set('pricingMode', 'multiple')}
              >
                Multiple variants
              </button>
            </div>
            {form.pricingMode === 'single' ? (
              <Field label="Price (₹)">
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => set('price', e.target.value)}
                />
              </Field>
            ) : (
              <div className="space-y-3">
                {form.variants.map((variant, index) => (
                  <div key={index} className="grid gap-2 sm:grid-cols-[1fr_110px_110px_auto] sm:items-end">
                    <Field label={index === 0 ? 'Variant / size' : ''}>
                      <input
                        className={inputClass}
                        placeholder="e.g. Half, Large, Glass"
                        value={variant.name}
                        onChange={(e) => setVariant(index, 'name', e.target.value)}
                      />
                    </Field>
                    <Field label={index === 0 ? 'Price (₹)' : ''}>
                      <input
                        className={inputClass}
                        type="number"
                        min="0"
                        step="0.01"
                        value={variant.price}
                        onChange={(e) => setVariant(index, 'price', e.target.value)}
                      />
                    </Field>
                    <Field label={index === 0 ? 'Available' : ''}>
                      <select
                        className={inputClass}
                        value={variant.is_available ? 'yes' : 'no'}
                        onChange={(e) => setVariant(index, 'is_available', e.target.value === 'yes')}
                      >
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    </Field>
                    <Button variant="danger" className="mb-0.5" onClick={() => removeVariant(index)}>
                      Delete
                    </Button>
                  </div>
                ))}
                <Button variant="secondary" onClick={addVariant}>+ Add Variant</Button>
              </div>
            )}
          </div>
          <Field label="Food type">
            <div className="flex flex-wrap gap-2">
              {FOOD_TYPES.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${
                    form.food_type === type.id ? 'bg-ink text-white' : 'border border-line bg-white'
                  }`}
                  onClick={() => set('food_type', type.id)}
                >
                  <FoodTypeMark value={type.id} />
                  {type.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Availability">
            <select className={inputClass} value={form.is_available ? 'yes' : 'no'} onChange={(e) => set('is_available', e.target.value === 'yes')}>
              <option value="yes">Available</option>
              <option value="no">Sold Out</option>
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
            {editing ? <Button variant="secondary" onClick={cancelEdit}>Cancel</Button> : null}
          </div>
        </form>
        <div className="mt-4">
          <Alert>{error}</Alert>
          {saving ? <p className="mt-2 text-xs text-muted">Saving order...</p> : null}
        </div>
      </Card>
      {categories.map((category) => {
        const categoryItems = itemsInCategory(category.id)
        return (
          <Card key={category.id} title={category.name}>
            {categoryItems.length === 0 ? (
              <p className="text-sm text-muted">{restaurant.name} doesn't have any menu items in this category yet.</p>
            ) : (
              <SortableList
                items={categoryItems}
                getId={(item) => item.id}
                disabled={saving}
                onReorder={(next, previous) => onReorder(category.id, next, previous)}
                className="space-y-3"
                renderItem={(item, { dragging, handleProps, disabled }) => (
                  <div
                    className={`flex flex-col gap-3 rounded-xl border border-line p-3 sm:flex-row sm:items-center ${
                      dragging ? 'bg-white shadow-sm ring-1 ring-forest' : ''
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <SortHandle handleProps={handleProps} disabled={disabled} label={`Reorder ${item.name}`} />
                      {item.image_url ? (
                        <img src={item.image_url} alt="" className="h-14 w-14 rounded-lg object-cover" />
                      ) : (
                        <div className="h-14 w-14 rounded-lg bg-paper" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 font-medium">
                          <FoodTypeMark value={item.food_type} />
                          <span className="min-w-0 truncate">{item.name}</span>
                        </p>
                        <p className="text-sm text-muted">
                          <FoodTypeText value={item.food_type} /> · {summaryPrice(item)} · {item.is_available ? 'Available' : 'Sold Out'}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      <Button variant="secondary" disabled={saving} onClick={() => duplicate(item)}>
                        Duplicate
                      </Button>
                      <Button variant="secondary" disabled={saving} onClick={() => startEdit(item)}>
                        Edit
                      </Button>
                      <select
                        className={`${inputClass} w-[8.5rem]`}
                        disabled={saving || togglingId === item.id}
                        value={item.is_available ? 'available' : 'sold_out'}
                        onChange={(e) => setAvailability(item, e.target.value === 'available')}
                        aria-label={`${item.name} availability`}
                      >
                        <option value="available">{togglingId === item.id ? 'Saving...' : 'Available'}</option>
                        <option value="sold_out">Sold Out</option>
                      </select>
                      <Button variant="danger" disabled={saving} onClick={() => remove(item)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                )}
              />
            )}
          </Card>
        )
      })}
    </div>
  )
}
