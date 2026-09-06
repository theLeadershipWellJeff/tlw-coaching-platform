import { redirect } from 'next/navigation'

/** The Command Center moved to its own sidebar entry. */
export default function CommandCenterRedirect() {
  redirect('/command-center')
}
