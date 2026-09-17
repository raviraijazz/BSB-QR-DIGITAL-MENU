import { Link } from 'react-router-dom'

const WHATSAPP = 'https://wa.me/919721450099'
const EMAIL = 'bsbagency4u@gmail.com'

const steps = [
  { n: '01', t: 'Create your restaurant', d: 'Add your restaurant name, contact details and logo.' },
  { n: '02', t: 'Build your digital menu', d: 'Add categories, dishes, prices and photos.' },
  { n: '03', t: 'Share your QR', d: 'Download your QR code and let guests scan your menu.' },
]

const features = [
  { t: 'Easy Menu Updates', d: 'Update prices and dishes anytime without changing your QR code.' },
  { t: 'Mobile Friendly', d: 'Designed for guests browsing on their phones.' },
  { t: 'Your Restaurant, Your Brand', d: 'Keep your restaurant identity visible throughout the menu.' },
  { t: 'Instant QR Code', d: 'Generate and download your restaurant QR code.' },
  { t: 'No App Required', d: 'Guests simply scan and open the menu in their browser.' },
  { t: 'Simple Dashboard', d: 'Manage your menu without complicated restaurant software.' },
]

const previewTabs = ['Starters', 'Mains', 'Drinks']
const previewItems = [
  { name: 'Tomato Soup', note: 'Roasted tomato, basil oil', price: '₹180', tab: 'Starters' },
  { name: 'Paneer Tikka', note: 'Charred cottage cheese, mint chutney', price: '₹260', tab: 'Starters' },
  { name: 'Butter Chicken', note: 'Creamy tomato gravy, served with naan', price: '₹320', tab: 'Mains' },
  { name: 'Fresh Lime Soda', note: 'Sweet, salted or mixed', price: '₹90', tab: 'Drinks' },
]

