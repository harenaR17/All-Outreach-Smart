/**
 * Template token renderer for outreach email sequences.
 *
 * Tokens use the {{variable_name}} syntax matching the keys in `leads.variables`.
 * The special token {{email}} resolves to the lead's email address.
 *
 * Inbox/sender variables (e.g. {{sender_first_name}}, {{sender_signature}}) are
 * injected via the optional `inboxVariables` parameter produced by
 * `buildInboxVariableMap`. Lead variables take precedence over inbox variables
 * for generic keys (e.g. {{role}}), while namespaced tokens like {{sender_role}}
 * are unique to the inbox.
 */

export interface RenderResult {
  rendered: string
  resolved: string[]   // token names that were found and substituted
  missing: string[]    // token names that were NOT found in any variable source
}

export interface TokenSegment {
  type: 'text' | 'resolved' | 'missing'
  value: string         // raw text or the token name (without braces)
  original: string      // original text including {{ }}
}

/** Shape of an inbox/email-account row (subset needed for variable resolution). */
export interface InboxForVariables {
  email_address: string
  display_name?: string | null
  first_name?: string | null
  last_name?: string | null
  role?: string | null
  phone_number?: string | null
  signature?: string | null
  variables?: Record<string, string> | null
}

const TOKEN_REGEX = /\{\{(\w+)\}\}/g

/**
 * Builds a flat variable map from an inbox/email-account row.
 *
 * Resolved aliases:
 *   sender_email, sender_name, sender_first_name, sending_account_first_name,
 *   sender_last_name, sender_role, sender_phone, phone_number,
 *   sender_signature, account_signature, signature
 *   + any arbitrary keys in inbox.variables (e.g. booking_link).
 *
 * Falls back to parsing display_name when first_name / last_name are null.
 */
export function buildInboxVariableMap(inbox: InboxForVariables): Record<string, string> {
  const nameParts = (inbox.display_name ?? '').trim().split(/\s+/)
  const firstName = inbox.first_name?.trim() || nameParts[0] || ''
  const lastName  = inbox.last_name?.trim()  || nameParts.slice(1).join(' ') || ''
  const fullName  = [firstName, lastName].filter(Boolean).join(' ') || inbox.display_name || ''
  const sig       = inbox.signature?.trim() ?? ''
  const phone     = inbox.phone_number?.trim() ?? ''
  const role      = inbox.role?.trim() ?? ''

  return {
    // Email aliases
    sender_email: inbox.email_address,
    sending_account_email: inbox.email_address,

    // Name aliases
    sender_name:  fullName,
    sender_first_name: firstName,
    sending_account_first_name: firstName,
    sender_last_name: lastName,
    sending_account_last_name: lastName,

    // Role / phone
    sender_role: role,
    sender_phone: phone,
    phone_number: phone,

    // Signature aliases
    sender_signature: sig,
    account_signature: sig,
    signature: sig,

    // Arbitrary custom keys from inbox.variables (e.g. booking_link)
    ...(inbox.variables ?? {}),
  }
}

/**
 * Extracts all unique {{token}} names from a template string.
 */
export function extractTokens(text: string): string[] {
  const found = new Set<string>()
  for (const match of text.matchAll(TOKEN_REGEX)) {
    found.add(match[1])
  }
  return Array.from(found)
}

/**
 * Renders a template by substituting {{tokens}} with variable values.
 * Returns the rendered string plus lists of resolved and missing token names.
 *
 * Resolution order (first non-empty value wins):
 *   1. {{email}} → leadEmail (special built-in)
 *   2. leadVariables[token]
 *   3. inboxVariables[token]
 *
 * @param template       - Raw template string with {{token}} placeholders.
 * @param leadVariables  - Lead variables record (from leads.variables JSONB).
 * @param leadEmail      - Lead email address (resolves {{email}}).
 * @param inboxVariables - Optional inbox/sender variable map from buildInboxVariableMap.
 */
export function renderTemplate(
  template: string,
  leadVariables: Record<string, string | number | boolean | null>,
  leadEmail: string,
  inboxVariables?: Record<string, string>,
): RenderResult {
  const resolved: string[] = []
  const missing: string[] = []
  const seen = new Set<string>()

  const rendered = template.replace(TOKEN_REGEX, (_, token: string) => {
    if (token === 'email') {
      if (!seen.has(token)) { resolved.push(token); seen.add(token) }
      return leadEmail
    }

    // Lead variables take precedence
    const leadVal = leadVariables[token]
    if (leadVal !== undefined && leadVal !== null && leadVal !== '') {
      if (!seen.has(token)) { resolved.push(token); seen.add(token) }
      return String(leadVal)
    }

    // Fall back to inbox variables
    const inboxVal = inboxVariables?.[token]
    if (inboxVal !== undefined && inboxVal !== '') {
      if (!seen.has(token)) { resolved.push(token); seen.add(token) }
      return inboxVal
    }

    if (!seen.has(token)) { missing.push(token); seen.add(token) }
    return `{{${token}}}` // leave the placeholder intact so it stays visible
  })

  return { rendered, resolved, missing }
}

/**
 * Splits a template into typed segments for color-coded preview rendering.
 * Each segment is either plain text, a resolved token, or a missing token.
 *
 * Resolution order mirrors renderTemplate: email → lead → inbox.
 *
 * @param template       - Raw template string.
 * @param leadVariables  - Lead variables or undefined for a generic preview.
 * @param leadEmail      - Lead email or undefined.
 * @param inboxVariables - Optional inbox variable map from buildInboxVariableMap.
 */
export function segmentTemplate(
  template: string,
  leadVariables?: Record<string, string | number | boolean | null>,
  leadEmail?: string,
  inboxVariables?: Record<string, string>,
): TokenSegment[] {
  const segments: TokenSegment[] = []
  let lastIndex = 0

  for (const match of template.matchAll(new RegExp(TOKEN_REGEX.source, 'g'))) {
    const token = match[1]
    const start = match.index!
    const end = start + match[0].length

    // Text before this token
    if (start > lastIndex) {
      segments.push({ type: 'text', value: template.slice(lastIndex, start), original: template.slice(lastIndex, start) })
    }

    if (leadVariables !== undefined) {
      const isEmail = token === 'email'
      const leadVal = isEmail ? leadEmail : leadVariables[token]
      const inboxVal = inboxVariables?.[token]
      const resolvedVal = (leadVal !== undefined && leadVal !== null && leadVal !== '')
        ? leadVal
        : (inboxVal !== undefined && inboxVal !== '')
          ? inboxVal
          : undefined

      if (resolvedVal !== undefined) {
        segments.push({ type: 'resolved', value: String(resolvedVal), original: match[0] })
      } else {
        segments.push({ type: 'missing', value: token, original: match[0] })
      }
    } else {
      // No lead selected — render all as "preview" (unresolved but not flagged)
      segments.push({ type: 'text', value: match[0], original: match[0] })
    }

    lastIndex = end
  }

  // Trailing text
  if (lastIndex < template.length) {
    segments.push({ type: 'text', value: template.slice(lastIndex), original: template.slice(lastIndex) })
  }

  return segments
}
