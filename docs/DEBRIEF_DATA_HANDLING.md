# theLeadershipWell Assessment Debrief Portal — data handling summary

*For sponsor procurement and IT review. One page on purpose. Technical detail
on request.*

## What the service is

A secure web portal where each participant in a leadership program can view
their own 360-degree feedback report, work through it with an AI thinking
partner grounded in that report, set goals, and track them for the period the
program purchased (typically 12 months). It follows a human group debrief; it
does not replace it.

## What we hold, per participant

| Data | Source | Who can see it |
|---|---|---|
| Name, work email | Sponsor roster | theLeadershipWell staff; the participant |
| The 360 feedback report (PDF) and a structured extraction of its scores, bands, norms, and anonymised rater comments | Uploaded by theLeadershipWell or by the participant | The participant; their assigned coach if the program includes one; theLeadershipWell staff |
| Goals the participant sets | The participant | The participant; their coach if any; staff |
| Conversations with the AI assistant | The participant | The participant; theLeadershipWell staff for support and quality |
| Sign-in and usage events (logins, report views, messages sent) | The system | theLeadershipWell staff |

**Rater identities are never stored.** The names of the people invited to rate
a participant are removed during extraction and verified absent before the
report is made available. The assistant cannot attribute a comment or score to
an individual and is instructed to decline if asked.

**The sponsor sees no individual data.** No dashboard, export, or report gives
the sponsoring company, its HR function, or a cohort administrator access to
any participant's scores, comments, goals, or conversations. Aggregate program
counts (seats activated, participation) are available on request.

## Where it lives and how it moves

- Hosted on Vercel (application) and Supabase (database and file storage),
  both in the United States, with encryption in transit (TLS) and at rest.
- Files are stored in a private bucket; every download is a short-lived signed
  link issued only to the authenticated owner.
- Email (sign-in links, invitations, support replies) is sent through Resend
  from `mail.theleadershipwell.online` with SPF, DKIM, and DMARC.
- The AI assistant is Anthropic's Claude, accessed through Anthropic's API.
  Conversations and report content are sent to Anthropic to generate replies.
  Anthropic does not use API data to train its models. No other AI providers
  are involved.
- No data is sold or shared with third parties beyond the processors above.

## Access control

- Participants sign in with a single-use emailed link (24-hour expiry) or a
  username and password they set themselves. Passwords are stored as one-way
  hashes; nobody at theLeadershipWell can read them.
- Every request is scoped to the signed-in participant. A participant can
  never reach another participant's report, goals, or conversations.
- Company context (vision and values) is loaded strictly by the participant's
  own company link and tested to prevent cross-company leakage.
- Staff access is limited to named supervisor accounts; every administrative
  action is written to an append-only audit log.

## Retention and deletion

- Access lasts for the purchased period; it can be extended per participant.
- A participant may request deletion of their report, goals, and conversations
  at any time from inside the portal. Requests are completed within five
  working days.
- At the end of a program the sponsor may request deletion of all participant
  data for that cohort.

## Participants are told

Before first sign-in, every invitation links to a plain-language statement of
the above at `/portal/privacy`, covering ownership of the report, who can see
what, how the assistant works, and how to request deletion.

## Contact

Dr. Jeff Holmes · theLeadershipWell · jeff@theleadershipwell.com
