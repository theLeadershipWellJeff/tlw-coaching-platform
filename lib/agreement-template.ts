/**
 * Single source of truth for the coaching-agreement document: the ICF/legal
 * LOCKED section text, the coach-editable defaults, the canonical section order,
 * and the renderer that turns a template + per-client merge values into the full
 * HTML document.
 *
 * The same renderer backs every surface so they can never drift: the Library
 * editor's live preview, the Issue-Agreement review step, the public signing
 * page, and the immutable `signed_agreement_html` snapshot stored at signing.
 *
 * Locked text lives here (not just in the DB) so it has one home; the
 * `agreement_templates` row is seeded from these constants on first load and the
 * locked columns are the snapshot copy.
 */
import { escapeHtml } from './html'

const NAVY_DEEP = '#111226'
const ESPRESSO = '#403832'
const WARM = '#8B8680'

// ---------------------------------------------------------------------------
// Locked sections — ICF ethics & legal. Never editable in the UI.
// ---------------------------------------------------------------------------
export const LOCKED_SECTIONS = {
  coach_client_relationship: `A. Coach agrees to maintain the ethics and standards of behavior established by the International Coach Federation ("ICF"). It is recommended that the Client review the ICF Code of Ethics and the applicable standards of behavior.
B. Client is solely responsible for creating and implementing his/her own physical, mental, and emotional well-being, decisions, choices, actions, and results arising out of or resulting from the coaching relationship and his/her coaching calls and interactions with the Coach. As such, the Client agrees that the Coach is not and will not be liable or responsible for any actions or inaction, or for any direct or indirect result of any services provided by the Coach. Client understands coaching is not therapy and does not substitute for therapy if needed, and does not prevent, cure, or treat any mental disorder or medical disease.
C. Client further acknowledges that he/she may terminate or discontinue the coaching relationship at any time.
D. Client acknowledges that coaching is a comprehensive process that may involve different areas of his or her life, including work, finances, health, relationships, education and recreation. The Client agrees that deciding how to handle these issues, incorporating coaching principles into those areas, and implementing choices is exclusively the Client's responsibility.
E. Client acknowledges that coaching does not involve the diagnosis or treatment of mental disorders as defined by the American Psychiatric Association and that coaching is not to be used as a substitute for counseling, psychotherapy, psychoanalysis, mental health care, substance abuse treatment, or other professional advice by legal, medical or other qualified professionals, and that it is the Client's exclusive responsibility to seek such independent professional guidance as needed. If Client is currently under the care of a mental health professional, it is recommended that the Client promptly inform the mental health care provider of the nature and extent of the coaching relationship agreed upon by the Client and the Coach.
F. The Client understands that in order to enhance the coaching relationship, the Client agrees to communicate honestly, be open to feedback and assistance and to create the time and energy to participate fully in the program.`,

  confidentiality: `This coaching relationship, as well as all information (documented or verbal) that the Client shares with the Coach as part of this relationship, is bound by the principles of confidentiality set forth in the ICF Code of Ethics. However, please be aware that the Coach-Client relationship is not considered a legally confidential relationship (like the medical and legal professions) and thus communications are not subject to the protection of any legally recognized privilege. The Coach agrees not to disclose any information pertaining to the Client without the Client's written consent. The Coach will not disclose the Client's name as a reference without the Client's consent.
Confidential Information does not include information that: was in the Coach's possession prior to its being furnished by the Client; is generally known to the public or in the Client's industry; is obtained by the Coach from a third party, without breach of any obligation to the Client; is independently developed by the Coach without use of or reference to the Client's confidential information; or the Coach is required by statute, lawfully issued subpoena, or by court order to disclose; is disclosed to the Coach and as a result of such disclosure, the Coach reasonably believes there to be an imminent or likely risk of danger or harm to the Client or others; and involves illegal activity.
The Client also acknowledges his or her continuing obligation to raise any confidentiality questions or concerns with the Coach in a timely manner.`,

  ai_recording: `To enhance your coaching experience and create a clear record of your progress, coaching sessions may be recorded (audio and/or video) and processed using AI tools to generate transcripts and summaries. With your consent, the Coach may use AI-enabled services to transcribe and organize session content. These providers act as data processors on the Coach's behalf and are engaged only where they maintain appropriate confidentiality and security safeguards.
All recordings, transcripts, and AI-generated outputs are treated as Confidential Information under this Agreement and are subject to the same protections. The Coach will not sell, publish, or share your recordings or identifiable session content with any outside party except as necessary to deliver the AI processing described above, and your content will not be used to train any publicly available AI model without your separate written consent. Recordings and transcripts are stored securely and retained only as long as reasonably needed to support the engagement.
This authorization is voluntary. You may decline recording or revoke this consent at any time with written notice, without affecting the coaching relationship.`,

  release_of_information: `The Coach engages in training and continuing education pursuing and/or maintaining Coaching Credentials. That process requires the names and contact information of all Clients for possible verification by coaching certification bodies. By signing this agreement, you agree to have only your name, contact information and start and end dates of coaching shared with staff members and/or other parties involved in this process for the sole and necessary purpose of verifying the coaching relationship; no personal notes will be shared.
According to the ethics of the coaching profession, topics may be anonymously and hypothetically shared with other coaching professionals for training, supervision, mentoring, evaluation, and for coach professional development and/or consultation purposes.`,

  termination: `Either the Client or the Coach may terminate this Agreement at any time with 1 week written notice. Client agrees to compensate the Coach for all coaching services rendered and subscribed to through and including the effective date of termination of the coaching relationship.`,

  limited_liability: `Except as expressly provided in this Agreement, the Coach makes no guarantees, representations or warranties of any kind or nature, express or implied with respect to the coaching services negotiated, agreed upon and rendered. In no event shall the Coach be liable to the Client for any indirect, consequential or special damages. Notwithstanding any damages that the Client may incur, the Coach's entire liability under this Agreement, and the Client's exclusive remedy, shall be limited to the amount actually paid by the Client to the Coach under this Agreement for all coaching services rendered through and including the termination date.`,

  standard_legal: `Entire Agreement: This document reflects the entire agreement between the Coach and the Client, and reflects a complete understanding of the parties with respect to the subject matter. This Agreement supersedes all prior written and oral representations. The Agreement may not be amended, altered or supplemented except in writing signed by both the Coach and the Client.
Severability: If any provision of this Agreement shall be held to be invalid or unenforceable for any reason, the remaining provisions shall continue to be valid and enforceable. If the Court finds that any provision of this Agreement is invalid or unenforceable, but that by limiting such provision it would become valid and enforceable, then such provision shall be deemed to be written, construed, and enforced as so limited.
Waiver: The failure of either party to enforce any provision of this Agreement shall not be construed as a waiver or limitation of that party's right to subsequently enforce and compel strict compliance with every provision of this Agreement.
Applicable Law: This Agreement shall be governed and construed in accordance with the laws of the State of California without giving effect to any conflicts of laws provisions.
Binding Effect: This Agreement shall be binding upon the parties hereto and their respective successors and permissible assigns. Please sign this Client Agreement prior to the first scheduled coaching meeting.`,
} as const

