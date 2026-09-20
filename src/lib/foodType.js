export const FOOD_TYPES = [
  { id: 'veg', label: 'Veg' },
  { id: 'non_veg', label: 'Non-Veg' },
]

export function normalizeFoodType(value) {
  return value === 'non_veg' ? 'non_veg' : 'veg'
}

export function foodTypeLabel(value) {
  return normalizeFoodType(value) === 'non_veg' ? 'Non-veg' : 'Veg'
}
