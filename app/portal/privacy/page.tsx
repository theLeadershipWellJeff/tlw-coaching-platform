/**
 * Participant-facing confidentiality statement — public (no session needed),
 * linked from the sign-in page and every invitation email, so a participant
 * can read how their report and conversations are handled BEFORE their first
 * login. Plain language, no legalese; the data-handling one-pager for
 * procurement lives in docs/DEBRIEF_DATA_HANDLING.md.
 */
export const dynamic = 'force-static'

export default function PortalPrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">theLeadershipWell</p>
      <h1 className="mt-3 text-[24px] font-medium text-tlw-navy-deep">How your report and conversations are handled</h1>
      <p className="mt-2 text-[14px] text-tlw-warm-gray">Read this before you sign in. It is short on purpose.</p>

      <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-tlw-espresso">
        <section>
          <h2 className="text-[13px] font-semibold uppercase tracking-[1.5px] text-tlw-navy-rich">Your report is yours</h2>
          <p className="mt-2">
            Your feedback report belongs to you. You can download it at any time from your portal, and nothing in the system
            can switch that off. No sponsor, cohort administrator, or setting can withhold your own report from you.
          </p>
        </section>

        <section>
          <h2 className="text-[13px] font-semibold uppercase tracking-[1.5px] text-tlw-navy-rich">Who can see what</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>Your employer and the people who sponsored the program see only totals about the program, never your individual scores, comments, or conversations.</li>
            <li>The people who rated you are anonymous to you, and they stay anonymous to the assistant. The names of everyone invited to rate you are removed before your report is read by the system, and the assistant will not guess who said what, however the question is asked.</li>
            <li>If you have a coach in this program, they can see your report and your goals so they can work with you. If you do not have a coach, no coach sees them.</li>
            <li>Anything you upload yourself that is marked as a personnel review is visible only to you.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-[13px] font-semibold uppercase tracking-[1.5px] text-tlw-navy-rich">The assistant</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>It reads your report, your goals, and your own conversations with it. Nothing else about you.</li>
            <li>It quotes only what is in your report. It does not invent scores, comments, or comparisons.</li>
            <li>It is a thinking partner for what comes after your debrief, not a coach, a therapist, or a decision-maker. It will not tell you what your goals should be. You decide.</li>
            <li>Your conversations are stored so you can return to them. They are used to run and improve the service, not to train public AI models.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-[13px] font-semibold uppercase tracking-[1.5px] text-tlw-navy-rich">Signing in</h2>
          <p className="mt-2">
            You sign in with a link sent to your email, or with a username and password you set yourself. Links work once and
            expire after 24 hours. We never ask for a password by email.
          </p>
        </section>

        <section>
          <h2 className="text-[13px] font-semibold uppercase tracking-[1.5px] text-tlw-navy-rich">How long we keep it</h2>
          <p className="mt-2">
            Your access lasts for the period your program purchased, typically a year. You can ask for your report and
            conversations to be deleted at any time by writing to support from inside the portal.
          </p>
        </section>

        <section>
          <h2 className="text-[13px] font-semibold uppercase tracking-[1.5px] text-tlw-navy-rich">Questions</h2>
          <p className="mt-2">
            Use <strong>Contact support</strong> in your portal, or if you have a coach, write to them directly. A person will
            answer.
          </p>
        </section>
      </div>

      <p className="mt-10 text-[13px]">
        <a href="/portal/login" className="font-medium text-tlw-signal-orange hover:underline">
          Go to sign in →
        </a>
      </p>
    </div>
  )
}
