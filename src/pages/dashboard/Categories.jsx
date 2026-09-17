import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Card from '../../components/Card'
import EmptyState from '../../components/EmptyState'
import Field, { inputClass } from '../../components/Field'
import Spinner from '../../components/Spinner'
import { createCategory, deleteCategory, listCategories, updateCategory } from '../../services/categories'

export default function Categories() {
  const { restaurant, loading } = useOutletContext()
  const [items, setItems] = useState([])
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    if (!restaurant) return
    const { data, error: nextError } = await listCategories(restaurant.id)
    if (nextError) setError(nextError.message)
    else setItems(data)
  }

  useEffect(() => {
    load()
  }, [restaurant])

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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-display text-3xl">Categories</h1>
      <Card title="Add category">
        <form onSubmit={onCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field label="Name">
              <input className={inputClass} placeholder="e.g. Starters" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          </div>
          <Button type="submit" disabled={busy}>Add</Button>
        </form>
        <Alert>{error}</Alert>
      </Card>
      <Card title="Your categories">
        {items.length === 0 ? (
          <p className="text-sm text-muted">No categories yet.</p>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-3">
                <input
                  className={inputClass}
                  defaultValue={item.name}
                  onBlur={(e) => {
                    if (e.target.value.trim() && e.target.value !== item.name) rename(item, e.target.value.trim())
                  }}
                />
                <Button variant="danger" onClick={() => remove(item)}>Delete</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
