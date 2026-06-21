import { PageHeader } from '@/app/components/layout/PageHeader'
import { NudgeQueue } from './NudgeQueue'

export default function NudgesPage() {
  return (
    <>
      <PageHeader
        title="Nudge Queue"
        subtitle="Between-session touches drafted from your sessions. Review, edit, and send — nothing goes out without you."
      />
      <NudgeQueue />
    </>
  )
}
