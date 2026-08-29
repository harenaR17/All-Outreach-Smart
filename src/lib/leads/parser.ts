import Papa from 'papaparse'
import * as XLSX from 'xlsx'

export interface ParsedLeadRow {
  email: string
  variables: Record<string, string | number | boolean | null>
}

export interface ParseResult {
  success: boolean
  filename: string
  totalRowsFound: number
  validLeads: ParsedLeadRow[]
  inFileDuplicates: number
  headers: string[]
  detectedEmailColumn: string | null
  error?: string
}

/**
 * Normalizes header keys to clean variable identifiers (e.g. "First Name" -> "first_name")
 */
export function normalizeHeaderKey(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s-]+/g, '_')
}

/**
 * Validates basic email formatting
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email.trim().toLowerCase())
}

/**
 * Identifies the column name containing email addresses
 */
export function detectEmailColumn(
  headers: string[],
  rows: Record<string, unknown>[]
): string | null {
  const commonNames = [
    'email',
    'e-mail',
    'email_address',
    'emailaddress',
    'mail',
    'work_email',
    'contact_email',
    'primary_email',
  ]

  // 1. Check exact or normalized header name match
  for (const h of headers) {
    const norm = normalizeHeaderKey(h)
    if (commonNames.includes(norm)) {
      return h
    }
  }

  // 2. Check header containing "email" or "mail"
  for (const h of headers) {
    const norm = normalizeHeaderKey(h)
    if (norm.includes('email') || norm.includes('mail')) {
      return h
    }
  }

  // 3. Inspect first 10 rows for email pattern
  for (const h of headers) {
    let emailMatches = 0
    const sampleSize = Math.min(rows.length, 10)

    for (let i = 0; i < sampleSize; i++) {
      const val = String(rows[i]?.[h] || '').trim()
      if (isValidEmail(val)) {
        emailMatches++
      }
    }

    if (emailMatches >= Math.max(1, Math.floor(sampleSize * 0.5))) {
      return h
    }
  }

  return null
}

/**
 * Parses a CSV or Excel file (from File object or ArrayBuffer) in browser/server
 */
export async function parseSpreadsheet(
  file: File | { name: string; buffer: ArrayBuffer }
): Promise<ParseResult> {
  const filename = file.name
  const ext = filename.split('.').pop()?.toLowerCase()

  try {
    let rawRows: Record<string, unknown>[] = []
    let headers: string[] = []

    if (ext === 'csv' || ext === 'txt') {
      let csvText: string

      if ('text' in file && typeof file.text === 'function') {
        csvText = await file.text()
      } else if ('buffer' in file) {
        const decoder = new TextDecoder('utf-8')
        csvText = decoder.decode(file.buffer)
      } else {
        throw new Error('Unable to read text from file')
      }

      const parsed = Papa.parse<Record<string, unknown>>(csvText, {
        header: true,
        skipEmptyLines: 'greedy',
        transformHeader: (h) => h.trim(),
      })

      rawRows = parsed.data
      headers = parsed.meta.fields || []
    } else if (ext === 'xlsx' || ext === 'xls') {
      let arrayBuffer: ArrayBuffer

      if ('arrayBuffer' in file && typeof file.arrayBuffer === 'function') {
        arrayBuffer = await file.arrayBuffer()
      } else if ('buffer' in file) {
        arrayBuffer = file.buffer
      } else {
        throw new Error('Unable to read arrayBuffer from file')
      }

      const workbook = XLSX.read(arrayBuffer, { type: 'array' })
      const firstSheetName = workbook.SheetNames[0]

      if (!firstSheetName) {
        return {
          success: false,
          filename,
          totalRowsFound: 0,
          validLeads: [],
          inFileDuplicates: 0,
          headers: [],
          detectedEmailColumn: null,
          error: 'Spreadsheet has no worksheets.',
        }
      }

      const worksheet = workbook.Sheets[firstSheetName]
      rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
        defval: '',
        raw: false,
      })

      if (rawRows.length > 0 && rawRows[0]) {
        headers = Object.keys(rawRows[0]).map((h) => h.trim())
      }
    } else {
      return {
        success: false,
        filename,
        totalRowsFound: 0,
        validLeads: [],
        inFileDuplicates: 0,
        headers: [],
        detectedEmailColumn: null,
        error: 'Unsupported file format. Please upload a .csv or .xlsx file.',
      }
    }

    if (rawRows.length === 0) {
      return {
        success: false,
        filename,
        totalRowsFound: 0,
        validLeads: [],
        inFileDuplicates: 0,
        headers,
        detectedEmailColumn: null,
        error: 'No data rows found in the uploaded spreadsheet.',
      }
    }

    const emailCol = detectEmailColumn(headers, rawRows)

    if (!emailCol) {
      return {
        success: false,
        filename,
        totalRowsFound: rawRows.length,
        validLeads: [],
        inFileDuplicates: 0,
        headers,
        detectedEmailColumn: null,
        error:
          'Could not automatically detect an email column. Please ensure your header row contains "email" or valid email addresses.',
      }
    }

    // Process rows & deduplicate within file
    const seenEmails = new Set<string>()
    const validLeads: ParsedLeadRow[] = []
    let inFileDuplicates = 0

    for (const row of rawRows) {
      const rawEmail = String(row[emailCol] || '').trim().toLowerCase()

      if (!isValidEmail(rawEmail)) {
        continue // Skip rows without valid email
      }

      if (seenEmails.has(rawEmail)) {
        inFileDuplicates++
        continue // Skip duplicate within the same spreadsheet
      }

      seenEmails.add(rawEmail)

      // Extract variables
      const variables: Record<string, string | number | boolean | null> = {}

      for (const [key, val] of Object.entries(row)) {
        if (key === emailCol) continue // Exclude primary email from variables

        const normKey = normalizeHeaderKey(key)
        if (!normKey) continue

        let cleanVal: string | number | boolean | null = null
        if (val !== undefined && val !== null && val !== '') {
          cleanVal = typeof val === 'string' ? val.trim() : (val as number | boolean)
        }

        variables[normKey] = cleanVal
      }

      validLeads.push({
        email: rawEmail,
        variables,
      })
    }

    return {
      success: true,
      filename,
      totalRowsFound: rawRows.length,
      validLeads,
      inFileDuplicates,
      headers,
      detectedEmailColumn: emailCol,
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown parsing error'
    return {
      success: false,
      filename,
      totalRowsFound: 0,
      validLeads: [],
      inFileDuplicates: 0,
      headers: [],
      detectedEmailColumn: null,
      error: `Failed to parse spreadsheet: ${msg}`,
    }
  }
}
