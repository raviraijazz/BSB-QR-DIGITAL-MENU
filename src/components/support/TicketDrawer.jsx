import { useEffect, useState } from 'react'
import Alert from '../Alert'
import Button from '../Button'
import Field, { inputClass } from '../Field'
import NavIcon from '../NavIcon'
import Spinner from '../Spinner'
import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  catalogLabel,
  formatSupportDateTime,
  priorityTone,
  statusTone,
} from '../../lib/supportCatalog'
import { addTicketReply, listTicketReplies, updateSupportTicketStatus } from '../../services/support'

export default function TicketDrawer({ ticket, restaurant, user, onClose, onUpdated }) {
  const [replies, setReplies] = useState([])
  const [busy, setBusy] = useState(false)
  const [reply, setReply] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const timeZone = restaurant?.timezone || 'Asia/Kolkata'

  useEffect(() => {
    let active = true
    async function load() {
      if (!ticket?.id || !restaurant?.id) {
        setReplies([])
        return
      }
      setBusy(true)
      setError('')
      const result = await listTicketReplies(restaurant.id, ticket.id)
      if (!active) return
      setReplies(result.data || [])
      setError(result.error?.message || '')
      setBusy(false)
    }
    load()
    function onKey(event) {
      if (event.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      active = false
      window.removeEventListener('keydown', onKey)
    }
  }, [ticket?.id, restaurant?.id, onClose])

  if (!ticket) return null

  async function sendReply() {
    setError('')
    setNotice('')
    const result = await addTicketReply(restaurant.id, ticket.id, user?.id, reply)
    if (result.error) {
      setError(result.error.message)
      return
    }
    setReply('')
    setReplies((rows) => [...rows, result.data])
    setNotice('Reply saved.')
    onUpdated?.()
  }

  async function setStatus(status) {
    setError('')
    const result = await updateSupportTicketStatus(restaurant.id, ticket.id, status)
    if (result.error) {
      setError(result.error.message)
      return
    }
    setNotice(status === 'closed' ? 'Ticket closed.' : 'Ticket reopened.')
    onUpdated?.(result.data)
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/30">
      <button type="button" aria-label="Close ticket" className="h-full flex-1" onClick={onClose} />
      <aside className="flex h-full w-full max-w-lg flex-col overflow-hidden border-l border-line bg-card shadow-sm">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.14em] text-muted">{ticket.ticket_number}</p>
            <h2 className="mt-1 font-display text-2xl leading-tight">{ticket.subject}</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className={`rounded-full border px-2 py-0.5 text-[11px] ${statusTone(ticket.status)}`}>
                {catalogLabel(TICKET_STATUSES, ticket.status)}
              </span>
              <span className={`rounded-full border px-2 py-0.5 text-[11px] ${priorityTone(ticket.priority)}`}>
                {catalogLabel(TICKET_PRIORITIES, ticket.priority)}
              </span>
              <span className="rounded-full border border-line px-2 py-0.5 text-[11px]">{catalogLabel(TICKET_CATEGORIES, ticket.category)}</span>
            </div>
          </div>
          <button type="button" aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-paper" onClick={onClose}>
            <NavIcon name="close" className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <Alert>{error}</Alert>
          <Alert type="success">{notice}</Alert>
          <p className="text-sm text-muted">Created {formatSupportDateTime(ticket.created_at, timeZone)} · Updated {formatSupportDateTime(ticket.updated_at, timeZone)}</p>
          <section className="rounded-[16px] border border-line bg-white p-4">
            <h3 className="text-sm font-medium">Description</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm">{ticket.description}</p>
          </section>
          <section className="rounded-[16px] border border-line bg-white p-4">
            <h3 className="text-sm font-medium">Conversation</h3>
            {busy ? <Spinner label="Loading replies..." /> : null}
            {!busy && !replies.length ? <p className="mt-2 text-sm text-muted">No replies yet. Support has not responded.</p> : null}
            <div className="mt-3 space-y-3">
              {replies.map((row) => (
                <div key={row.id} className="rounded-xl border border-line bg-paper px-3 py-2">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-muted">
                    {row.author_role === 'support' ? 'Support' : 'You'} · {formatSupportDateTime(row.created_at, timeZone)}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{row.body}</p>
                </div>
              ))}
            </div>
            <Field label="Reply">
              <textarea className={inputClass} rows={4} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Add information for support" />
            </Field>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={sendReply} disabled={!reply.trim()}>Send reply</Button>
              {ticket.status === 'closed' ? (
                <Button variant="secondary" onClick={() => setStatus('open')}>Reopen</Button>
              ) : (
                <Button variant="secondary" onClick={() => setStatus('closed')}>Close ticket</Button>
              )}
            </div>
            <p className="mt-3 text-[12px] text-muted">Attachments are not configured. File uploads for tickets require a private storage bucket, which is not connected.</p>
          </section>
        </div>
      </aside>
    </div>
  )
}
