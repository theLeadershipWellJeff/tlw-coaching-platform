'use client'
import { useEffect, useState } from 'react'

const KEY = 'tlw-portal-onboarded'

/** First-visit welcome for the Client Portal (dismissal remembered per browser). */
export function PortalOnboarding() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setShow(true)
    } catch {
      /* ignore */
    }
  }, [])

  function dismiss() {
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      /* ignore */
    }
    setShow(false)
  }

  if (!show) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-tlw-navy-deep/40 p-4">
      <div className="w-full max-w-md rounded-tlw-2xl bg-tlw-surface p-6 shadow-xl">
        <h2 className="text-[18px] font-medium text-tlw-navy-deep">Welcome to your portal</h2>
        <p className="mt-2 text-[14px] text-tlw-espresso">
          This is your private space to stay connected to your coaching:
        </p>
        <ul className="mt-3 space-y-1.5 text-[13px] text-tlw-espresso">
          <li>📅 <strong>Book your next session</strong> from the button up top.</li>
          <li>💬 <strong>Chat</strong> with an assistant that knows your goals and sessions.</li>
          <li>🎯 Revisit your <strong>goals</strong>, <strong>sessions</strong>, and the <strong>notes</strong> your coach sent you.</li>
          <li>🔎 <strong>Search</strong> across your sessions and notes.</li>
          <li>✉️ <strong>Message your coach</strong> anytime.</li>
        </ul>
        <p className="mt-3 text-[12px] text-tlw-warm-gray">
          Tap the <span className="italic">i</span> on any card for a quick tip.
        </p>
        <button
          onClick={dismiss}
          className="mt-5 w-full rounded-tlw-lg bg-tlw-navy-deep px-4 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-tlw-navy-rich"
        >
          Get started
        </button>
      </div>
    </div>
  )
}
