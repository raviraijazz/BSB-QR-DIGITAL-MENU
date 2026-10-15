import { useState } from 'react'
import { inputClass } from './Field'

export default function PasswordInput({ value, onChange, autoComplete = 'current-password', placeholder }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <input
        className={`${inputClass} pr-16`}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-slate-500 hover:text-slate-700"
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? 'Hide' : 'Show'}
      </button>
    </div>
  )
}
