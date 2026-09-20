import { useCallback, useEffect, useState } from 'react'
import {
  listMyRestaurants,
  readActiveRestaurantId,
  writeActiveRestaurantId,
} from '../services/restaurants'
import { useAuth } from './useAuth'

function pickRestaurant(list, preferredId) {
  if (!list.length) return null
  return list.find((item) => item.id === preferredId) || list[0]
}

export function useRestaurant() {
  const { user } = useAuth()
  const [restaurants, setRestaurants] = useState([])
  const [restaurant, setRestaurantState] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (!user) {
      setRestaurants([])
      setRestaurantState(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error: nextError } = await listMyRestaurants(user.id)
    const list = data ?? []
    const next = pickRestaurant(list, readActiveRestaurantId(user.id))
    setRestaurants(list)
    setRestaurantState(next)
    if (next?.id) writeActiveRestaurantId(user.id, next.id)
    setError(nextError?.message || '')
    setLoading(false)
  }, [user])

  useEffect(() => {
    refresh()
  }, [refresh])

  const setRestaurant = useCallback(
    (next) => {
      if (!next) return
      setRestaurantState(next)
      setRestaurants((current) => {
        const exists = current.some((item) => item.id === next.id)
        if (!exists) return [...current, next]
        return current.map((item) => (item.id === next.id ? next : item))
      })
      if (user?.id && next.id) writeActiveRestaurantId(user.id, next.id)
    },
    [user],
  )

  const selectRestaurant = useCallback(
    (id) => {
      const next = restaurants.find((item) => item.id === id)
      if (!next) return
      setRestaurant(next)
    },
    [restaurants, setRestaurant],
  )

  return {
    restaurants,
    restaurant,
    loading,
    error,
    refresh,
    setRestaurant,
    selectRestaurant,
  }
}
