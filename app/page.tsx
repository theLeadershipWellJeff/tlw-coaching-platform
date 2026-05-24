import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { TLWLogo } from './components/TLWLogo'

export default async function Home() {
  const session = await getServerSession(authOptions)
  if (session) redirect('/dashboard')

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <TLWLogo size={56} light />
      <p className="text-tlw-warm-gray text-xs tracking-[5px] uppercase mt-4 mb-2">theLeadershipWell</p>
      <h1 className="font-serif text-3xl font-light text-tlw-cream mb-2">Session Prep Engine</h1>
      <p className="text-tlw-warm-gray text-sm mb-10">Sign in to access your coaching dashboard</p>
      <a
        href="/api/auth/signin"
        className="px-8 py-3 bg-tlw-navy-rich border border-tlw-warm-gray/30 rounded-lg text-tlw-cream text-sm font-medium hover:bg-tlw-navy-rich/80 transition-colors"
      >
        Sign in with Google
      </a>
    </div>
  )
}
