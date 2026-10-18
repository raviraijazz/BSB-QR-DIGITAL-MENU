import { Component } from 'react'

export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Application error:', error, info?.componentStack)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const message = String(error?.message || '')
    const chunkFailed =
      message.includes('Failed to fetch dynamically imported module') ||
      message.includes('Importing a module script failed') ||
      message.includes('Unexpected token')
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">
            {chunkFailed ? 'This page could not be loaded' : 'Something went wrong'}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {chunkFailed
              ? 'The app was updated while this tab was open. Reload to get the latest version.'
              : 'An unexpected error interrupted this page. Reload to try again.'}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <button
              type="button"
              onClick={this.handleReload}
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Reload
            </button>
            <a
              href="/platform-admin/login"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Founder sign in
            </a>
          </div>
        </div>
      </div>
    )
  }
}
