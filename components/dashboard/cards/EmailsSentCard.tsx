'use client'
/**
 * Emails Sent card — the coach's outbound communications log across all clients.
 * Sizes:
 *   compact   → count sent this week + "View all" link
 *   standard  → week count + last ~4 rows; each row navigates to the client's
 *               workspace communication card (+ Gmail icon if available)
 *   expanded  → full scrollable list, same click behavior
 *
 * "View all" (compact/standard) opens a modal listing every email. Clicking a
 * row there navigates to the client workspace; a mail icon opens Gmail directly.
 */
import { useState } from 'react'
import Link from 'next/link'
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

function gmailUrl(id: string): string {
  return `https://mail.google.com/mail/u/0/#all/${id}`
}

/** A single email row. Clicking navigates to the client workspace; a mail icon
 *  opens the message in Gmail when we have a message id. */
function Row({ it, onClick }: { it: EmailItem; onClick?: () => void }) {
  const failed = it.status === 'failed'

  const inner = (
    <div className="flex min-w-0 flex-1 items-start gap-2.5">
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
      </div>
    </div>
  )

  return (
    <div className="group flex items-center gap-1">
      {it.clientId ? (
        <Link
          href={`/clients/${it.clientId}`}
          onClick={onClick}
          className="flex min-w-0 flex-1 rounded-tlw-lg px-2 py-1.5 transition-colors hover:bg-tlw-canvas"
        >
          {inner}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 rounded-tlw-lg px-2 py-1.5">{inner}</div>
      )}
      {it.gmailMessageId && (
        <a
          href={gmailUrl(it.gmailMessageId)}
          target="_blank"
          rel="noopener noreferrer"
          title="Open in Gmail"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 rounded-md px-1.5 py-1 text-[13px] leading-none text-tlw-warm-gray opacity-0 transition-all hover:bg-tlw-warm-gray/15 hover:text-tlw-espresso group-hover:opacity-100"
        >
          ↗
        </a>
      )}
    </div>
  )
}

/** Full-list modal — all emails, each row navigating to the client workspace. */
function ListModal({ items, onClose }: { items: EmailItem[]; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-tlw-navy-deep/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="All sent emails"
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-tlw-2xl bg-tlw-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-tlw-warm-gray/15 px-5 py-4">
          <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">Emails sent</p>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md px-1.5 py-1 text-[14px] leading-none text-tlw-warm-gray transition-colors hover:bg-tlw-warm-gray/15 hover:text-tlw-espresso"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto px-3 py-3">
          {items.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-tlw-warm-gray">No emails sent yet.</p>
          ) : (
            <div className="space-y-0.5">
              {items.map((it) => (
                <Row key={it.id} it={it} onClick={onClose} />
              ))}
            </div>
          )}
        </div>
        <p className="border-t border-tlw-warm-gray/15 px-5 py-3 text-[11px] text-tlw-warm-gray">
          Click a row to open that client&apos;s workspace · ↗ opens in Gmail
        </p>
      </div>
    </div>
  )
}

function Count({ n, onViewAll }: { n: number; onViewAll: () => void }) {
  return (
    <div>
      <p className="text-[30px] font-medium leading-none text-tlw-navy-deep">{n}</p>
      <p className="mt-2 text-[11px] text-tlw-warm-gray">sent this week</p>
      <button
        onClick={onViewAll}
        className="mt-2 text-[12px] font-medium text-tlw-signal-orange hover:underline"
      >
        View all →
      </button>
    </div>
  )
}

function EmailsSent({ size, data }: { size: CardSize; data: EmailsData }) {
  const [showModal, setShowModal] = useState(false)

  if (data.loading) return <div className="h-16 animate-pulse rounded-tlw-lg bg-tlw-canvas/70" />
  if (data.error || !data.emails) return <p className="text-[13px] text-tlw-warm-gray">Couldn&apos;t load emails.</p>

  const { weekCount, items } = data.emails

  const modal = showModal && (
    <ListModal items={items} onClose={() => setShowModal(false)} />
  )

  if (size === 'compact') {
    return (
      <>
        <Count n={weekCount} onViewAll={() => setShowModal(true)} />
        {modal}
      </>
    )
  }

  if (items.length === 0) {
    return (
      <>
        <Count n={weekCount} onViewAll={() => setShowModal(true)} />
        <div className="mt-3 flex min-h-[80px] flex-col items-center justify-center border-t border-tlw-warm-gray/15 pt-3 text-center">
          <p className="text-[13px] text-tlw-warm-gray">No emails sent yet.</p>
          <p className="mt-1 text-[12px] text-tlw-warm-gray">Sends from the app appear here.</p>
        </div>
        {modal}
      </>
    )
  }

  if (size === 'standard') {
    return (
      <>
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <Count n={weekCount} onViewAll={() => setShowModal(true)} />
          </div>
          <div className="mt-3 space-y-0.5 border-t border-tlw-warm-gray/15 pt-2">
            {items.slice(0, 4).map((it) => (
              <Row key={it.id} it={it} />
            ))}
            {items.length > 4 && (
              <button
                onClick={() => setShowModal(true)}
                className="mt-1 px-2 text-[12px] font-medium text-tlw-warm-gray hover:text-tlw-espresso"
              >
                +{items.length - 4} more
              </button>
            )}
          </div>
        </div>
        {modal}
      </>
    )
  }

  // expanded
  return (
    <>
      <div className="flex h-full flex-col">
        <Count n={weekCount} onViewAll={() => setShowModal(true)} />
        <div className="mt-3 max-h-72 space-y-0.5 overflow-y-auto border-t border-tlw-warm-gray/15 pt-2 pr-1">
          {items.map((it) => (
            <Row key={it.id} it={it} />
          ))}
        </div>
      </div>
      {modal}
    </>
  )
}

export const emailsSentCard: DashboardCard<EmailsData> = {
  ...CARD_META['emails-sent'],
  useData: useEmailsData,
  render: ({ size, data }) => <EmailsSent size={size} data={data} />,
}
