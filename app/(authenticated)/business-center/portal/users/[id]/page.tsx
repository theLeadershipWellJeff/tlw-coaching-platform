import { redirect } from 'next/navigation'

export default function PortalUserRedirect({ params }: { params: { id: string } }) {
  redirect(`/command-center/portal/users/${params.id}`)
}
