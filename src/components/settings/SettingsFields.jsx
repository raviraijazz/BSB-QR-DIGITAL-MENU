import { useEffect, useMemo, useState } from 'react'
import Field, { inputClass } from '../Field'
import {
  CURRENCIES,
  PERMISSION_GROUPS,
  RESTAURANT_TYPES,
  ROLE_KEYS,
  TIMEZONES,
  WEEKDAYS,
} from '../../lib/restaurantSettings'
import {
  BILL_ALIGNMENTS,
  BILL_FONT_SIZES,
  BILL_TEMPLATES,
} from '../../lib/billPrint'
import {
  ORDER_TYPES,
  connectionLabel,
  emptyPrinter,
  emptyRoute,
  printerLabel,
} from '../../lib/printerRouting'
import { printTestTicket } from '../../services/printJobs'
import { listCategories } from '../../services/categories'
import { listMenuItems } from '../../services/menuItems'

export const selectClass = inputClass

export function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="flex items-start justify-between gap-3 rounded-xl border border-line bg-white px-3 py-2.5">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint ? <span className="mt-0.5 block text-[11px] text-muted">{hint}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-10 shrink-0 rounded-full transition ${checked ? 'bg-forest' : 'bg-stone-300'}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </label>
  )
}

export function Check({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  )
}

