import { useCallback, useEffect, useState } from 'react'
import { getMyRestaurant } from '../services/restaurants'
import { useAuth } from './useAuth'

export function useRestaurant() {
  const { user } = useAuth()
  const [restaurant, setRestaurant] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (!user) {
      setRestaurant(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error: nextError } = await getMyRestaurant(user.id)
    setRestaurant(data ?? null)
    setError(nextError?.message || '')
    setLoading(false)
  }, [user])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { restaurant, loading, error, refresh, setRestaurant }
}
