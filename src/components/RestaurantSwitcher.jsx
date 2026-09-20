import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function RestaurantSwitcher({ restaurants, restaurant, onSelect }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    function onDoc(event) {
      if (!wrapRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  if (!restaurants.length) {
    return <p className="text-xs text-muted">Digital menu</p>
  }

  return (
    <div ref={wrapRef} className="relative mt-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-line bg-white px-3 py-2 text-left text-sm hover:border-forest"
      >
        <span className="min-w-0 truncate font-medium">{restaurant?.name || 'Select restaurant'}</span>
        <span className="shrink-0 text-xs text-muted">{open ? '▲' : '▼'}</span>
      </button>
      {open ? (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-line bg-white p-1 shadow-lg">
          {restaurants.map((item) => {
            const active = item.id === restaurant?.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelect(item.id)
                  setOpen(false)
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                  active ? 'bg-paper font-medium text-forest' : 'text-stone-600 hover:bg-paper'
                }`}
              >
                <span className="w-4 shrink-0">{active ? '✓' : ''}</span>
                <span className="min-w-0 truncate">{item.name}</span>
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              navigate('/dashboard/restaurant?new=1')
            }}
            className="mt-1 flex w-full rounded-lg px-3 py-2 text-left text-sm text-forest hover:bg-paper"
          >
            + Add Restaurant
          </button>
        </div>
      ) : null}
    </div>
  )
}