// ---------------------------------------------------------------------------
// Editable section defaults (seed data; coach can update in the Library).
// ---------------------------------------------------------------------------
export const EDITABLE_DEFAULTS = {
  description_of_coaching: `Coaching is a thought partnership between the Coach and the Client in an intentional, curious, and creative process that inspires the client to maximize personal and professional potential. The Coach works to facilitate Client creation and development of personal, professional, and business goals and to develop and carry out a strategy for achieving those goals.`,

  agreement_logistics: `Our coaching agreement includes two contacts per month via Zoom. These calls are 55 minutes in duration. In between these regularly appointed coaching sessions, we will use email post-session recaps to enhance and anchor the benefits of your coaching. This will create a clear record of your success.
An additional two 55-minute sessions per month are allotted for ad-hoc needs as they arise. These are optional and do not roll over into subsequent months.
Our agreement consists of a minimum of two coaching sessions a month. Unused sessions will be billed or deducted from your allotment at the agreed-upon rate and payment structure outlined below. Additional sessions may be scheduled as needed and either billed separately or deducted from the total session allotment.`,

  method_of_contact: `Call at the Zoom link {{zoom_link}} or phone {{phone}}. We agree together on the times and days according to your subscription frequency.
Occasionally, you may have an urgent question, a request for feedback, or a need for a confidential response to situations where you don't want to wait for your next call. This is a quick check-in coaching session, which you can book through your coaching portal. You may also contact your coach via email.`,

  late_policy: `Things happen, and meetings go late. We will wait for ten minutes in the Zoom room for you to log in. After 10 minutes, we will assume something more important has arisen. However, the session will still be deducted from your allotment. A follow-up email will be sent letting you know about the miss and will include a rescheduling link. If there is time in both our calendars to schedule that week, the missed session will not count against your allotment.`,

  cancellation_policy: `Any cancellation made within 48 hours of the agreed-upon scheduled session will be deducted from your allotment (if pre-paid) or will be charged as if it happened. Rescheduling within the same week may happen without charge if the request is made 24 hours before the agreed-upon scheduled session. Otherwise, rescheduling will be charged at the agreed-upon hourly rate.`,

  // Defaults blank — the payment section is omitted unless filled (per-client at
  // issue time, or as a template default the coach sets).
  payment_terms: '',
} as const

/** The shape the renderer needs — matches the editable + locked columns. */
export interface AgreementTemplateContent {
  description_of_coaching: string
  agreement_logistics: string
  method_of_contact: string
  late_policy: string
  cancellation_policy: string
  payment_terms: string | null
  locked_coach_client_relationship: string
  locked_confidentiality: string
  locked_ai_recording: string
  locked_release_of_information: string
  locked_termination: string
  locked_limited_liability: string
  locked_standard_legal: string
}

