export interface ServiceAccountCredentials {
  emailAddress: string
  clientEmail: string
  privateKey: string
}

export interface VerificationResult {
  success: boolean
  emailAddress?: string
  messagesTotal?: number
  threadsTotal?: number
  accessToken?: string
  tokenExpiresAt?: string
  error?: string
  errorCode?: string
  remediation?: string
}

/**
 * Normalizes private key strings (handling escaped newlines, trimming, etc.)
 */
export function normalizePrivateKey(key: string): string {
  let cleaned = key.trim()
  // Replace literal '\n' string representations with actual newlines
  if (cleaned.includes('\\n')) {
    cleaned = cleaned.replace(/\\n/g, '\n')
  }
  return cleaned
}

/**
 * Base64URL encoder helper for Web Crypto JWT generation
 */
function base64UrlEncode(input: string | Uint8Array): string {
  let binary = ''
  if (typeof input === 'string') {
    const bytes = new TextEncoder().encode(input)
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
    }
  } else {
    for (let i = 0; i < input.length; i++) {
      binary += String.fromCharCode(input[i])
    }
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * Generates an OAuth2 access token for a Google Workspace user using Domain-Wide Delegation.
 * Uses the Web Crypto API (`crypto.subtle`) for 100% compatibility across Cloudflare Workers,
 * Vercel, Node.js, and Edge runtimes (avoiding Node-only OpenSSL stream issues in google-auth-library).
 */
export async function getGoogleAccessToken(
  clientEmail: string,
  subjectEmail?: string | null,
  privateKeyPem?: string,
  customScopes?: string[]
): Promise<{ token: string; expiresAt: string }> {
  if (!clientEmail || !privateKeyPem) {
    throw new Error('clientEmail and privateKeyPem are required to generate access token.')
  }

  const nowSec = Math.floor(Date.now() / 1000)

  const jwtHeader = { alg: 'RS256', typ: 'JWT' }
  const jwtPayload: Record<string, unknown> = {
    iss: clientEmail,
    scope: (
      customScopes || [
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.modify',
      ]
    ).join(' '),
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowSec,
    exp: nowSec + 3600,
  }

  if (subjectEmail) {
    jwtPayload.sub = subjectEmail
  }

  const encodedHeader = base64UrlEncode(JSON.stringify(jwtHeader))
  const encodedPayload = base64UrlEncode(JSON.stringify(jwtPayload))
  const signingInput = `${encodedHeader}.${encodedPayload}`

  // Clean PEM key
  const normalised = normalizePrivateKey(privateKeyPem)
  const pemBody = normalised
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '')

  const keyBytes = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0))

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput)
  )

  const signatureBytes = new Uint8Array(signatureBuffer)
  const signatureBase64Url = base64UrlEncode(signatureBytes)
  const assertion = `${signingInput}.${signatureBase64Url}`

  // Exchange signed JWT assertion with Google OAuth2 Token Endpoint
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })

  if (!tokenRes.ok) {
    const errorText = await tokenRes.text()
    let errorJson: { error?: string; error_description?: string } = {}
    try {
      errorJson = JSON.parse(errorText)
    } catch {
      // not JSON
    }
    const err = new Error(errorJson.error_description || errorJson.error || errorText)
    ;(err as any).status = tokenRes.status
    ;(err as any).response = { status: tokenRes.status, data: errorJson.error ? errorJson : errorText }
    throw err
  }

  const tokenData = (await tokenRes.json()) as { access_token: string; expires_in?: number }
  const expiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString()

  return {
    token: tokenData.access_token,
    expiresAt,
  }
}

/**
 * Verifies a Google Workspace mailbox using Service Account Domain-Wide Delegation.
 * Impersonates the target mailbox and queries Gmail users.getProfile('me').
 */
export async function verifyGmailInbox(
  creds: ServiceAccountCredentials
): Promise<VerificationResult> {
  const emailAddress = creds.emailAddress.trim().toLowerCase()
  const clientEmail = creds.clientEmail.trim()
  const privateKey = normalizePrivateKey(creds.privateKey)

  if (!emailAddress || !clientEmail || !privateKey) {
    return {
      success: false,
      error: 'Missing required credentials (emailAddress, clientEmail, or privateKey).',
    }
  }

  try {
    // 1. Obtain access token using native Web Crypto JWT assertion
    const { token: accessToken, expiresAt: tokenExpiresAt } = await getGoogleAccessToken(
      clientEmail,
      emailAddress,
      privateKey
    )

    // 2. Query Gmail API profile directly via fetch
    const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    if (!profileRes.ok) {
      const errText = await profileRes.text()
      let errJson: any = {}
      try {
        errJson = JSON.parse(errText)
      } catch {
        // not JSON
      }
      const err = new Error(errJson?.error?.message || errText)
      ;(err as any).status = profileRes.status
      ;(err as any).response = { status: profileRes.status, data: errJson }
      throw err
    }

    const profile = (await profileRes.json()) as {
      emailAddress?: string
      messagesTotal?: number
      threadsTotal?: number
    }

    return {
      success: true,
      emailAddress: profile.emailAddress || emailAddress,
      messagesTotal: profile.messagesTotal || 0,
      threadsTotal: profile.threadsTotal || 0,
      accessToken,
      tokenExpiresAt,
    }
  } catch (err: unknown) {
    return parseGoogleAuthError(err, emailAddress, clientEmail)
  }
}

/**
 * Sends a self-addressed test email (from the mailbox to itself) using Service Account Domain-Wide Delegation.
 * This directly verifies that the 'https://www.googleapis.com/auth/gmail.send' scope is fully authorized.
 */
