import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Card from '../../components/Card'
import Field, { inputClass } from '../../components/Field'
import Spinner from '../../components/Spinner'
import { saveRestaurant } from '../../services/restaurants'
import { uploadAsset } from '../../lib/upload'

export default function Restaurant() {
  const { user, restaurant, loading, setRestaurant } = useOutletContext()
  const [form, setForm] = useState({ name: '', phone: '', address: '', logo_url: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (restaurant) {
      setForm({
        name: restaurant.name || '',
        phone: restaurant.phone || '',
        address: restaurant.address || '',
        logo_url: restaurant.logo_url || '',
      })
    }
  }, [restaurant])

  if (loading) return <Spinner />

  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function onUpload(event) {
    const file = event.target.files?.[0]
    if (!file) return
    const { url, error: uploadError } = await uploadAsset(user.id, file, 'logo')
    if (uploadError) setError(uploadError)
    else set('logo_url', url)
  }

  async function onSubmit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    const { data, error: nextError } = await saveRestaurant(user.id, restaurant, form)
    setBusy(false)
    if (nextError) {
      setError(nextError.message)
      return
    }
    setRestaurant(data)
    setNotice('Restaurant saved.')
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 font-display text-3xl">Restaurant</h1>
      <Card>
        <form onSubmit={onSubmit} className="space-y-4">
          <Alert>{error}</Alert>
          <Alert type="success">{notice}</Alert>
          <Field label="Restaurant name">
            <input className={inputClass} required value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Phone">
            <input className={inputClass} value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </Field>
          <Field label="Address">
            <textarea className={inputClass} rows={3} value={form.address} onChange={(e) => set('address', e.target.value)} />
          </Field>
          <Field label="Logo" hint="JPG, PNG or WebP. Max 2MB.">
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onUpload} />
          </Field>
          {form.logo_url ? <img src={form.logo_url} alt="" className="h-16 w-16 rounded-xl object-cover" /> : null}
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving...' : restaurant ? 'Save changes' : 'Create restaurant'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
