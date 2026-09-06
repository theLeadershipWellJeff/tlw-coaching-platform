import { redirect } from 'next/navigation'

/** The Client Portal admin lives under the Command Center now. */
export default function PortalAdminRedirect() {
  redirect('/command-center/portal')
}
