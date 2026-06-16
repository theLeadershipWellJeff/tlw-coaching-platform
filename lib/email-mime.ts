/**
 * Shared helpers for building raw Gmail messages.
 *
 * Email headers (RFC 5322) may only carry ASCII. Subject lines that contain
 * non-ASCII characters — em-dashes (—), middots (·), or the smart quotes/dashes
 * Claude tends to produce in AI-drafted subjects — must be wrapped as RFC 2047
 * "encoded-words", otherwise mail clients render them as mojibake (the "weird
 * characters" bug). `encodeHeaderValue` does that; `headerSafe` keeps the value
 * on a single line as a defense against header injection.
 */

/** Strip CR/LF (header-injection defense) and trim. Use for ASCII fields (to/cc). */
export function headerSafe(s: string): string {
  return (s || '').replace(/[\r\n]+/g, ' ').trim()
}

/**
 * Encode a header value (typically a Subject) for safe transport. Pure ASCII
 * passes through unchanged; anything else is emitted as one or more RFC 2047
 * base64 encoded-words, chunked so each stays within the 75-char limit and
 * never splits a multibyte UTF-8 character.
 */
export function encodeHeaderValue(input: string): string {
  const s = headerSafe(input)
  // Printable ASCII (plus tab) is safe to send verbatim.
  if (/^[\x20-\x7E]*$/.test(s)) return s

  // 'B' (base64) encoding, UTF-8. base64 of 45 source bytes is 60 chars; with
  // the "=?UTF-8?B?" prefix (10) and "?=" suffix (2) that's 72 ≤ 75.
  const MAX_BYTES = 45
  const words: string[] = []
  let buf: number[] = []
  for (const ch of s) {
    const chBytes = Array.from(Buffer.from(ch, 'utf8'))
    if (buf.length > 0 && buf.length + chBytes.length > MAX_BYTES) {
      words.push(`=?UTF-8?B?${Buffer.from(buf).toString('base64')}?=`)
      buf = []
    }
    buf.push(...chBytes)
  }
  if (buf.length > 0) words.push(`=?UTF-8?B?${Buffer.from(buf).toString('base64')}?=`)
  // Fold long subjects across continuation lines (CRLF + space).
  return words.join('\r\n ')
}
