import { sampleBillDocument } from '../../lib/billPrint'
import { defaultTaxRate, formatMoneyPreview } from '../../lib/restaurantSettings'

const TABS = [
  { id: 'kot', label: 'KOT Preview' },
  { id: 'bill', label: 'Bill Preview' },
  { id: 'mini', label: 'Mini Receipt' },
]

const SAMPLE = {
  table: 'Table 4',
  waiter: 'Vijay Pandey',
  order: '003',
  kot: '104',
  bill: '002',
  time: '10:45 AM',
  items: [
    { name: 'Veg Biryani', variant: 'Full', qty: 1, price: 240 },
    { name: 'Paneer Tikka', variant: '', qty: 1, price: 250 },
  ],
}

function money(value, currency) {
  return formatMoneyPreview(value, currency)
}

function sampleTotals(form) {
  const subtotal = SAMPLE.items.reduce((sum, item) => sum + item.price * item.qty, 0)
  const rate = form.tax_enabled ? defaultTaxRate(form) : 0
  const charge = (form.serviceCharges || []).find((row) => row.is_enabled)
  const service = charge
    ? charge.charge_type === 'fixed'
      ? Number(charge.value) || 0
      : (subtotal * (Number(charge.value) || 0)) / 100
    : 0
  const tax = form.tax_mode === 'inclusive' ? (subtotal * rate) / (100 + rate) : (subtotal * rate) / 100
  const payable = form.tax_mode === 'inclusive' ? subtotal + service : subtotal + tax + service
  return { subtotal, tax, service, payable, rate }
}

function Ticket({ children, accent }) {
  return (
    <div className="rounded-[16px] border border-line bg-white p-4 shadow-sm" style={{ borderTopColor: accent, borderTopWidth: 3 }}>
      {children}
    </div>
  )
}

