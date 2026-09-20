export default function Card({ title, action, children, className = '', compact = false }) {
  return (
    <section className={`rounded-2xl border border-line bg-card shadow-sm ${compact ? 'p-4' : 'p-5'} ${className}`}>
      {(title || action) && (
        <div className={`flex items-center justify-between gap-3 ${compact ? 'mb-3' : 'mb-4'}`}>
          {title ? <h2 className={`font-display font-medium ${compact ? 'text-lg' : 'text-xl'}`}>{title}</h2> : <span />}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}