/** A fresh template content block seeded from the constants above. */
export function seedTemplateContent(): AgreementTemplateContent {
  return {
    description_of_coaching: EDITABLE_DEFAULTS.description_of_coaching,
    agreement_logistics: EDITABLE_DEFAULTS.agreement_logistics,
    method_of_contact: EDITABLE_DEFAULTS.method_of_contact,
    late_policy: EDITABLE_DEFAULTS.late_policy,
    cancellation_policy: EDITABLE_DEFAULTS.cancellation_policy,
    payment_terms: EDITABLE_DEFAULTS.payment_terms,
    locked_coach_client_relationship: LOCKED_SECTIONS.coach_client_relationship,
    locked_confidentiality: LOCKED_SECTIONS.confidentiality,
    locked_ai_recording: LOCKED_SECTIONS.ai_recording,
    locked_release_of_information: LOCKED_SECTIONS.release_of_information,
    locked_termination: LOCKED_SECTIONS.termination,
    locked_limited_liability: LOCKED_SECTIONS.limited_liability,
    locked_standard_legal: LOCKED_SECTIONS.standard_legal,
  }
}

/** The six editable sections, in editor display order. */
export const EDITABLE_SECTIONS: { key: keyof AgreementTemplateContent; label: string; rows: number; placeholder?: string }[] = [
  { key: 'description_of_coaching', label: 'Opening / Description of Coaching', rows: 4 },
  { key: 'agreement_logistics', label: 'Agreement Logistics', rows: 6 },
  { key: 'method_of_contact', label: 'Method of Contact', rows: 3 },
  { key: 'late_policy', label: 'Late Policy', rows: 4 },
  { key: 'cancellation_policy', label: 'Cancellation & Rescheduling', rows: 4 },
  { key: 'payment_terms', label: 'Payment Terms', rows: 2, placeholder: 'Leave blank to omit this section. Overridden per client at issue time.' },
]

/** Merge values resolved into the document at render time. */
export interface AgreementVars {
  client_name: string
  coach_name: string
  zoom_link: string
  phone: string
  payment_terms?: string | null // per-issue override; falls back to the template value
}

function resolveMerge(text: string, vars: AgreementVars): string {
  return text
    .replace(/\{\{\s*client_name\s*\}\}/g, escapeHtml(vars.client_name) || 'Client Name')
    .replace(/\{\{\s*coach_name\s*\}\}/g, escapeHtml(vars.coach_name) || 'Coach')
    .replace(/\{\{\s*zoom_link\s*\}\}/g, escapeHtml(vars.zoom_link) || '—')
    .replace(/\{\{\s*phone\s*\}\}/g, escapeHtml(vars.phone) || '—')
}

/** One section → escaped, merge-resolved paragraphs (each line a <p>). */
function paragraphs(raw: string, vars: AgreementVars): string {
  return resolveMerge(escapeHtml(raw), vars)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p style="margin:0 0 10px;line-height:1.7;">${line}</p>`)
    .join('')
}

/**
 * Render the full agreement document body (the sections, in signing order) as a
 * self-contained, inline-styled HTML block. `signature` optionally appends the
 * typed-name + timestamp block recorded at signing (for the archived snapshot
 * and the client's copy).
 */
export function renderAgreementHtml(
  t: AgreementTemplateContent,
  vars: AgreementVars,
  signature?: { typedName: string; signedAt: string; recordingAuthorized: boolean }
): string {
  const heading = (text: string) =>
    `<h2 style="font-size:19px;font-weight:600;color:${NAVY_DEEP};margin:26px 0 10px;">${escapeHtml(text)}</h2>`
  const section = (title: string, body: string) => heading(title) + paragraphs(body, vars)

  // Payment: per-issue override wins; else the template value; omit if blank.
  const payment = (vars.payment_terms ?? t.payment_terms ?? '').trim()

  const parts: string[] = [
    paragraphs(t.description_of_coaching, vars),
    section('Coach-Client Relationship', t.locked_coach_client_relationship),
    section('Agreement Logistics', t.agreement_logistics),
    section('Method of Contact', t.method_of_contact),
    section('Late Policy', t.late_policy),
    section('Cancellation & Rescheduling', t.cancellation_policy),
    section('Confidentiality', t.locked_confidentiality),
    section('AI Recording & Authorization', t.locked_ai_recording),
    section('Release of Information', t.locked_release_of_information),
    section('Termination', t.locked_termination),
    section('Limited Liability', t.locked_limited_liability),
    section('Standard Legal Provisions', t.locked_standard_legal),
  ]
  if (payment) parts.push(section('Payment Terms', payment))

  if (signature) {
    parts.push(
      `<div style="margin-top:32px;padding-top:18px;border-top:1px solid #e5e0d8;">
        <p style="margin:0 0 6px;font-size:13px;color:${WARM};">Recording &amp; AI processing: <strong style="color:${ESPRESSO};">${signature.recordingAuthorized ? 'Authorized' : 'Not authorized'}</strong></p>
        <p style="margin:0;font-size:15px;color:${ESPRESSO};">Signed by <strong>${escapeHtml(signature.typedName)}</strong> on ${escapeHtml(signature.signedAt)}</p>
      </div>`
    )
  }

  return `<div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:17px;color:${ESPRESSO};">${parts.join('')}</div>`
}
