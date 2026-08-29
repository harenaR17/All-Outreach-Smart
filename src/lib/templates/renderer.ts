/**
 * Template token renderer for outreach email sequences.
 *
 * Tokens use the {{variable_name}} syntax matching the keys in `leads.variables`.
 * The special token {{email}} resolves to the lead's email address.
 */

export interface RenderResult {
  rendered: string
  resolved: string[]   // token names that were found and substituted
  missing: string[]    // token names that were NOT found in lead variables
}

export interface TokenSegment {
  type: 'text' | 'resolved' | 'missing'
  value: string         // raw text or the token name (without braces)
  original: string      // original text including {{ }}
}

const TOKEN_REGEX = /\{\{(\w+)\}\}/g

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
 * Renders a template by substituting {{tokens}} with lead variable values.
 * Returns the rendered string plus lists of resolved and missing token names.
 *
 * @param template - Raw template string with {{token}} placeholders.
 * @param variables - Lead variables record (from leads.variables JSONB).
 * @param email    - Lead email address (resolves {{email}}).
 */
export function renderTemplate(
  template: string,
  variables: Record<string, string | number | boolean | null>,
  email: string
): RenderResult {
  const resolved: string[] = []
  const missing: string[] = []
  const seen = new Set<string>()

  const rendered = template.replace(TOKEN_REGEX, (_, token: string) => {
    if (token === 'email') {
      if (!seen.has(token)) { resolved.push(token); seen.add(token) }
      return email
    }

    const val = variables[token]
    if (val !== undefined && val !== null && val !== '') {
      if (!seen.has(token)) { resolved.push(token); seen.add(token) }
      return String(val)
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
 * @param template   - Raw template string.
 * @param variables  - Lead variables or undefined for a generic preview.
 * @param email      - Lead email or undefined.
 */
export function segmentTemplate(
  template: string,
  variables?: Record<string, string | number | boolean | null>,
  email?: string
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

    if (variables !== undefined) {
      const isEmail = token === 'email'
      const val = isEmail ? email : variables[token]
      if (val !== undefined && val !== null && val !== '') {
        segments.push({ type: 'resolved', value: String(val), original: match[0] })
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
