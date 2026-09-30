import { jest } from '@jest/globals'
import crypto from 'node:crypto'
import { src } from './helpers/loadApp.js'
import { createFakeSupabase } from './helpers/fakeSupabase.js'

const { encrypt, verifySlackSignature } = await import(src('utils/crypto.js'))

const INCIDENT_ID = 'i0000000-0000-4000-8000-000000000001'
const incident = {
  id: INCIDENT_ID,
  title: 'TypeError in Expense.jsx:47',
  severity: 'critical',
  slack_message_ts: null,
  github_issue_number: null,
  error: {
    id: 'e1',
    error_type: 'TypeError',
    message: 'Cannot read properties of undefined',
    file_name: 'Expense.jsx',
    line_number: 47,
    occurrences: 127,
    environment: 'production',
    ai_analysis: { status: 'completed', rootCause: 'user is undefined', suggestedFix: 'user?.name' },
  },
  repository: { id: 'r1', user_id: 'u1', full_name: 'me/SplitWise', html_url: 'https://github.com/me/SplitWise' },
}
const integration = {
  user_id: 'u1',
  workspace_id: 'T123',
  workspace_name: 'Acme',
  channel_id: 'C123',
  channel_name: '#alerts',
  access_token: encrypt('xoxb-real-token'),
  created_at: '2026-09-01T00:00:00Z',
}

let incidentUpdates = []
const admin = createFakeSupabase({
  tables: {
    incidents: (chain) => {
      const update = chain.find(([method]) => method === 'update')
      if (update) {
        incidentUpdates.push(update[1])
        return { data: null, error: null }
      }
      return { data: incident, error: null }
    },
    slack_integrations: { data: integration, error: null },
  },
})

jest.unstable_mockModule(src('supabase/adminClient.js'), () => ({
  requireAdmin: () => admin,
  unwrap: ({ data, error }) => {
    if (error) throw new Error(error.message)
    return data
  },
}))

const slackService = await import(src('services/slackService.js'))

const slackReplies = (body) => jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => body })

beforeEach(() => {
  incidentUpdates = []
  jest.restoreAllMocks()
})

describe('sendErrorAlert', () => {
  it('posts a Block Kit alert with the bot token and stores the message ts', async () => {
    const fetchSpy = slackReplies({ ok: true, ts: '1700000000.0001', channel: 'C123' })

    const result = await slackService.sendErrorAlert(INCIDENT_ID)

    expect(result).toMatchObject({ ok: true, ts: '1700000000.0001' })
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://slack.com/api/chat.postMessage')
    expect(init.headers.Authorization).toBe('Bearer xoxb-real-token')
    const body = JSON.parse(init.body)
    expect(body.channel).toBe('C123')
    const text = JSON.stringify(body.blocks)
    for (const expected of ['PipelineIQ Alert', 'me/SplitWise', 'CRITICAL', 'Expense.jsx:47', '127', 'production', 'user is undefined', 'Create GitHub Issue', 'View Error', 'View GitHub']) {
      expect(text).toContain(expected)
    }
    expect(incidentUpdates).toEqual([{ slack_channel_id: 'C123', slack_message_ts: '1700000000.0001' }])
  })

  it('does not throw on permanent Slack errors (no endless retries)', async () => {
    slackReplies({ ok: false, error: 'channel_not_found' })
    await expect(slackService.sendErrorAlert(INCIDENT_ID)).resolves.toEqual({ ok: false, skipped: 'channel_not_found' })
    expect(incidentUpdates).toEqual([])
  })

  it('throws on transient Slack errors so the queue retries', async () => {
    slackReplies({ ok: false, error: 'ratelimited' })
    await expect(slackService.sendErrorAlert(INCIDENT_ID)).rejects.toThrow('ratelimited')
  })

  it('throws when Slack is unreachable so the queue retries', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ENOTFOUND slack.com'))
    await expect(slackService.sendErrorAlert(INCIDENT_ID)).rejects.toThrow('ENOTFOUND')
  })
})

describe('getStatus', () => {
  it('never returns the access token', async () => {
    const status = await slackService.getStatus('u1')
    expect(status).toMatchObject({ connected: true, workspace_name: 'Acme', channel_name: '#alerts' })
    expect(JSON.stringify(status)).not.toContain('xoxb')
    expect(JSON.stringify(status)).not.toContain(integration.access_token)
  })
})

describe('Slack request signatures', () => {
  const secret = 'test-slack-signing-secret'
  const body = Buffer.from('payload=%7B%7D')
  const now = 1_700_000_000
  const sign = (ts) => `v0=${crypto.createHmac('sha256', secret).update(`v0:${ts}:${body}`).digest('hex')}`

  it('accepts a valid, fresh signature', () => {
    expect(verifySlackSignature(body, now, sign(now), secret, now)).toBe(true)
  })

  it('rejects stale timestamps (replay protection)', () => {
    expect(verifySlackSignature(body, now - 600, sign(now - 600), secret, now)).toBe(false)
  })

  it('rejects invalid signatures', () => {
    expect(verifySlackSignature(body, now, 'v0=deadbeef', secret, now)).toBe(false)
  })
})
