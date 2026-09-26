import Link from 'next/link'
import {
  LegalPage,
  LegalSection,
  LEGAL_ADDRESS,
  LEGAL_BRAND,
  LEGAL_CONTACT_EMAIL,
  LEGAL_ENTITY,
} from '@/app/components/legal/LegalPage'

/**
 * Public terms of service for the coach platform. Linked from the Google OAuth
 * consent screen (Branding page), the homepage, and /join. Billing terms must
 * stay in step with lib/access.ts (COACH_PRICING, trial) and the cancel flow in
 * lib/admin/coach-cancel.ts (no proration or refunds).
 */
export const dynamic = 'force-static'

export const metadata = {
  title: 'Terms of Service — theLeadershipWell',
}

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <p>
        These terms are an agreement between you and {LEGAL_ENTITY}, doing business as {LEGAL_BRAND} (&ldquo;we&rdquo;,
        &ldquo;us&rdquo;), for use of the {LEGAL_BRAND} coaching platform at theleadershipwell.online (the
        &ldquo;Service&rdquo;). By creating an account or using the Service, you agree to them. If you use the Service
        for a business, you agree on its behalf.
      </p>

      <LegalSection heading="The Service">
        <p>
          The Service helps professional coaches run their practice: session notes and preparation, scheduling and
          reminders, session scorecards, a client portal with an AI assistant, and billing. Features may change as we
          improve the Service.
        </p>
      </LegalSection>

      <LegalSection heading="Your account">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>You sign in with a Google account and give the Service permission to send email and manage calendar events as described in our <Link href="/privacy" className="text-tlw-signal-orange underline">Privacy Policy</Link>.</li>
          <li>Keep your account secure. You are responsible for activity under it.</li>
          <li>Give us accurate information and keep it up to date.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Subscriptions and payment">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Paid plans are billed in advance, monthly or yearly, through Stripe, at the price shown when you subscribe.</li>
          <li>A free trial, when offered, converts to a paid subscription at its end unless you cancel before then.</li>
          <li>Subscriptions renew automatically until cancelled. You can cancel at any time; access continues to the end of the period you have paid for.</li>
          <li>Fees are not refunded for partial periods, except where the law requires.</li>
          <li>We may change prices with at least 30 days&apos; notice by email. A change applies from your next renewal.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Your content and your clients">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            You own the content you and your clients put into the Service. You give us permission to store, process, and
            transmit it only as needed to provide the Service to you.
          </li>
          <li>
            You are responsible for having your clients&apos; permission to store their information in the Service,
            including recorded sessions and transcripts, and for meeting your own professional and legal obligations,
            such as confidentiality and any codes of ethics you follow.
          </li>
          <li>You can download all of your data at any time, including after your subscription ends.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="AI features">
        <p>
          The Service uses AI to draft messages, summarize sessions, suggest questions, and score sessions. AI output can
          be wrong. Review anything the Service drafts before you send it. Scorecards and suggestions are aids to your
          professional judgment, not a substitute for it, and are not medical, psychological, legal, or financial advice.
        </p>
      </LegalSection>

      <LegalSection heading="Acceptable use">
        <p>Do not use the Service to:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>break the law or violate anyone&apos;s rights, including privacy rights;</li>
          <li>send spam or messages recipients have not agreed to receive;</li>
          <li>upload malicious code or try to access accounts or data that are not yours;</li>
          <li>disrupt, overload, or reverse-engineer the Service.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Our property">
        <p>
          The Service, including its software, design, rubrics, and frameworks, belongs to us and our licensors. These
          terms give you the right to use the Service while your account is active; they do not transfer ownership.
        </p>
      </LegalSection>

      <LegalSection heading="Suspension and termination">
        <p>
          You can stop using the Service at any time. We may suspend or end your access if you break these terms or do
          not pay, or if we must for legal reasons. Where we can, we will tell you first and give you a chance to
          download your data.
        </p>
      </LegalSection>

      <LegalSection heading="Disclaimers">
        <p>
          The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. To the extent the law allows, we
          disclaim all warranties, express or implied, including merchantability, fitness for a particular purpose, and
          non-infringement. We do not promise the Service will be uninterrupted or error-free.
        </p>
      </LegalSection>

      <LegalSection heading="Limitation of liability">
        <p>
          To the extent the law allows, we are not liable for indirect, incidental, special, consequential, or punitive
          damages, or for lost profits, revenue, or data. Our total liability for any claim relating to the Service is
          limited to the amount you paid us in the 12 months before the claim.
        </p>
      </LegalSection>

      <LegalSection heading="Indemnity">
        <p>
          You agree to defend and indemnify us against claims arising from your content, your use of the Service, or your
          breach of these terms, including claims by your clients.
        </p>
      </LegalSection>

      <LegalSection heading="Governing law">
        <p>
          These terms are governed by the laws of the State of California, without regard to its conflict-of-law rules.
          Any dispute will be resolved in the state or federal courts located in San Diego County, California, and you
          and we consent to their jurisdiction.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to these terms">
        <p>
          We may update these terms. We will change the effective date above and, for significant changes, email you
          before they take effect. Continuing to use the Service after that means you accept the updated terms.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          {LEGAL_ENTITY}
          <br />
          {LEGAL_ADDRESS}
          <br />
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-tlw-signal-orange underline">
            {LEGAL_CONTACT_EMAIL}
          </a>
        </p>
      </LegalSection>
    </LegalPage>
  )
}
