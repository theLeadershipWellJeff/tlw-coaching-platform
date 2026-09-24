import { PageHeader } from '@/app/components/layout/PageHeader'
import { DashboardSurface } from '@/components/dashboard/DashboardSurface'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach, coachGreetingName } from '@/lib/coach'
import { WelcomeChecklist } from './WelcomeChecklist'
import { NeedsAttentionPanel } from './NeedsAttentionPanel'

/** Hour of day (0–23) in the coach's zone — never the server's UTC clock (QA TLW-003). */
function hourIn(timeZone: string): number {
  try {
    const h = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(new Date())
    return Number(h) % 24
  } catch {
    return new Date().getHours()
  }
}

function greeting(timeZone: string): string {
  const h = hourIn(timeZone)
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

/** The greeting name (the coach's own choice from Account → Profile) + their timezone. */
async function coachBits(): Promise<{ name: string; timeZone: string }> {
  try {
    const coach = await getSessionCoach(getSupabaseAdmin())
    return { name: coachGreetingName(coach), timeZone: coach?.timezone || 'America/Los_Angeles' }
  } catch {
    return { name: 'there', timeZone: 'America/Los_Angeles' }
  }
}

export default async function DashboardPage() {
  const { name, timeZone } = await coachBits()
  let today: string
  try {
    today = new Date().toLocaleDateString('en-US', { timeZone, weekday: 'long', month: 'long', day: 'numeric' })
  } catch {
    today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  }

  return (
    <>
      <PageHeader eyebrow="theLeadershipWell" title={`${greeting(timeZone)}, ${name}`} subtitle={today} guide="dashboard" />
      {/* First-run setup checklist — only visible while the roster is empty. */}
      <WelcomeChecklist />
      {/* The coach attention queue — always mounted (not an opt-in card), one
          quiet line when empty. */}
      <NeedsAttentionPanel timeZone={timeZone} />
      {/* One unified, arrangeable board: roster, Up next, scorecard, and every
          other tile are cards you can add, size, and drag to reorder. */}
      <DashboardSurface />
    </>
  )
}
