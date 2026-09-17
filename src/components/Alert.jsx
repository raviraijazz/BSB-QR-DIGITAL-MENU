export default function Alert({ type = 'error', children }) {
  const styles =
    type === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : 'border-red-200 bg-red-50 text-red-800'

  if (!children) return null
  return <div className={`rounded-xl border px-3 py-2 text-sm ${styles}`}>{children}</div>
}
