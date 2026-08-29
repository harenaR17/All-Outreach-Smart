/**
 * Extracts a Google Sheets spreadsheetId from any valid Google Drive / Sheets URL.
 * Handles:
 *   https://docs.google.com/spreadsheets/d/SHEET_ID/edit#gid=0
 *   https://docs.google.com/spreadsheets/d/SHEET_ID/
 *   https://drive.google.com/file/d/SHEET_ID/view
 *   https://drive.google.com/open?id=SHEET_ID
 */
export function extractSheetId(url: string): string | null {
  try {
    const parsed = new URL(url)

    // Pattern 1: /spreadsheets/d/{id} or /file/d/{id}
    const pathMatch = parsed.pathname.match(/\/d\/([a-zA-Z0-9_-]{20,})/)
    if (pathMatch) return pathMatch[1]

    // Pattern 2: ?id=SHEET_ID
    const idParam = parsed.searchParams.get('id')
    if (idParam && /^[a-zA-Z0-9_-]{20,}$/.test(idParam)) return idParam

    return null
  } catch {
    return null
  }
}
