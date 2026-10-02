import { sha256Hex } from '../utils/crypto.js'

// Replace values that change between occurrences of the same bug, so they group together.
const MESSAGE_RULES = [
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>'],
  [/\b\d{4}-\d{2}-\d{2}[t ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:z|[+-]\d{2}:?\d{2})?\b/gi, '<timestamp>'],
  [/\b[a-z][a-z0-9+.-]*:\/\/[^\s'"`)]+/gi, '<url>'],
  [/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, '<email>'],
  [/\b0x[0-9a-f]+\b/gi, '<hex>'],
  [/\b[0-9a-f]{12,}\b/gi, '<hex>'],
  // Numbers, including ones glued to a unit (4321ms, 512MB, 30s), which never hit a \b after the digits.
  [/\b\d+(?:\.\d+)?(?:ms|s|m|h|b|kb|mb|gb|px|%)?\b/gi, '<n>'],
]

export function normalizeMessage(message = '') {
  return MESSAGE_RULES.reduce((out, [pattern, token]) => out.replace(pattern, token), String(message))
    .replace(/\s+/g, ' ')
    .trim()
}

// Strips origin, query string and bundler content hashes (e.g. GroupList.abc123de.js).
export function normalizeFileName(fileName = '') {
  if (!fileName) return ''
  return String(fileName)
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i, '')
    .split(/[?#]/)[0]
    .replace(/[.-][0-9a-z_-]{6,}(?=\.(?:m?js|cjs|jsx|css)$)/i, (segment) => (/\d/.test(segment) ? '' : segment))
}

// SHA-256 over repository, type, normalized message, file and line. Timestamps are excluded.
export function generateFingerprint({ repositoryId, errorType, message, fileName, lineNumber }) {
  const parts = [
    repositoryId,
    String(errorType ?? '').trim(),
    normalizeMessage(message),
    normalizeFileName(fileName),
    lineNumber ?? '',
  ]
  return sha256Hex(parts.join('\u001f'))
}

// "file:line" for titles, alerts and issues: no origin or query string (which can carry tokens).
export function displayLocation({ file_name: fileName, line_number: lineNumber }) {
  if (!fileName) return null
  const file = normalizeFileName(fileName).replace(/^\/+/, '') || fileName
  return lineNumber ? `${file}:${lineNumber}` : file
}
