import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { AppShell } from '@/app/components/layout/AppShell'
import { PlanSessionWindowProvider } from '@/app/components/plan/PlanSessionWindows'
import { ToastHost } from '@/app/components/shared/Toast'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/')

  // The Command Center sidebar entry is supervisor-only. Resolved server-side
  // so it never renders in a regular coach's HTML (the /api/admin and
  // /api/coaches routes enforce the same gate). Any hiccup = no entry.
  let isSupervisor = false
  try {
    const coach = await getSessionCoach(getSupabaseAdmin())
    isSupervisor = coach?.role === 'supervisor'
  } catch {
    isSupervisor = false
  }

  // PlanSessionWindowProvider lives at the layout level so an open floating
  // "Plan next session" window survives navigation between pages (e.g. from
  // the client workspace into the session notes editor).
  return (
    <AppShell isSupervisor={isSupervisor}>
      <PlanSessionWindowProvider>{children}</PlanSessionWindowProvider>
      <ToastHost />
    </AppShell>
  )
}