export default function Home() {
  return (
    <div className="text-[#1c241f]">
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:gap-14 lg:py-16">
        <div>
          <p className="text-[0.7rem] font-semibold tracking-[0.22em] text-forest">
            DIGITAL MENU FOR RESTAURANTS
          </p>
          <h1 className="mt-4 font-display text-[2.15rem] leading-[1.15] text-ink sm:text-5xl">
            Turn Your Restaurant Menu Into a Simple QR Experience.
          </h1>
          <p className="mt-4 max-w-lg text-[0.98rem] leading-relaxed text-stone-600">
            Create a beautiful digital menu, generate your QR code, and let guests browse it instantly from their
            phones. No app required.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              to="/signup"
              className="rounded-xl bg-forest px-5 py-3 text-sm font-medium text-white transition hover:bg-forest-deep"
            >
              Create Your Free Menu
            </Link>
            <a
              href="#how-it-works"
              className="rounded-xl border border-[#d8cfc0] bg-white/80 px-5 py-3 text-sm font-medium text-ink transition hover:border-forest hover:text-forest"
            >
              See How It Works
            </a>
          </div>
          <p className="mt-5 text-xs tracking-wide text-stone-500">
            No app for guests · Easy to update · QR stays the same
          </p>
        </div>

        <div className="relative">
          <div className="absolute -inset-3 rounded-[2rem] bg-forest/8 blur-2xl" aria-hidden="true" />
          <div className="relative overflow-hidden rounded-[1.6rem] border border-[#e4d9c8] bg-[#fffaf3] shadow-[0_24px_50px_-28px_rgba(31,61,50,0.45)]">
            <div className="flex items-center gap-3 border-b border-[#efe6d8] px-5 py-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-forest font-display text-sm text-[#f4efe6]">
                CB
              </div>
              <div>
                <p className="font-display text-xl leading-none">Cafe BSB</p>
                <p className="mt-1 text-[0.7rem] uppercase tracking-[0.16em] text-gold">Digital Menu</p>
              </div>
            </div>
            <div className="flex gap-2 px-5 pt-4">
              {previewTabs.map((tab, index) => (
                <span
                  key={tab}
                  className={`rounded-full px-3 py-1 text-xs ${
                    index === 0 ? 'bg-forest text-white' : 'bg-[#f3ebe0] text-stone-600'
                  }`}
                >
                  {tab}
                </span>
              ))}
            </div>
            <div className="space-y-2.5 p-5">
              {previewItems.map((item) => (
                <div key={item.name} className="flex items-start justify-between gap-4 rounded-2xl bg-[#f7f1e8] px-4 py-3">
                  <div>
                    <p className="text-[0.7rem] uppercase tracking-wider text-gold">{item.tab}</p>
                    <p className="mt-0.5 font-medium">{item.name}</p>
                    <p className="text-sm text-stone-500">{item.note}</p>
                  </div>
                  <p className="shrink-0 text-sm font-medium text-forest">{item.price}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-24 border-y border-[#e8dfd1] bg-[#fffaf3]">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <p className="text-[0.7rem] font-semibold tracking-[0.22em] text-forest">HOW IT WORKS</p>
          <h2 className="mt-3 font-display text-3xl text-ink sm:text-4xl">From menu to QR in minutes.</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {steps.map((step) => (
              <article key={step.n} className="rounded-2xl border border-[#eadfcf] bg-white px-5 py-6">
                <p className="font-display text-2xl text-gold">{step.n}</p>
                <h3 className="mt-3 font-display text-xl">{step.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-600">{step.d}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="scroll-mt-24 mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <p className="text-[0.7rem] font-semibold tracking-[0.22em] text-forest">FEATURES</p>
        <h2 className="mt-3 max-w-xl font-display text-3xl text-ink sm:text-4xl">
          Everything you need for a digital menu. Nothing you don’t.
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <article key={feature.t} className="rounded-2xl border border-[#eadfcf] bg-[#fffaf3] px-5 py-6">
              <h3 className="font-display text-xl">{feature.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">{feature.d}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-forest">
        <div className="mx-auto max-w-6xl px-4 py-14 text-center sm:px-6">
          <h2 className="font-display text-3xl text-[#f4efe6] sm:text-4xl">
            Give your guests a better way to browse your menu.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-[#d5cbb8]">
            Set up your restaurant, add dishes, and share a QR that always opens the latest menu.
          </p>
          <Link
            to="/signup"
            className="mt-7 inline-flex rounded-xl bg-[#f4efe6] px-5 py-3 text-sm font-medium text-forest transition hover:bg-white"
          >
            Create Your Free Menu
          </Link>
        </div>
      </section>

      <section id="contact" className="scroll-mt-24 mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <p className="text-[0.7rem] font-semibold tracking-[0.22em] text-forest">SUPPORT</p>
        <h2 className="mt-3 font-display text-3xl text-ink">Need help?</h2>
        <p className="mt-2 max-w-lg text-sm text-stone-600">
          Reach us by email or WhatsApp if you need a hand setting up your menu.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <a
            href={`mailto:${EMAIL}`}
            className="rounded-2xl border border-[#eadfcf] bg-[#fffaf3] px-5 py-5 transition hover:border-forest"
          >
            <p className="text-xs uppercase tracking-wider text-stone-500">Email</p>
            <p className="mt-1 font-medium">{EMAIL}</p>
          </a>
          <a
            href={WHATSAPP}
            target="_blank"
            rel="noreferrer"
            className="rounded-2xl border border-[#eadfcf] bg-[#fffaf3] px-5 py-5 transition hover:border-forest"
          >
            <p className="text-xs uppercase tracking-wider text-stone-500">WhatsApp</p>
            <p className="mt-1 font-medium">+91 97214 50099</p>
          </a>
        </div>
      </section>

      <footer className="border-t border-[#e8dfd1] bg-[#fffaf3]">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-3">
          <div>
            <p className="font-display text-lg">BSB Digital Menu</p>
            <p className="mt-2 text-sm text-stone-600">Simple digital menus for modern restaurants.</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-stone-500">Links</p>
            <div className="mt-3 flex flex-col gap-2 text-sm">
              <Link to="/" className="hover:text-forest">Home</Link>
              <a href="#how-it-works" className="hover:text-forest">How it works</a>
              <a href="#features" className="hover:text-forest">Features</a>
              <a href="#contact" className="hover:text-forest">Contact</a>
              <Link to="/login" className="hover:text-forest">Log in</Link>
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
        <p className="border-t border-[#eadfcf] px-4 py-4 text-center text-xs text-stone-500">
          © 2026 BSB Digital Menu. All rights reserved.
        </p>
      </footer>
    </div>
  )
}
