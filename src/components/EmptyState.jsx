import { Link } from 'react-router-dom'
import Button from './Button'

export default function EmptyState({ title, body, actionTo, actionLabel }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-white/70 px-6 py-10 text-center">
      <h3 className="font-display text-xl">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{body}</p>
      {actionTo ? (
        <Link to={actionTo} className="mt-5 inline-block">
          <Button>{actionLabel}</Button>
        </Link>
      ) : null}
    </div>
  )
}
