import { createContext, createElement, useContext, useEffect, useMemo, useState } from 'react'
import { getMyWaiter, getWaiterRestaurant, listMyAssignedTables } from '../services/waiterAuth'
import { useAuth } from './useAuth'

const WaiterContext = createContext(null)

export function WaiterProvider({ children }) {
  const { user, isWaiter } = useAuth()
  const [waiter, setWaiter] = useState(null)
  const [restaurant, setRestaurant] = useState(null)
  const [tables, setTables] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      if (!user || !isWaiter) {
        setWaiter(null)
        setRestaurant(null)
        setTables([])
        setError('')
        setLoading(false)
        return
      }
      setLoading(true)
      const { data: nextWaiter, error: waiterError } = await getMyWaiter()
      if (!active) return
      if (waiterError || !nextWaiter) {
        setWaiter(null)
        setRestaurant(null)
        setTables([])
        setError(waiterError?.message || 'Waiter account not found')
        setLoading(false)
        return
      }
      if (nextWaiter.is_active === false) {
        setWaiter(nextWaiter)
        setRestaurant(null)
        setTables([])
        setError('disabled')
        setLoading(false)
        return
      }
      const [restaurantResult, tablesResult] = await Promise.all([
        getWaiterRestaurant(nextWaiter.restaurant_id),
        listMyAssignedTables(nextWaiter.restaurant_id, nextWaiter.id),
      ])
      if (!active) return
      setWaiter(nextWaiter)
      setRestaurant(restaurantResult.data)
      setTables(tablesResult.data ?? [])
      setError(restaurantResult.error?.message || tablesResult.error?.message || '')
      setLoading(false)
    }
    load()
    return () => {
      active = false
    }
  }, [user?.id, isWaiter])

  const value = useMemo(
    () => ({ waiter, restaurant, tables, loading, error }),
    [waiter, restaurant, tables, loading, error]
  )

  return createElement(WaiterContext.Provider, { value }, children)
}

export function useWaiter() {
  const ctx = useContext(WaiterContext)
  if (!ctx) throw new Error('useWaiter must be used within WaiterProvider')
  return ctx
}
