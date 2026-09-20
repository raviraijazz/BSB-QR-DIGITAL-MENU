import { foodTypeLabel, normalizeFoodType } from '../lib/foodType'

export default function FoodTypeMark({ value, className = '' }) {
  const type = normalizeFoodType(value)
  const veg = type === 'veg'
  const color = veg ? '#15803d' : '#9a3412'
  const label = veg ? 'Vegetarian' : 'Non-vegetarian'

  return (
    <span className={`relative inline-flex shrink-0 items-center ${className}`} title={label}>
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <rect x="0.75" y="0.75" width="12.5" height="12.5" rx="1.2" fill="none" stroke={color} strokeWidth="1.5" />
        <circle cx="7" cy="7" r="3.1" fill={color} />
      </svg>
      <span className="absolute h-px w-px overflow-hidden whitespace-nowrap" style={{ clip: 'rect(0, 0, 0, 0)' }}>
        {label}
      </span>
    </span>
  )
}

export function FoodTypeText({ value }) {
  return <span className="text-xs uppercase tracking-wide text-muted">{foodTypeLabel(value)}</span>
}
