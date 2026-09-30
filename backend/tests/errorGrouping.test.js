import { jest } from '@jest/globals'
import { QUEUES, src } from './helpers/loadApp.js'
import { createFakeSupabase } from './helpers/fakeSupabase.js'

const REPO = '0b7a8f7e-6a57-4d52-9d8b-0f4f1c2c9a11'
const ERROR_ID = 'e0000000-0000-4000-8000-000000000001'

// ─── mocks ──────────────────────────────────────────────────────
let rpcResult
let errorRow
const admin = createFakeSupabase({
  rpc: jest.fn(async () => ({ data: [rpcResult], error: null })),
  tables: {
    errors: (chain) => {
      const update = chain.find(([method]) => method === 'update')
      if (update) errorRow = { ...errorRow, ...update[1] }
      return { data: errorRow, error: null }
    },
    error_events: { data: [{ request_url: 'https://app.example/x?token=abc' }], error: null },
  },
})

const enqueueOrRun = jest.fn(async () => {})
const analyzeError = jest.fn()
const openIncidentForError = jest.fn()
const queueSlackNotification = jest.fn(async () => {})

jest.unstable_mockModule(src('supabase/adminClient.js'), () => ({
  requireAdmin: () => admin,
  unwrap: ({ data, error }) => {
    if (error) throw new Error(error.message)
    return data
  },
}))
jest.unstable_mockModule(src('workers/queue.js'), () => ({ QUEUES, enqueueOrRun }))
jest.unstable_mockModule(src('services/aiService.js'), () => ({ analyzeError }))
jest.unstable_mockModule(src('services/incidentService.js'), () => ({
  openIncidentForError,
  queueSlackNotification,
  shouldOpenIncident: (error) => ['critical', 'high'].includes(error.severity),
}))

const errorService = await import(src('services/errorService.js'))
const { generateFingerprint } = await import(src('services/fingerprintService.js'))

beforeEach(() => {
  jest.clearAllMocks()
  errorRow = {
    id: ERROR_ID,
    repository_id: REPO,
    error_type: 'TypeError',
    message: 'Cannot read properties of undefined',
    severity: 'high',
    environment: 'production',
    status: 'open',
    occurrences: 1,
    ai_analysis: { status: 'pending' },
    repository: { id: REPO, full_name: 'me/app' },
  }
})

const payload = {
  repositoryId: REPO,
  errorType: 'TypeError',
  message: 'Cannot read properties of undefined',
  fileName: 'Expense.jsx',
  lineNumber: 47,
  environment: 'production',
}

describe('ingestError (grouping)', () => {
  it('creates a new group and queues AI analysis once', async () => {
    rpcResult = { error_id: ERROR_ID, is_new: true, is_regression: false, occurrences: 1 }

    const outcome = await errorService.ingestError(payload)

    expect(outcome).toMatchObject({ errorId: ERROR_ID, isNew: true, occurrences: 1 })
    expect(admin.rpc).toHaveBeenCalledWith(
      'ingest_error',
      expect.objectContaining({ p_repository_id: REPO, p_fingerprint: generateFingerprint(payload), p_severity: 'high' }),
    )
    expect(enqueueOrRun).toHaveBeenCalledTimes(1)
    expect(enqueueOrRun).toHaveBeenCalledWith(QUEUES.aiAnalysis, { errorId: ERROR_ID }, expect.any(Function))
  })

  it('only increments existing groups: no AI analysis, no Slack for repeats', async () => {
    for (let i = 2; i <= 100; i += 1) {
      rpcResult = { error_id: ERROR_ID, is_new: false, is_regression: false, occurrences: i }
      await errorService.ingestError(payload)
    }
    expect(admin.rpc).toHaveBeenCalledTimes(99)
    expect(enqueueOrRun).not.toHaveBeenCalled()
  })

  it('sends the same fingerprint for identical errors', async () => {
    rpcResult = { error_id: ERROR_ID, is_new: false, is_regression: false, occurrences: 2 }
    await errorService.ingestError(payload)
    await errorService.ingestError({ ...payload, timestamp: '2026-09-30T00:00:00Z' })
    const [first, second] = admin.rpc.mock.calls.map(([, args]) => args.p_fingerprint)
    expect(first).toBe(second)
  })

  it('re-triggers analysis when a resolved error regresses', async () => {
    rpcResult = { error_id: ERROR_ID, is_new: false, is_regression: true, occurrences: 7 }
    await errorService.ingestError(payload)
    expect(enqueueOrRun).toHaveBeenCalledTimes(1)
  })
})

describe('analyzeAndAlert', () => {
  it('stores the AI analysis, opens an incident and queues one Slack alert', async () => {
    analyzeError.mockResolvedValue({ status: 'completed', severity: 'critical', rootCause: 'x', explanation: 'y', suggestedFix: 'z', affectedArea: 'a' })
    openIncidentForError.mockResolvedValue({ incident: { id: 'inc-1' }, created: true })

    const result = await errorService.analyzeAndAlert(ERROR_ID)

    expect(result).toMatchObject({ analysis: 'completed', incident: 'inc-1', created: true })
    expect(errorRow.severity).toBe('critical')
    expect(queueSlackNotification).toHaveBeenCalledWith('inc-1', 'alert')
  })

  it('keeps the error and still alerts when Gemini is unavailable', async () => {
    analyzeError.mockResolvedValue({ status: 'unavailable', reason: 'request_failed' })
    openIncidentForError.mockResolvedValue({ incident: { id: 'inc-2' }, created: true })

    const result = await errorService.analyzeAndAlert(ERROR_ID)

    expect(result.analysis).toBe('unavailable')
    expect(errorRow.ai_analysis).toEqual({ status: 'unavailable', reason: 'request_failed' })
    expect(errorRow.severity).toBe('high') // rule-based severity preserved
    expect(queueSlackNotification).toHaveBeenCalledWith('inc-2', 'alert')
  })

  it('does not alert again when an incident is already active', async () => {
    analyzeError.mockResolvedValue({ status: 'unavailable', reason: 'not_configured' })
    openIncidentForError.mockResolvedValue({ incident: { id: 'inc-1' }, created: false })

    await errorService.analyzeAndAlert(ERROR_ID)
    expect(queueSlackNotification).not.toHaveBeenCalled()
  })

  it('does not open incidents for low-severity or ignored errors', async () => {
    analyzeError.mockResolvedValue({ status: 'completed', severity: 'low', rootCause: 'x', explanation: 'y', suggestedFix: 'z', affectedArea: 'a' })
    await errorService.analyzeAndAlert(ERROR_ID)

    errorRow.status = 'ignored'
    errorRow.severity = 'critical'
    analyzeError.mockResolvedValue({ status: 'unavailable', reason: 'not_configured' })
    await errorService.analyzeAndAlert(ERROR_ID)

    expect(openIncidentForError).not.toHaveBeenCalled()
  })
})

describe('estimateSeverity', () => {
  it.each([
    [{ errorType: 'Error', message: 'database connection timed out', environment: 'production' }, 'critical'],
    [{ errorType: 'TypeError', message: 'x is undefined', environment: 'production' }, 'high'],
    [{ errorType: 'TypeError', message: 'x is undefined', environment: 'staging' }, 'medium'],
    [{ errorType: 'Warning', message: 'Each child in a list should have a unique key', environment: 'production' }, 'low'],
    [{ errorType: 'Error', message: 'something', environment: 'development' }, 'low'],
  ])('%o → %s', (input, expected) => {
    expect(errorService.estimateSeverity(input)).toBe(expected)
  })
})
