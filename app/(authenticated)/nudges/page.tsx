import { PageHeader } from '@/app/components/layout/PageHeader'
import { NudgeQueue } from './NudgeQueue'
import { VaultSyncButton } from './VaultSyncButton'

export default function NudgesPage() {
  return (
    <>
      <PageHeader
        title="Nudge Queue"
        subtitle="Between-session touches drafted from your sessions. Review, edit, and send — nothing goes out without you."
      />
      <div className="mb-6 flex items-center justify-between gap-4">
        <p className="text-[12px] text-tlw-warm-gray">
          Frameworks power nudge drafting. Re-index your vault and confirm the connection.
        </p>
        <VaultSyncButton />
      </div>
      <NudgeQueue />
    </>
  )
}
