import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import EmptyState from '../../components/EmptyState'
import Spinner from '../../components/Spinner'
import { formatClock } from '../../lib/orderCart'
import { tableHeading } from '../../lib/tableToken'
import { listOpenSessions, openTableSession, sessionForTable } from '../../services/tableSessions'

export default function WaiterHome() {
  const { waiter, restaurant, tables } = useOutletContext()
  const navigate = useNavigate()
  const [sessions, setSessions] = useState([])
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [loading, setLoading] = useState(true)

  async function load() {
    if (!restaurant?.id) {
      setSessions([])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error: nextError } = await listOpenSessions(restaurant.id)
    setLoading(false)
    setSessions(data ?? [])
    setError(nextError?.message || '')
  }

  useEffect(() => {
    load()
  }, [restaurant?.id])

  const cards = useMemo(
    () =>
      (tables || []).map((table) => ({
        table,
        session: sessionForTable(sessions, table.id),
      })),
    [tables, sessions],
  )

  async function onOpen(table, session) {
    if (session) {
      navigate(`/waiter/sessions/${session.id}`)
      return
    }
    setBusyId(table.id)
    setError('')
    const { data, error: nextError } = await openTableSession(restaurant.id, table)
    setBusyId('')
    if (nextError || !data) {
      setError(nextError?.message || 'Could not open table')
      return
    }
    navigate(`/waiter/sessions/${data.id}`)
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Waiter</p>
        <h1 className="mt-1 font-display text-3xl">My Tables</h1>
        <p className="mt-1 text-sm text-muted">Only tables assigned to {waiter?.waiter_id}.</p>
      </div>

      <Alert>{error}</Alert>

      {loading ? (
        <Spinner />
      ) : cards.length === 0 ? (
        <EmptyState title="No tables assigned" body="Ask the restaurant owner to assign tables to your waiter ID." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map(({ table, session }) => {
            const active = Boolean(session)
            return (
              <div key={table.id} className="flex min-h-[168px] flex-col rounded-[1.6rem] border border-line bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-display text-xl leading-tight">{tableHeading(table)}</p>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                      active ? 'bg-forest/10 text-forest' : 'bg-paper text-muted'
                    }`}
                  >
                    {active ? 'ACTIVE' : 'AVAILABLE'}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted">{table.capacity ? `${table.capacity} seats` : 'Capacity not set'}</p>
                <p className="mt-1 text-sm text-muted">
                  {waiter.full_name} · <span className="font-mono">{waiter.waiter_id}</span>
                </p>
                {active ? (
                  <p className="mt-1 text-xs text-muted">
                    {session.session_number} · {formatClock(session.started_at)}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-muted">No open session</p>
                )}
                <div className="mt-auto pt-4">
                  <Button className="w-full" disabled={busyId === table.id} onClick={() => onOpen(table, session)}>
                    {busyId === table.id ? 'Opening...' : active ? 'Open Order' : 'Open Table'}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
