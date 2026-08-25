'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

type Seg = 'hour' | 'minute' | 'meridiem'
type Pending = { seg: 'hour' | 'minute'; digits: string }

const SEGS: Seg[] = ['hour', 'minute', 'meridiem']
const WHEEL_STEP = 40 // accumulated deltaY per step — keeps trackpads from over-spinning
const DRAG_STEP = 24 // px of touch drag per step
const TYPE_COMMIT_MS = 1200

/**
 * iOS-style time control: hour / minute / AM-PM segments the coach can TYPE
 * into or SCROLL (mouse wheel, or touch drag). The hour spins on the full-day
 * continuum — scrolling past 11 AM rolls into 12 PM — so the meridiem moves
 * with the hour instead of being a separate step (it stays clickable to flip
 * directly). Minutes scroll on a 5-minute grid; typing sets exact minutes.
 * Value in/out is the 24h "HH:MM" string a native <input type="time"> uses
 * ('' = unset), so callers swap in without changing their state or API calls.
 */
export function TimeWheelInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const hourRef = useRef<HTMLSpanElement>(null)
  const minuteRef = useRef<HTMLSpanElement>(null)
  const meridiemRef = useRef<HTMLSpanElement>(null)

  const [pending, setPending] = useState<Pending | null>(null)
  const pendingRef = useRef<Pending | null>(null)
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wheelAcc = useRef(0)

  const parsed = parseValue(value)

  const set = useCallback((h: number, m: number) => onChange(formatValue(h, m)), [onChange])

  function setPendingBoth(p: Pending | null) {
    pendingRef.current = p
    setPending(p)
  }
  function clearTimer() {
    if (commitTimer.current) clearTimeout(commitTimer.current)
    commitTimer.current = null
  }

  const base = () => parsed ?? nextHalfHour()

  function commitHour(h12: number) {
    const b = base()
    set((h12 % 12) + (b.h >= 12 ? 12 : 0), b.m)
  }
  function commitMinute(m: number) {
    const b = base()
    set(b.h, m)
  }
  function setMeridiem(pm: boolean) {
    const b = base()
    set((b.h % 12) + (pm ? 12 : 0), b.m)
  }

  const applyStep = useCallback(
    (seg: Seg, dir: 1 | -1) => {
      if (!parsed) {
        // First spin on an empty picker lands on a sensible starting point.
        const b = nextHalfHour()
        set(b.h, b.m)
        return
      }
      if (seg === 'hour') {
        // 24h continuum: 11:30 AM +1 → 12:30 PM, 11 PM +1 → 12 AM. The
        // meridiem follows the hour instead of being its own step.
        set((parsed.h + dir + 24) % 24, parsed.m)
      } else if (seg === 'minute') {
        const snapped = dir === 1 ? Math.floor(parsed.m / 5) * 5 + 5 : Math.ceil(parsed.m / 5) * 5 - 5
        set(parsed.h, (snapped + 60) % 60)
      } else {
        set((parsed.h + 12) % 24, parsed.m)
      }
    },
    [parsed, set]
  )

  function focusSeg(seg: Seg) {
    const ref = seg === 'hour' ? hourRef : seg === 'minute' ? minuteRef : meridiemRef
    ref.current?.focus()
  }

  function commitPending() {
    const cur = pendingRef.current
    if (!cur) return
    const n = Number(cur.digits)
    if (cur.seg === 'hour') {
      if (n >= 1 && n <= 12) commitHour(n)
    } else {
      commitMinute(n)
    }
    setPendingBoth(null)
  }

  function armTimer() {
    clearTimer()
    commitTimer.current = setTimeout(commitPending, TYPE_COMMIT_MS)
  }

  function typeDigit(seg: 'hour' | 'minute', d: string) {
    clearTimer()
    const cur = pendingRef.current
    if (seg === 'hour') {
      if (cur?.seg === 'hour') {
        const combined = Number(cur.digits + d)
        if (combined >= 1 && combined <= 12) {
          commitHour(combined)
          setPendingBoth(null)
          focusSeg('minute')
        } else {
          // "1" then "5": the 1 is the hour, the 5 starts the minutes.
          if (Number(cur.digits) >= 1) commitHour(Number(cur.digits))
          setPendingBoth(null)
          focusSeg('minute')
          typeDigit('minute', d)
        }
        return
      }
      if (d === '0' || d === '1') {
        setPendingBoth({ seg: 'hour', digits: d })
        armTimer()
        return
      }
      commitHour(Number(d))
      focusSeg('minute')
      return
    }
    if (cur?.seg === 'minute') {
      commitMinute(Number(cur.digits + d))
      setPendingBoth(null)
      focusSeg('meridiem')
      return
    }
    if (Number(d) <= 5) {
      setPendingBoth({ seg: 'minute', digits: d })
      armTimer()
      return
    }
    commitMinute(Number(d))
    focusSeg('meridiem')
  }

  function handleKeyDown(seg: Seg) {
    return (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        commitPending()
        applyStep(seg, 1)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        commitPending()
        applyStep(seg, -1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        commitPending()
        focusSeg(SEGS[Math.min(SEGS.indexOf(seg) + 1, 2)])
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        commitPending()
        focusSeg(SEGS[Math.max(SEGS.indexOf(seg) - 1, 0)])
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        clearTimer()
        setPendingBoth(null)
        onChange('')
      } else if (seg === 'meridiem') {
        if (e.key === 'a' || e.key === 'A') setMeridiem(false)
        else if (e.key === 'p' || e.key === 'P') setMeridiem(true)
      } else if (/^[0-9]$/.test(e.key)) {
        e.preventDefault()
        typeDigit(seg, e.key)
      }
    }
  }

  // Wheel + touch-drag spinning. Attached natively (not via React's onWheel)
  // because React registers wheel/touch listeners as passive, so
  // preventDefault — needed to keep the page from scrolling under the
  // spinner — would be ignored.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const segFrom = (t: EventTarget | null): Seg | null =>
      ((t as HTMLElement | null)?.closest?.('[data-seg]')?.getAttribute('data-seg') as Seg) || null

    const onWheel = (e: WheelEvent) => {
      const seg = segFrom(e.target)
      if (!seg) return
      e.preventDefault()
      wheelAcc.current += e.deltaY
      while (Math.abs(wheelAcc.current) >= WHEEL_STEP) {
        const dir = wheelAcc.current > 0 ? 1 : -1
        wheelAcc.current -= dir * WHEEL_STEP
        applyStep(seg, dir)
      }
    }

    let touch: { seg: Seg; y: number } | null = null
    const onTouchStart = (e: TouchEvent) => {
      const seg = segFrom(e.target)
      if (seg) touch = { seg, y: e.touches[0].clientY }
    }
    const onTouchMove = (e: TouchEvent) => {
      if (!touch) return
      e.preventDefault()
      const dy = touch.y - e.touches[0].clientY // drag up → later, like the iOS wheel
      const steps = Math.trunc(dy / DRAG_STEP)
      if (steps !== 0) {
        for (let i = 0; i < Math.abs(steps); i++) applyStep(touch.seg, steps > 0 ? 1 : -1)
        touch.y -= steps * DRAG_STEP
      }
    }
    const onTouchEnd = () => {
      touch = null
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [applyStep])

  useEffect(() => () => clearTimer(), [])

  const hourText =
    pending?.seg === 'hour' ? pending.digits : parsed ? String(parsed.h % 12 || 12) : '–'
  const minuteText =
    pending?.seg === 'minute'
      ? pending.digits
      : parsed
        ? String(parsed.m).padStart(2, '0')
        : '––'
  const meridiemText = parsed ? (parsed.h >= 12 ? 'PM' : 'AM') : '––'

  const segClass =
    'cursor-ns-resize rounded px-1 py-0.5 tabular-nums outline-none transition-colors focus:bg-tlw-signal-orange/20 focus:text-tlw-espresso'

  return (
    <div
      ref={containerRef}
      role="group"
      aria-label="Time"
      title="Type the time, or scroll to spin it — AM/PM follows the hour"
      className="flex w-fit select-none items-center rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-1.5 py-1.5 text-[14px] text-tlw-espresso focus-within:border-tlw-signal-orange"
    >
      <span
        ref={hourRef}
        data-seg="hour"
        tabIndex={0}
        role="spinbutton"
        aria-label="Hour"
        aria-valuenow={parsed ? parsed.h % 12 || 12 : undefined}
        onKeyDown={handleKeyDown('hour')}
        onBlur={commitPending}
        className={`${segClass} min-w-[24px] text-right`}
      >
        {hourText}
      </span>
      <span className="px-px text-tlw-warm-gray">:</span>
      <span
        ref={minuteRef}
        data-seg="minute"
        tabIndex={0}
        role="spinbutton"
        aria-label="Minutes"
        aria-valuenow={parsed?.m}
        onKeyDown={handleKeyDown('minute')}
        onBlur={commitPending}
        className={`${segClass} min-w-[26px]`}
      >
        {minuteText}
      </span>
      <span
        ref={meridiemRef}
        data-seg="meridiem"
        tabIndex={0}
        role="spinbutton"
        aria-label="AM or PM"
        aria-valuetext={meridiemText}
        onKeyDown={handleKeyDown('meridiem')}
        onClick={() => (parsed ? setMeridiem(parsed.h < 12) : set(nextHalfHour().h, nextHalfHour().m))}
        className={`${segClass} ml-1 cursor-pointer text-[12px] font-medium text-tlw-warm-gray focus:text-tlw-espresso`}
      >
        {meridiemText}
      </span>
    </div>
  )
}

function parseValue(value: string): { h: number; m: number } | null {
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(value)
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (h > 23 || m > 59) return null
  return { h, m }
}

function formatValue(h: number, m: number) {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// An empty picker's first interaction starts at the next half-hour from now
// (the coach's browser clock), not midnight.
function nextHalfHour(): { h: number; m: number } {
  const now = new Date()
  if (now.getMinutes() < 30) return { h: now.getHours(), m: 30 }
  return { h: (now.getHours() + 1) % 24, m: 0 }
}
