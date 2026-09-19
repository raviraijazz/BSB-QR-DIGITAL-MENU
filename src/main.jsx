import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { hasSupabaseConfig } from './lib/supabase'

const root = createRoot(document.getElementById('root'))

if (!hasSupabaseConfig) {
  root.render(
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '24px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: '420px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.4rem', marginBottom: '8px' }}>App configuration missing</h1>
        <p style={{ color: '#57534e', lineHeight: 1.5 }}>
          Missing <code>VITE_SUPABASE_URL</code> or <code>VITE_SUPABASE_ANON_KEY</code>.
          Add both environment variables and rebuild the app.
        </p>
      </div>
    </div>
  )
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}
