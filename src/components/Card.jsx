export default function Card({ title, action, children, className = '' }) {
  return (
    <section className={`rounded-2xl border border-line bg-card p-5 shadow-sm ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title ? <h2 className="font-display text-xl font-medium">{title}</h2> : <span />}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}
