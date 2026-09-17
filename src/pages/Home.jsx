import { Link } from 'react-router-dom'

const steps = [
  { n: '01', t: 'Create your restaurant', d: 'Add name, phone, address and a logo.' },
  { n: '02', t: 'Build the menu', d: 'Add categories, items, prices and photos.' },
  { n: '03', t: 'Print the QR', d: 'Guests scan once. You update the menu anytime.' },
]

export default function Home() {
  return (
    <>
      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-16 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-accent">For restaurants</p>
          <h1 className="mt-3 font-display text-4xl leading-tight sm:text-5xl">
            A digital menu your guests can scan in seconds.
          </h1>
          <p className="mt-4 max-w-lg text-muted">
            Create your restaurant profile, add dishes, generate a QR code, and share a permanent menu link.
            No app. No ordering. Just a clean menu.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/signup" className="rounded-xl bg-ink px-5 py-3 text-sm text-white">
              Create your menu
            </Link>
            <Link to="/login" className="rounded-xl border border-line bg-white px-5 py-3 text-sm">
              Log in
            </Link>
          </div>
        </div>
        <div className="rounded-3xl border border-line bg-card p-6 shadow-sm">
          <p className="text-xs uppercase tracking-widest text-muted">Sample guest view</p>
          <h2 className="mt-2 font-display text-3xl">Cafe BSB</h2>
          <div className="mt-6 space-y-4">
            <div className="rounded-2xl bg-paper p-4">
              <p className="text-xs text-muted">Starters</p>
              <div className="mt-2 flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium">Tomato soup</p>
                  <p className="text-sm text-muted">Roasted tomato, basil oil</p>
                </div>
                <p className="text-sm">₹180</p>
              </div>
            </div>
            <div className="rounded-2xl bg-paper p-4">
              <p className="text-xs text-muted">Mains</p>
              <div className="mt-2 flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium">Butter chicken</p>
                  <p className="text-sm text-muted">Creamy tomato gravy, naan</p>
                </div>
                <p className="text-sm">₹320</p>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="border-t border-line bg-card">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:grid-cols-3">
          {steps.map((step) => (
            <div key={step.n}>
              <p className="text-xs text-accent">{step.n}</p>
              <h3 className="mt-2 font-display text-2xl">{step.t}</h3>
              <p className="mt-2 text-sm text-muted">{step.d}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
