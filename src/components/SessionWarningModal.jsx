import Button from './Button'
import { formatCountdown } from '../lib/sessionPolicy'

export default function SessionWarningModal({
  open,
  remainingMs,
  sharedDevice,
  onContinue,
  onSignOut,
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-900/50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Session warning</p>
        <h2 className="mt-1 text-xl font-semibold text-slate-900">Your session is about to expire</h2>
        <p className="mt-2 text-sm text-slate-500">
          {sharedDevice
            ? 'This shared-device session will lock after idle timeout. Continue only after a real action.'
            : 'Continue session resets inactivity only. It cannot extend the maximum session lifetime.'}
        </p>
        <p className="mt-4 text-center font-mono text-3xl text-slate-900">{formatCountdown(remainingMs)}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onSignOut}>
            Sign out
          </Button>
          <Button type="button" className="bg-blue-600 hover:bg-blue-700" onClick={onContinue}>
            Continue session
          </Button>
        </div>
      </div>
    </div>
  )
}
