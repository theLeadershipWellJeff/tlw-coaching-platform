import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { AppShell } from '@/app/components/layout/AppShell'
import { PlanSessionWindowProvider } from '@/app/components/plan/PlanSessionWindows'

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/')

  // PlanSessionWindowProvider lives at the layout level so an open floating
  // "Plan next session" window survives navigation between pages (e.g. from
  // the client workspace into the session notes editor).
  return (
    <AppShell>
      <PlanSessionWindowProvider>{children}</PlanSessionWindowProvider>
    </AppShell>
  )
}
