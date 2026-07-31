import type { Client, CoachingGoal } from '@/lib/supabase/types'

// Build a CSV export of a client's contact data + coaching info, one client per
// data row (header row + one row) so the file drops straight into a spreadsheet
// or CRM import. Escaping follows RFC 4180: any field containing a comma, quote,
// or newline is wrapped in double quotes and its own quotes doubled.

function escapeCsv(value: string): string {
  if (value === '') return ''
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function csvRow(cells: string[]): string {
  return cells.map((c) => escapeCsv(c ?? '')).join(',')
}

function formatGoals(goals: CoachingGoal[] | null): string {
  if (!goals || goals.length === 0) return ''
  return goals
    .map((g) => {
      const parts = [g.title]
      if (g.description) parts.push(g.description)
      if (g.metrics && g.metrics.length) parts.push(`Metrics: ${g.metrics.join('; ')}`)
      return parts.join(' — ')
    })
    .join(' | ')
}

function formatRecording(value: boolean | null): string {
  if (value === true) return 'Authorized'
  if (value === false) return 'Do not record'
  return 'Not set'
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

// Column order — contact details first, then coaching context, then metadata.
const COLUMNS: { header: string; value: (c: Client) => string }[] = [
  { header: 'Name', value: (c) => c.name || '' },
  { header: 'Email', value: (c) => c.email || '' },
  { header: 'Phone', value: (c) => c.phone || '' },
  { header: 'Title', value: (c) => c.title || '' },
  { header: 'Company', value: (c) => c.company || '' },
  { header: 'Address', value: (c) => c.address || '' },
  { header: 'Timezone', value: (c) => c.timezone_label || c.timezone || '' },
  { header: 'Status', value: (c) => c.status || '' },
  { header: 'Tags', value: (c) => (c.tags && c.tags.length ? c.tags.join('; ') : '') },
  { header: 'Bio', value: (c) => c.bio || '' },
  { header: 'Key Info', value: (c) => c.key_info || '' },
  { header: 'Coaching Map', value: (c) => c.coaching_map || '' },
  { header: 'Coaching Goals', value: (c) => formatGoals(c.coaching_goals) },
  { header: 'Session Fee', value: (c) => (c.session_fee != null ? `$${c.session_fee}` : '') },
  { header: 'Agreement On File', value: (c) => (c.agreement_on_file ? 'Yes' : 'No') },
  { header: 'Recording', value: (c) => formatRecording(c.recording_authorized) },
  { header: 'Client Since', value: (c) => formatDate(c.created_at) },
]

// Full CSV text (header row + one data row) for a single client.
export function clientToCsv(client: Client): string {
  const header = csvRow(COLUMNS.map((col) => col.header))
  const row = csvRow(COLUMNS.map((col) => col.value(client)))
  return `${header}\r\n${row}\r\n`
}

// A filesystem-safe download name, e.g. "jane-doe-export.csv".
export function clientCsvFilename(client: Client): string {
  const slug = (client.name || 'client')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${slug || 'client'}-export.csv`
}
