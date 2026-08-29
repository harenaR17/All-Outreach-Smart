'use server'

import { getGoogleAccessToken } from '@/lib/google/auth'
import { extractSheetId } from '@/lib/google/sheets-url'
import { supabaseAdmin } from '@/lib/supabase/server'
import { parseSpreadsheet, type ParseResult } from '@/lib/leads/parser'

export interface FetchSheetResult {
  success: boolean
  parseResult?: ParseResult
  error?: string
  hint?: string
}

/**
 * Fetches a Google Sheets spreadsheet and returns rows as CSV text.
 * Uses one of two strategies depending on the inboxes configured in the database:
 *
 *  Strategy A (preferred) — Service Account with Sheets API:
 *    Picks any stored service account credentials (no inbox impersonation needed),
 *    authenticates as the service account itself, and calls the Google Sheets REST API.
 *    Requires the sheet to be shared with the service account's client_email OR set
 *    to "Anyone with the link can view".
 *
 *  Strategy B (fallback) — Public export URL:
 *    Downloads the CSV export URL (only works when sheet is publicly shared).
 */
export async function fetchGoogleSheetAsCSV(
  sheetUrl: string
): Promise<{ success: boolean; csvText?: string; filename?: string; error?: string; hint?: string }> {
  const spreadsheetId = extractSheetId(sheetUrl)

  if (!spreadsheetId) {
    return {
      success: false,
      error: 'Could not extract a Google Sheet ID from the URL you provided.',
      hint: 'Make sure you paste a Google Sheets or Drive link. Example: https://docs.google.com/spreadsheets/d/YOUR_ID/edit',
    }
  }

  // Try Strategy A first: use stored service account credentials with native Web Crypto & REST API
  try {
    const supabase = supabaseAdmin()
    const { data: accountRow } = await supabase
      .from('email_accounts')
      .select('service_account_client_email, service_account_private_key')
      .not('service_account_client_email', 'is', null)
      .not('service_account_private_key', 'is', null)
      .limit(1)
      .single()

    if (accountRow?.service_account_client_email && accountRow?.service_account_private_key) {
      // Obtain Google access token using Web Crypto (compatible with Cloudflare Workers)
      const { token: accessToken } = await getGoogleAccessToken(
        accountRow.service_account_client_email,
        null, // No "subject" — acting AS the service account, not impersonating a mailbox
        accountRow.service_account_private_key,
        [
          'https://www.googleapis.com/auth/spreadsheets.readonly',
          'https://www.googleapis.com/auth/drive.readonly',
        ]
      )

      // 1. Get sheet metadata to extract title and first sheet tab name
      const metaRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties.title`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      )

      if (metaRes.ok) {
        const metaData = (await metaRes.json()) as {
          properties?: { title?: string }
          sheets?: Array<{ properties?: { title?: string } }>
        }

        const sheetTitle = metaData.properties?.title || 'google_sheet'
        const firstTabName = metaData.sheets?.[0]?.properties?.title || 'Sheet1'

        // 2. Fetch all values from the first tab
        const valuesRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
            firstTabName
          )}?valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        )

        if (valuesRes.ok) {
          const valuesData = (await valuesRes.json()) as { values?: string[][] }
          const rows = valuesData.values

          if (rows && rows.length > 0) {
            // Convert rows array to CSV text
            const csvText = rows
              .map((row) =>
                row
                  .map((cell) => {
                    const str = String(cell ?? '')
                    if (str.includes(',') || str.includes('\n') || str.includes('"')) {
                      return `"${str.replace(/"/g, '""')}"`
                    }
                    return str
                  })
                  .join(',')
              )
              .join('\n')

            return {
              success: true,
              csvText,
              filename: `${sheetTitle.replace(/[^a-z0-9_\-. ]/gi, '_')}.csv`,
            }
          }
        }
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (
      msg.toLowerCase().includes('permission') ||
      msg.toLowerCase().includes('access') ||
      msg.toLowerCase().includes('not found') ||
      msg.toLowerCase().includes('403') ||
      msg.toLowerCase().includes('404')
    ) {
      return {
        success: false,
        error: `Google Sheets API access denied: ${msg}`,
        hint: 'Share the spreadsheet with your service account email (shown on the Inboxes page) or set it to "Anyone with the link can view".',
      }
    }
  }

  // Strategy B: Public export URL fallback
  try {
    const exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&id=${spreadsheetId}`
    const response = await fetch(exportUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': 'OutreachSmart/1.0' },
    })

    if (!response.ok) {
      return {
        success: false,
        error: `Could not access the spreadsheet (HTTP ${response.status}).`,
        hint:
          response.status === 403
            ? 'The sheet is private. Either share it with your service account email, or change its sharing settings to "Anyone with the link can view".'
            : 'Verify the link is correct and the spreadsheet is accessible.',
      }
    }

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/csv') && !contentType.includes('text/plain')) {
      return {
        success: false,
        error: 'Google did not return a CSV response — the link may not point to a spreadsheet or it requires sign-in.',
        hint: 'Make sure the Google Sheet is set to "Anyone with the link can view".',
      }
    }

    const csvText = await response.text()
    return { success: true, csvText, filename: `google_sheet_${spreadsheetId.slice(0, 8)}.csv` }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      error: `Failed to fetch spreadsheet: ${msg}`,
      hint: 'Check the URL and ensure the sheet is shared or public.',
    }
  }
}

/**
 * Server action: Fetch and parse a Google Sheets spreadsheet from a Drive link.
 * Returns the same ParseResult structure as the file upload path.
 */
export async function fetchAndParseGoogleSheet(sheetUrl: string): Promise<FetchSheetResult> {
  const fetchRes = await fetchGoogleSheetAsCSV(sheetUrl)

  if (!fetchRes.success || !fetchRes.csvText || !fetchRes.filename) {
    return { success: false, error: fetchRes.error, hint: fetchRes.hint }
  }

  // Convert CSV text to ArrayBuffer so we can reuse the existing parser
  const encoder = new TextEncoder()
  const buffer = encoder.encode(fetchRes.csvText).buffer as ArrayBuffer

  const parseResult = await parseSpreadsheet({ name: fetchRes.filename, buffer })

  return { success: true, parseResult }
}
