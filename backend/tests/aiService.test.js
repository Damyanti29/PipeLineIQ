import { jest } from '@jest/globals'
import { src } from './helpers/loadApp.js'

process.env.GEMINI_API_KEY = 'test-gemini-key' // enable the Gemini code path for this file
const { analyzeError, buildErrorContext, buildPrompt, parseAnalysis } = await import(src('services/aiService.js'))
const { redactSecrets } = await import(src('utils/redact.js'))

const error = {
  id: 'e1',
  error_type: 'TypeError',
  message: 'Cannot read properties of undefined',
  file_name: 'Expense.jsx',
  line_number: 47,
  column_number: 12,
  environment: 'production',
  occurrences: 3,
  stack_trace: 'TypeError: boom\n    at Expense (Expense.jsx:47:12)',
}
const repository = { full_name: 'me/app' }

const validAnalysis = {
  severity: 'critical',
  rootCause: 'user is undefined after session expiry',
  explanation: 'The component reads user.name without a guard.',
  suggestedFix: 'const name = user?.name ?? "Unknown"',
  affectedArea: 'Expense list',
}

const geminiResponse = (text, { ok = true, status = 200 } = {}) =>
  jest.fn(async () => ({ ok, status, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) }))

describe('analyzeError', () => {
  it('returns a validated analysis on success', async () => {
    const fetchImpl = geminiResponse(JSON.stringify(validAnalysis))
    const result = await analyzeError(error, repository, { fetchImpl })

    expect(result).toMatchObject({ status: 'completed', ...validAnalysis })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toContain(':generateContent')
    expect(init.headers['x-goog-api-key']).toBe('test-gemini-key')
    expect(url).not.toContain('test-gemini-key') // key is sent as a header, not in the URL
  })

  it('accepts JSON wrapped in markdown fences', async () => {
    const fetchImpl = geminiResponse('```json\n' + JSON.stringify(validAnalysis) + '\n```')
    expect((await analyzeError(error, repository, { fetchImpl })).status).toBe('completed')
  })

  it('marks analysis unavailable when Gemini is down (never throws)', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error('ECONNRESET')
    })
    await expect(analyzeError(error, repository, { fetchImpl })).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'request_failed',
    })
  })

  it('falls back to the latest model when the configured one is retired', async () => {
    const ok = await geminiResponse(JSON.stringify(validAnalysis))()
    const fetchImpl = jest.fn().mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) }).mockResolvedValueOnce(ok)
    const result = await analyzeError(error, repository, { fetchImpl })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(fetchImpl.mock.calls[1][0]).toContain('gemini-flash-latest')
    expect(result).toMatchObject({ status: 'completed', model: 'gemini-flash-latest' })
  })

  it('retries an overloaded model once, then falls back to the next model', async () => {
    const ok = await geminiResponse(JSON.stringify(validAnalysis))()
    const overloaded = { ok: false, status: 503, json: async () => ({}) }
    const fetchImpl = jest.fn().mockResolvedValueOnce(overloaded).mockResolvedValueOnce(overloaded).mockResolvedValueOnce(ok)
    const result = await analyzeError(error, repository, { fetchImpl })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(fetchImpl.mock.calls[1][0]).toBe(fetchImpl.mock.calls[0][0]) // same model retried
    expect(result).toMatchObject({ status: 'completed', model: 'gemini-flash-latest' })
  })

  it('marks analysis unavailable on HTTP errors', async () => {
    const fetchImpl = geminiResponse('', { ok: false, status: 429 })
    expect(await analyzeError(error, repository, { fetchImpl })).toMatchObject({ status: 'unavailable', reason: 'gemini_http_429' })
  })

  it.each([
    ['non-JSON output', 'The root cause is probably...'],
    ['missing fields', JSON.stringify({ severity: 'high' })],
    ['invalid severity', JSON.stringify({ ...validAnalysis, severity: 'catastrophic' })],
  ])('rejects %s', async (_, text) => {
    const result = await analyzeError(error, repository, { fetchImpl: geminiResponse(text) })
    expect(result).toMatchObject({ status: 'unavailable', reason: 'invalid_response' })
  })
})

describe('what is sent to Gemini', () => {
  const secretError = {
    ...error,
    message: 'Auth failed with api_key=AIzaSyA1234567890abcdefghijklmnopqrstuv',
    stack_trace: [
      'Error: token ghp_abcdefghijklmnopqrstuvwxyz0123456789 rejected',
      'password: hunter2',
      'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
      'xoxb-1234567890-abcdefghijklmnop',
      '-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----',
      'postgres://admin:s3cret@db.internal:5432/app',
    ].join('\n'),
    metadata: { apiKey: 'should-never-be-sent' },
    user_agent: 'Mozilla/5.0',
    request_url: 'https://app.example/pay?token=abc123',
  }

  it('redacts credentials and omits metadata, user agents and query strings', () => {
    const prompt = buildPrompt(buildErrorContext(secretError, repository))

    for (const secret of ['AIzaSyA1234567890', 'ghp_abcdef', 'hunter2', 'eyJhbGciOi', 'xoxb-', 'MIIEow', 's3cret', 'should-never-be-sent', 'token=abc123', 'Mozilla']) {
      expect(prompt).not.toContain(secret)
    }
    expect(prompt).toContain('TypeError')
    expect(prompt).toContain('Expense.jsx')
    expect(prompt).toContain('https://app.example/pay')
  })

  it('redactSecrets leaves ordinary debugging text alone', () => {
    const text = "TypeError: Cannot read properties of undefined (reading 'name') at Expense.jsx:47"
    expect(redactSecrets(text)).toBe(text)
  })
})

describe('parseAnalysis', () => {
  it('trims and validates fields', () => {
    expect(parseAnalysis(JSON.stringify({ ...validAnalysis, rootCause: '  spaced  ' })).rootCause).toBe('spaced')
  })
})
