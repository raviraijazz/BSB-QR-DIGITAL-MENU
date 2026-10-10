export function unauthenticatedPath(allow, fromPath) {
  const to = allow === 'waiter' ? '/waiter/login' : '/login'
  return { to, state: fromPath ? { from: fromPath } : undefined }
}

export function forbiddenPath(allow, { isOwner, isWaiter }) {
  if (allow === 'owner' && !isOwner) return isWaiter ? '/waiter' : '/'
  if (allow === 'waiter' && !isWaiter) return isOwner ? '/dashboard' : '/'
  return null
}

export function guestHomePath(allow, { user, isOwner, isWaiter }) {
  if (!user) return null
  if (allow === 'owner' && isOwner) return '/dashboard'
  if (allow === 'waiter' && isWaiter) return '/waiter'
  if (allow === 'owner' && isWaiter) return '/waiter'
  if (allow === 'waiter' && isOwner) return '/dashboard'
  return null
}