export function ProfileFields({ form, set, errors }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Restaurant name" error={errors.name}>
          <input className={inputClass} value={form.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Restaurant type">
          <select className={selectClass} value={form.restaurant_type} onChange={(e) => set('restaurant_type', e.target.value)}>
            <option value="">Select type</option>
            {RESTAURANT_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </Field>
        <Field label="Owner name">
          <input className={inputClass} value={form.owner_name} onChange={(e) => set('owner_name', e.target.value)} />
        </Field>
        <Field label="Email" error={errors.email}>
          <input className={inputClass} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Phone" error={errors.phone}>
          <input className={inputClass} value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="Alternate phone">
          <input className={inputClass} value={form.alternate_phone} onChange={(e) => set('alternate_phone', e.target.value)} />
        </Field>
        <Field label="GSTIN" error={errors.gstin}>
          <input className={inputClass} value={form.gstin} onChange={(e) => set('gstin', e.target.value)} />
        </Field>
        <Field label="FSSAI">
          <input className={inputClass} value={form.fssai} onChange={(e) => set('fssai', e.target.value)} />
        </Field>
        <Field label="City">
          <input className={inputClass} value={form.city} onChange={(e) => set('city', e.target.value)} />
        </Field>
        <Field label="State">
          <input className={inputClass} value={form.state} onChange={(e) => set('state', e.target.value)} />
        </Field>
        <Field label="PIN">
          <input className={inputClass} value={form.pin} onChange={(e) => set('pin', e.target.value)} />
        </Field>
        <Field label="Timezone">
          <select className={selectClass} value={form.timezone} onChange={(e) => set('timezone', e.target.value)}>
            {TIMEZONES.map((zone) => (
              <option key={zone} value={zone}>{zone}</option>
            ))}
          </select>
        </Field>
        <Field label="Currency">
          <select className={selectClass} value={form.currency} onChange={(e) => set('currency', e.target.value)}>
            {CURRENCIES.map((row) => (
              <option key={row.id} value={row.id}>{row.label}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Address">
        <textarea className={inputClass} rows={3} value={form.address} onChange={(e) => set('address', e.target.value)} />
      </Field>
      <div>
        <h3 className="font-display text-lg">Working hours</h3>
        <p className="mt-1 text-xs text-muted">Times use this restaurant timezone ({form.timezone}).</p>
        <div className="mt-3 space-y-2">
          {WEEKDAYS.map((day) => {
            const row = (form.hours || []).find((item) => item.day_of_week === day.id) || { day_of_week: day.id, is_open: true, open_time: '11:00', close_time: '23:00' }
            return (
              <div key={day.id} className="grid grid-cols-[7rem_auto_1fr_1fr] items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-sm">
                <span className="font-medium">{day.label}</span>
                <Check checked={row.is_open} onChange={(value) => set('hours', (form.hours || []).map((item) => (item.day_of_week === day.id ? { ...item, is_open: value } : item)))} label="Open" />
                <input className={inputClass} type="time" disabled={!row.is_open} value={row.open_time} onChange={(e) => set('hours', (form.hours || []).map((item) => (item.day_of_week === day.id ? { ...item, open_time: e.target.value } : item)))} />
                <input className={inputClass} type="time" disabled={!row.is_open} value={row.close_time} onChange={(e) => set('hours', (form.hours || []).map((item) => (item.day_of_week === day.id ? { ...item, close_time: e.target.value } : item)))} />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function BrandingFields({ form, set, errors, onLogo, onMark, onRemoveLogo, onRemoveMark }) {
  return (
    <div className="space-y-5">
      <Field label="Logo" hint="JPG, PNG or WebP. Max 2MB. Used on menu, QR and bill preview.">
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onLogo} />
      </Field>
      {form.logo_url ? (
        <div className="flex items-center gap-3">
          <img src={form.logo_url} alt="" className="h-16 w-16 rounded-xl object-cover" />
          <button type="button" className="text-sm text-rose-700" onClick={onRemoveLogo}>Remove logo</button>
        </div>
      ) : null}
      <Field label="Small logo / mark" hint="Optional mark for compact tickets.">
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onMark} />
      </Field>
      {form.mark_url ? (
        <div className="flex items-center gap-3">
          <img src={form.mark_url} alt="" className="h-10 w-10 rounded-lg object-cover" />
          <button type="button" className="text-sm text-rose-700" onClick={onRemoveMark}>Remove mark</button>
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Primary brand color">
          <input className={inputClass} type="color" value={form.primary_color} onChange={(e) => set('primary_color', e.target.value)} />
        </Field>
        <Field label="Secondary brand color">
          <input className={inputClass} type="color" value={form.secondary_color} onChange={(e) => set('secondary_color', e.target.value)} />
        </Field>
      </div>
      <h3 className="font-display text-lg">Contact & online presence</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Website" error={errors.website}>
          <input className={inputClass} value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="https://" />
        </Field>
        <Field label="Facebook" error={errors.facebook}>
          <input className={inputClass} value={form.facebook} onChange={(e) => set('facebook', e.target.value)} />
        </Field>
        <Field label="Instagram" error={errors.instagram}>
          <input className={inputClass} value={form.instagram} onChange={(e) => set('instagram', e.target.value)} />
        </Field>
        <Field label="Google Maps" error={errors.google_maps}>
          <input className={inputClass} value={form.google_maps} onChange={(e) => set('google_maps', e.target.value)} />
        </Field>
      </div>
      <h3 className="font-display text-lg">Additional info</h3>
      <Field label="Tagline / subtitle">
        <input className={inputClass} value={form.tagline} onChange={(e) => set('tagline', e.target.value)} />
      </Field>
      <Field label="Thank-you message">
        <input className={inputClass} value={form.thank_you_message} onChange={(e) => set('thank_you_message', e.target.value)} />
      </Field>
      <Field label="Terms & conditions">
        <textarea className={inputClass} rows={4} value={form.terms} onChange={(e) => set('terms', e.target.value)} />
      </Field>
    </div>
  )
}

export function TaxFields({ form, set, errors }) {
  const rates = form.taxRates || []
  const charges = form.serviceCharges || []
  return (
    <div className="space-y-5">
      <AlertNote>Tax rates are not hard-coded. Saved values are used from Phase 16 onward.</AlertNote>
      {errors.tax ? <p className="text-sm text-rose-700">{errors.tax}</p> : null}
      <Toggle checked={form.tax_enabled} onChange={(value) => set('tax_enabled', value)} label="Enable tax" hint="Applies as restaurant default, not as a rewrite of settled bills." />
      <Field label="Tax mode">
        <select className={selectClass} value={form.tax_mode} onChange={(e) => set('tax_mode', e.target.value)}>
          <option value="exclusive">Exclusive</option>
          <option value="inclusive">Inclusive</option>
        </select>
      </Field>
      <Field label="Rounding">
        <select className={selectClass} value={form.rounding} onChange={(e) => set('rounding', e.target.value)}>
          <option value="none">None</option>
          <option value="nearest">Nearest rupee</option>
          <option value="up">Round up</option>
          <option value="down">Round down</option>
        </select>
      </Field>
      <div>
        <h3 className="font-display text-lg">Tax rates</h3>
        <div className="mt-3 space-y-2">
          {rates.map((row, index) => (
            <div key={row.id || index} className="grid gap-2 rounded-xl border border-line bg-white p-3 sm:grid-cols-[1fr_7rem_auto_auto]">
              <input className={inputClass} value={row.name} onChange={(e) => set('taxRates', rates.map((item, i) => (i === index ? { ...item, name: e.target.value } : item)))} placeholder="Name" />
              <input className={inputClass} type="number" min="0" max="100" step="0.01" value={row.rate} onChange={(e) => set('taxRates', rates.map((item, i) => (i === index ? { ...item, rate: e.target.value } : item)))} />
              <Check checked={row.is_enabled} onChange={(value) => set('taxRates', rates.map((item, i) => (i === index ? { ...item, is_enabled: value } : item)))} label="On" />
              <button type="button" className="text-sm text-rose-700" onClick={() => set('taxRates', rates.filter((_, i) => i !== index))}>Remove</button>
            </div>
          ))}
        </div>
        <button type="button" className="mt-2 text-sm font-medium text-forest" onClick={() => set('taxRates', [...rates, { name: '', rate: 0, is_enabled: true, sort_order: rates.length }])}>Add tax rate</button>
      </div>
      <div>
        <h3 className="font-display text-lg">Service charge</h3>
        {charges.map((row, index) => (
          <div key={row.id || index} className="mt-3 space-y-3 rounded-xl border border-line bg-white p-3">
            <Toggle checked={row.is_enabled} onChange={(value) => set('serviceCharges', charges.map((item, i) => (i === index ? { ...item, is_enabled: value } : item)))} label="Enable service charge" />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Type">
                <select className={selectClass} value={row.charge_type} onChange={(e) => set('serviceCharges', charges.map((item, i) => (i === index ? { ...item, charge_type: e.target.value } : item)))}>
                  <option value="percent">Percentage</option>
                  <option value="fixed">Fixed</option>
                </select>
              </Field>
              <Field label={row.charge_type === 'fixed' ? 'Amount' : 'Percentage'}>
                <input className={inputClass} type="number" min="0" step="0.01" value={row.value} onChange={(e) => set('serviceCharges', charges.map((item, i) => (i === index ? { ...item, value: e.target.value } : item)))} />
              </Field>
              <Field label="Taxable">
                <select className={selectClass} value={row.is_taxable ? 'yes' : 'no'} onChange={(e) => set('serviceCharges', charges.map((item, i) => (i === index ? { ...item, is_taxable: e.target.value === 'yes' } : item)))}>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </Field>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function AlertNote({ children }) {
  return <p className="rounded-xl border border-line bg-paper px-3 py-2 text-sm text-muted">{children}</p>
}

export function PaymentFields({ form, set, errors }) {
  const rows = form.payments || []
  function move(index, dir) {
    const next = rows.slice()
    const target = index + dir
    if (target < 0 || target >= next.length) return
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)
    set('payments', next)
  }
  return (
    <div className="space-y-4">
      <AlertNote>No payment gateway is connected. These flags only configure which methods can appear later.</AlertNote>
      {errors.upi ? <p className="text-sm text-rose-700">{errors.upi}</p> : null}
      {rows.map((row, index) => (
        <div key={row.method} className="space-y-3 rounded-[16px] border border-line bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium">{row.label}</p>
            <div className="flex gap-2">
              <button type="button" className="text-xs text-muted" onClick={() => move(index, -1)}>Up</button>
              <button type="button" className="text-xs text-muted" onClick={() => move(index, 1)}>Down</button>
            </div>
          </div>
          <Toggle checked={row.is_enabled} onChange={(value) => set('payments', rows.map((item, i) => (i === index ? { ...item, is_enabled: value } : item)))} label={`Enable ${row.label}`} />
          {row.method === 'upi' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="UPI ID">
                <input className={inputClass} value={row.upi_id} onChange={(e) => set('payments', rows.map((item, i) => (i === index ? { ...item, upi_id: e.target.value } : item)))} placeholder="name@upi" />
              </Field>
              <Field label="Display name">
                <input className={inputClass} value={row.display_name} onChange={(e) => set('payments', rows.map((item, i) => (i === index ? { ...item, display_name: e.target.value } : item)))} />
              </Field>
            </div>
          ) : null}
          {(row.method === 'upi' || row.method === 'card') ? (
            <Toggle checked={row.reference_required} onChange={(value) => set('payments', rows.map((item, i) => (i === index ? { ...item, reference_required: value } : item)))} label="Reference required" />
          ) : null}
        </div>
      ))}
    </div>
  )
}

export function FlagGrid({ value, onChange, flags }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {flags.map((flag) => (
        <Check key={flag.id} checked={value[flag.id]} onChange={(next) => onChange({ ...value, [flag.id]: next })} label={flag.label} />
      ))}
    </div>
  )
}

export function KotFields({ form, set }) {
  const kot = form.kot || {}
  return (
    <div className="space-y-5">
      <AlertNote>KOT layout is stored only. Existing kitchen tickets are not rewritten.</AlertNote>
      <FlagGrid
        value={kot}
        onChange={(next) => set('kot', next)}
        flags={[
          { id: 'showRestaurantName', label: 'Restaurant name' },
          { id: 'showLogo', label: 'Logo' },
          { id: 'showKotNumber', label: 'KOT number' },
          { id: 'showTable', label: 'Table' },
          { id: 'showWaiter', label: 'Waiter' },
          { id: 'showOrderTime', label: 'Order time' },
          { id: 'showOrderType', label: 'Order type' },
          { id: 'showItemCode', label: 'Item code' },
          { id: 'showItemName', label: 'Item name' },
          { id: 'showVariant', label: 'Variant' },
          { id: 'showQuantity', label: 'Quantity' },
          { id: 'showNotes', label: 'Notes' },
          { id: 'showCustomerName', label: 'Customer name' },
          { id: 'showAddonLabel', label: 'Add-on label' },
          { id: 'showReprintLabel', label: 'Reprint label' },
        ]}
      />
      <Field label="KOT header">
        <input className={inputClass} value={kot.header} onChange={(e) => set('kot', { ...kot, header: e.target.value })} />
      </Field>
      <Field label="KOT footer">
        <input className={inputClass} value={kot.footer} onChange={(e) => set('kot', { ...kot, footer: e.target.value })} />
      </Field>
      <div className="grid gap-2 sm:grid-cols-2">
        <Toggle checked={kot.sound} onChange={(value) => set('kot', { ...kot, sound: value })} label="New KOT sound" />
        <Toggle checked={kot.timer} onChange={(value) => set('kot', { ...kot, timer: value })} label="Ticket timer" />
        <Toggle checked={kot.ageHighlight} onChange={(value) => set('kot', { ...kot, ageHighlight: value })} label="Age highlighting" />
        <Toggle checked={kot.addonDistinction} onChange={(value) => set('kot', { ...kot, addonDistinction: value })} label="Add-on distinction" />
      </div>
    </div>
  )
}

export function BillFields({ form, set }) {
  const bill = form.bill || {}
  return (
    <div className="space-y-5">
      <AlertNote>Bill layout is configuration only. Historical bills stay as stored and are never recalculated.</AlertNote>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Template">
          <select className={selectClass} value={bill.template || 'thermal'} onChange={(e) => set('bill', { ...bill, template: e.target.value })}>
            {BILL_TEMPLATES.map((row) => (
              <option key={row.id} value={row.id}>{row.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Font size">
          <select className={selectClass} value={bill.fontSize || 'normal'} onChange={(e) => set('bill', { ...bill, fontSize: e.target.value })}>
            {BILL_FONT_SIZES.map((row) => (
              <option key={row.id} value={row.id}>{row.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Alignment">
          <select className={selectClass} value={bill.alignment || 'center'} onChange={(e) => set('bill', { ...bill, alignment: e.target.value })}>
            {BILL_ALIGNMENTS.map((row) => (
              <option key={row.id} value={row.id}>{row.label}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Toggle checked={bill.autoPrintOnSettle !== false} onChange={(value) => set('bill', { ...bill, autoPrintOnSettle: value })} label="Auto-print after settlement" hint="Opens the browser print dialog only after a bill is fully paid." />
        <Toggle checked={bill.printSplitReceipt !== false} onChange={(value) => set('bill', { ...bill, printSplitReceipt: value })} label="Print split receipt" hint="Also print a receipt copy when a bill is paid with more than one method." />
        <Toggle checked={bill.printMerchantCopy} onChange={(value) => set('bill', { ...bill, printMerchantCopy: value })} label="Print merchant copy" hint="Print a second copy when a receipt printer is assigned." />
      </div>
      <FlagGrid
        value={bill}
        onChange={(next) => set('bill', next)}
        flags={[
          { id: 'showLogo', label: 'Logo' },
          { id: 'showRestaurantName', label: 'Restaurant name' },
          { id: 'showLegalName', label: 'Legal / owner name' },
          { id: 'showAddress', label: 'Address' },
          { id: 'showPhone', label: 'Phone' },
          { id: 'showEmail', label: 'Email' },
          { id: 'showGstin', label: 'GSTIN' },
          { id: 'showBillNumber', label: 'Bill number' },
          { id: 'showDateTime', label: 'Date and time' },
          { id: 'showTable', label: 'Table' },
          { id: 'showWaiter', label: 'Waiter' },
          { id: 'showGuestCount', label: 'Guest count' },
          { id: 'showItemCode', label: 'Item code' },
          { id: 'showItemName', label: 'Item name' },
          { id: 'showVariants', label: 'Variants' },
          { id: 'showItemNotes', label: 'Item notes' },
          { id: 'showDiscount', label: 'Discount' },
          { id: 'showTax', label: 'Tax' },
          { id: 'showTaxBreakdown', label: 'CGST / SGST breakdown' },
          { id: 'showServiceCharge', label: 'Service charge' },
          { id: 'showPaymentMethod', label: 'Payment method' },
          { id: 'showSplitPayments', label: 'Split payment breakdown' },
          { id: 'showUpiInfo', label: 'UPI info' },
          { id: 'showFooter', label: 'Footer' },
          { id: 'showReprintLabel', label: 'Reprint label' },
        ]}
      />
      <Field label="Bill header">
        <input className={inputClass} value={bill.header} onChange={(e) => set('bill', { ...bill, header: e.target.value })} />
      </Field>
      <Field label="Bill footer">
        <input className={inputClass} value={bill.footer} onChange={(e) => set('bill', { ...bill, footer: e.target.value })} />
      </Field>
      <Field label="Thank-you message">
        <input className={inputClass} value={bill.thankYou} onChange={(e) => set('bill', { ...bill, thankYou: e.target.value })} />
      </Field>
      <Field label="Return / refund text">
        <textarea className={inputClass} rows={3} value={bill.refundText} onChange={(e) => set('bill', { ...bill, refundText: e.target.value })} />
      </Field>
    </div>
  )
}

function printerKey(row, index) {
  return row.id || row._key || `printer-${index}`
}

export function PrinterFields({ form, set, restaurant }) {
  const rows = form.printers || []
  const routes = form.printerRoutes || []
  const [tab, setTab] = useState('profiles')
  const [categories, setCategories] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [testNotice, setTestNotice] = useState('')
  const [testError, setTestError] = useState('')
  const [testingId, setTestingId] = useState('')

  useEffect(() => {
    if (!restaurant?.id) return undefined
    let active = true
    Promise.all([listCategories(restaurant.id), listMenuItems(restaurant.id)]).then(([nextCategories, nextItems]) => {
      if (!active) return
      setCategories(nextCategories.data || [])
      setMenuItems(nextItems.data || [])
    })
    return () => {
      active = false
    }
  }, [restaurant?.id])

  function patch(index, next) {
    const updated = rows.map((item, i) => {
      if (i !== index) {
        if (next.is_default_kot && item.is_default_kot) return { ...item, is_default_kot: false }
        if (next.is_default_kitchen && item.is_default_kitchen) return { ...item, is_default_kitchen: false }
        if (next.is_default_bill && item.is_default_bill) return { ...item, is_default_bill: false }
        if (next.is_default_receipt && item.is_default_receipt) return { ...item, is_default_receipt: false }
        return item
      }
      return { ...item, ...next }
    })
    set('printers', updated)
  }

  function addPrinter() {
    set('printers', [...rows, { ...emptyPrinter(), _key: `new-${Date.now()}`, is_default_kot: rows.length === 0 }])
  }

  function removePrinter(index) {
    const removed = rows[index]
    const key = printerKey(removed, index)
    set('printers', rows.filter((_, i) => i !== index))
    set('printerRoutes', routes.filter((row) => row.printer_id !== removed.id && row.printer_id !== key))
  }

  async function onTest(row, index) {
    setTestingId(printerKey(row, index))
    setTestError('')
    setTestNotice('')
    const result = await printTestTicket({ restaurant, printer: row, settings: form })
    setTestingId('')
    if (result.error) setTestError(result.error.message)
    else setTestNotice(`Test print opened for ${printerLabel(row)}. Choose a system printer in the browser dialog.`)
  }

  function patchRoute(index, next) {
    set('printerRoutes', routes.map((item, i) => (i === index ? { ...item, ...next } : item)))
  }

  const kotPrinters = rows.filter((row) => row.use_for !== 'bill' && row.use_for !== 'receipt')
  const needsAddress = (row) => row.connection_type === 'network' || row.connection_type === 'usb' || row.connection_type === 'bluetooth'

  const kotPreview = useMemo(() => {
    const kot = form.kot || {}
    return { kot, name: form.name, logo_url: form.logo_url }
  }, [form.kot, form.name, form.logo_url])

  const TABS = [
    { id: 'profiles', label: 'Printers' },
    { id: 'routing', label: 'Routing' },
    { id: 'preview', label: 'KOT preview' },
  ]

  return (
    <div className="space-y-4">
      <AlertNote>Printing uses the browser or system print dialog. USB and network addresses are stored for later hardware support and are not claimed as live connections.</AlertNote>
      <div className="flex gap-1 rounded-xl bg-paper p-1">
        {TABS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setTab(option.id)}
            className={`flex-1 rounded-lg px-2 py-1.5 text-[12px] font-medium ${tab === option.id ? 'bg-white text-ink shadow-sm' : 'text-muted'}`}
          >
            {option.label}
          </button>
        ))}
      </div>
      {testError ? <p className="text-sm text-rose-700">{testError}</p> : null}
      {testNotice ? <p className="text-sm text-forest">{testNotice}</p> : null}

      {tab === 'profiles' ? (
        <div className="space-y-4">
          {rows.length === 0 ? (
            <p className="rounded-[16px] border border-dashed border-line bg-white px-4 py-8 text-center text-sm text-muted">
              No printers yet. Add a kitchen printer to route KOTs.
            </p>
          ) : null}
          {rows.map((row, index) => (
            <div key={printerKey(row, index)} className="space-y-3 rounded-[16px] border border-line bg-white p-4">
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <Field label="Printer name">
                    <input className={inputClass} value={row.name} onChange={(e) => patch(index, { name: e.target.value })} />
                  </Field>
                </div>
                <button type="button" className="mb-1 text-sm text-rose-700" onClick={() => removePrinter(index)}>Remove</button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Type">
                  <select className={selectClass} value={row.printer_type} onChange={(e) => patch(index, { printer_type: e.target.value })}>
                    <option value="thermal">Thermal</option>
                    <option value="kitchen">Kitchen</option>
                    <option value="laser">Laser</option>
                  </select>
                </Field>
                <Field label="Connection">
                  <select className={selectClass} value={row.connection_type} onChange={(e) => patch(index, { connection_type: e.target.value })}>
                    <option value="browser">Browser print</option>
                    <option value="system">System print</option>
                    <option value="usb">USB</option>
                    <option value="network">Network</option>
                    <option value="bluetooth">Bluetooth</option>
                  </select>
                </Field>
                <Field label="Paper">
                  <select className={selectClass} value={row.paper_width} onChange={(e) => patch(index, { paper_width: e.target.value })}>
                    <option value="58mm">58mm</option>
                    <option value="80mm">80mm</option>
                    <option value="a4">A4</option>
                  </select>
                </Field>
                <Field label="Use for">
                  <select className={selectClass} value={row.use_for || 'kot'} onChange={(e) => patch(index, { use_for: e.target.value })}>
                    <option value="kot">KOT</option>
                    <option value="kitchen">Kitchen</option>
                    <option value="bill">Bill</option>
                    <option value="receipt">Receipt</option>
                  </select>
                </Field>
              </div>
              {needsAddress(row) ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Address / path">
                    <input className={inputClass} value={row.address || ''} onChange={(e) => patch(index, { address: e.target.value })} placeholder="Optional" />
                  </Field>
                  <Field label="Host">
                    <input className={inputClass} value={row.host || ''} onChange={(e) => patch(index, { host: e.target.value })} placeholder="Optional" />
                  </Field>
                  <Field label="Port">
                    <input className={inputClass} value={row.port || ''} onChange={(e) => patch(index, { port: e.target.value })} placeholder="9100" />
                  </Field>
                </div>
              ) : (
                <p className="text-[11px] text-muted">{connectionLabel(row.connection_type)} opens the browser or system print dialog.</p>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <Toggle checked={row.is_active !== false} onChange={(value) => patch(index, { is_active: value })} label="Active" />
                <Toggle checked={row.is_default_kot} onChange={(value) => patch(index, { is_default_kot: value, use_for: value ? 'kot' : row.use_for })} label="Default KOT printer" />
                <Toggle checked={row.is_default_bill} onChange={(value) => patch(index, { is_default_bill: value, use_for: value ? 'bill' : row.use_for })} label="Default bill printer" />
                <Toggle checked={row.is_default_receipt} onChange={(value) => patch(index, { is_default_receipt: value, use_for: value ? 'receipt' : row.use_for })} label="Default receipt printer" />
              </div>
              <button
                type="button"
                className="text-sm font-medium text-forest"
                disabled={Boolean(testingId)}
                onClick={() => onTest(row, index)}
              >
                {testingId === printerKey(row, index) ? 'Opening print dialog...' : 'Test print'}
              </button>
            </div>
          ))}
          <button type="button" className="text-sm font-medium text-forest" onClick={addPrinter}>
            Add printer
          </button>
        </div>
      ) : null}

      {tab === 'routing' ? (
        <div className="space-y-4">
          <AlertNote>Routing priority is Menu Item, then Category, then Order Type, then the default KOT printer. Split tickets print only the matching items.</AlertNote>
          {kotPrinters.length === 0 ? (
            <p className="text-sm text-muted">Add an active KOT printer before creating routes.</p>
          ) : (
            <>
              {routes.map((row, index) => (
                <div key={row.id || index} className="grid gap-3 rounded-[16px] border border-line bg-white p-4 sm:grid-cols-[8rem_1fr_1fr_auto]">
                  <Field label="Route by">
                    <select className={selectClass} value={row.route_type} onChange={(e) => patchRoute(index, { route_type: e.target.value, route_value: '' })}>
                      <option value="item">Menu item</option>
                      <option value="category">Category</option>
                      <option value="order_type">Order type</option>
                    </select>
                  </Field>
                  <Field label="Matches">
                    {row.route_type === 'item' ? (
                      <select className={selectClass} value={row.route_value} onChange={(e) => patchRoute(index, { route_value: e.target.value })}>
                        <option value="">Select item</option>
                        {menuItems.map((item) => (
                          <option key={item.id} value={item.id}>{item.name}</option>
                        ))}
                      </select>
                    ) : null}
                    {row.route_type === 'category' ? (
                      <select className={selectClass} value={row.route_value} onChange={(e) => patchRoute(index, { route_value: e.target.value })}>
                        <option value="">Select category</option>
                        {categories.map((item) => (
                          <option key={item.id} value={item.id}>{item.name}</option>
                        ))}
                      </select>
                    ) : null}
                    {row.route_type === 'order_type' ? (
                      <select className={selectClass} value={row.route_value} onChange={(e) => patchRoute(index, { route_value: e.target.value })}>
                        <option value="">Select type</option>
                        {ORDER_TYPES.map((item) => (
                          <option key={item.id} value={item.id}>{item.label}</option>
                        ))}
                      </select>
                    ) : null}
                  </Field>
                  <Field label="Printer">
                    <select className={selectClass} value={row.printer_id} onChange={(e) => patchRoute(index, { printer_id: e.target.value })}>
                      <option value="">Select printer</option>
                      {kotPrinters.map((printer, printerIndex) => (
                        <option key={printerKey(printer, printerIndex)} value={printer.id || printer._key || printerKey(printer, printerIndex)}>
                          {printerLabel(printer)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <button type="button" className="self-end text-sm text-rose-700" onClick={() => set('printerRoutes', routes.filter((_, i) => i !== index))}>Remove</button>
                </div>
              ))}
              <button
                type="button"
                className="text-sm font-medium text-forest"
                onClick={() => set('printerRoutes', [...routes, { ...emptyRoute(), printer_id: kotPrinters[0]?.id || kotPrinters[0]?._key || '' }])}
              >
                Add route
              </button>
            </>
          )}
        </div>
      ) : null}

      {tab === 'preview' ? (
        <div className="space-y-3">
          <AlertNote>Preview uses KOT layout flags from KOT Settings. Sample items only — nothing is printed until you use Test print.</AlertNote>
          <div className="mx-auto max-w-xs rounded-[16px] border border-line bg-white p-4 font-mono text-[12px]">
            {kotPreview.kot.showLogo && kotPreview.logo_url ? <img src={kotPreview.logo_url} alt="" className="mx-auto mb-2 h-8 w-8 rounded object-cover" /> : null}
            {kotPreview.kot.showRestaurantName ? <p className="text-center text-[11px] font-semibold uppercase tracking-[0.14em]">{kotPreview.name || 'Restaurant'}</p> : null}
            {kotPreview.kot.header ? <p className="mt-1 text-center text-[11px] text-muted">{kotPreview.kot.header}</p> : null}
            <p className="mt-2 text-center text-sm font-semibold">KITCHEN ORDER</p>
            <div className="mt-2 space-y-0.5">
              {kotPreview.kot.showKotNumber ? <p>KOT #104{kotPreview.kot.showReprintLabel ? ' · NEW' : ''}</p> : null}
              {kotPreview.kot.showTable ? <p>Table: Table 4</p> : null}
              {kotPreview.kot.showWaiter ? <p>Waiter: Vijay Pandey</p> : null}
              {kotPreview.kot.showOrderTime ? <p>Time: 10:45 AM</p> : null}
              {kotPreview.kot.showOrderType ? <p>Type: Dine-in</p> : null}
            </div>
            <hr className="my-2 border-dashed border-line" />
            <p>{kotPreview.kot.showQuantity ? '1 x ' : ''}{kotPreview.kot.showItemName ? 'Veg Biryani' : 'Item'}{kotPreview.kot.showVariant ? ' (Full)' : ''}</p>
            {kotPreview.kot.showNotes ? <p className="text-[10px] text-muted">Less spicy</p> : null}
            <p className="mt-1">{kotPreview.kot.showQuantity ? '1 x ' : ''}{kotPreview.kot.showItemName ? 'Paneer Tikka' : 'Item'}</p>
            {kotPreview.kot.footer ? <p className="mt-2 text-center text-[11px] text-muted">{kotPreview.kot.footer}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function PermissionFields({ form, set }) {
  const roles = form.roles || []
  return (
    <div className="space-y-4">
      <AlertNote>Owner and Waiter login still use the existing auth model. These role flags prepare Manager, Cashier and Kitchen without changing current access.</AlertNote>
      <div className="overflow-x-auto rounded-[16px] border border-line">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="bg-paper text-left text-[11px] uppercase tracking-[0.12em] text-muted">
              <th className="px-3 py-2 font-medium">Permission</th>
              {ROLE_KEYS.map((role) => (
                <th key={role.id} className="px-3 py-2 font-medium">{role.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_GROUPS.map((group) => (
              <tr key={group.id} className="border-t border-line">
                <td className="px-3 py-2">{group.label}</td>
                {ROLE_KEYS.map((role) => {
                  const row = roles.find((item) => item.role_key === role.id)
                  const locked = role.id === 'owner'
                  return (
                    <td key={role.id} className="px-3 py-2">
                      <input
                        type="checkbox"
                        disabled={locked}
                        checked={Boolean(row?.permissions?.[group.id])}
                        onChange={(event) =>
                          set(
                            'roles',
                            roles.map((item) =>
                              item.role_key === role.id
                                ? { ...item, permissions: { ...item.permissions, [group.id]: event.target.checked } }
                                : item,
                            ),
                          )
                        }
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export { AlertNote }

export function QrFields({ form, set }) {
  const qr = form.qr || {}
  return (
    <div className="space-y-4">
      <AlertNote>QR Studio and public /menu/:slug stay as they are. These flags store restaurant preferences only.</AlertNote>
      <Toggle checked={qr.guestMenuEnabled} onChange={(value) => set('qr', { ...qr, guestMenuEnabled: value })} label="Guest menu enabled" />
      <Toggle checked={qr.qrEnabled} onChange={(value) => set('qr', { ...qr, qrEnabled: value })} label="QR enabled" />
      <Toggle checked={qr.showPrices} onChange={(value) => set('qr', { ...qr, showPrices: value })} label="Show prices" />
      <Toggle checked={qr.showSoldOut} onChange={(value) => set('qr', { ...qr, showSoldOut: value })} label="Show sold-out items" />
      <Toggle checked={qr.guestOrdering} onChange={(value) => set('qr', { ...qr, guestOrdering: value })} label="Guest ordering" hint="Not enforced yet." />
      <Toggle checked={qr.brandedQr} onChange={(value) => set('qr', { ...qr, brandedQr: value })} label="Branded QR" />
      <Field label="Language">
        <select className={selectClass} value={qr.language} onChange={(e) => set('qr', { ...qr, language: e.target.value })}>
          <option value="en">English</option>
          <option value="hi">Hindi</option>
        </select>
      </Field>
      <Field label="Table QR behavior">
        <select className={selectClass} value={qr.tableQrBehavior} onChange={(e) => set('qr', { ...qr, tableQrBehavior: e.target.value })}>
          <option value="menu">Open menu</option>
          <option value="table_menu">Open table menu</option>
        </select>
      </Field>
    </div>
  )
}

export function OrdersFields({ form, set }) {
  const orders = form.orders || {}
  return (
    <div className="space-y-4">
      <AlertNote>Order-type and numbering preferences are stored only. Live orders are not changed in this phase.</AlertNote>
      <Toggle checked={orders.dineIn} onChange={(value) => set('orders', { ...orders, dineIn: value })} label="Dine-in" />
      <Toggle checked={orders.takeaway} onChange={(value) => set('orders', { ...orders, takeaway: value })} label="Takeaway" />
      <Toggle checked={orders.delivery} onChange={(value) => set('orders', { ...orders, delivery: value })} label="Delivery" />
      <Field label="Default order type">
        <select className={selectClass} value={orders.defaultOrderType} onChange={(e) => set('orders', { ...orders, defaultOrderType: e.target.value })}>
          <option value="dine_in">Dine-in</option>
          <option value="takeaway">Takeaway</option>
          <option value="delivery">Delivery</option>
        </select>
      </Field>
      <Toggle checked={orders.askGuestCount} onChange={(value) => set('orders', { ...orders, askGuestCount: value })} label="Ask guest count" />
      <Toggle checked={orders.allowOrderNotes} onChange={(value) => set('orders', { ...orders, allowOrderNotes: value })} label="Allow order notes" />
      <Toggle checked={orders.allowCancel} onChange={(value) => set('orders', { ...orders, allowCancel: value })} label="Allow cancellation" />
      <Field label="Order numbering prefix">
        <input className={inputClass} value={orders.orderPrefix} onChange={(e) => set('orders', { ...orders, orderPrefix: e.target.value })} />
      </Field>
      <Field label="Add-on behavior">
        <select className={selectClass} value={orders.addonBehavior} onChange={(e) => set('orders', { ...orders, addonBehavior: e.target.value })}>
          <option value="new_kot">New KOT</option>
          <option value="same_order">Same order</option>
        </select>
      </Field>
    </div>
  )
}

export function FloorFields({ form, set }) {
  const floor = form.floor || {}
  return (
    <div className="space-y-4">
      <AlertNote>Floor preferences never use restaurant_tables.is_active as occupancy.</AlertNote>
      <Field label="Default floor">
        <input className={inputClass} value={floor.defaultFloor} onChange={(e) => set('floor', { ...floor, defaultFloor: e.target.value })} />
      </Field>
      <Field label="Default capacity">
        <input className={inputClass} type="number" min="1" value={floor.defaultCapacity} onChange={(e) => set('floor', { ...floor, defaultCapacity: Number(e.target.value) || 1 })} />
      </Field>
      <Field label="Numbering preference">
        <select className={selectClass} value={floor.numbering} onChange={(e) => set('floor', { ...floor, numbering: e.target.value })}>
          <option value="numeric">Numeric</option>
          <option value="named">Named</option>
        </select>
      </Field>
      <Field label="Waiter assignment">
        <select className={selectClass} value={floor.waiterAssignment} onChange={(e) => set('floor', { ...floor, waiterAssignment: e.target.value })}>
          <option value="assigned">Assigned tables</option>
          <option value="any">Any table</option>
        </select>
      </Field>
      <Field label="Session behavior">
        <select className={selectClass} value={floor.sessionBehavior} onChange={(e) => set('floor', { ...floor, sessionBehavior: e.target.value })}>
          <option value="open_until_settled">Open until settled</option>
          <option value="close_on_empty">Close when empty</option>
        </select>
      </Field>
      <Toggle checked={floor.showTableStatus} onChange={(value) => set('floor', { ...floor, showTableStatus: value })} label="Show table status" />
    </div>
  )
}

export function KitchenFields({ form, set }) {
  const kitchen = form.kitchen || {}
  return (
    <div className="space-y-4">
      <AlertNote>Kitchen/KDS settings do not duplicate KOT schema or change the live kitchen board yet.</AlertNote>
      <Toggle checked={kitchen.enabled} onChange={(value) => set('kitchen', { ...kitchen, enabled: value })} label="Kitchen / KDS enabled" />
      <Toggle checked={kitchen.sound} onChange={(value) => set('kitchen', { ...kitchen, sound: value })} label="New-ticket sound" />
      <Toggle checked={kitchen.timer} onChange={(value) => set('kitchen', { ...kitchen, timer: value })} label="Ticket timer" />
      <Toggle checked={kitchen.ageHighlight} onChange={(value) => set('kitchen', { ...kitchen, ageHighlight: value })} label="Age highlighting" />
      <Toggle checked={kitchen.addonDistinction} onChange={(value) => set('kitchen', { ...kitchen, addonDistinction: value })} label="Add-on distinction" />
      <Field label="Default sort">
        <select className={selectClass} value={kitchen.sort} onChange={(e) => set('kitchen', { ...kitchen, sort: e.target.value })}>
          <option value="oldest">Oldest first</option>
          <option value="newest">Newest first</option>
        </select>
      </Field>
      <Field label="Refresh seconds">
        <input className={inputClass} type="number" min="3" max="60" value={kitchen.refreshSeconds} onChange={(e) => set('kitchen', { ...kitchen, refreshSeconds: Number(e.target.value) || 8 })} />
      </Field>
      <Field label="Prep stations" hint="Comma-separated foundation only.">
        <input className={inputClass} value={kitchen.stations} onChange={(e) => set('kitchen', { ...kitchen, stations: e.target.value })} />
      </Field>
    </div>
  )
}

export function DiscountFields({ form, set }) {
  const discounts = form.discounts || {}
  return (
    <div className="space-y-4">
      <AlertNote>Discount policy only. This is not discount history and does not change running bills.</AlertNote>
      <Toggle checked={discounts.percentEnabled} onChange={(value) => set('discounts', { ...discounts, percentEnabled: value })} label="Percentage discounts" />
      <Toggle checked={discounts.fixedEnabled} onChange={(value) => set('discounts', { ...discounts, fixedEnabled: value })} label="Fixed amount discounts" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Max percentage">
          <input className={inputClass} type="number" min="0" max="100" value={discounts.maxPercent} onChange={(e) => set('discounts', { ...discounts, maxPercent: Number(e.target.value) || 0 })} />
        </Field>
        <Field label="Max amount">
          <input className={inputClass} type="number" min="0" value={discounts.maxAmount} onChange={(e) => set('discounts', { ...discounts, maxAmount: Number(e.target.value) || 0 })} />
        </Field>
      </div>
      <Toggle checked={discounts.approvalRequired} onChange={(value) => set('discounts', { ...discounts, approvalRequired: value })} label="Approval required" />
      <Field label="Predefined reasons">
        <textarea className={inputClass} rows={3} value={discounts.reasons} onChange={(e) => set('discounts', { ...discounts, reasons: e.target.value })} />
      </Field>
    </div>
  )
}

export function WaiterPrefFields({ form, set }) {
  const waiters = form.waiters || {}
  return (
    <div className="space-y-4">
      <AlertNote>Waiter passwords are never stored here. Login still uses the existing waiter auth flow.</AlertNote>
      <Toggle checked={waiters.loginEnabled} onChange={(value) => set('waiters', { ...waiters, loginEnabled: value })} label="Waiter login policy" />
      <Field label="Session timeout (minutes)">
        <input className={inputClass} type="number" min="5" value={waiters.sessionTimeoutMinutes} onChange={(e) => set('waiters', { ...waiters, sessionTimeoutMinutes: Number(e.target.value) || 5 })} />
      </Field>
      <Field label="Minimum password length">
        <input className={inputClass} type="number" min="6" value={waiters.minPasswordLength} onChange={(e) => set('waiters', { ...waiters, minPasswordLength: Number(e.target.value) || 6 })} />
      </Field>
      <Toggle checked={waiters.canCollectPayment} onChange={(value) => set('waiters', { ...waiters, canCollectPayment: value })} label="Payment permission" />
      <Toggle checked={waiters.canDiscount} onChange={(value) => set('waiters', { ...waiters, canDiscount: value })} label="Discount permission" />
      <Toggle checked={waiters.canCancelOrder} onChange={(value) => set('waiters', { ...waiters, canCancelOrder: value })} label="Order-cancel permission" />
      <Toggle checked={waiters.canTransferTable} onChange={(value) => set('waiters', { ...waiters, canTransferTable: value })} label="Table-transfer permission" />
      <Toggle checked={waiters.restrictAssignedTables} onChange={(value) => set('waiters', { ...waiters, restrictAssignedTables: value })} label="Restrict to assigned tables" />
    </div>
  )
}

export function NotificationFields({ form, set }) {
  const notifications = form.notifications || {}
  return (
    <div className="space-y-4">
      <AlertNote>In-app preference flags only. No email/SMS provider is connected.</AlertNote>
      <Toggle checked={notifications.newOrder} onChange={(value) => set('notifications', { ...notifications, newOrder: value })} label="New order" />
      <Toggle checked={notifications.newKot} onChange={(value) => set('notifications', { ...notifications, newKot: value })} label="New KOT" />
      <Toggle checked={notifications.kotReady} onChange={(value) => set('notifications', { ...notifications, kotReady: value })} label="KOT ready" />
      <Toggle checked={notifications.payment} onChange={(value) => set('notifications', { ...notifications, payment: value })} label="Payment" />
      <Toggle checked={notifications.failedOperation} onChange={(value) => set('notifications', { ...notifications, failedOperation: value })} label="Failed operation" />
      <Toggle checked={notifications.ownerAlerts} onChange={(value) => set('notifications', { ...notifications, ownerAlerts: value })} label="Owner alerts" />
    </div>
  )
}

export function SecurityFields({ form, set }) {
  const security = form.security || {}
  return (
    <div className="space-y-4">
      <AlertNote>Security preferences only. Credentials are never stored in restaurant settings.</AlertNote>
      <Field label="Owner session timeout (minutes)">
        <input className={inputClass} type="number" min="5" value={security.ownerTimeoutMinutes} onChange={(e) => set('security', { ...security, ownerTimeoutMinutes: Number(e.target.value) || 5 })} />
      </Field>
      <Field label="Waiter session timeout (minutes)">
        <input className={inputClass} type="number" min="5" value={security.waiterTimeoutMinutes} onChange={(e) => set('security', { ...security, waiterTimeoutMinutes: Number(e.target.value) || 5 })} />
      </Field>
      <Field label="Minimum password length">
        <input className={inputClass} type="number" min="6" value={security.minPasswordLength} onChange={(e) => set('security', { ...security, minPasswordLength: Number(e.target.value) || 6 })} />
      </Field>
      <Toggle checked={security.confirmSensitive} onChange={(value) => set('security', { ...security, confirmSensitive: value })} label="Confirm sensitive actions" />
      <Toggle checked={security.auditLog} onChange={(value) => set('security', { ...security, auditLog: value })} label="Audit-log preference" />
    </div>
  )
}

export function AdvancedFields({ form, set }) {
  const advanced = form.advanced || {}
  return (
    <div className="space-y-4">
      <AlertNote>Copy-settings between restaurants is prepared as a future foundation and is not implemented.</AlertNote>
      <Toggle checked={advanced.exportConfig} onChange={(value) => set('advanced', { ...advanced, exportConfig: value })} label="Allow configuration export" />
      <Toggle checked={advanced.exportData} onChange={(value) => set('advanced', { ...advanced, exportData: value })} label="Allow data export preference" />
      <Toggle checked={advanced.auditAccess} onChange={(value) => set('advanced', { ...advanced, auditAccess: value })} label="Audit access" />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Order prefix">
          <input className={inputClass} value={advanced.orderPrefix} onChange={(e) => set('advanced', { ...advanced, orderPrefix: e.target.value })} />
        </Field>
        <Field label="Bill prefix">
          <input className={inputClass} value={advanced.billPrefix} onChange={(e) => set('advanced', { ...advanced, billPrefix: e.target.value })} />
        </Field>
        <Field label="KOT prefix">
          <input className={inputClass} value={advanced.kotPrefix} onChange={(e) => set('advanced', { ...advanced, kotPrefix: e.target.value })} />
        </Field>
      </div>
      <Field label="Archive after (days)">
        <input className={inputClass} type="number" min="30" value={advanced.archiveDays} onChange={(e) => set('advanced', { ...advanced, archiveDays: Number(e.target.value) || 30 })} />
      </Field>
    </div>
  )
}
