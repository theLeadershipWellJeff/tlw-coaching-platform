import { DateTime } from "luxon";

const DAY_MAP: Record<string, number> = {
  mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7,
};

export interface ScheduleSlot {
  day: number;
  hour: number;
  minute: number;
}

export function parseSlot(raw: string): ScheduleSlot {
  const match = raw.trim().match(/^([A-Za-z]{3})\s+(\d{1,2}):(\d{2})$/);
  if (!match) {
    throw new Error(
      `Invalid schedule slot "${raw}". Expected format: "Tue 07:00".`
    );
  }
  const [, dayRaw, hourRaw, minuteRaw] = match;
  const day = DAY_MAP[dayRaw.toLowerCase()];
  if (!day) throw new Error(`Unknown weekday "${dayRaw}" in slot "${raw}"`);
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`Invalid time in slot "${raw}"`);
  }
  return { day, hour, minute };
}

export function nextSlotAfter(
  slot: ScheduleSlot,
  timezone: string,
  reference: DateTime = DateTime.now()
): DateTime {
  let candidate = reference
    .setZone(timezone)
    .set({ hour: slot.hour, minute: slot.minute, second: 0, millisecond: 0 });

  const currentDow = candidate.weekday;
  let daysAhead = (slot.day - currentDow + 7) % 7;

  if (daysAhead === 0 && candidate <= reference.setZone(timezone)) {
    daysAhead = 7;
  }
  candidate = candidate.plus({ days: daysAhead });
  return candidate;
}

export function nextSlotFromList(
  rawSlots: string[],
  timezone: string,
  reference: DateTime = DateTime.now()
): DateTime | null {
  if (!rawSlots.length) return null;
  const candidates = rawSlots
    .map(parseSlot)
    .map((s) => nextSlotAfter(s, timezone, reference));
  candidates.sort((a, b) => a.toMillis() - b.toMillis());
  return candidates[0];
}

export function toIsoUtc(dt: DateTime): string {
  return dt.toUTC().toISO({ suppressMilliseconds: true }) ?? "";
}

export function resolveDueAt(opts: {
  mode: "queue" | "scheduled";
  dueAt?: string;
  defaultSlots?: string[];
  timezone: string;
}): string | undefined {
  if (opts.mode === "queue") return undefined;
  if (opts.dueAt) {
    const dt = DateTime.fromISO(opts.dueAt, { setZone: true });
    if (!dt.isValid) throw new Error(`Invalid dueAt "${opts.dueAt}"`);
    return toIsoUtc(dt);
  }
  if (opts.defaultSlots && opts.defaultSlots.length) {
    const next = nextSlotFromList(opts.defaultSlots, opts.timezone);
    if (next) return toIsoUtc(next);
  }
  throw new Error(
    "scheduled mode requires either dueAt or a default schedule slot"
  );
}
