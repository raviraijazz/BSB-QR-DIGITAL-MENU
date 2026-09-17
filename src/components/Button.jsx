export default function Button({
  children,
  type = 'button',
  variant = 'primary',
  className = '',
  disabled,
  ...props
}) {
  const styles = {
    primary: 'bg-ink text-white hover:bg-stone-800',
    secondary: 'bg-white text-ink border border-line hover:bg-paper',
    ghost: 'bg-transparent text-ink hover:bg-white/70',
    danger: 'bg-red-700 text-white hover:bg-red-800',
  }

  return (
    <button
      type={type}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
