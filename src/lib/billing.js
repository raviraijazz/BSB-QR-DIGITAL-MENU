import { applyBillDiscount, moneyRound, remainingBalance, paymentsTotal } from './orderCart'

export const DEFAULT_TAX = {
  enabled: false,
  mode: 'exclusive',
  rate: 0,
  serviceRate: 0,
}

export function money(value) {
  return moneyRound(value)
}

export function restaurantTaxSettings(restaurant) {
  if (!restaurant) return { ...DEFAULT_TAX }
  const enabled = restaurant.tax_enabled === true || restaurant.gst_enabled === true
  const mode = restaurant.tax_mode === 'inclusive' ? 'inclusive' : 'exclusive'
  const rate = Number(restaurant.tax_rate ?? restaurant.gst_rate)
  const serviceRate = Number(restaurant.service_charge_rate ?? restaurant.service_charge)
  return {
    enabled,
    mode,
    rate: Number.isFinite(rate) && rate > 0 ? rate : 0,
    serviceRate: Number.isFinite(serviceRate) && serviceRate > 0 ? serviceRate : 0,
  }
}

export function taxSettingsFromBill(bill) {
  if (!bill) return { ...DEFAULT_TAX }
  const tax = money((Number(bill.cgst_amount) || 0) + (Number(bill.sgst_amount) || 0))
  const service = money(bill.other_tax_amount)
  const taxable = money(bill.taxable_amount)
  const grand = money(bill.grand_total)
  if (tax <= 0 && service <= 0) return { ...DEFAULT_TAX }
  let mode = 'exclusive'
  let rate = 0
  if (tax > 0 && taxable > 0) {
    const exclusiveGrand = money(taxable + tax + service)
    const inclusiveGrand = money(taxable + service)
    if (Math.abs(grand - inclusiveGrand) < 0.02 && Math.abs(grand - exclusiveGrand) > 0.02) {
      mode = 'inclusive'
      const base = money(taxable - tax)
      rate = base > 0 ? money((tax / base) * 100) : 0
    } else {
      rate = money((tax / taxable) * 100)
    }
  }
  const serviceBase = mode === 'inclusive' ? taxable : money(taxable + tax)
  const serviceRate = serviceBase > 0 && service > 0 ? money((service / serviceBase) * 100) : 0
  return {
    enabled: tax > 0 || service > 0,
    mode,
    rate,
    serviceRate,
  }
}

export function calculateBill({
  subtotal,
  discountType,
  discountValue,
  tax = DEFAULT_TAX,
}) {
  const discount = applyBillDiscount(subtotal, discountType, discountValue)
  const taxable = discount.taxable
  const enabled = Boolean(tax?.enabled) && Number(tax?.rate) > 0
  const mode = tax?.mode === 'inclusive' ? 'inclusive' : 'exclusive'
  const rate = enabled ? Math.max(0, Number(tax.rate) || 0) : 0
  const serviceRate = Math.max(0, Number(tax?.serviceRate) || 0)

  let taxAmount = 0
  if (enabled) {
    if (mode === 'inclusive') {
      taxAmount = money((taxable * rate) / (100 + rate))
    } else {
      taxAmount = money((taxable * rate) / 100)
    }
  }

  const afterTax = mode === 'inclusive' ? taxable : money(taxable + taxAmount)
  const serviceCharge = serviceRate > 0 ? money((afterTax * serviceRate) / 100) : 0
  const payable = money(afterTax + serviceCharge)
  const cgst = money(taxAmount / 2)
  const sgst = money(taxAmount - cgst)

  return {
    subtotal: money(subtotal),
    discountType: discount.discountType,
    discountValue: discount.discountValue,
    discountAmount: discount.discountAmount,
    taxable,
    taxEnabled: enabled,
    taxMode: mode,
    taxRate: rate,
    taxAmount,
    cgstAmount: cgst,
    sgstAmount: sgst,
    serviceRate,
    serviceCharge,
    payable,
    warning: discount.warning,
  }
}

export function billBalance(payable, payments) {
  const paid = paymentsTotal(payments)
  const remaining = remainingBalance(payable, payments)
  return { paid, remaining, settled: remaining === 0 && money(payable) >= 0 }
}

export function snapshotFromTotals(totals) {
  return {
    subtotal: totals.subtotal,
    discount_type: totals.discountType,
    discount_value: totals.discountValue,
    discount_amount: totals.discountAmount,
    taxable_amount: totals.taxable,
    cgst_amount: totals.cgstAmount,
    sgst_amount: totals.sgstAmount,
    other_tax_amount: totals.serviceCharge,
    grand_total: totals.payable,
  }
}

export function aggregateOrderItems(orders) {
  const map = new Map()
  for (const order of orders || []) {
    if (order.status === 'cancelled') continue
    for (const item of order.order_items || []) {
      const rate = money(item.unit_price)
      const key = `${String(item.item_name || '').trim().toLowerCase()}::${rate}`
      const row = map.get(key) || { name: item.item_name || 'Item', qty: 0, rate, amount: 0 }
      row.qty += Number(item.quantity) || 0
      row.amount = money(row.amount + (Number(item.line_total) || 0))
      map.set(key, row)
    }
  }
  const rows = [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'en-IN'))
  const qty = rows.reduce((sum, row) => sum + row.qty, 0)
  const amount = money(rows.reduce((sum, row) => sum + row.amount, 0))
  return { rows, qty, amount }
}

export function splitDraftTotal(rows) {
  return money((rows || []).reduce((sum, row) => sum + (Number(row.amount) || 0), 0))
}
