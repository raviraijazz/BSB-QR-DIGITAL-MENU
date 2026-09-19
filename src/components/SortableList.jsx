import { useEffect, useRef, useState } from 'react'
import { moveItem } from '../lib/sort'

function indexFromPointer(listEl, clientY) {
  const nodes = [...(listEl?.querySelectorAll('[data-sort-id]') || [])]
  if (!nodes.length) return 0
  for (let i = 0; i < nodes.length; i += 1) {
    const rect = nodes[i].getBoundingClientRect()
    if (clientY < rect.top + rect.height / 2) return i
  }
  return nodes.length - 1
}

export default function SortableList({ items, getId, disabled, onReorder, renderItem, className = '' }) {
  const listRef = useRef(null)
  const [localItems, setLocalItems] = useState(items)
  const [draggingId, setDraggingId] = useState(null)
  const originRef = useRef(items)
  const localRef = useRef(items)
  const draggingRef = useRef(null)
  const movedRef = useRef(false)
  const finishedRef = useRef(true)

  useEffect(() => {
    localRef.current = localItems
  }, [localItems])

  useEffect(() => {
    if (draggingId) return
    setLocalItems(items)
    originRef.current = items
    localRef.current = items
  }, [items, draggingId])

  function finish() {
    if (finishedRef.current) return
    finishedRef.current = true
    const start = originRef.current
    const next = localRef.current
    draggingRef.current = null
    setDraggingId(null)
    if (!movedRef.current) return
    const changed = start.some((item, index) => getId(item) !== getId(next[index]))
    if (changed) onReorder(next, start)
  }

  function onPointerDown(event, id) {
    if (disabled || event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    movedRef.current = false
    finishedRef.current = false
    originRef.current = localItems
    draggingRef.current = id
    setDraggingId(id)
  }

  function onPointerMove(event) {
    const id = draggingRef.current
    if (!id || disabled) return
    if (event.cancelable) event.preventDefault()
    const from = localRef.current.findIndex((item) => getId(item) === id)
    if (from < 0) return
    const to = indexFromPointer(listRef.current, event.clientY)
    if (to === from) return
    movedRef.current = true
    const next = moveItem(localRef.current, from, to)
    localRef.current = next
    setLocalItems(next)
  }

  function onPointerUp(event, id) {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    finish(id)
  }

  return (
    <ul ref={listRef} className={className}>
      {localItems.map((item) => {
        const id = getId(item)
        const dragging = draggingId === id
        const handleProps = {
          onPointerDown: (event) => onPointerDown(event, id),
          onPointerMove,
          onPointerUp: (event) => onPointerUp(event, id),
          onPointerCancel: (event) => onPointerUp(event, id),
          onLostPointerCapture: () => finish(),
        }
        return (
          <li key={id} data-sort-id={id} className={dragging ? 'relative z-10' : ''}>
            {renderItem(item, { dragging, handleProps, disabled })}
          </li>
        )
      })}
    </ul>
  )
}

export function SortHandle({ handleProps, disabled, label = 'Reorder' }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      className="grid h-10 w-10 shrink-0 cursor-grab touch-none select-none place-items-center rounded-xl border border-line bg-white text-lg leading-none text-stone-500 hover:border-ink active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
      {...handleProps}
    >
      ☰
    </button>
  )
}
