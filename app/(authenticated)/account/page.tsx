import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { PageHeader } from '@/app/components/layout/PageHeader'
import { SupervisorSettings } from './SupervisorSettings'
import { TimezoneSettings } from './TimezoneSettings'
import { SchedulingSettings } from './SchedulingSettings'

export default async function AccountPage() {
  const session = await getServerSession(authOptions)
  const name = session?.user?.name || '—'
  const email = session?.user?.email || '—'

  return (
    <>
      <PageHeader title="Account" subtitle="Your coach profile and session settings." />

      <div className="max-w-2xl space-y-6">
        <div className="rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-surface p-6">
          <p className="mb-4 text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">
            Signed in as
          </p>
          <dl className="space-y-3 text-[13px]">
            <div className="flex justify-between gap-4">
              <dt className="text-tlw-warm-gray">Name</dt>
              <dd className="text-tlw-espresso">{name}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-tlw-warm-gray">Email</dt>
              <dd className="text-tlw-espresso">{email}</dd>
            </div>
          </dl>
        </div>

        <TimezoneSettings />

        <SchedulingSettings />

        <SupervisorSettings />

        <a
          href="/api/auth/signout"
          className="inline-flex items-center rounded-tlw-md border border-tlw-warm-gray/30 px-4 py-2 text-[13px] font-medium text-tlw-espresso transition-colors duration-tlw-base hover:bg-tlw-warm-gray/[0.08]"
        >
          Sign out
        </a>
      </div>
    </>
  )
}
