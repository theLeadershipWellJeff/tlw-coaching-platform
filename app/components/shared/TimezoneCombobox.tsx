'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { allTimeZones, COMMON_TIMEZONES } from '@/lib/scheduling'
import { searchTimezones, zoneLabel, gmtOffsetLabel, cityOf } from '@/lib/timezones'

type Group = { label: string | null; zones: string[] }

/**
 * A searchable timezone picker. Type a city ("Dallas", "London") or zone and it
 * resolves to the IANA zone, showing each option's current GMT offset. When the
 * box is empty it surfaces a **Favorites** group (passed in — e.g. the zones the
 * coach already uses) over a Common list, so the usual picks are one click away
 * and the long IANA list never has to be scrolled. Stores the IANA zone string.
 */
export function TimezoneCombobox({
  value,
  onChange,
  favorites = [],
  allowEmpty = true,
  placeholder = 'Type a city or zone…',
  disabled = false,
}: {
  value: string
  onChange: (zone: string) => void
  favorites?: string[]
  allowEmpty?: boolean
  placeholder?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const all = useMemo(() => allTimeZones(), [])

  // Favorites first (valid + de-duped), then Common (minus favorites).
  const favs = useMemo(() => favorites.filter((z) => all.includes(z)), [favorites, all])
  const commonRest = useMemo(
    () => COMMON_TIMEZONES.filter((z) => (all.includes(z) || z === 'UTC') && !favs.includes(z)),
    [favs, all]
  )

  const groups: Group[] = useMemo(() => {
    if (query.trim()) return [{ label: null, zones: searchTimezones(query, all).slice(0, 60) }]
    return [
      ...(favs.length ? [{ label: 'Favorites', zones: favs }] : []),
      { label: favs.length ? 'All zones' : 'Common', zones: commonRest },
    ]
  }, [query, all, favs, commonRest])

  // Flat list of selectable zones for keyboard navigation.
  const flat = useMemo(() => groups.flatMap((g) => g.zones), [groups])

  useEffect(() => setActive(0), [query])

  // Close on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function choose(zone: string) {
    onChange(zone)
    setOpen(false)
    setQuery('')
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, flat.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (flat[active]) choose(flat[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  // What the input shows: the live query while open, else the current selection.
  const display = open ? query : value ? `${cityOf(value)} — ${gmtOffsetLabel(value)}` : ''

  let idx = -1 // running index into the flat list, for highlight matching
  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={display}
          disabled={disabled}
          placeholder={placeholder}
          onFocus={() => {
            setOpen(true)
            setQuery('')
          }}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onKeyDown={onKeyDown}
          className="w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-3 py-2 pr-8 text-[13px] text-tlw-espresso outline-none focus:border-tlw-signal-orange disabled:opacity-50"
        />
        {value && allowEmpty && !disabled && (
          <button
            type="button"
            aria-label="Clear timezone"
            onClick={() => choose('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-tlw-warm-gray hover:text-tlw-espresso"
          >
            ×
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-tlw-md border border-tlw-warm-gray/25 bg-white shadow-lg">
          {flat.length === 0 ? (
            <p className="px-3 py-2 text-[12px] text-tlw-warm-gray">No matching timezone.</p>
          ) : (
            groups.map((g, gi) => (
              <div key={gi}>
                {g.label && g.zones.length > 0 && (
                  <p className="sticky top-0 bg-tlw-canvas/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-[1.5px] text-tlw-warm-gray">
                    {g.label}
                  </p>
                )}
                {g.zones.map((zone) => {
                  idx++
                  const isActive = idx === active
                  const isSelected = zone === value
                  return (
                    <button
                      key={zone}
                      type="button"
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => choose(zone)}
                      className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-[13px] ${
                        isActive ? 'bg-blue-50' : 'bg-white'
                      } ${isSelected ? 'font-medium text-tlw-navy-rich' : 'text-tlw-espresso'}`}
                    >
                      <span className="truncate">
                        {cityOf(zone)}
                        <span className="ml-1.5 text-[11px] text-tlw-warm-gray">{zoneRegionSuffix(zone)}</span>
                      </span>
                      <span className="shrink-0 text-[11px] tabular-nums text-tlw-warm-gray">
                        {gmtOffsetLabel(zone)}
                      </span>
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

/** A compact region suffix so duplicate city names stay distinguishable. */
function zoneRegionSuffix(zone: string): string {
  const parts = zone.split('/')
  if (parts.length <= 1) return ''
  // Show the region (and an intermediate segment when present, e.g. Argentina).
  return parts.length > 2 ? `${parts[0]} · ${parts[1].replace(/_/g, ' ')}` : parts[0]
}

// Re-exported for callers that want the label elsewhere.
export { zoneLabel }
