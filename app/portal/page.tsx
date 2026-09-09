import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getPortalClientId } from '@/lib/portal/server'
import { loadPortalOverview, type PortalOverview } from '@/lib/portal/data'
import { PortalLogoutButton } from './PortalLogoutButton'
import { ContactCoachCard } from './ContactCoachCard'
import { FrameworksCard } from './FrameworksCard'
import { InfoPopover } from './InfoPopover'
import { PortalShell } from './PortalShell'
import { BillingCard } from './BillingCard'
import { AssessmentCard } from './AssessmentCard'
import { ContactSupportCard } from './ContactSupportCard'
import { PortalGoalsCard } from './PortalGoalsCard'
import { DocumentsCard } from './DocumentsCard'
import { WeeklyPlanCard } from './WeeklyPlanCard'
import { MyNotesCard } from './MyNotesCard'

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

  const firstName = data.displayName

  // Presence-aware layout (assessment debrief, Phase 3). A client with a coach
  // sees today's portal exactly; a card that can only ever be empty for a
  // coach-less participant is not rendered at all. Never keyed on client_type.
  const { hasCoach, assessmentsEnabled } = data
  const showSessions = hasCoach || data.appointments.length > 0
  const showTranscripts = hasCoach || data.transcripts.length > 0
  const showNotes = hasCoach || data.sessionNotes.length > 0
  const showMessages = hasCoach || data.messages.length > 0

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">
          theLeadershipWell
        </p>
        <div className="flex items-center gap-4">
          <a
            href="/portal/settings"
            className="text-[12px] font-medium text-tlw-warm-gray hover:text-tlw-espresso"
          >
            Settings
          </a>
          <PortalLogoutButton />
        </div>
      </div>
      <PortalShell
        onboarded={data.onboarded}
        hasCoach={hasCoach}
        assessmentsEnabled={assessmentsEnabled}
        hasBooking={Boolean(data.bookingUrl)}
      />

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

      {/* Your 360 report — first thing a participant sees, whenever the flag is on */}
      {assessmentsEnabled && (
        <div className="mt-6">
          <AssessmentCard bookingUrl={data.bookingUrl} />
        </div>
      )}

      <form action="/portal/search" className="mt-6">
        <input
          name="q"
          placeholder="Search your sessions and notes…"
          className="w-full rounded-tlw-lg border border-tlw-warm-gray/25 bg-tlw-surface px-4 py-2.5 text-[14px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
        />
      </form>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <a
          href="/portal/chat"
          className="flex items-center justify-between rounded-tlw-2xl border border-tlw-navy-rich/20 bg-tlw-navy-rich/5 p-5 transition-colors hover:bg-tlw-navy-rich/10"
        >
          <div>
            <p className="text-[15px] font-medium text-tlw-navy-deep">
              {hasCoach ? 'Chat with your coaching assistant' : 'Chat with your thinking partner'}
            </p>
            <p className="mt-0.5 text-[13px] text-tlw-warm-gray">
              {hasCoach ? 'Reflect on your goals, sessions, and documents, anytime.' : 'Work through your report and what comes next, anytime.'}
            </p>
          </div>
          <span className="text-[20px] text-tlw-signal-orange" aria-hidden>
            →
          </span>
        </a>
        <a
          href="/portal/chat?mode=week"
          className="flex items-center justify-between rounded-tlw-2xl border border-tlw-signal-orange/30 bg-tlw-signal-orange/5 p-5 transition-colors hover:bg-tlw-signal-orange/10"
        >
          <div>
            <p className="text-[15px] font-medium text-tlw-navy-deep">Plan your week</p>
            <p className="mt-0.5 text-[13px] text-tlw-warm-gray">
              A short coaching conversation that ends in your Top 5 for the week, saved to this page.
            </p>
          </div>
          <span className="text-[20px] text-tlw-signal-orange" aria-hidden>
            →
          </span>
        </a>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* This week's plan — the Top 5 saved from a Plan-your-week chat */}
        <div className="lg:col-span-2">
          <WeeklyPlanCard />
        </div>

        {/* Upcoming sessions */}
        {showSessions && (
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
        )}

        {/* Goals — every client gets the progress card (round 4); coach-written
            wording stays read-only, progress is the client's to report */}
        <PortalGoalsCard
          hasCoach={hasCoach}
          initialGoals={data.goals.map((g, index) => ({ ...g, index, editable: g.author === 'client' }))}
        />

        {/* Session records — each opens the full transcript */}
        {showTranscripts && (
        <Card
          title="Session transcripts"
          info="The transcript of each past session. Open one to read it in full, or search up top to find a moment."
        >
          {data.transcripts.length === 0 ? (
            <Empty>Your session transcripts will appear here.</Empty>
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
        )}

        {/* Session notes the coach sent — each opens the full note */}
        {showNotes && (
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
        )}

        {/* Everything else the coach sent */}
        {showMessages && (
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
        )}

        {/* Documents the client has added — every portal, coach or not */}
        <div className="lg:col-span-2">
          <DocumentsCard hasCoach={hasCoach} />
        </div>

        {/* My notes — the client's private journal; feeds the assistant */}
        <div className="lg:col-span-2">
          <MyNotesCard />
        </div>

        {/* Frameworks surfaced to this client (self-hides when none) */}
        <div className="lg:col-span-2">
          <FrameworksCard />
        </div>

        {/* Billing — self-hides unless this client is their own payer */}
        <div className="lg:col-span-2">
          <BillingCard />
        </div>

        {/* Contact — their coach when someone is coaching them; otherwise a
            theLeadershipWell coach (book on the house scheduler, or a note) */}
        <div className="lg:col-span-2">
          {hasCoach ? <ContactCoachCard /> : <ContactSupportCard bookingUrl={data.bookingUrl} />}
        </div>
      </div>
    </div>
  )
}