function BillPreviewTicket({ form, accent }) {
  const doc = sampleBillDocument(form)
  const flags = doc.flags || {}
  const align = flags.alignment || 'center'
  const title = flags.template === 'thermal' ? 'RECEIPT' : 'TAX INVOICE'
  return (
    <Ticket accent={accent}>
      <div style={{ textAlign: align }}>
        {flags.showLogo && doc.logoUrl ? <img src={doc.logoUrl} alt="" className="mx-auto mb-2 h-10 w-10 rounded-lg object-cover" /> : null}
        {flags.showRestaurantName ? <p className="font-display text-lg">{doc.restaurantName}</p> : null}
        {flags.showLegalName && doc.legalName ? <p className="text-[11px] text-muted">{doc.legalName}</p> : null}
        {doc.header ? <p className="text-[11px] text-muted">{doc.header}</p> : null}
        {flags.showAddress && doc.address ? <p className="mt-1 text-[11px] text-muted">{doc.address}</p> : null}
        {flags.showPhone && doc.phone ? <p className="text-[11px] text-muted">{doc.phone}</p> : null}
        {flags.showEmail && doc.email ? <p className="text-[11px] text-muted">{doc.email}</p> : null}
        {flags.showGstin && doc.gstin ? <p className="text-[11px] text-muted">GSTIN {doc.gstin}</p> : null}
      </div>
      <p className="mt-2 text-center text-[11px] font-semibold tracking-[0.12em]">{title}</p>
      <p className="text-center text-[10px] uppercase tracking-[0.12em] text-muted">Sample preview</p>
      <div className="mt-2 space-y-0.5 text-[12px]">
        {flags.showBillNumber ? <p>Bill #{doc.billNumber}</p> : null}
        {flags.showDateTime ? <p>{doc.dateLabel} · {doc.timeLabel}</p> : null}
        {flags.showTable ? <p>Table: {doc.tableLabel}</p> : null}
        {flags.showWaiter ? <p>Waiter: {doc.waiterLabel}</p> : null}
        {flags.showGuestCount ? <p>Guests: {doc.guestCount}</p> : null}
      </div>
      <hr className="my-2 border-dashed border-line" />
      <ul className="space-y-1 text-[12px]">
        {doc.items.map((item) => (
          <li key={item.id} className="flex justify-between gap-2">
            <span>
              {flags.showItemName ? item.name : 'Item'}
              {flags.showVariants && item.variant ? ` (${item.variant})` : ''}
              {flags.showItemCode && item.code ? <span className="block text-[10px] text-muted">#{item.code}</span> : null}
              {flags.showItemNotes && item.notes ? <span className="block text-[10px] text-muted">{item.notes}</span> : null}
            </span>
            <span className="tabular-nums">{money(item.amount, doc.currency)}</span>
          </li>
        ))}
      </ul>
      <hr className="my-2 border-dashed border-line" />
      <div className="space-y-0.5 text-[12px]">
        <p className="flex justify-between"><span>Subtotal</span><span>{money(doc.subtotal, doc.currency)}</span></p>
        {flags.showDiscount ? <p className="flex justify-between"><span>Discount</span><span>{doc.discount ? `− ${money(doc.discount, doc.currency)}` : 'None'}</span></p> : null}
        {flags.showTax ? <p className="flex justify-between"><span>{doc.taxLabel}</span><span>{money(doc.tax, doc.currency)}</span></p> : null}
        {flags.showTax && flags.showTaxBreakdown && (doc.cgst || doc.sgst) ? (
          <>
            <p className="flex justify-between text-muted"><span>CGST</span><span>{money(doc.cgst, doc.currency)}</span></p>
            <p className="flex justify-between text-muted"><span>SGST</span><span>{money(doc.sgst, doc.currency)}</span></p>
          </>
        ) : null}
        {flags.showServiceCharge ? <p className="flex justify-between"><span>Service</span><span>{money(doc.service, doc.currency)}</span></p> : null}
        <p className="flex justify-between font-semibold"><span>Grand Total</span><span>{money(doc.payable, doc.currency)}</span></p>
        {flags.showPaymentMethod ? <p>Paid: Cash + UPI</p> : null}
        {flags.showSplitPayments ? <p className="text-muted">Cash {money(200, doc.currency)} · UPI {money(Math.max(0, doc.payable - 200), doc.currency)}</p> : null}
        {flags.showUpiInfo && doc.upiId ? <p className="text-muted">UPI {doc.upiName || doc.upiId}</p> : null}
      </div>
      {flags.showFooter ? <p className="mt-2 text-center text-[11px] text-muted">{doc.footer || doc.thankYou}</p> : null}
      {flags.autoPrintOnSettle === false ? <p className="mt-2 text-center text-[10px] text-muted">Auto-print off</p> : null}
    </Ticket>
  )
}

export default function SettingsPreview({ form, tab, onTab }) {
  const accent = form.primary_color || '#1f3d32'
  const kot = form.kot || {}
  const totals = sampleTotals(form)
  const currency = form.currency || 'INR'

  return (
    <aside className="rounded-[18px] border border-line bg-card p-4 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Live preview</p>
      <div className="mt-3 flex gap-1 rounded-xl bg-paper p-1">
        {TABS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onTab(option.id)}
            className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-medium ${tab === option.id ? 'bg-white text-ink shadow-sm' : 'text-muted'}`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted">Visual preview only. Nothing is printed.</p>

      <div className="mt-4">
        {tab === 'kot' ? (
          <Ticket accent={accent}>
            {kot.showLogo && form.logo_url ? <img src={form.logo_url} alt="" className="mb-2 h-8 w-8 rounded object-cover" /> : null}
            {kot.showRestaurantName ? <p className="text-center text-[11px] font-semibold uppercase tracking-[0.14em]">{form.name || 'Restaurant'}</p> : null}
            {kot.header ? <p className="mt-1 text-center text-[11px] text-muted">{kot.header}</p> : null}
            <p className="mt-2 text-center text-sm font-semibold">KITCHEN ORDER</p>
            <div className="mt-2 space-y-0.5 text-[12px]">
              {kot.showKotNumber ? <p>KOT #{SAMPLE.kot}{kot.showReprintLabel ? ' · NEW' : ''}</p> : null}
              {kot.showTable ? <p>Table: {SAMPLE.table}</p> : null}
              {kot.showWaiter ? <p>Waiter: {SAMPLE.waiter}</p> : null}
              {kot.showOrderTime ? <p>Time: {SAMPLE.time}</p> : null}
              {kot.showOrderType ? <p>Type: Dine-in</p> : null}
              {kot.showCustomerName ? <p>Guest: Walk-in</p> : null}
            </div>
            <hr className="my-2 border-dashed border-line" />
            <ul className="space-y-1 text-[12px]">
              {SAMPLE.items.map((item) => (
                <li key={item.name} className="flex justify-between gap-2">
                  <span>
                    {kot.showQuantity ? `${item.qty} x ` : ''}
                    {kot.showItemName ? item.name : 'Item'}
                    {kot.showVariant && item.variant ? ` (${item.variant})` : ''}
                    {kot.showAddonLabel ? '' : null}
                    {kot.showNotes ? <span className="block text-[10px] text-muted">Less spicy</span> : null}
                  </span>
                </li>
              ))}
            </ul>
            {kot.footer ? <p className="mt-2 text-center text-[11px] text-muted">{kot.footer}</p> : null}
          </Ticket>
        ) : null}

        {tab === 'bill' ? (
          <BillPreviewTicket form={form} accent={accent} />
        ) : null}

        {tab === 'mini' ? (
          <Ticket accent={accent}>
            <p className="text-center text-[12px] font-semibold">{form.name || 'Restaurant'}</p>
            <p className="text-center text-[11px] text-muted">{SAMPLE.table} · #{SAMPLE.order}</p>
            <hr className="my-2 border-dashed border-line" />
            {SAMPLE.items.map((item) => (
              <p key={item.name} className="flex justify-between text-[12px]">
                <span>{item.qty} {item.name}</span>
                <span>{money(item.price, currency)}</span>
              </p>
            ))}
            <p className="mt-2 flex justify-between text-[12px] font-semibold">
              <span>Total</span>
              <span>{money(totals.payable, currency)}</span>
            </p>
            <p className="mt-2 text-center text-[10px] text-muted">{form.thank_you_message || 'Thank you'}</p>
          </Ticket>
        ) : null}
      </div>
    </aside>
  )
}
