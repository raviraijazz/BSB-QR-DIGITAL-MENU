export default function Spinner({ label = 'Loading...', full = false }) {
  return (
    <div
      className={`flex items-center justify-center text-sm text-muted ${
        full ? 'min-h-screen' : 'min-h-[40vh]'
      }`}
      role="status"
    >
      {label}
    </div>
  )
}
