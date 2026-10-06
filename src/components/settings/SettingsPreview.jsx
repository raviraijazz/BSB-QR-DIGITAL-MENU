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

export default function SettingsPreview({ form, tab, onTab }) {
  const accent = form.primary_color || '#1f3d32'
  const kot = form.kot || {}
  const bill = form.bill || {}
  const totals = sampleTotals(form)
  const currency = form.currency || 'INR'
  const upi = (form.payments || []).find((row) => row.method === 'upi' && row.is_enabled)

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
          <Ticket accent={accent}>
            {bill.showLogo && form.logo_url ? <img src={form.logo_url} alt="" className="mx-auto mb-2 h-10 w-10 rounded-lg object-cover" /> : null}
            {bill.showRestaurantName ? <p className="text-center font-display text-lg">{form.name || 'Restaurant'}</p> : null}
            {bill.showLegalName && form.owner_name ? <p className="text-center text-[11px] text-muted">{form.owner_name}</p> : null}
            {bill.header ? <p className="text-center text-[11px] text-muted">{bill.header}</p> : null}
            {bill.showAddress ? <p className="mt-1 text-center text-[11px] text-muted">{form.address || 'Address'}</p> : null}
            {bill.showPhone ? <p className="text-center text-[11px] text-muted">{form.phone || ''}</p> : null}
            {bill.showEmail && form.email ? <p className="text-center text-[11px] text-muted">{form.email}</p> : null}
            {bill.showGstin && form.gstin ? <p className="text-center text-[11px] text-muted">GSTIN {form.gstin}</p> : null}
            <div className="mt-2 space-y-0.5 text-[12px]">
              {bill.showBillNumber ? <p>Bill #{SAMPLE.bill}</p> : null}
              {bill.showTable ? <p>Table: {SAMPLE.table}</p> : null}
              {bill.showWaiter ? <p>Waiter: {SAMPLE.waiter}</p> : null}
              {bill.showGuestCount ? <p>Guests: 2</p> : null}
            </div>
            <hr className="my-2 border-dashed border-line" />
            <ul className="space-y-1 text-[12px]">
              {SAMPLE.items.map((item) => (
                <li key={item.name} className="flex justify-between gap-2">
                  <span>
                    {bill.showItemName ? item.name : 'Item'}
                    {bill.showVariants && item.variant ? ` (${item.variant})` : ''}
                    {bill.showItemCode ? <span className="block text-[10px] text-muted">SKU</span> : null}
                  </span>
                  <span className="tabular-nums">{money(item.price, currency)}</span>
                </li>
              ))}
            </ul>
            <hr className="my-2 border-dashed border-line" />
            <div className="space-y-0.5 text-[12px]">
              <p className="flex justify-between"><span>Subtotal</span><span>{money(totals.subtotal, currency)}</span></p>
              {bill.showDiscount ? <p className="flex justify-between"><span>Discount</span><span>{money(0, currency)}</span></p> : null}
              {bill.showTax ? <p className="flex justify-between"><span>Tax{totals.rate ? ` (${totals.rate}%)` : ''}</span><span>{money(totals.tax, currency)}</span></p> : null}
              {bill.showServiceCharge ? <p className="flex justify-between"><span>Service</span><span>{money(totals.service, currency)}</span></p> : null}
              <p className="flex justify-between font-semibold"><span>Grand Total</span><span>{money(totals.payable, currency)}</span></p>
              {bill.showPaymentMethod ? <p>Paid: Cash + UPI</p> : null}
              {bill.showSplitPayments ? <p className="text-muted">Cash {money(200, currency)} · UPI {money(totals.payable - 200, currency)}</p> : null}
              {bill.showUpiInfo && upi?.upi_id ? <p className="text-muted">UPI {upi.display_name || upi.upi_id}</p> : null}
            </div>
            {bill.showFooter ? <p className="mt-2 text-center text-[11px] text-muted">{bill.footer || form.thank_you_message || bill.thankYou}</p> : null}
          </Ticket>
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
