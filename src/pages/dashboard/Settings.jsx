import { useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Card from '../../components/Card'
import EmptyState from '../../components/EmptyState'
import Field, { inputClass } from '../../components/Field'
import Spinner from '../../components/Spinner'
import { useAuth } from '../../hooks/useAuth'
import { updateSlug } from '../../services/restaurants'

export default function Settings() {
  const { user, restaurant, loading, setRestaurant } = useOutletContext()
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [slugInput, setSlugInput] = useState(restaurant?.slug || '')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  if (loading) return <Spinner />
  if (!restaurant) {
    return (
      <EmptyState
        title="Create your restaurant first"
        body="Settings become available after restaurant setup."
        actionTo="/dashboard/restaurant"
        actionLabel="Restaurant setup"
      />
    )
  }

  async function onSlug(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    const { data, error: nextError } = await updateSlug(restaurant.id, user.id, slugInput || restaurant.name)
    setBusy(false)
    if (nextError) {
      setError(nextError.message)
      return
    }
    setRestaurant(data)
    setSlugInput(data.slug)
    setNotice('Menu URL updated. Download a new QR if you already printed one.')
  }

  async function onSignOut() {
    await signOut()
    navigate('/')
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="font-display text-3xl">Settings</h1>
      <Card title="Menu URL">
        <p className="mb-4 text-sm text-muted">
          Changing the slug changes the public URL. Existing printed QR codes will stop working.
        </p>
        <form onSubmit={onSlug} className="space-y-4">
          <Alert>{error}</Alert>
          <Alert type="success">{notice}</Alert>
          <Field label="Slug" hint={`Current: /menu/${restaurant.slug}`}>
            <input className={inputClass} value={slugInput} onChange={(e) => setSlugInput(e.target.value)} />
          </Field>
          <Button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Update slug'}</Button>
        </form>
      </Card>
      <Card title="Account">
        <p className="text-sm text-muted">{user?.user_metadata?.username || 'Account'}</p>
        {user?.user_metadata?.contact_number ? (
          <p className="text-sm text-muted">{user.user_metadata.contact_number}</p>
        ) : null}
        <Button className="mt-4" variant="secondary" onClick={onSignOut}>Sign out</Button>
      </Card>
    </div>
  )
}
