import {
  LegalPage,
  LegalSection,
  LEGAL_ADDRESS,
  LEGAL_BRAND,
  LEGAL_CONTACT_EMAIL,
  LEGAL_ENTITY,
} from '@/app/components/legal/LegalPage'

/**
 * Public privacy policy for the coach platform (theleadershipwell.online). This
 * is the URL on the Google OAuth consent screen's Branding page, so the
 * "Google user data" section must stay accurate to the scopes in
 * lib/authOptions.ts (gmail.send, calendar.readonly, calendar.events) and keep
 * the Limited Use disclosure. Change a scope → change this page in the same PR.
 * Client-portal participants also have the plain-language /portal/privacy.
 */
export const dynamic = 'force-static'

export const metadata = {
  title: 'Privacy Policy — theLeadershipWell',
}

const LIMITED_USE_URL = 'https://developers.google.com/terms/api-services-user-data-policy'

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        This policy explains how {LEGAL_ENTITY}, doing business as {LEGAL_BRAND} (&ldquo;we&rdquo;, &ldquo;us&rdquo;),
        collects, uses, and protects information in the {LEGAL_BRAND} coaching platform at theleadershipwell.online
        (the &ldquo;Service&rdquo;). The Service is used by professional coaches (&ldquo;coaches&rdquo;) to run their
        practice, and by those coaches&apos; clients through the client portal.
      </p>

      <LegalSection heading="Information we collect">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Account information</strong> — a coach&apos;s name, email address, and profile photo from their
            Google account, plus settings they enter (title, phone, timezone, availability, email signature).
          </li>
          <li>
            <strong>Client information a coach enters</strong> — client names, contact details, session notes, coaching
            goals, action items, agreements, documents, and session transcripts the coach uploads.
          </li>
          <li>
            <strong>Client portal information</strong> — what a client writes or uploads in their portal, including
            conversations with the portal assistant, notes, goals, and documents.
          </li>
          <li>
            <strong>Billing information</strong> — invoices and payment status. Card details are entered on and held by
            Stripe; we never see or store full card numbers.
          </li>
          <li>
            <strong>Technical information</strong> — sign-in records, IP address, and basic request logs needed to keep
            the Service secure and working.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="Google user data">
        <p>
          Coaches sign in with Google. With the coach&apos;s permission, the Service requests these Google permissions
          and uses them only as described:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Basic profile (name, email, photo)</strong> — to identify the coach and sign them in.
          </li>
          <li>
            <strong>Gmail — send email on your behalf</strong> (<code>gmail.send</code>) — to send the emails the coach
            writes or approves in the Service (session notes, session-prep sheets, appointment confirmations and
            reminders, agreements, invoices, and follow-up messages) from the coach&apos;s own Gmail account, so they
            appear in the coach&apos;s Sent folder. The Service cannot read, search, or delete the coach&apos;s email.
          </li>
          <li>
            <strong>Google Calendar — view</strong> (<code>calendar.readonly</code>) — to show the coach&apos;s upcoming
            sessions, check free/busy times before booking, let the coach choose which calendar to use, match session
            recordings to the right client by time, and detect sessions clients book through the coach&apos;s
            scheduling links.
          </li>
          <li>
            <strong>Google Calendar — events</strong> (<code>calendar.events</code>) — to create, move, and cancel the
            session events the coach books in the Service, with the client as a guest.
          </li>
        </ul>
        <p>
          We store the Google sign-in token the Service needs to act on the coach&apos;s behalf (for example, to send a
          scheduled reminder) and the calendar details of coaching sessions (time, length, title, and guest email).
          This data is used only to provide these features to the coach who granted access.
        </p>
        <p>
          <strong>Limited Use.</strong> {LEGAL_BRAND}&apos;s use and transfer to any other app of information received
          from Google APIs will adhere to the{' '}
          <a href={LIMITED_USE_URL} className="text-tlw-signal-orange underline" target="_blank" rel="noopener noreferrer">
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. In particular:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>We use Google user data only to provide and improve the user-facing features described above.</li>
          <li>We do not sell Google user data, and we do not use it for advertising.</li>
          <li>
            We do not use Google user data to develop, improve, or train generalized or non-personalized AI or
            machine-learning models.
          </li>
          <li>
            We transfer Google user data to others only as necessary to provide the Service (the service providers
            listed below), to comply with law, or as part of a merger or acquisition with notice to users.
          </li>
          <li>
            People do not read Google user data unless the coach asks us to (for example, for support), it is needed
            for security or to comply with law, or it has been aggregated and made anonymous.
          </li>
        </ul>
        <p>
          A coach can remove the Service&apos;s access at any time at{' '}
          <a
            href="https://myaccount.google.com/permissions"
            className="text-tlw-signal-orange underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            myaccount.google.com/permissions
          </a>
          . Email and calendar features stop working until access is granted again.
        </p>
      </LegalSection>

      <LegalSection heading="How we use information">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>To provide the Service: session prep, notes, scheduling, reminders, scorecards, the client portal, and billing.</li>
          <li>
            To generate drafts and insights with AI. Content such as session notes, transcripts, goals, and upcoming
            session times is sent to our AI provider to produce the drafts, summaries, and scores the coach reviews.
          </li>
          <li>To keep the Service secure, prevent abuse, and fix problems.</li>
          <li>To contact coaches about their account, billing, and important changes.</li>
        </ul>
        <p>We do not sell personal information, and we do not use it for advertising.</p>
      </LegalSection>

      <LegalSection heading="Service providers">
        <p>We share information only with providers that help us run the Service, under agreements that limit their use of it:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Vercel (hosting) and Supabase (database and file storage)</li>
          <li>Anthropic (AI processing, under commercial terms that do not permit training its models on our content)</li>
          <li>Google (sign-in, Gmail, and Calendar, as described above)</li>
          <li>Stripe (payments)</li>
          <li>Resend (transactional email for client-portal sign-in links)</li>
          <li>Zoom (meeting links and session information, where the coach uses it)</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Cookies">
        <p>
          We use only the cookies needed to keep you signed in and secure. We do not use advertising or third-party
          tracking cookies.
        </p>
      </LegalSection>

      <LegalSection heading="Security">
        <p>
          Data is encrypted in transit and at rest. Access to each coach&apos;s clients is restricted to that coach, and
          client-portal users can see only their own information. No system is perfectly secure; if we learn of a
          breach that affects your information, we will notify you as the law requires.
        </p>
      </LegalSection>

      <LegalSection heading="Keeping and deleting information">
        <p>
          We keep information for as long as the account exists, including after a subscription ends, so a coach can
          return or download their data. A coach can download all of their data at any time from the Service. To have an
          account and its data deleted, email{' '}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-tlw-signal-orange underline">
            {LEGAL_CONTACT_EMAIL}
          </a>
          ; we will delete it within 30 days, except records we must keep by law (such as tax and billing records).
          Deleting an account also deletes the stored Google sign-in token.
        </p>
      </LegalSection>

      <LegalSection heading="Coaches and their clients">
        <p>
          A coach decides what client information to put into the Service and is responsible for having their
          clients&apos; permission to do so, including permission to record sessions. We process client information on
          the coach&apos;s behalf. Clients with questions about their information should contact their coach first, or
          write to us.
        </p>
      </LegalSection>

      <LegalSection heading="Your rights, including California residents">
        <p>
          You can ask to access, correct, download, or delete your personal information, and we will not treat you
          differently for asking. California residents have these rights under the California Consumer Privacy Act. We
          do not sell or share personal information for cross-context behavioral advertising. To make a request, email{' '}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-tlw-signal-orange underline">
            {LEGAL_CONTACT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection heading="Children">
        <p>The Service is for professional use and is not directed to anyone under 16.</p>
      </LegalSection>

      <LegalSection heading="Changes">
        <p>
          If we change this policy, we will update the effective date above, and for significant changes we will notify
          coaches by email before they take effect.
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
