'use client'
/**
 * Calendar heat-map card — days color-coded by booked load from Google Calendar
 * (live, read-only). Buckets (brief §8.1): light <2h · medium 2–4h · heavy >4h.
 * Colors stay in the navy/gray family (no Signal Orange), strongest weight for
 * heavy, readable on cream. Sizes (brief §5):
 *   compact   → today's load + a 7-day color strip
 *   standard  → current-month mini-grid
 *   expanded  → full month grid; click a day → that day's sessions
 */
import { useState } from 'react'
import { CARD_META } from '@/lib/dashboard/cards'
import { useCalendarData, type CalendarData, type CalendarPayload } from '@/lib/dashboard/useCalendarData'
import type { CardSize, DashboardCard } from '@/lib/dashboard/types'

type Level = 'none' | 'light' | 'medium' | 'heavy'

function level(hours: number): Level {
  if (hours <= 0) return 'none'
  if (hours < 2) return 'light'
  if (hours <= 4) return 'medium'
  return 'heavy'
}

const CELL: Record<Level, string> = {
  none: 'bg-tlw-canvas',
  light: 'bg-tlw-warm-gray/30',
  medium: 'bg-tlw-navy-rich/60',
  heavy: 'bg-tlw-navy-deep',
}
const NUM: Record<Level, string> = {
  none: 'text-tlw-warm-gray',
  light: 'text-tlw-espresso',
  medium: 'text-white',
  heavy: 'text-white',
}
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function addDayStr(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + n)
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

function weekdayOf(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

function dayOfMonth(ymd: string): number {
  return Number(ymd.split('-')[2])
}

function hoursOf(cal: CalendarPayload, ymd: string): number {
  return cal.days[ymd]?.hours ?? 0
}

function fmtTime(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
  } catch {
    return ''
  }
}

function monthName(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function Legend() {
  return (
    <div className="mt-3 flex items-center gap-3 text-[10px] text-tlw-warm-gray">
      <span className="flex items-center gap-1">
        <span className={`inline-block h-2.5 w-2.5 rounded-sm ${CELL.light}`} /> &lt;2h
      </span>
      <span className="flex items-center gap-1">
        <span className={`inline-block h-2.5 w-2.5 rounded-sm ${CELL.medium}`} /> 2–4h
      </span>
      <span className="flex items-center gap-1">
        <span className={`inline-block h-2.5 w-2.5 rounded-sm ${CELL.heavy}`} /> &gt;4h
      </span>
    </div>
  )
}

/** Month grid of colored day cells. onSelect (expanded) wires day → detail. */
function MonthGrid({
  cal,
  size,
  selected,
  onSelect,
}: {
  cal: CalendarPayload
  size: 'standard' | 'expanded'
  selected?: string
  onSelect?: (ymd: string) => void
}) {
  const monthStart = `${cal.year}-${String(cal.month).padStart(2, '0')}-01`
  const daysInMonth = new Date(Date.UTC(cal.year, cal.month, 0)).getUTCDate()
  const lead = weekdayOf(monthStart)
  const cells: (string | null)[] = []
  for (let i = 0; i < lead; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${monthStart.slice(0, 8)}${String(d).padStart(2, '0')}`)

  const big = size === 'expanded'
  return (
    <div>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="text-center text-[10px] text-tlw-warm-gray">
            {w}
          </div>
        ))}
        {cells.map((ymd, i) => {
          if (!ymd) return <div key={i} />
          const lv = level(hoursOf(cal, ymd))
          const isToday = ymd === cal.today
          const isSel = ymd === selected
          const clickable = !!onSelect
          return (
            <button
              key={i}
              disabled={!clickable}
              onClick={() => onSelect?.(ymd)}
              title={`${ymd} · ${hoursOf(cal, ymd)}h booked`}
              className={`flex items-center justify-center rounded-tlw-sm ${big ? 'h-9' : 'h-7'} ${CELL[lv]} ${NUM[lv]} ${
                isToday ? 'ring-2 ring-tlw-navy-rich ring-offset-1' : ''
              } ${isSel ? 'outline outline-2 outline-tlw-espresso' : ''} ${clickable ? 'cursor-pointer' : 'cursor-default'} text-[11px]`}
            >
              {dayOfMonth(ymd)}
            </button>
          )
        })}
      </div>
      <Legend />
    </div>
  )
}

function NotConnected() {
  return <p className="text-[13px] text-tlw-warm-gray">Connect Google Calendar to see your booked load.</p>
}

function TodayLine({ cal }: { cal: CalendarPayload }) {
  const h = hoursOf(cal, cal.today)
  const lv = level(h)
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-block h-3 w-3 rounded-sm ${CELL[lv === 'none' ? 'light' : lv]}`} />
      <p className="text-[15px] text-tlw-navy-deep">
        <span className="font-medium">{h}h</span> <span className="text-tlw-warm-gray">booked today</span>
      </p>
    </div>
  )
}