export async function sendSelfTestEmail(
  creds: ServiceAccountCredentials
): Promise<VerificationResult> {
  const emailAddress = creds.emailAddress.trim().toLowerCase()
  const clientEmail = creds.clientEmail.trim()
  const privateKey = normalizePrivateKey(creds.privateKey)

  if (!emailAddress || !clientEmail || !privateKey) {
    return {
      success: false,
      error: 'Missing required credentials (emailAddress, clientEmail, or privateKey).',
    }
  }

  try {
    // 1. Obtain access token
    const { token: accessToken, expiresAt: tokenExpiresAt } = await getGoogleAccessToken(
      clientEmail,
      emailAddress,
      privateKey
    )

    // 2. Build RFC 2822 self-test message
    const messageId = `<test-${crypto.randomUUID()}@outreach-smart>`
    const dateStr = new Date().toUTCString()
    const subject = `[Outreach Smart] Mailbox Connected & Verified`
    const body = `Hello,\n\nYour Google Workspace mailbox (${emailAddress}) is now connected to Outreach Smart.\n\n✅ Domain-Wide Delegation and Gmail Send permissions are active and operational.\n\nTimestamp: ${dateStr}\n`

    const headers = [
      `From: ${emailAddress}`,
      `To: ${emailAddress}`,
      `Subject: ${subject}`,
      `Message-ID: ${messageId}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset=utf-8`,
      `Content-Transfer-Encoding: quoted-printable`,
    ]

    const rawEmail = [...headers, '', body].join('\r\n')
    const rawEncoded = base64UrlEncode(rawEmail)

    // 3. Send email via Gmail API
    const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: rawEncoded }),
    })

    if (!sendRes.ok) {
      const errText = await sendRes.text()
      let errJson: any = {}
      try {
        errJson = JSON.parse(errText)
      } catch {
        // not JSON
      }
      const err = new Error(errJson?.error?.message || errText)
      ;(err as any).status = sendRes.status
      ;(err as any).response = { status: sendRes.status, data: errJson }
      throw err
    }

    return {
      success: true,
      emailAddress,
      accessToken,
      tokenExpiresAt,
    }
  } catch (err: unknown) {
    return parseGoogleAuthError(err, emailAddress, clientEmail)
  }
}

/**
 * Parses Google API and JWT authentication errors into user-friendly actionable feedback.
 */
function parseGoogleAuthError(
  err: unknown,
  targetEmail: string,
  clientEmail: string
): VerificationResult {
  const errorObj = err as any
  const resData = errorObj?.response?.data || errorObj?.cause?.response?.data
  let dataError = ''
  let dataDesc = ''

  if (typeof resData === 'string') {
    dataDesc = resData
  } else if (resData && typeof resData === 'object') {
    dataError = String(resData.error || resData?.error?.message || '')
    dataDesc = String(resData.error_description || resData?.error?.errors?.[0]?.message || '')
  }

  const rawMessage = errorObj?.message || String(err)
  const status = errorObj?.status || errorObj?.response?.status || errorObj?.code
  const fullErrorText = `${rawMessage} ${dataError} ${dataDesc} ${JSON.stringify(resData || {})}`.toLowerCase()

  const diagnosticDetails = [
    rawMessage,
    dataError ? `error: ${dataError}` : null,
    dataDesc ? `description: ${dataDesc}` : null,
    status ? `status: ${status}` : null,
  ]
    .filter(Boolean)
    .join(' | ')

  // 1. Domain-wide delegation missing or client ID / scope not authorized
  if (
    fullErrorText.includes('unauthorized_client') ||
    fullErrorText.includes('client is unauthorized') ||
    fullErrorText.includes('access_denied') ||
    fullErrorText.includes('delegation')
  ) {
    return {
      success: false,
      errorCode: 'DELEGATION_NOT_AUTHORIZED',
      error: `Google rejected token: Domain-wide delegation or scope is not authorized for "${targetEmail}" (${dataDesc || dataError || rawMessage}).`,
      remediation:
        'In Google Workspace Admin Console (admin.google.com) → Security → API controls → Domain-wide delegation: Edit your Client ID and ensure ALL authorized scopes match: https://www.googleapis.com/auth/gmail.send, https://www.googleapis.com/auth/gmail.readonly, and https://www.googleapis.com/auth/gmail.modify.',
    }
  }

  // 2. Mailbox not found / invalid grant / clock skew / user not in domain
  if (
    fullErrorText.includes('invalid_grant') ||
    fullErrorText.includes('user not found') ||
    fullErrorText.includes('account not found')
  ) {
    return {
      success: false,
      errorCode: 'INVALID_GRANT_OR_USER',
      error: `Google rejected credentials: ${dataDesc || dataError || rawMessage}`,
      remediation:
        'Verify that: (1) The mailbox address exists in your Google Workspace domain. (2) The service account private key matches the client email. (3) The server system clock is accurate.',
    }
  }

  // 3. Invalid private key format / PEM decode error
  if (
    fullErrorText.includes('pem') ||
    fullErrorText.includes('private key') ||
    fullErrorText.includes('bad decrypt') ||
    fullErrorText.includes('asn1') ||
    fullErrorText.includes('routines')
  ) {
    return {
      success: false,
      errorCode: 'INVALID_PRIVATE_KEY',
      error: 'Invalid Service Account Private Key format.',
      remediation:
        'Ensure the private key includes the "-----BEGIN PRIVATE KEY-----" and "-----END PRIVATE KEY-----" headers and valid base64 key contents.',
    }
  }

  // 4. Fallback general error with full diagnostic trace
  return {
    success: false,
    errorCode: 'GMAIL_API_ERROR',
    error: `Gmail verification failed: ${diagnosticDetails || rawMessage}`,
    remediation:
      'Check that Gmail API is enabled in your Google Cloud Project, the service account has active domain-wide delegation in admin.google.com, and scopes match.',
  }
}
