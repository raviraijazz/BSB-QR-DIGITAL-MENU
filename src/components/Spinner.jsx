export default function Spinner({ label = 'Loading...' }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted" role="status">
      {label}
    </div>
  )
}