function Strip({ cal }: { cal: CalendarPayload }) {
  const days = Array.from({ length: 7 }, (_, i) => addDayStr(cal.today, i))
  return (
    <div className="mt-3 flex gap-1.5">
      {days.map((ymd) => {
        const lv = level(hoursOf(cal, ymd))
        const isToday = ymd === cal.today
        return (
          <div key={ymd} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={`flex h-8 w-full items-center justify-center rounded-tlw-sm ${CELL[lv]} ${NUM[lv]} ${
                isToday ? 'ring-2 ring-tlw-navy-rich' : ''
              } text-[11px]`}
              title={`${ymd} · ${hoursOf(cal, ymd)}h booked`}
            >
              {dayOfMonth(ymd)}
            </div>
            <span className="text-[10px] text-tlw-warm-gray">{WEEKDAYS[weekdayOf(ymd)]}</span>
          </div>
        )
      })}
    </div>
  )
}

function DayDetail({ cal, ymd }: { cal: CalendarPayload; ymd: string }) {
  const load = cal.days[ymd]
  const heading = new Date(ymd + 'T00:00:00Z').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
  const sessions = (load?.sessions || []).slice().sort((a, b) => a.start.localeCompare(b.start))
  return (
    <div className="mt-3 border-t border-tlw-warm-gray/15 pt-3">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">
        {heading} · {load?.hours ?? 0}h
      </p>
      {sessions.length === 0 ? (
        <p className="text-[13px] text-tlw-warm-gray">Nothing booked.</p>
      ) : (
        <ul className="max-h-40 space-y-1 overflow-y-auto pr-1">
          {sessions.map((s, i) => (
            <li key={i} className="flex items-center justify-between gap-3 text-[13px]">
              <span className="min-w-0 truncate text-tlw-espresso">{s.title}</span>
              <span className="shrink-0 text-tlw-warm-gray">{fmtTime(s.start, cal.timezone)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CalendarHeatmap({ size, data }: { size: CardSize; data: CalendarData }) {
  const [selected, setSelected] = useState<string | null>(null)
  if (data.loading) return <div className="h-20 animate-pulse rounded-tlw-lg bg-tlw-canvas/70" />
  if (data.error || !data.calendar) return <p className="text-[13px] text-tlw-warm-gray">Couldn&apos;t load calendar.</p>
  const cal = data.calendar
  if (!cal.calendarConnected) return <NotConnected />

  if (size === 'compact') {
    return (
      <div>
        <TodayLine cal={cal} />
        <Strip cal={cal} />
      </div>
    )
  }

  if (size === 'standard') {
    return (
      <div>
        <p className="mb-2 text-[13px] font-medium text-tlw-navy-deep">{monthName(cal.year, cal.month)}</p>
        <MonthGrid cal={cal} size="standard" />
      </div>
    )
  }

  // expanded
  const sel = selected || cal.today
  return (
    <div>
      <p className="mb-2 text-[13px] font-medium text-tlw-navy-deep">{monthName(cal.year, cal.month)}</p>
      <MonthGrid cal={cal} size="expanded" selected={sel} onSelect={setSelected} />
      <DayDetail cal={cal} ymd={sel} />
    </div>
  )
}

export const calendarHeatmapCard: DashboardCard<CalendarData> = {
  ...CARD_META['calendar'],
  useData: useCalendarData,
  render: ({ size, data }) => <CalendarHeatmap size={size} data={data} />,
}
