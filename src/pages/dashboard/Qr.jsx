import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import QRCode from 'qrcode'
import Button from '../../components/Button'
import Card from '../../components/Card'
import EmptyState from '../../components/EmptyState'
import Spinner from '../../components/Spinner'
import { menuUrl } from '../../lib/menuUrl'

export default function Qr() {
  const { restaurant, loading } = useOutletContext()
  const [dataUrl, setDataUrl] = useState('')
  const [copied, setCopied] = useState(false)

  const url = restaurant?.slug ? menuUrl(restaurant.slug) : ''

  useEffect(() => {
    if (!url) return
    QRCode.toDataURL(url, { width: 512, margin: 2, color: { dark: '#1c1917', light: '#ffffff' } })
      .then(setDataUrl)
      .catch(() => setDataUrl(''))
  }, [url])

  if (loading) return <Spinner />
  if (!restaurant) {
    return (
      <EmptyState
        title="Create your restaurant first"
        body="A QR code is generated from your restaurant menu URL."
        actionTo="/dashboard/restaurant"
        actionLabel="Restaurant setup"
      />
    )
  }

  function download() {
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = `${restaurant.slug}-menu-qr.png`
    link.click()
  }

  async function copy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="font-display text-3xl">QR code</h1>
      <Card>
        <p className="text-sm text-muted">
          This QR always opens your menu. Updating dishes does not change the code.
        </p>
        <p className="mt-3 break-all text-sm">{url}</p>
        <div className="mt-6 flex justify-center rounded-2xl bg-white p-6">
          {dataUrl ? <img src={dataUrl} alt="Menu QR code" className="h-64 w-64" /> : <p>Generating...</p>}
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={download} disabled={!dataUrl}>Download PNG</Button>
          <Button variant="secondary" onClick={copy}>{copied ? 'Copied' : 'Copy menu link'}</Button>
          <a href={url} target="_blank" rel="noreferrer">
            <Button variant="ghost">Preview menu</Button>
          </a>
        </div>
      </Card>
    </div>
  )
}
