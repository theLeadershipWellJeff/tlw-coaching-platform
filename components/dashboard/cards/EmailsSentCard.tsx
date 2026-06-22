'use client'
/**
 * Emails Sent card — the coach's outbound communications log across all clients.
 * Read-only: a row with a Gmail message id deep-links to that message in Gmail
 * (per the resolved decision — no in-app body view). Sizes (brief §5):
 *   compact   → count sent this week
 *   standard  → week count + last ~4 (recipient · subject · time)
 *   expanded  → scrollable full list with status; click a row → Gmail
 */
import { CARD_META } from '@/lib/dashboard/cards'
import { useEmailsData, type EmailItem, type EmailsData } from '@/lib/dashboard/useEmailsData'
import type { CardSize, DashboardCard } from '@/lib/dashboard/types'

const ICONS: Record<string, string> = { email: '✉', reminder: '🔔', prep_sheet: '📄' }

function label(it: EmailItem): string {
  if (it.subject && it.subject.trim()) return it.subject
  if (it.type === 'reminder') return 'Reminder'
  if (it.type === 'prep_sheet') return 'Prep sheet'
  return 'Email'
}

function relTime(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min${min === 1 ? '' : 's'} ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`
  const day = Math.round(hr / 24)
  if (day < 7) return `${day} day${day === 1 ? '' : 's'} ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Best-effort deep link to the message in the coach's own Gmail. `u/0` targets
// the first signed-in account (the standard Gmail web convention).
function gmailUrl(id: string): string {
  return `https://mail.google.com/mail/u/0/#all/${id}`
}

function Row({ it, showPreview }: { it: EmailItem; showPreview?: boolean }) {
  const failed = it.status === 'failed'
  const inner = (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 shrink-0 text-[13px] leading-none">{ICONS[it.type] || '✉'}</span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2">
          <span className="min-w-0 truncate text-[13px] text-tlw-navy-deep">{label(it)}</span>
          {failed && (
            <span className="shrink-0 rounded-full bg-red-50 px-1.5 py-[1px] text-[10px] font-medium text-red-700">
              failed
            </span>
          )}
        </p>
        <p className="truncate text-[12px] text-tlw-warm-gray">
          {it.clientName} · {relTime(it.sentAt)}
        </p>
        {showPreview && it.preview && (
          <p className="mt-0.5 truncate text-[12px] text-tlw-warm-gray">{it.preview}</p>
        )}
      </div>
    </div>
  )
  if (it.gmailMessageId) {
    return (
      <a
        href={gmailUrl(it.gmailMessageId)}
        target="_blank"
        rel="noopener noreferrer"
        title="Open in Gmail"
        className="block rounded-tlw-lg px-2 py-1.5 transition-colors hover:bg-tlw-canvas"
      >
        {inner}
      </a>
    )
  }
  return <div className="rounded-tlw-lg px-2 py-1.5">{inner}</div>
}

function Count({ n }: { n: number }) {
  return (
    <div>
      <p className="text-[30px] font-medium leading-none text-tlw-navy-deep">{n}</p>
      <p className="mt-2 text-[11px] text-tlw-warm-gray">sent this week</p>
    </div>
  )
}

function Empty() {
  return (
    <div className="flex h-full min-h-[80px] flex-col items-center justify-center text-center">
      <p className="text-[13px] text-tlw-warm-gray">No emails sent yet.</p>
      <p className="mt-1 text-[12px] text-tlw-warm-gray">Sends from the app appear here.</p>
    </div>
  )
}

function EmailsSent({ size, data }: { size: CardSize; data: EmailsData }) {
  if (data.loading) return <div className="h-16 animate-pulse rounded-tlw-lg bg-tlw-canvas/70" />
  if (data.error || !data.emails) return <p className="text-[13px] text-tlw-warm-gray">Couldn&apos;t load emails.</p>

  const { weekCount, items } = data.emails

  if (size === 'compact') return <Count n={weekCount} />

  if (items.length === 0) {
    return (
      <div>
        <Count n={weekCount} />
        <div className="mt-3 border-t border-tlw-warm-gray/15 pt-3">
          <Empty />
        </div>
      </div>
    )
  }

  if (size === 'standard') {
    return (
      <div>
        <Count n={weekCount} />
        <div className="mt-3 space-y-0.5 border-t border-tlw-warm-gray/15 pt-2">
          {items.slice(0, 4).map((it) => (
            <Row key={it.id} it={it} />
          ))}
        </div>
      </div>
    )
  }

  // expanded
  return (
    <div className="flex h-full flex-col">
      <Count n={weekCount} />
      <div className="mt-3 max-h-72 space-y-0.5 overflow-y-auto border-t border-tlw-warm-gray/15 pt-2 pr-1">
        {items.map((it) => (
          <Row key={it.id} it={it} showPreview />
        ))}
      </div>
    </div>
  )
}

export const emailsSentCard: DashboardCard<EmailsData> = {
  ...CARD_META['emails-sent'],
  useData: useEmailsData,
  render: ({ size, data }) => <EmailsSent size={size} data={data} />,
}
