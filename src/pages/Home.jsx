import { Link } from 'react-router-dom'

const WHATSAPP = 'https://wa.me/919721450099'
const EMAIL = 'bsbagency4u@gmail.com'

const demoItems = [
  {
    name: 'Tomato Soup',
    note: 'Slow-roasted tomato, basil oil',
    image: 'from-[#c45c26] to-[#7a2e12]',
    prices: [{ label: 'Bowl', value: '₹180' }],
  },
  {
    name: 'Paneer Tikka',
    note: 'Charred cottage cheese, mint chutney',
    image: 'from-[#d97706] to-[#9a3412]',
    prices: [
      { label: 'Half', value: '₹180' },
      { label: 'Full', value: '₹300' },
    ],
  },
  {
    name: 'Butter Chicken',
    note: 'Creamy tomato gravy, served with naan',
    image: 'from-[#b45309] to-[#7c2d12]',
    prices: [
      { label: 'Half', value: '₹220' },
      { label: 'Full', value: '₹380' },
    ],
  },
  {
    name: 'Fresh Lime Soda',
    note: 'Sweet, salted or mixed',
    image: 'from-[#65a30d] to-[#3f6212]',
    prices: [{ label: 'Glass', value: '₹90' }],
    unavailable: false,
  },
]

const steps = [
  { n: '01', t: 'Create Your Restaurant Profile', d: 'Add your restaurant name, logo, address, and contact details.' },
  { n: '02', t: 'Add Categories and Menu Items', d: 'Add dishes, descriptions, images, prices, variants, and availability.' },
  { n: '03', t: 'Generate Your QR Code', d: 'Create and download the QR code connected to your permanent menu URL.' },
  { n: '04', t: 'Display It for Customers', d: 'Place the QR code on tables, counters, printed cards, posters, or menus.' },
]

const features = [
  { t: 'Digital Restaurant Menu', d: 'A clean mobile menu guests open in the browser after scanning your QR.' },
  { t: 'Menu Categories', d: 'Group dishes into starters, mains, drinks, or any categories you need.' },
  { t: 'Multiple Price Variants', d: 'Set one price or custom sizes such as half, full, glass, or plate.' },
  { t: 'Food Images', d: 'Add photos so guests can see the dish before they choose.' },
  { t: 'Availability Control', d: 'Hide or show items and variants when something is unavailable.' },
  { t: 'Permanent QR Code', d: 'The QR stays the same even when you update dishes or prices.' },
  { t: 'Mobile-Friendly Design', d: 'Built first for phones, so the menu is easy to browse at the table.' },
  { t: 'Easy Menu Updates', d: 'Change names, prices, images, and categories from one dashboard.' },
]

