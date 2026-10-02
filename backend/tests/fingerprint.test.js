import { generateFingerprint, normalizeFileName, normalizeMessage } from '../src/services/fingerprintService.js'

const REPO = '0b7a8f7e-6a57-4d52-9d8b-0f4f1c2c9a11'
const base = {
  repositoryId: REPO,
  errorType: 'TypeError',
  message: 'Cannot read properties of undefined',
  fileName: 'Expense.jsx',
  lineNumber: 47,
}

describe('generateFingerprint', () => {
  it('is a stable SHA-256 hex digest for identical errors', () => {
    const a = generateFingerprint(base)
    const b = generateFingerprint({ ...base })
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(a).toBe(b)
  })

  it('ignores timestamps, column numbers and other occurrence data', () => {
    const a = generateFingerprint({ ...base, timestamp: '2026-01-01T00:00:00Z', columnNumber: 3 })
    const b = generateFingerprint({ ...base, timestamp: '2026-09-30T12:00:00Z', columnNumber: 99 })
    expect(a).toBe(b)
  })

  it('changes when repository, type, message, file or line change', () => {
    const original = generateFingerprint(base)
    expect(generateFingerprint({ ...base, repositoryId: '9c1f5a8e-2f3b-4a8c-8d9e-1a2b3c4d5e6f' })).not.toBe(original)
    expect(generateFingerprint({ ...base, errorType: 'ReferenceError' })).not.toBe(original)
    expect(generateFingerprint({ ...base, message: 'x is not a function' })).not.toBe(original)
    expect(generateFingerprint({ ...base, fileName: 'Group.jsx' })).not.toBe(original)
    expect(generateFingerprint({ ...base, lineNumber: 48 })).not.toBe(original)
  })

  it('groups messages that differ only by dynamic values', () => {
    const a = generateFingerprint({ ...base, message: 'User 123 not found (id 3f2b9c4e-1d2a-4b3c-9e8f-7a6b5c4d3e2f)' })
    const b = generateFingerprint({ ...base, message: 'User 987 not found (id 0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d)' })
    expect(a).toBe(b)
  })

  it('groups bundled files across deploys (content hashes stripped)', () => {
    const a = generateFingerprint({ ...base, fileName: 'https://app.example/assets/index-BFfxeLB0.js' })
    const b = generateFingerprint({ ...base, fileName: 'https://app.example/assets/index-Zq81kPw2.js?v=2' })
    expect(a).toBe(b)
  })
})

describe('normalizeMessage', () => {
  it('replaces ids, numbers, urls, emails and timestamps', () => {
    expect(normalizeMessage('GET https://api.example.com/users/42?x=1 failed for a@b.co at 2026-09-30T10:00:00Z (0xdeadbeef)')).toBe(
      'GET <url> failed for <email> at <timestamp> (<hex>)',
    )
  })

  it('replaces numbers glued to a unit', () => {
    expect(normalizeMessage('connect ETIMEDOUT 10.0.3.17:5432 after 4321ms (heap 512MB)')).toBe(
      'connect ETIMEDOUT <n>.<n>:<n> after <n> (heap <n>)',
    )
  })

  it('keeps meaningful text such as property names', () => {
    expect(normalizeMessage("Cannot read properties of undefined (reading 'name')")).toBe(
      "Cannot read properties of undefined (reading 'name')",
    )
  })
})

describe('normalizeFileName', () => {
  it('keeps plain source file names untouched', () => {
    expect(normalizeFileName('src/components/Expense.jsx')).toBe('src/components/Expense.jsx')
    expect(normalizeFileName('react-dom.development.js')).toBe('react-dom.development.js')
  })
})
