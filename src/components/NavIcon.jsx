export default function NavIcon({ name, className = 'h-4 w-4' }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.8',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className,
    'aria-hidden': true,
  }

  const paths = {
    overview: <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />,
    restaurant: (
      <>
        <path d="M4 20h16" />
        <path d="M6 20V8h12v12" />
        <path d="M9 11h.01M12 11h.01M15 11h.01M9 15h6" />
      </>
    ),
    categories: (
      <>
        <path d="M4 7h16M4 12h16M4 17h10" />
      </>
    ),
    menu: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M8 9h8M8 12h8M8 15h5" />
      </>
    ),
    qr: (
      <>
        <path d="M7 7h3v3H7zM14 7h3v3h-3zM7 14h3v3H7z" />
        <path d="M14 14h1.5v1.5H14zM16.5 16.5H18V18h-1.5zM14 18h1.5v-1.5" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V20a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H4a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H10a1.7 1.7 0 0 0 1-1.5V4a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V10a1.7 1.7 0 0 0 1.5 1H20a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1z" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    link: <path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1" />,
    copy: (
      <>
        <rect x="8" y="8" width="12" height="12" rx="2" />
        <path d="M4 16V6a2 2 0 0 1 2-2h10" />
      </>
    ),
    share: (
      <>
        <circle cx="18" cy="5" r="2.4" />
        <circle cx="6" cy="12" r="2.4" />
        <circle cx="18" cy="19" r="2.4" />
        <path d="M8.2 13.2 15.8 17.4M15.8 6.6 8.2 10.8" />
      </>
    ),
    phone: (
      <>
        <path d="M6.5 3.8h3.2l1.1 2.8-2 1.2a12 12 0 0 0 5.4 5.4l1.2-2 2.8 1.1v3.2c0 .9-.7 1.6-1.6 1.6C8.8 17.1 3 11.3 3 5.4 3 4.5 3.7 3.8 4.6 3.8z" />
      </>
    ),
    whatsapp: (
      <>
        <path d="M12 4.5a7.5 7.5 0 0 0-6.4 11.4L5 19.5l3.7-.9A7.5 7.5 0 1 0 12 4.5z" />
        <path d="M9.4 9.7c.2-.4.3-.4.6-.4h.5c.2 0 .4 0 .5.4.2.5.6 1.6.6 1.7 0 .10.0.1.4.6s.2.5.4.7.3.3.5.5.3.1.5 0c.2-.1.8-.3 1.5-.9s1-.9 1.1-1.2.1-.5 0-.7-.5-.6-.7-.7" />
      </>
    ),
    external: <path d="M14 5h5v5M19 5l-9 9M9 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3" />,
    menuToggle: <path d="M4 7h16M4 12h16M4 17h16" />,
    close: <path d="M6 6l12 12M18 6 6 18" />,
    available: <path d="M20 7 10 17l-5-5" />,
    sold: <circle cx="12" cy="12" r="8" />,
    folder: (
      <>
        <path d="M4 7h6l2 2h8v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      </>
    ),
  }

  return <svg {...common}>{paths[name] || paths.overview}</svg>
}
