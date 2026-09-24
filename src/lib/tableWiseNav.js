export const TABLE_WISE_HOME = '/dashboard/table-wise'

export const TABLE_WISE_MODULES = [
  {
    key: 'tables',
    to: '/dashboard/table-wise/tables',
    label: 'Floor / Tables',
    icon: 'tables',
    lines: ['Manage restaurant tables', 'View table status', 'Open table operations'],
    ready: true,
  },
  {
    key: 'orders',
    to: '/dashboard/table-wise/orders',
    label: 'Live Orders',
    icon: 'orders',
    lines: ['Monitor active orders', 'Track order status'],
    ready: false,
    title: 'Live Orders',
    body: 'Live restaurant orders will appear here once waiter ordering is enabled.',
  },
  {
    key: 'kitchen',
    to: '/dashboard/table-wise/kitchen',
    label: 'Kitchen / KOT',
    icon: 'kitchen',
    lines: ['Monitor kitchen tickets', 'Track preparation status'],
    ready: false,
    title: 'Kitchen / KOT',
    body: 'Kitchen tickets will appear here once order-to-KOT workflow is enabled.',
  },
  {
    key: 'bills',
    to: '/dashboard/table-wise/bills',
    label: 'Running Bills',
    icon: 'bills',
    lines: ['View active table/session bills'],
    ready: false,
    title: 'Running Bills',
    body: 'Active session bills will appear here once table sessions and billing are active.',
  },
  {
    key: 'collections',
    to: '/dashboard/table-wise/collections',
    label: 'Collections',
    icon: 'collections',
    lines: ['View settled payments and collections'],
    ready: false,
    title: 'Collections',
    body: 'Settled payments and date-wise collections will appear here once billing and payments are enabled.',
  },
  {
    key: 'waiters',
    to: '/dashboard/table-wise/waiters',
    label: 'Waiters',
    icon: 'waiters',
    lines: ['Manage waiter accounts and assignments'],
    ready: true,
  },
  {
    key: 'history',
    to: '/dashboard/table-wise/history',
    label: 'Order History',
    icon: 'history',
    lines: ['View completed/historical sessions and orders'],
    ready: false,
    title: 'Order History',
    body: 'Completed sessions, orders and payment history will appear here.',
  },
]

export function isTableWisePath(pathname) {
  return pathname === TABLE_WISE_HOME || pathname.startsWith(`${TABLE_WISE_HOME}/`)
}

export function tableWiseModuleByPath(pathname) {
  return TABLE_WISE_MODULES.find((item) => item.to === pathname) || null
}
