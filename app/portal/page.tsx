import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getPortalClientId } from '@/lib/portal/server'
import { loadPortalOverview, type PortalOverview } from '@/lib/portal/data'
import { PortalLogoutButton } from './PortalLogoutButton'
import { ContactCoachCard } from './ContactCoachCard'
import { FrameworksCard } from './FrameworksCard'
import { InfoPopover } from './InfoPopover'
import { PortalOnboarding } from './PortalOnboarding'

export const dynamic = 'force-dynamic'

function Card({ title, info, children }: { title: string; info?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-[1.5px] text-tlw-navy-rich">{title}</h2>
        {info && <InfoPopover label={title} text={info} />}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] text-tlw-warm-gray">{children}</p>
}

function fmtDateTime(iso: string, tz: string | null): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: tz || undefined,
    }).format(new Date(iso))
  } catch {
    return new Date(iso).toLocaleString('en-US')
  }
}

function fmtDate(ymd: string | null): string {
  if (!ymd) return ''
  const d = new Date(ymd + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Same short form, for a full timestamp (when a note was sent). */
function fmtSentDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default async function PortalHome() {
  const clientId = await getPortalClientId()
  if (!clientId) redirect('/portal/login')

  const data: PortalOverview | null = await loadPortalOverview(clientId)
  if (!data) redirect('/portal/login')

  const firstName = (data.client.name || '').split(' ')[0] || 'there'

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <PortalOnboarding />
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">
          theLeadershipWell
        </p>
        <PortalLogoutButton />
      </div>

      <h1 className="mt-8 text-[24px] font-medium text-tlw-navy-deep">Welcome, {firstName}.</h1>

      {/* Booking sits at the top — for most clients this is why they came. */}
      {data.bookingUrl && (
        <a
          href={data.bookingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 flex items-center justify-between rounded-tlw-2xl bg-tlw-navy-deep px-5 py-4 text-white transition-opacity hover:opacity-90"
        >
          <span className="text-[15px] font-medium">Schedule your next session</span>
          <span className="text-[18px] text-tlw-signal-orange" aria-hidden>
            →
          </span>
        </a>
      )}

      <form action="/portal/search" className="mt-6">
        <input
          name="q"
          placeholder="Search your sessions and notes…"
          className="w-full rounded-tlw-lg border border-tlw-warm-gray/25 bg-tlw-surface px-4 py-2.5 text-[14px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
        />
      </form>

      <a
        href="/portal/chat"
        className="mt-6 flex items-center justify-between rounded-tlw-2xl border border-tlw-navy-rich/20 bg-tlw-navy-rich/5 p-5 transition-colors hover:bg-tlw-navy-rich/10"
      >
        <div>
          <p className="text-[15px] font-medium text-tlw-navy-deep">Chat with your coaching assistant</p>
          <p className="mt-0.5 text-[13px] text-tlw-warm-gray">
            Reflect on your goals and sessions, anytime.
          </p>
        </div>
        <span className="text-[20px] text-tlw-signal-orange" aria-hidden>
          →
        </span>
      </a>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Upcoming sessions */}
        <Card
          title="Upcoming sessions"
          info="Your booked coaching sessions. Use “Schedule your next session” up top to book another."
        >
          {data.appointments.length === 0 ? (
            <Empty>No upcoming session scheduled yet.</Empty>
          ) : (
            <ul className="space-y-1.5">
              {data.appointments.map((a, i) => (
                <li
                  key={a.id}
                  className={i === 0 ? 'text-[15px] text-tlw-espresso' : 'text-[13px] text-tlw-espresso'}
                >
                  {fmtDateTime(a.scheduled_at, data.client.timezone)}
                  <span className="text-tlw-warm-gray"> · {a.duration_minutes} min</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Coaching goals */}
        <Card title="Your coaching goals" info="The goals you and your coach are working on. Revisit them anytime to stay focused.">
          {data.goals.length === 0 ? (
            <Empty>Your goals will appear here once set with your coach.</Empty>
          ) : (
            <ul className="space-y-3">
              {data.goals.map((g, i) => (
                <li key={i}>
                  <p className="text-[14px] font-medium text-tlw-navy-deep">{g.title}</p>
                  {g.description && (
                    <p className="mt-0.5 text-[13px] text-tlw-espresso">{g.description}</p>
                  )}
                  {g.metrics && g.metrics.filter(Boolean).length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {g.metrics.filter(Boolean).map((m, j) => (
                        <li key={j} className="text-[12px] text-tlw-warm-gray">— {m}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Session records — each opens the full transcript */}
        <Card
          title="Your sessions"
          info="A record of your past sessions. Open one to read it in full, or search up top to find a moment."
        >
          {data.transcripts.length === 0 ? (
            <Empty>Your session records will appear here.</Empty>
          ) : (
            <ul className="space-y-1.5">
              {data.transcripts.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/portal/sessions/${t.id}`}
                    className="flex items-baseline justify-between gap-3 rounded-tlw-md px-1 py-0.5 -mx-1 transition-colors hover:bg-tlw-canvas"
                  >
                    <span className="min-w-0 truncate text-[13px] text-tlw-espresso">
                      {t.title || 'Session'}
                    </span>
                    <span className="shrink-0 text-[12px] text-tlw-warm-gray">{fmtDate(t.session_date)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Session notes the coach sent — each opens the full note */}
        <Card
          title="Your session notes"
          info="The notes your coach sent you after a session. Open one to read it in full."
        >
          {data.sessionNotes.length === 0 ? (
            <Empty>Notes your coach sends you after a session will appear here.</Empty>
          ) : (
            <ul className="space-y-2.5">
              {data.sessionNotes.map((n) => (
                <li key={n.id}>
                  <Link
                    href={`/portal/notes/${n.id}`}
                    className="block rounded-tlw-md px-1 py-0.5 -mx-1 transition-colors hover:bg-tlw-canvas"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="min-w-0 truncate text-[13px] font-medium text-tlw-navy-deep">
                        {n.subject || 'Session notes'}
                      </p>
                      <span className="shrink-0 text-[12px] text-tlw-warm-gray">
                        {fmtSentDate(n.sent_at)}
                      </span>
                    </div>
                    {n.preview && (
                      <p className="mt-0.5 line-clamp-2 text-[12px] text-tlw-warm-gray">{n.preview}</p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Everything else the coach sent */}
        <Card title="Messages from your coach" info="Other emails and nudges your coach has sent you.">
          {data.messages.length === 0 ? (
            <Empty>Messages your coach sends you will appear here.</Empty>
          ) : (
            <ul className="space-y-2.5">
              {data.messages.map((m) => (
                <li key={m.id}>
                  <p className="text-[13px] font-medium text-tlw-navy-deep">{m.subject || 'Message'}</p>
                  {m.preview && (
                    <p className="mt-0.5 line-clamp-2 text-[12px] text-tlw-warm-gray">{m.preview}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Frameworks surfaced to this client (self-hides when none) */}
        <div className="lg:col-span-2">
          <FrameworksCard />
        </div>

        {/* Contact your coach — interactive */}
        <div className="lg:col-span-2">
          <ContactCoachCard />
        </div>
      </div>
    </div>
  )
}
