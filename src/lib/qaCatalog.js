export const QA_TABS = [
  { id: 'features', label: 'Feature Checklist' },
  { id: 'integration', label: 'Integration' },
  { id: 'security', label: 'Security / RLS' },
  { id: 'integrity', label: 'Data Integrity' },
  { id: 'financial', label: 'Financial Math' },
  { id: 'print', label: 'Print' },
  { id: 'settings', label: 'Settings' },
  { id: 'multitenancy', label: 'Multi-restaurant' },
  { id: 'performance', label: 'Performance' },
  { id: 'uat', label: 'UAT' },
  { id: 'deployment', label: 'Deployment' },
]

export const QA_SEVERITIES = ['critical', 'high', 'medium', 'low']

function check(id, tab, title, detail, severity, kind) {
  return { id, tab, title, detail, severity, kind }
}

export const QA_CHECKS = [
  check('feat-owner-auth', 'features', 'Owner login and session', 'Owner can authenticate and reach the dashboard.', 'critical', 'live'),
  check('feat-restaurant', 'features', 'Restaurant profile', 'Active restaurant record loads for the signed-in owner.', 'critical', 'live'),
  check('feat-categories', 'features', 'Categories module', 'Category list query succeeds for this restaurant.', 'high', 'live'),
  check('feat-menu', 'features', 'Menu items module', 'Menu item list query succeeds for this restaurant.', 'high', 'live'),
  check('feat-tables', 'features', 'Floor / tables', 'Restaurant tables query succeeds.', 'high', 'live'),
  check('feat-waiters', 'features', 'Waiters module', 'Waiters query succeeds for this restaurant.', 'high', 'live'),
  check('feat-qr', 'features', 'Public menu slug', 'Restaurant has a public menu slug for QR links.', 'high', 'live'),
  check('feat-sessions', 'features', 'Table sessions', 'Table sessions query succeeds.', 'high', 'live'),
  check('feat-orders', 'features', 'Live orders', 'Orders query succeeds for this restaurant.', 'critical', 'live'),
  check('feat-kots', 'features', 'Kitchen / KOT', 'KOT query succeeds for this restaurant.', 'high', 'live'),
  check('feat-bills', 'features', 'Running bills', 'Bills query succeeds for this restaurant.', 'critical', 'live'),
  check('feat-payments', 'features', 'Payments', 'Payments query succeeds for this restaurant.', 'critical', 'live'),
  check('feat-history', 'features', 'Order history route', 'Order history dashboard route is registered.', 'medium', 'code'),
  check('feat-collections', 'features', 'Collections route', 'Collections dashboard route is registered.', 'medium', 'code'),
  check('feat-settings', 'features', 'Global settings', 'Restaurant settings row can be loaded.', 'high', 'live'),
  check('feat-print-config', 'features', 'Printer configuration', 'Printer profiles and routes can be loaded.', 'high', 'live'),
  check('feat-readiness', 'features', 'System Readiness section', 'Settings includes the System Readiness section.', 'low', 'code'),

  check('int-supabase', 'integration', 'Supabase client configured', 'Frontend has VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.', 'critical', 'live'),
  check('int-schema-core', 'integration', 'Core schema reachable', 'restaurants, categories, and menu_items are queryable.', 'critical', 'live'),
  check('int-schema-tablewise', 'integration', 'Table-wise schema reachable', 'tables, waiters, sessions, orders, bills, and payments are queryable.', 'critical', 'live'),
  check('int-schema-settings', 'integration', 'Settings schema reachable', 'restaurant_settings is queryable.', 'high', 'live'),
  check('int-schema-print', 'integration', 'Print schema reachable', 'restaurant_printer_profiles and restaurant_print_jobs are queryable.', 'high', 'live'),
  check('int-rpc-payment', 'integration', 'Payment RPC present', 'collect_bill_payment is available to the owner client.', 'critical', 'live'),
  check('int-rpc-kot-stamp', 'integration', 'KOT stamp RPC present', 'stamp_kot_printed is available or printed_at can be updated.', 'medium', 'live'),
  check('int-owner-waiter-routes', 'integration', 'Owner and waiter route isolation', 'Dashboard is owner-only; waiter app is waiter-only.', 'critical', 'code'),
  check('int-guest-menu', 'integration', 'Public menu does not require auth', 'Guest menu route is registered outside protected layouts.', 'high', 'code'),

  check('sec-anon-only', 'security', 'No service-role key in frontend', 'Client uses the anon key only; service-role secrets are not bundled.', 'critical', 'live'),
  check('sec-env-surface', 'security', 'Vite env surface is limited', 'Only expected VITE_ public keys are exposed to the client.', 'critical', 'live'),
  check('sec-owner-scope', 'security', 'Owner restaurant scope', 'Listed restaurants belong to the signed-in owner.', 'critical', 'live'),
  check('sec-rls-bills', 'security', 'Bills stay on owned restaurants', 'Unfiltered bill reads do not return foreign restaurants.', 'critical', 'live'),
  check('sec-rls-payments', 'security', 'Payments stay on owned restaurants', 'Unfiltered payment reads do not return foreign restaurants.', 'critical', 'live'),
  check('sec-rls-orders', 'security', 'Orders stay on owned restaurants', 'Unfiltered order reads do not return foreign restaurants.', 'critical', 'live'),
  check('sec-rls-waiters', 'security', 'Waiters stay on owned restaurants', 'Unfiltered waiter reads do not return foreign restaurants.', 'high', 'live'),
  check('sec-protected-routes', 'security', 'ProtectedRoute role gates', 'Owner and waiter apps redirect the other role away.', 'critical', 'code'),
  check('sec-waiter-logs', 'security', 'Waiter login debug logs removed', 'Waiter sign-in does not print credentials or diag events.', 'high', 'code'),
  check('sec-password-policy', 'security', 'Password change requires current password', 'Owner and waiter password flows re-authenticate before update.', 'high', 'code'),

  check('intg-bill-session', 'integrity', 'One bill per session', 'No duplicate bill rows share the same session_id.', 'critical', 'live'),
  check('intg-payment-bill', 'integrity', 'Payments belong to a bill', 'Payment rows include restaurant_id and bill_id.', 'critical', 'live'),
  check('intg-paid-balance', 'integrity', 'Settled bills have no remaining balance', 'Paid bills match recorded payments within rounding.', 'critical', 'live'),
  check('intg-open-overpay', 'integrity', 'Open bills are not overpaid', 'Payment totals do not exceed grand total on open bills.', 'critical', 'live'),
  check('intg-cancelled-orders', 'integrity', 'Cancelled orders excluded from totals', 'sessionOrderTotals skips cancelled orders.', 'high', 'math'),
  check('intg-line-amount', 'integrity', 'Line amount uses qty × rate', 'lineAmount multiplies unit price and quantity with money rounding.', 'high', 'math'),
  check('intg-kot-order', 'integrity', 'KOT rows stay on restaurant orders', 'Loaded KOTs belong to this restaurant.', 'high', 'live'),
  check('intg-table-numbers', 'integrity', 'Table numbers unique in restaurant', 'Active table numbers do not collide case-insensitively.', 'medium', 'live'),

  check('fin-discount-percent', 'financial', 'Percent discount math', '10% of 100.00 is 10.00 and taxable 90.00.', 'critical', 'math'),
  check('fin-discount-amount', 'financial', 'Fixed discount math', 'Amount discount of 25.00 on 100.00 yields 75.00.', 'critical', 'math'),
  check('fin-discount-cap', 'financial', 'Discount cannot exceed subtotal', 'Oversize amount discount is clamped with a warning.', 'critical', 'math'),
  check('fin-tax-exclusive', 'financial', 'Exclusive GST split', 'Exclusive 5% GST splits evenly into CGST and SGST.', 'critical', 'math'),
  check('fin-tax-inclusive', 'financial', 'Inclusive GST extraction', 'Inclusive tax is extracted from taxable amount.', 'critical', 'math'),
  check('fin-service-charge', 'financial', 'Service charge after tax', 'Exclusive service charge applies on amount after GST.', 'high', 'math'),
  check('fin-split-payments', 'financial', 'Split payment remaining balance', 'Partial cash + UPI leaves the correct remainder.', 'critical', 'math'),
  check('fin-snapshot-stored', 'financial', 'Reprint uses stored bill totals', 'billSnapshotRows reads saved bill columns, not a live recalculation.', 'critical', 'math'),
  check('fin-rounding', 'financial', 'Money rounding to 2 decimals', 'moneyRound uses half-up to paise.', 'high', 'math'),

  check('print-jobs-table', 'print', 'Print jobs table', 'restaurant_print_jobs can be listed for this restaurant.', 'high', 'live'),
  check('print-bill-idempotent', 'print', 'Bill print job idempotency', 'First bill/receipt job is unique per restaurant, bill, printer, and type.', 'high', 'live'),
  check('print-auto-after-settle', 'print', 'Auto-print is post-settlement only', 'printSettledBill skips auto-print when autoPrintOnSettle is off.', 'critical', 'code'),
  check('print-failure-isolated', 'print', 'Print failure does not roll back payment', 'Failed print jobs remain independent of recorded payments.', 'critical', 'live'),
  check('print-reprint-flag', 'print', 'Reprint sets is_reprint', 'Reprint path calls printSettledBill with reprint true.', 'high', 'code'),
  check('print-browser-dialog', 'print', 'Browser/system print dialog only', 'USB/network addresses are stored on printer profiles, not claimed live.', 'medium', 'live'),
  check('print-kot-routing', 'print', 'KOT printer routing helpers', 'Default KOT/bill/receipt printer helpers resolve active printers.', 'medium', 'math'),

  check('set-tax-runtime', 'settings', 'Tax settings apply at runtime', 'applySettingsToRestaurant copies tax_enabled, tax_mode, and rates.', 'high', 'math'),
  check('set-bill-flags', 'settings', 'Bill flags hydrate from JSON', 'defaultBill and hydrateSettings merge bill JSON.', 'medium', 'math'),
  check('set-validation', 'settings', 'Settings validation', 'Missing name/phone and invalid GSTIN/UPI are rejected.', 'medium', 'math'),
  check('set-payments-enabled', 'settings', 'Enabled payment methods', 'At least one payment method is enabled, or none are configured yet.', 'medium', 'live'),
  check('set-timezone', 'settings', 'Restaurant timezone', 'Timezone is present for history and bill stamps.', 'medium', 'live'),

  check('mt-switcher', 'multitenancy', 'Restaurant switcher data', 'Owner restaurant list can hold more than one restaurant.', 'high', 'live'),
  check('mt-active-key', 'multitenancy', 'Active restaurant is owner-scoped', 'Active restaurant id is stored per user id.', 'high', 'code'),
  check('mt-query-filter', 'multitenancy', 'Queries filter restaurant_id', 'Loaded bills, orders, and payments match the active restaurant.', 'critical', 'live'),
  check('mt-slug-unique', 'multitenancy', 'Public slug uniqueness helper', 'uniqueSlug retries with a suffix when a slug is taken.', 'medium', 'code'),

  check('perf-bills', 'performance', 'Bills list latency', 'Bills query completes within 3 seconds.', 'medium', 'live'),
  check('perf-orders', 'performance', 'Orders list latency', 'Orders query completes within 3 seconds.', 'medium', 'live'),
  check('perf-settings', 'performance', 'Settings load latency', 'Settings load completes within 3 seconds.', 'low', 'live'),

  check('uat-owner-login', 'uat', 'UAT: owner sign-in', 'Manually confirm owner login, logout, and password change.', 'high', 'manual'),
  check('uat-waiter-login', 'uat', 'UAT: waiter sign-in', 'Manually confirm waiter login, disabled waiter, and wrong password.', 'high', 'manual'),
  check('uat-order-flow', 'uat', 'UAT: table session to KOT', 'Manually confirm start session, send order, and kitchen status.', 'critical', 'manual'),
  check('uat-settle-print', 'uat', 'UAT: settle and auto-print', 'Manually confirm full settlement then browser print dialog.', 'critical', 'manual'),
  check('uat-reprint-history', 'uat', 'UAT: history reprint and PDF', 'Manually confirm reprint/PDF from order history uses stored totals.', 'high', 'manual'),
  check('uat-guest-qr', 'uat', 'UAT: guest QR menu', 'Manually confirm public menu loads without owner session.', 'medium', 'manual'),
  check('uat-mobile', 'uat', 'UAT: waiter on a phone', 'Manually confirm waiter order entry on a narrow screen.', 'medium', 'manual'),

  check('dep-env-example', 'deployment', 'Env example documents anon key only', 'README asks for VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.', 'critical', 'code'),
  check('dep-sql-files', 'deployment', 'Additive SQL files present', 'Core, settings, KOT, bill, and payment SQL files exist in repo.', 'high', 'code'),
  check('dep-build-mode', 'deployment', 'Production bundle mode', 'This session reports whether the app was built for production.', 'high', 'live'),
  check('dep-preview-hosts', 'deployment', 'Preview allowedHosts', 'Vite allows *.monkeycode-ai.live for hosted preview.', 'medium', 'code'),
  check('dep-manual-build', 'deployment', 'npm run build', 'Production build must be run in CI or locally; this check does not fake a pass.', 'critical', 'manual'),
]

export function checksForTab(tabId) {
  if (!tabId || tabId === 'all') return QA_CHECKS
  return QA_CHECKS.filter((row) => row.tab === tabId)
}

export function tabMeta(tabId) {
  return QA_TABS.find((row) => row.id === tabId) || { id: tabId, label: tabId }
}
