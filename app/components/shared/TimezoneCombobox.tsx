'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { COMMON_TIMEZONES } from '@/lib/scheduling'
import {
  searchTimezoneOptions,
  optionForZone,
  gmtOffsetLabel,
  cityOf,
  zoneLabel,
  type TzOption,
} from '@/lib/timezones'

type Group = { label: string | null; options: TzOption[] }

/**
 * A searchable timezone picker. Type a city ("Mumbai", "Dallas", "London") and
 * it resolves to the IANA zone — searching a curated list of major world cities
 * plus every IANA zone — showing each option's current GMT offset. When the box
 * is empty it surfaces a **Favorites** group (passed in — e.g. the zones the
 * coach already uses) over a Common list, so the usual picks are one click away
 * and the long zone list never has to be scrolled. Stores the IANA zone string.
 */
export function TimezoneCombobox({
  value,
  onChange,
  label,
  favorites = [],
  allowEmpty = true,
  placeholder = 'Type a city or zone…',
  disabled = false,
}: {
  value: string
  // Receives the IANA zone plus the picked city label (e.g. "Austin"), so the
  // caller can store the label and show it back instead of the zone's canonical
  // city. A cleared selection passes ('', undefined).
  onChange: (zone: string, label?: string) => void
  // A stored custom display city for the current value — overrides the zone's
  // representative city in the closed-input label (e.g. show "Austin" not "Chicago").
  label?: string
  favorites?: string[]
  allowEmpty?: boolean
  placeholder?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)

  // Favorites (de-duped) then Common (minus favorites), as options.
  const favOptions = useMemo(() => {
    const seen = new Set<string>()
    const out: TzOption[] = []
    for (const z of favorites) {
      if (!z || seen.has(z)) continue
      seen.add(z)
      out.push(optionForZone(z))
    }
    return out
  }, [favorites])

  const commonOptions = useMemo(() => {
    const favZones = new Set(favOptions.map((o) => o.zone))
    return COMMON_TIMEZONES.filter((z) => !favZones.has(z)).map(optionForZone)
  }, [favOptions])

  const groups: Group[] = useMemo(() => {
    if (query.trim()) return [{ label: null, options: searchTimezoneOptions(query) }]
    return [
      ...(favOptions.length ? [{ label: 'Favorites', options: favOptions }] : []),
      { label: 'Common', options: commonOptions },
    ]
  }, [query, favOptions, commonOptions])

  const flat = useMemo(() => groups.flatMap((g) => g.options), [groups])

  useEffect(() => setActive(0), [query])

  // Close on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function choose(opt: TzOption | null) {
    onChange(opt?.zone ?? '', opt?.label)
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

  // The city shown for the current value: the stored custom label (e.g. "Austin")
  // when set, else the zone's representative city.
  const currentCity = label || (value ? optionForZone(value).label : '')
  // What the input shows: the live query while open, else the current selection.
  const display = open ? query : value ? `${currentCity} — ${gmtOffsetLabel(value)}` : ''

  let idx = -1 // running index into the flat list, for highlight matching
  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={display}
          disabled={disabled}
          placeholder={placeholder}
          title={value ? zoneLabel(value) : undefined}
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
            onClick={() => choose(null)}
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
                {g.label && g.options.length > 0 && (
                  <p className="sticky top-0 bg-tlw-canvas/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-[1.5px] text-tlw-warm-gray">
                    {g.label}
                  </p>
                )}
                {g.options.map((opt) => {
                  idx++
                  const isActive = idx === active
                  const isSelected = opt.zone === value
                  return (
                    <button
                      key={`${opt.label}|${opt.zone}`}
                      type="button"
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => choose(opt)}
                      className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-[13px] ${
                        isActive ? 'bg-blue-50' : 'bg-white'
                      } ${isSelected ? 'font-medium text-tlw-navy-rich' : 'text-tlw-espresso'}`}
                    >
                      <span className="min-w-0 truncate">
                        {opt.label}
                        {opt.sublabel && (
                          <span className="ml-1.5 text-[11px] text-tlw-warm-gray">{opt.sublabel}</span>
                        )}
                      </span>
                      <span className="shrink-0 text-[11px] tabular-nums text-tlw-warm-gray">
                        {gmtOffsetLabel(opt.zone)}
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

// Re-exported for callers that want the label elsewhere.
export { zoneLabel }
