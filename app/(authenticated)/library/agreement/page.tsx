import { PageHeader } from '@/app/components/layout/PageHeader'
import { AgreementTemplateEditor } from './AgreementTemplateEditor'

export default function AgreementTemplatePage() {
  return (
    <>
      <PageHeader title="Coaching Agreement Template" subtitle="Manage the master agreement sent to all clients." />
      <AgreementTemplateEditor />
    </>
  )
}
