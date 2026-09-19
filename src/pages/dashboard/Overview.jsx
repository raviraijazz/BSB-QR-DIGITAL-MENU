import { Link, useOutletContext } from 'react-router-dom'
import EmptyState from '../../components/EmptyState'
import Spinner from '../../components/Spinner'
import { menuUrl } from '../../lib/menuUrl'

export default function Overview() {
  const { restaurant, loading } = useOutletContext()

  if (loading) return <Spinner />
  if (!restaurant) {
    return (
      <EmptyState
        title="Set up your restaurant"
        body="Add restaurant name, phone, address and an optional logo. Then you can build the menu and generate a QR code."
        actionTo="/dashboard/restaurant"
        actionLabel="Set up restaurant"
      />
    )
  }

  const cards = [
    { to: '/dashboard/categories', title: 'Categories', body: 'Group dishes like Starters, Mains, Drinks.' },
    { to: '/dashboard/menu', title: 'Menu items', body: 'Add names, prices, photos and availability.' },
    { to: '/dashboard/qr', title: 'QR Code Studio', body: 'Brand, download and print the QR that always opens this menu.' },
  ]

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-3xl">{restaurant.name}</h1>
        <p className="mt-1 text-sm text-muted">Manage your digital menu from here.</p>
      </div>
      {restaurant.slug ? (
        <p className="rounded-xl bg-white px-4 py-3 text-sm">
          Public menu:{' '}
          <a className="underline" href={menuUrl(restaurant.slug)} target="_blank" rel="noreferrer">
            {menuUrl(restaurant.slug)}
          </a>
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((card) => (
          <Link key={card.to} to={card.to} className="rounded-2xl border border-line bg-card p-5 hover:border-ink">
            <h2 className="font-display text-xl">{card.title}</h2>
            <p className="mt-2 text-sm text-muted">{card.body}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
