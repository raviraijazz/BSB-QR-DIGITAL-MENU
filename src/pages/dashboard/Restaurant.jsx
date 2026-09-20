import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Card from '../../components/Card'
import Field, { inputClass } from '../../components/Field'
import Spinner from '../../components/Spinner'
import { saveRestaurant } from '../../services/restaurants'
import { uploadAsset } from '../../lib/upload'

const emptyForm = { name: '', phone: '', address: '', logo_url: '' }

export default function Restaurant() {
  const { user, restaurant, restaurants, loading, setRestaurant } = useOutletContext()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const creating = searchParams.get('new') === '1' || !restaurant
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (creating) {
      setForm({
        name: '',
        phone: user?.user_metadata?.contact_number || '',
        address: '',
        logo_url: '',
      })
      return
    }
    setForm({
      name: restaurant?.name || '',
      phone: restaurant?.phone || user?.user_metadata?.contact_number || '',
      address: restaurant?.address || '',
      logo_url: restaurant?.logo_url || '',
    })
  }, [restaurant, user, creating])

  if (loading) return <Spinner />

  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function onUpload(event) {
    const file = event.target.files?.[0]
    if (!file) return
    const path = creating ? `logo-${Date.now()}` : `logo-${restaurant.id}`
    const { url, error: uploadError } = await uploadAsset(user.id, file, path)
    if (uploadError) setError(uploadError)
    else set('logo_url', url)
  }

  async function onSubmit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    const current = creating ? null : restaurant
    const { data, error: nextError } = await saveRestaurant(user.id, current, form)
    setBusy(false)
    if (nextError) {
      setError(nextError.message)
      return
    }
    setRestaurant(data)
    if (creating) {
      navigate('/dashboard', { replace: true })
      return
    }
    setNotice('Restaurant saved.')
  }

  const title = creating ? (restaurants?.length ? 'Add restaurant' : 'Set up your restaurant') : 'Restaurant'

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-2 font-display text-3xl">{title}</h1>
      {creating ? (
        <p className="mb-6 text-sm text-muted">
          {restaurants?.length
            ? 'Create another restaurant. Categories, menu items and QR codes stay separate.'
            : 'Add your restaurant details to start building your digital menu.'}
        </p>
      ) : (
        <div className="mb-6" />
      )}
      <Card>
        <form onSubmit={onSubmit} className="space-y-4">
          <Alert>{error}</Alert>
          <Alert type="success">{notice}</Alert>
          <Field label="Restaurant name">
            <input className={inputClass} required value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Phone">
            <input className={inputClass} required value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </Field>
          <Field label="Address">
            <textarea className={inputClass} rows={3} required value={form.address} onChange={(e) => set('address', e.target.value)} />
          </Field>
          <Field label="Logo (optional)" hint="JPG, PNG or WebP. Max 2MB.">
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onUpload} />
          </Field>
          {form.logo_url ? <img src={form.logo_url} alt="" className="h-16 w-16 rounded-xl object-cover" /> : null}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving...' : creating ? 'Create restaurant' : 'Save changes'}
            </Button>
            {creating && restaurant ? (
              <Button variant="secondary" onClick={() => navigate('/dashboard/restaurant')}>
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      </Card>
    </div>
  )
}
