import { usePlatformAdmin } from '../hooks/usePlatformAdmin'
import SessionWarningModal from './SessionWarningModal'
import { useSessionGuard } from '../hooks/useSessionGuard'

export default function SessionGuard({ children }) {
  const { isAdmin } = usePlatformAdmin()
  const { warningOpen, remainingMs, sharedDevice, continueSession, expire } = useSessionGuard({ isAdmin })
  return (
    <>
      {children}
      <SessionWarningModal
        open={warningOpen}
        remainingMs={remainingMs}
        sharedDevice={sharedDevice}
        onContinue={continueSession}
        onSignOut={() => expire('sign_out')}
      />
    </>
  )
}