function PhoneMenu({ compact = false }) {
  return (
    <div className={`overflow-hidden bg-[#fffdf8] ${compact ? '' : 'h-full'}`}>
      <div className="border-b border-[#efe6d8] px-4 py-4 text-center">
        <div className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-2xl bg-forest font-display text-xs text-[#f6f1ea]">
          UB
        </div>
        <p className="font-display text-lg leading-none">Urban Bites</p>
        <p className="mt-1 text-[11px] text-stone-500">MG Road · +91 97214 50099</p>
      </div>
      <div className="flex gap-2 overflow-x-auto px-3 py-3">
        {['Starters', 'Mains', 'Drinks'].map((tab, index) => (
          <span
            key={tab}
            className={`whitespace-nowrap rounded-full px-3 py-1 text-[11px] ${
              index === 0 ? 'bg-forest text-white' : 'bg-[#f3ebe0] text-stone-600'
            }`}
          >
            {tab}
          </span>
        ))}
      </div>
      <div className="space-y-2.5 px-3 pb-4">
        {demoItems.slice(0, compact ? 3 : 4).map((item) => (
          <div key={item.name} className="flex gap-3 rounded-2xl bg-[#f7f1e8] p-2.5">
            <div className={`h-14 w-14 shrink-0 rounded-xl bg-linear-to-br ${item.image}`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium">{item.name}</p>
                {item.prices.length === 1 ? <p className="text-xs text-forest">{item.prices[0].value}</p> : null}
              </div>
              <p className="mt-0.5 text-[11px] leading-snug text-stone-500">{item.note}</p>
              {item.prices.length > 1 ? (
                <p className="mt-1 text-[11px] text-forest">
                  {item.prices.map((price) => `${price.label} ${price.value}`).join(' · ')}
                </p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function QrMark() {
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16" aria-hidden="true">
      <rect width="64" height="64" fill="#fff" />
      <path fill="#1f3d32" d="M6 6h22v22H6zm8 8h6v6h-6zM36 6h22v22H36zm8 8h6v6h-6zM6 36h22v22H6zm8 8h6v6h-6zM36 36h8v8h-8zm10 0h12v6H46zm0 10h6v12h-6zm8-4h6v16h-6z" />
    </svg>
  )
}

export default function Home() {
  return (
    <div className="text-ink">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(31,61,50,0.08),transparent_36%)]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-12 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:py-16">
          <div>
            <p className="text-[0.72rem] font-semibold tracking-[0.22em] text-forest">QR DIGITAL MENU</p>
            <h1 className="mt-4 font-display text-[2.4rem] leading-[1.08] sm:text-5xl lg:text-[3.4rem]">
              Turn Your Restaurant Menu Digital.
            </h1>
            <p className="mt-4 max-w-lg text-base leading-relaxed text-stone-600">
              One QR code. One beautiful menu. Update it anytime.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/signup"
                className="rounded-full bg-forest px-6 py-3 text-center text-sm font-medium text-white transition hover:bg-forest-deep"
              >
                Create Your Menu
              </Link>
              <a
                href="#demo"
                className="rounded-full border border-[#d9d0c3] bg-white px-6 py-3 text-center text-sm font-medium transition hover:border-forest hover:text-forest"
              >
                View Demo
              </a>
            </div>
            <p className="mt-5 text-xs tracking-wide text-stone-500">
              No app for guests · Permanent menu link · QR stays the same
            </p>
          </div>

          <div className="relative mx-auto w-full max-w-[420px]">
            <div className="absolute -left-2 top-10 hidden rounded-2xl border border-[#eadfcf] bg-white px-3 py-2 text-xs shadow-lg sm:block">
              <p className="font-medium text-forest">Menu updated</p>
              <p className="text-stone-500">Same QR, latest dishes</p>
            </div>
            <div className="absolute -right-1 bottom-16 z-10 hidden rounded-2xl border border-[#eadfcf] bg-white p-3 shadow-xl sm:block">
              <QrMark />
              <p className="mt-1 text-center text-[10px] uppercase tracking-wider text-stone-500">Scan to view</p>
            </div>
            <div className="mx-auto w-[260px] rounded-[2.2rem] border-[10px] border-[#1c1917] bg-[#1c1917] shadow-[0_30px_70px_-28px_rgba(28,25,23,0.55)] sm:w-[280px]">
              <div className="mx-auto mt-2 h-4 w-24 rounded-full bg-[#111]" />
              <div className="mt-3 h-[460px] overflow-hidden rounded-[1.5rem] bg-white">
                <PhoneMenu compact />
              </div>
              <div className="mx-auto my-2 h-1 w-20 rounded-full bg-[#333]" />
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-[#ece7df] bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <p className="text-[0.72rem] font-semibold tracking-[0.22em] text-forest">ALWAYS CURRENT</p>
          <h2 className="mt-3 max-w-2xl font-display text-3xl sm:text-4xl">Your menu, always up to date.</h2>
          <p className="mt-4 max-w-2xl text-stone-600">
            Update dishes, prices, images, categories, and availability without printing a new menu.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              { t: 'No reprinting', d: 'Change a price or dish in the dashboard. Guests see the latest menu on the same link.' },
              { t: 'One place to manage', d: 'Restaurant profile, categories, items, images, and QR live in a simple dashboard.' },
              { t: 'Same QR, same URL', d: 'Customers scan once. Menu updates do not require a new QR code.' },
            ].map((card) => (
              <article key={card.t} className="rounded-3xl border border-[#ece7df] bg-[#f7f4ee] p-6">
                <h3 className="font-display text-xl">{card.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-600">{card.d}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="demo" className="scroll-mt-24 mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="max-w-2xl">
          <p className="text-[0.72rem] font-semibold tracking-[0.22em] text-forest">SAMPLE MENU</p>
          <h2 className="mt-3 font-display text-3xl sm:text-4xl">See how guests view your menu.</h2>
          <p className="mt-3 text-stone-600">
            This is a sample restaurant used for demonstration only. Your live menu will use your own restaurant
            details and dishes.
          </p>
        </div>
        <div className="mt-8 overflow-hidden rounded-[2rem] border border-[#ece7df] bg-white shadow-[0_24px_60px_-36px_rgba(28,25,23,0.35)]">
          <div className="grid lg:grid-cols-[280px_1fr]">
            <div className="border-b border-[#ece7df] bg-[#1f3d32] px-6 py-8 text-[#f6f1ea] lg:border-b-0 lg:border-r lg:border-[#2b5244]">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#f6f1ea] font-display text-forest">UB</div>
              <h3 className="mt-4 font-display text-3xl">Urban Bites</h3>
              <p className="mt-2 text-sm text-[#d5cbb8]">12 MG Road, sample location</p>
              <p className="text-sm text-[#d5cbb8]">+91 97214 50099</p>
              <p className="mt-6 text-xs uppercase tracking-[0.18em] text-gold">Digital menu preview</p>
            </div>
            <div className="p-4 sm:p-8">
              <div className="flex gap-2 overflow-x-auto pb-4">
                {['Starters', 'Mains', 'Drinks'].map((tab, index) => (
                  <span
                    key={tab}
                    className={`rounded-full px-4 py-1.5 text-sm ${index === 0 ? 'bg-forest text-white' : 'bg-[#f3ebe0]'}`}
                  >
                    {tab}
                  </span>
                ))}
              </div>
              <div className="grid gap-3">
                {demoItems.map((item) => (
                  <article key={item.name} className="flex gap-4 rounded-2xl border border-[#ece7df] p-3 sm:p-4">
                    <div className={`h-20 w-20 shrink-0 rounded-2xl bg-linear-to-br ${item.image}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <h4 className="font-medium">{item.name}</h4>
                        {item.prices.length === 1 ? <p className="text-sm text-forest">{item.prices[0].value}</p> : null}
                      </div>
                      <p className="mt-1 text-sm text-stone-500">{item.note}</p>
                      {item.prices.length > 1 ? (
                        <ul className="mt-2 space-y-1 text-sm">
                          {item.prices.map((price) => (
                            <li key={price.label} className="flex justify-between text-stone-700">
                              <span>{price.label}</span>
                              <span>{price.value}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="font-display text-3xl sm:text-4xl">Paper menus vs BSB Digital Menu</h2>
          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <article className="rounded-3xl border border-[#ece7df] bg-[#f7f4ee] p-6 sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Paper menu</p>
              <ul className="mt-5 space-y-3 text-sm text-stone-600">
                <li>Reprinting required when prices change</li>
                <li>Difficult to update during service</li>
                <li>Physical copies can become damaged</li>
                <li>Menu changes take time</li>
                <li>Food images and details are limited</li>
              </ul>
            </article>
            <article className="rounded-3xl bg-forest p-6 text-[#f6f1ea] sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">BSB Digital Menu</p>
              <ul className="mt-5 space-y-3 text-sm text-[#e7ddd0]">
                <li>Update the menu anytime from the dashboard</li>
                <li>One permanent QR code</li>
                <li>Mobile-friendly viewing in the browser</li>
                <li>Food images, descriptions, and price variants</li>
                <li>Availability control on the same menu link</li>
              </ul>
            </article>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-24 border-y border-[#ece7df]">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <p className="text-[0.72rem] font-semibold tracking-[0.22em] text-forest">HOW IT WORKS</p>
          <h2 className="mt-3 font-display text-3xl sm:text-4xl">From setup to table in four steps.</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step) => (
              <article key={step.n} className="rounded-3xl border border-[#ece7df] bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-md">
                <p className="font-display text-2xl text-gold">{step.n}</p>
                <h3 className="mt-3 font-display text-xl">{step.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-600">{step.d}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="scroll-mt-24 mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <p className="text-[0.72rem] font-semibold tracking-[0.22em] text-forest">FEATURES</p>
        <h2 className="mt-3 max-w-xl font-display text-3xl sm:text-4xl">Built for a simple digital menu.</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <article key={feature.t} className="rounded-3xl border border-[#ece7df] bg-white p-5">
              <div className="h-8 w-8 rounded-full bg-forest/10 ring-4 ring-forest/5" />
              <h3 className="mt-4 font-display text-lg">{feature.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">{feature.d}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="overflow-hidden border-y border-[#ece7df] bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <p className="text-[0.72rem] font-semibold tracking-[0.22em] text-forest">ANY DEVICE</p>
          <h2 className="mt-3 max-w-2xl font-display text-3xl sm:text-4xl">Opens in the browser. Looks right on every screen.</h2>
          <p className="mt-3 max-w-2xl text-stone-600">
            Guests scan the QR and view the menu on their phone. You can also preview it on a laptop. No app install.
          </p>
          <div className="relative mt-10 grid items-end gap-8 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-[1.6rem] border border-[#ece7df] bg-[#f7f4ee] p-3 shadow-[0_24px_50px_-32px_rgba(28,25,23,0.4)] sm:p-4">
              <div className="mb-3 flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs text-stone-500">
                <span className="h-2.5 w-2.5 rounded-full bg-[#e7dfd4]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#e7dfd4]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#e7dfd4]" />
                <span className="ml-2 truncate">bsbdigitalmenu.app/menu/urban-bites</span>
              </div>
              <div className="overflow-hidden rounded-[1.1rem] bg-white">
                <PhoneMenu />
              </div>
            </div>
            <div className="mx-auto w-[230px] rounded-[2rem] border-[10px] border-[#1c1917] bg-[#1c1917] shadow-[0_28px_60px_-28px_rgba(28,25,23,0.5)] sm:w-[250px]">
              <div className="mx-auto mt-2 h-3.5 w-20 rounded-full bg-[#111]" />
              <div className="mt-2 h-[390px] overflow-hidden rounded-[1.35rem] bg-white">
                <PhoneMenu compact />
              </div>
              <div className="mx-auto my-2 h-1 w-16 rounded-full bg-[#333]" />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-forest">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6">
          <h2 className="font-display text-3xl text-[#f6f1ea] sm:text-4xl">Ready to replace your paper menu?</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-[#d5cbb8]">
            Create a beautiful digital menu for your restaurant and share it with one QR code.
          </p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/signup"
              className="inline-flex rounded-full bg-[#f6f1ea] px-6 py-3 text-sm font-medium text-forest transition hover:bg-white"
            >
              Create Your Menu
            </Link>
            <a
              href="#demo"
              className="inline-flex rounded-full border border-[#d5cbb8] px-6 py-3 text-sm font-medium text-[#f6f1ea] transition hover:bg-white/10"
            >
              View Demo
            </a>
          </div>
        </div>
      </section>

      <section id="contact" className="scroll-mt-24 mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <p className="text-[0.72rem] font-semibold tracking-[0.22em] text-forest">CONTACT</p>
        <h2 className="mt-3 font-display text-3xl">Need help?</h2>
        <p className="mt-2 max-w-lg text-sm text-stone-600">
          Reach us by email or WhatsApp if you need a hand setting up your menu.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <a href={`mailto:${EMAIL}`} className="rounded-3xl border border-[#ece7df] bg-white px-5 py-5 transition hover:border-forest">
            <p className="text-xs uppercase tracking-wider text-stone-500">Email</p>
            <p className="mt-1 font-medium">{EMAIL}</p>
          </a>
          <a href={WHATSAPP} target="_blank" rel="noreferrer" className="rounded-3xl border border-[#ece7df] bg-white px-5 py-5 transition hover:border-forest">
            <p className="text-xs uppercase tracking-wider text-stone-500">WhatsApp</p>
            <p className="mt-1 font-medium">+91 97214 50099</p>
          </a>
        </div>
      </section>

      <footer className="border-t border-[#ece7df] bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-3">
          <div>
            <p className="font-display text-lg">BSB Digital Menu</p>
            <p className="mt-2 text-sm text-stone-600">Simple digital menus for modern restaurants.</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-stone-500">Links</p>
            <div className="mt-3 flex flex-col gap-2 text-sm">
              <Link to="/" className="hover:text-forest">Home</Link>
              <a href="#features" className="hover:text-forest">Features</a>
              <a href="#how-it-works" className="hover:text-forest">How It Works</a>
              <a href="#demo" className="hover:text-forest">Demo</a>
              <a href="#contact" className="hover:text-forest">Contact</a>
              <Link to="/login" className="hover:text-forest">Login</Link>
              <Link to="/signup" className="hover:text-forest">Create Your Menu</Link>
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-stone-500">Support</p>
            <div className="mt-3 flex flex-col gap-2 text-sm">
              <a href={`mailto:${EMAIL}`} className="hover:text-forest">{EMAIL}</a>
              <a href={WHATSAPP} target="_blank" rel="noreferrer" className="hover:text-forest">
                WhatsApp: +91 97214 50099
              </a>
            </div>
          </div>
        </div>
        <p className="border-t border-[#ece7df] px-4 py-4 text-center text-xs text-stone-500">
          © 2026 BSB Digital Menu. All rights reserved.
        </p>
      </footer>
    </div>
  )
}
