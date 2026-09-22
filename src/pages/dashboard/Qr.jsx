import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Card from '../../components/Card'
import EmptyState from '../../components/EmptyState'
import Spinner from '../../components/Spinner'
import { menuUrl, tableMenuUrl } from '../../lib/menuUrl'
import { fileSafeTableName, tableHeading } from '../../lib/tableToken'
import {
  BG_PRESETS,
  FG_PRESETS,
  PRINT_FORMATS,
  QR_STYLES,
  canvasToBlob,
  canvasToDataUrl,
  contrastIssue,
  createQrCanvas,
  createQrMatrix,
  downloadBrandedPdf,
  downloadBulkTablePdf,
  downloadDataUrl,
  downloadPrintPdf,
  downloadSafetyError,
  downloadTextFile,
  loadLogoImage,
  paintQr,
  qrToSvg,
  renderPrintCanvas,
  toDataUrl,
  whatsappShareUrl,
} from '../../lib/qrStudio'
import { isTableActive, listTables } from '../../services/tables'

const PREVIEW_SIZE = 360
const PNG_SIZE = 1024

function ColorSwatch({ selected, color, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-xl border px-2 py-2 text-[11px] ${
        selected ? 'border-forest bg-white ring-1 ring-forest' : 'border-line bg-white hover:border-ink'
      }`}
    >
      <span className="h-6 w-6 rounded-full border border-line" style={{ background: color }} />
      <span className="text-center leading-tight text-stone-600">{label}</span>
    </button>
  )
}

export default function Qr() {
  const { restaurant, loading } = useOutletContext()
  const previewRef = useRef(null)
  const printPreviewRef = useRef(null)

  const [fgPreset, setFgPreset] = useState('black')
  const [bgPreset, setBgPreset] = useState('white')
  const [fgCustom, setFgCustom] = useState('#1c1917')
  const [bgCustom, setBgCustom] = useState('#ffffff')
  const [style, setStyle] = useState('square')
  const [showLogo, setShowLogo] = useState(true)
  const [logoSize, setLogoSize] = useState('medium')
  const [logoImg, setLogoImg] = useState(null)
  const [logoDataUrl, setLogoDataUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [printFormat, setPrintFormat] = useState('a4')
  const [printPreviewUrl, setPrintPreviewUrl] = useState('')
  const [busy, setBusy] = useState('')
  const [tables, setTables] = useState([])
  const [targetId, setTargetId] = useState('general')

  useEffect(() => {
    let active = true
    async function loadTables() {
      if (!restaurant?.id) {
        setTables([])
        setTargetId('general')
        return
      }
      const { data, error: nextError } = await listTables(restaurant.id)
      if (!active) return
      if (nextError) setError(nextError.message)
      setTables(data || [])
      setTargetId('general')
    }
    loadTables()
    return () => {
      active = false
    }
  }, [restaurant?.id])

  const activeTables = tables.filter((item) => isTableActive(item))
  const selectedTable = tables.find((item) => item.id === targetId) || null
  const url = restaurant?.slug
    ? selectedTable
      ? tableMenuUrl(restaurant.slug, selectedTable.qr_token)
      : menuUrl(restaurant.slug)
    : ''
  const fileBase = restaurant?.slug
    ? selectedTable
      ? `${restaurant.slug}-${fileSafeTableName(tableHeading(selectedTable))}-qr`
      : `${restaurant.slug}-menu-qr`
    : 'menu-qr'
  const logoUrl = restaurant?.logo_url || ''
  const hasLogo = Boolean(logoUrl)

  const fg = fgPreset === 'custom' ? fgCustom : FG_PRESETS.find((p) => p.id === fgPreset)?.value || '#1c1917'
  const bg = bgPreset === 'custom' ? bgCustom : BG_PRESETS.find((p) => p.id === bgPreset)?.value || '#ffffff'
  const contrastMessage = contrastIssue(fg, bg)
  const logoOn = showLogo && hasLogo && Boolean(logoImg)

  const matrix = useMemo(() => (url ? createQrMatrix(url) : null), [url])

  const qrOptions = useMemo(
    () => ({ matrix, fg, bg, style, showLogo: logoOn, logoImg, logoSize }),
    [matrix, fg, bg, style, logoOn, logoImg, logoSize],
  )

  useEffect(() => {
    let cancelled = false
    if (!hasLogo) {
      setLogoImg(null)
      setLogoDataUrl('')
      return undefined
    }
    ;(async () => {
      try {
        const dataUrl = await toDataUrl(logoUrl)
        if (cancelled || !dataUrl) throw new Error('logo')
        const img = await loadLogoImage(dataUrl)
        if (cancelled) return
        setLogoDataUrl(dataUrl)
        setLogoImg(img)
      } catch {
        if (!cancelled) {
          setLogoImg(null)
          setLogoDataUrl('')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [hasLogo, logoUrl, restaurant?.id])

  useEffect(() => {
    const canvas = previewRef.current
    if (!canvas || !matrix) return
    canvas.width = PREVIEW_SIZE
    canvas.height = PREVIEW_SIZE
    paintQr(canvas, qrOptions)
  }, [matrix, qrOptions])

  useEffect(() => {
    if (!matrix) {
      setPrintPreviewUrl('')
      return
    }
    try {
        const canvas = renderPrintCanvas(printFormat, {
          restaurantName: restaurant?.name,
          tableName: selectedTable ? tableHeading(selectedTable) : '',
          logoImg,
          ...qrOptions,
        })
      printPreviewRef.current = canvas
      setPrintPreviewUrl(canvasToDataUrl(canvas))
    } catch {
      setPrintPreviewUrl('')
    }
  }, [matrix, printFormat, restaurant?.name, selectedTable, logoImg, qrOptions])

  if (loading) return <Spinner />
  if (!restaurant) {
    return (
      <EmptyState
        title="Create your restaurant first"
        body="A QR code is generated from the selected restaurant's menu URL."
        actionTo="/dashboard/restaurant"
        actionLabel="Restaurant setup"
      />
    )
  }

  function safetyBlock() {
    return downloadSafetyError({ url, matrix, contrastMessage })
  }

  function highResCanvas() {
    return createQrCanvas(PNG_SIZE, qrOptions)
  }

  async function onDownloadPng() {
    const block = safetyBlock()
    if (block) {
      setError(block)
      return
    }
    setError('')
    setBusy('png')
    try {
      const blob = await canvasToBlob(highResCanvas())
      const href = URL.createObjectURL(blob)
      downloadDataUrl(`${fileBase}.png`, href)
      setTimeout(() => URL.revokeObjectURL(href), 1500)
    } catch (err) {
      setError(err.message)
    }
    setBusy('')
  }

  function onDownloadSvg() {
    const block = safetyBlock()
    if (block) {
      setError(block)
      return
    }
    setError('')
    setBusy('svg')
    try {
      const svg = qrToSvg(matrix, {
        fg,
        bg,
        style,
        size: 1024,
        showLogo: logoOn && Boolean(logoDataUrl),
        logoDataUrl,
        logoSize,
      })
      downloadTextFile(`${fileBase}.svg`, svg, 'image/svg+xml')
    } catch (err) {
      setError(err.message)
    }
    setBusy('')
  }

  async function onDownloadPdf() {
    const block = safetyBlock()
    if (block) {
      setError(block)
      return
    }
    setError('')
    setBusy('pdf')
    try {
      await downloadBrandedPdf({
        name: restaurant.name,
        tableName: selectedTable ? tableHeading(selectedTable) : '',
        url,
        qrCanvas: highResCanvas(),
        logoImg,
        filename: `${fileBase}.pdf`,
      })
    } catch (err) {
      setError(err.message)
    }
    setBusy('')
  }

  async function onDownloadPrint(kind) {
    const block = safetyBlock()
    if (block) {
      setError(block)
      return
    }
    const canvas = printPreviewRef.current
    if (!canvas) {
      setError('Print preview is not ready yet.')
      return
    }
    setError('')
    setBusy(`print-${kind}`)
    try {
      if (kind === 'png') {
        downloadDataUrl(`${fileBase}-${printFormat}.png`, canvasToDataUrl(canvas))
      } else {
        await downloadPrintPdf(printFormat, canvas, `${fileBase}-${printFormat}.pdf`)
      }
    } catch (err) {
      setError(err.message)
    }
    setBusy('')
  }

  async function copy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function shareNative() {
    if (!navigator.share) {
      setError('Native share is not available on this device. Copy the link or use WhatsApp.')
      return
    }
    try {
      await navigator.share({
        title: restaurant.name,
        text: `View our digital menu:\n${url}`,
        url,
      })
    } catch (err) {
      if (err?.name !== 'AbortError') setError('Sharing was cancelled or not available.')
    }
  }

  async function shareQr() {
    const block = safetyBlock()
    if (block) {
      setError(block)
      return
    }
    try {
      const blob = await canvasToBlob(highResCanvas())
          const file = new File([blob], `${fileBase}.png`, { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: restaurant.name,
          text: `View our digital menu:\n${url}`,
          files: [file],
        })
        return
      }
      if (navigator.share) {
        await navigator.share({ title: restaurant.name, text: `View our digital menu:\n${url}`, url })
        return
      }
      downloadDataUrl(`${fileBase}.png`, canvasToDataUrl(highResCanvas()))
      setNotice('Native share is not available. The QR image was downloaded instead.')
    } catch (err) {
      if (err?.name !== 'AbortError') setError(err.message || 'Could not share the QR.')
    }
  }

  function testScan() {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function onBulkPrint() {
    if (!activeTables.length) {
      setError('Add active tables first, then print their QRs.')
      return
    }
    if (contrastMessage) {
      setError(contrastMessage)
      return
    }
    setError('')
    setBusy('bulk')
    try {
      await downloadBulkTablePdf({
        restaurantName: restaurant.name,
        tables: activeTables.map((item) => ({
          name: tableHeading(item),
          url: tableMenuUrl(restaurant.slug, item.qr_token),
        })),
        qrStyle: { fg, bg, style, showLogo: logoOn, logoImg, logoSize },
        filename: `${restaurant.slug}-table-qrs.pdf`,
      })
    } catch (err) {
      setError(err.message)
    }
    setBusy('')
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="font-display text-3xl">QR Code Studio</h1>
        <p className="mt-1 text-sm text-muted">
          Brand your QR. The general restaurant code always opens the same permanent menu URL.
        </p>
      </div>

      <Card title="QR target">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTargetId('general')}
            className={`rounded-xl border px-3 py-2 text-sm ${
              targetId === 'general' ? 'border-forest bg-white text-forest' : 'border-line bg-white text-stone-600'
            }`}
          >
            General restaurant QR
          </button>
          {tables.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTargetId(item.id)}
              className={`rounded-xl border px-3 py-2 text-sm ${
                targetId === item.id ? 'border-forest bg-white text-forest' : 'border-line bg-white text-stone-600'
              }`}
            >
              {tableHeading(item)}
              {isTableActive(item) ? '' : ' (inactive)'}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">
          Table QRs still open this restaurant's public menu with a table token. Manage tables from{' '}
          <Link className="underline" to="/dashboard/tables">
            Tables
          </Link>
          .
        </p>
      </Card>

      <Alert>{error}</Alert>
      <Alert type="success">{notice}</Alert>
      {contrastMessage ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{contrastMessage}</div>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
        <div className="order-2 space-y-5 lg:order-1">
          <Card title="Restaurant logo">
            {hasLogo ? (
              <div className="flex items-center gap-4">
                <img src={logoUrl} alt="" className="h-14 w-14 rounded-xl border border-line object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Show restaurant logo</p>
                  <p className="text-xs text-muted">Uses the logo from your restaurant profile.</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={showLogo}
                  onClick={() => setShowLogo((v) => !v)}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition ${showLogo ? 'bg-forest' : 'bg-stone-300'}`}
                >
                  <span
                    className="absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition"
                    style={{ left: showLogo ? '1.4rem' : '0.15rem' }}
                  />
                </button>
              </div>
            ) : (
              <p className="text-sm text-muted">
                Add a restaurant logo from your{' '}
                <Link className="underline" to="/dashboard/restaurant">
                  Restaurant Profile
                </Link>
                .
              </p>
            )}
            {hasLogo && showLogo && !logoImg ? (
              <p className="mt-3 text-xs text-amber-800">
                The logo could not be placed on the QR yet. Check that the image is public, then refresh this page.
              </p>
            ) : null}
            {hasLogo && showLogo ? (
              <div className="mt-4">
                <p className="mb-2 text-sm font-medium">Logo size</p>
                <div className="flex flex-wrap gap-2">
                  {['small', 'medium', 'large'].map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setLogoSize(size)}
                      className={`rounded-xl border px-3 py-2 text-sm capitalize ${
                        logoSize === size ? 'border-forest bg-white text-forest' : 'border-line bg-white text-stone-600'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </Card>

          <Card title="QR color">
            <p className="mb-2 text-sm font-medium">Foreground</p>
            <div className="flex flex-wrap gap-2">
              {FG_PRESETS.map((preset) => (
                <ColorSwatch
                  key={preset.id}
                  selected={fgPreset === preset.id}
                  color={preset.value || fgCustom}
                  label={preset.label}
                  onClick={() => setFgPreset(preset.id)}
                />
              ))}
            </div>
            {fgPreset === 'custom' ? (
              <label className="mt-3 flex items-center gap-3 text-sm">
                Custom
                <input type="color" value={fgCustom} onChange={(e) => setFgCustom(e.target.value)} />
              </label>
            ) : null}

            <p className="mb-2 mt-5 text-sm font-medium">Background</p>
            <div className="flex flex-wrap gap-2">
              {BG_PRESETS.map((preset) => (
                <ColorSwatch
                  key={preset.id}
                  selected={bgPreset === preset.id}
                  color={preset.value || bgCustom}
                  label={preset.label}
                  onClick={() => setBgPreset(preset.id)}
                />
              ))}
            </div>
            {bgPreset === 'custom' ? (
              <label className="mt-3 flex items-center gap-3 text-sm">
                Custom
                <input type="color" value={bgCustom} onChange={(e) => setBgCustom(e.target.value)} />
              </label>
            ) : null}
          </Card>

          <Card title="QR style">
            <div className="flex flex-wrap gap-2">
              {QR_STYLES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setStyle(item.id)}
                  className={`rounded-xl border px-3 py-2 text-sm ${
                    style === item.id ? 'border-forest bg-white text-forest' : 'border-line bg-white text-stone-600'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted">Corner markers stay square so scanning stays reliable.</p>
          </Card>

          <Card title="Download">
            <div className="flex flex-wrap gap-3">
              <Button onClick={onDownloadPng} disabled={Boolean(safetyBlock()) || busy === 'png'}>
                {busy === 'png' ? 'Preparing...' : 'Download PNG'}
              </Button>
              <Button variant="secondary" onClick={onDownloadSvg} disabled={Boolean(safetyBlock()) || busy === 'svg'}>
                {busy === 'svg' ? 'Preparing...' : 'Download SVG'}
              </Button>
              <Button variant="secondary" onClick={onDownloadPdf} disabled={Boolean(safetyBlock()) || busy === 'pdf'}>
                {busy === 'pdf' ? 'Preparing...' : 'Download PDF'}
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted">PNG for WhatsApp. SVG for print shops. PDF for A4 printing.</p>
          </Card>

          <Card title="Share">
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" onClick={copy}>
                {copied ? 'Copied' : 'Copy menu link'}
              </Button>
              <a href={whatsappShareUrl(url)} target="_blank" rel="noreferrer">
                <Button variant="secondary">WhatsApp</Button>
              </a>
              <Button variant="secondary" onClick={shareNative}>
                Share menu link
              </Button>
              <Button variant="secondary" onClick={shareQr}>
                Share QR
              </Button>
            </div>
          </Card>
        </div>

        <div className="order-1 space-y-5 lg:sticky lg:top-6 lg:order-2">
          <Card>
            <div className="rounded-2xl border border-line bg-[#fffdf9] px-5 py-6 text-center">
              {hasLogo ? (
                <img src={logoUrl} alt="" className="mx-auto mb-3 h-12 w-12 rounded-xl object-cover" />
              ) : (
                <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-forest font-display text-xs text-[#f6f1ea]">
                  {(restaurant.name || 'R').slice(0, 2).toUpperCase()}
                </div>
              )}
              <p className="font-display text-xl leading-tight">{restaurant.name}</p>
              {selectedTable ? <p className="mt-1 text-sm font-medium text-forest">{tableHeading(selectedTable)}</p> : null}
              <div className="mx-auto my-5 flex justify-center rounded-2xl bg-white p-3 shadow-sm">
                {matrix ? (
                  <canvas ref={previewRef} width={PREVIEW_SIZE} height={PREVIEW_SIZE} className="h-64 w-64 max-w-full" />
                ) : (
                  <p className="text-sm text-muted">Generating...</p>
                )}
              </div>
              <p className="font-medium text-forest">Scan to View Menu</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button variant="secondary" onClick={testScan}>
                Test QR
              </Button>
              <a href={url} target="_blank" rel="noreferrer">
                <Button variant="ghost">Preview menu</Button>
              </a>
            </div>
            <div className="mt-4 rounded-xl bg-paper px-3 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                {selectedTable ? tableHeading(selectedTable) : 'Your menu'}
              </p>
              <p className="mt-1 break-all text-sm">{url}</p>
              <button type="button" className="mt-2 text-sm underline" onClick={copy}>
                {copied ? 'Copied' : 'Copy link'}
              </button>
            </div>
          </Card>
        </div>
      </div>

      <Card title="Print designs">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {PRINT_FORMATS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setPrintFormat(item.id)}
              className={`rounded-2xl border px-4 py-3 text-left ${
                printFormat === item.id ? 'border-forest bg-white ring-1 ring-forest' : 'border-line bg-white hover:border-ink'
              }`}
            >
              <p className="font-medium">{item.label}</p>
              <p className="mt-1 text-xs text-muted">{item.hint}</p>
            </button>
          ))}
        </div>
        <div className="mt-5 overflow-hidden rounded-2xl border border-line bg-paper p-4">
          {printPreviewUrl ? (
            <img src={printPreviewUrl} alt={`${printFormat} print preview`} className="mx-auto max-h-[480px] w-auto max-w-full" />
          ) : (
            <p className="py-10 text-center text-sm text-muted">Preparing print preview...</p>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button onClick={() => onDownloadPrint('pdf')} disabled={Boolean(safetyBlock()) || Boolean(busy)}>
            Download print PDF
          </Button>
          <Button variant="secondary" onClick={() => onDownloadPrint('png')} disabled={Boolean(safetyBlock()) || Boolean(busy)}>
            Download print PNG
          </Button>
        </div>
      </Card>

      <Card title="Print all table QRs">
        {activeTables.length === 0 ? (
          <p className="text-sm text-muted">
            Add active tables from{' '}
            <Link className="underline" to="/dashboard/tables">
              Tables
            </Link>
            , then print a sheet of unique table QRs here.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted">
              Downloads one A4 PDF with {activeTables.length} active table {activeTables.length === 1 ? 'QR' : 'QRs'} (2 per row). The general restaurant QR is not included.
            </p>
            <div className="mt-4">
              <Button onClick={onBulkPrint} disabled={Boolean(contrastMessage) || busy === 'bulk'}>
                {busy === 'bulk' ? 'Preparing...' : 'Download all table QRs'}
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
