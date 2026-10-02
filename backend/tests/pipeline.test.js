import { jest } from '@jest/globals'
import { createFakeSupabase } from './helpers/fakeSupabase.js'
import { src } from './helpers/loadApp.js'

// ─── Mocks for the orchestration tests ──────────────────────────
const state = { claimed: [], updates: [], existingPr: [] }
const admin = createFakeSupabase({
  tables: {
    repositories: {
      data: [{ id: 'r1', user_id: 'u1', installation_id: 7, full_name: 'acme/app', html_url: 'https://github.com/acme/app', monitoring_enabled: true }],
      error: null,
    },
    pipeline_alerts: (chain) => {
      const op = chain.find(([method]) => ['upsert', 'update'].includes(method))
      if (op?.[0] === 'upsert') return { data: state.claimed, error: null }
      if (op?.[0] === 'update') {
        state.updates.push(op[1])
        return { data: state.claimed.map((c) => ({ ...c, commit_sha: 'abcdef1234567', ...op[1] })), error: null }
      }
      return { data: state.existingPr, error: null }
    },
  },
})

const github = {
  getInstallationToken: jest.fn(async () => 'installation-token'),
  getFailedJobLogs: jest.fn(),
  getChangedFiles: jest.fn(),
  getFileContent: jest.fn(),
  createFixPullRequest: jest.fn(),
}
const slack = { sendPipelineAlert: jest.fn(async () => ({ ok: true })), sendPipelineUpdate: jest.fn() }
const generateContent = jest.fn()

jest.unstable_mockModule(src('supabase/adminClient.js'), () => ({
  supabaseAdmin: admin,
  requireAdmin: () => admin,
  unwrap: ({ data, error }) => {
    if (error) throw new Error(error.message)
    return data
  },
}))
jest.unstable_mockModule(src('services/githubService.js'), () => github)
jest.unstable_mockModule(src('services/slackService.js'), () => slack)
jest.unstable_mockModule(src('services/aiService.js'), () => ({ generateContent }))

const pipeline = await import(src('services/pipelineService.js'))
const { extractTrigger, applyEdits, referencedPaths, cleanLog, parseFixResponse, buildPrBody, isReviewableFile, processPipelineEvent } = pipeline

const repoPayload = { id: 42, html_url: 'https://github.com/acme/app' }

// ─── Triggers ───────────────────────────────────────────────────
describe('extractTrigger', () => {
  const push = (overrides = {}) => ({
    ref: 'refs/heads/main', before: 'a'.repeat(40), after: 'b'.repeat(40), repository: repoPayload,
    head_commit: { message: 'feat: x', url: 'https://github.com/acme/app/commit/bbb' }, pusher: { name: 'dev' }, sender: { type: 'User' },
    ...overrides,
  })

  it('reviews branch pushes', () => {
    expect(extractTrigger('push', push())).toMatchObject({ source: 'diff_review', dedupeKey: `push:${'b'.repeat(40)}`, branch: 'main', actor: 'dev' })
  })

  it.each([
    ['tag pushes', { ref: 'refs/tags/v1.0.0' }],
    ['deleted branches', { deleted: true, after: '0'.repeat(40) }],
    ['its own fix branches', { ref: 'refs/heads/pipelineiq/fix-abc1234-ab12' }],
    ['bot pushes', { sender: { type: 'Bot' } }],
    ['commits marked [skip pipelineiq]', { head_commit: { message: 'wip [skip pipelineiq]' } }],
  ])('skips %s', (_, overrides) => {
    expect(extractTrigger('push', push(overrides)).skip).toBeTruthy()
  })

  const run = (overrides = {}) => ({
    action: 'completed', repository: repoPayload,
    workflow_run: { id: 9, run_attempt: 2, conclusion: 'failure', head_branch: 'main', head_sha: 'c'.repeat(40), name: 'CI', html_url: 'https://run', head_repository: { id: 42 }, ...overrides },
  })

  it('analyses failed workflow runs, keyed by run and attempt', () => {
    expect(extractTrigger('workflow_run', run())).toMatchObject({ source: 'ci_failure', dedupeKey: 'ci:9:2', branch: 'main', runUrl: 'https://run' })
  })

  it.each([
    ['successful runs', { conclusion: 'success' }],
    ['runs on fix branches', { head_branch: 'pipelineiq/fix-1' }],
    ['runs from forks', { head_repository: { id: 999 } }],
  ])('skips %s', (_, overrides) => {
    expect(extractTrigger('workflow_run', run(overrides)).skip).toBeTruthy()
  })
})

// ─── Applying edits ─────────────────────────────────────────────
describe('applyEdits', () => {
  const files = { 'src/a.js': 'const a = 1\nconst b = a + 1\n', 'src/c.js': 'x\r\ny\r\n' }

  it('applies exact, unique replacements', () => {
    const { files: out, rejected } = applyEdits(files, [{ path: 'src/a.js', find: 'a + 1', replace: 'a + 2' }])
    expect(rejected).toEqual([])
    expect(out).toEqual({ 'src/a.js': 'const a = 1\nconst b = a + 2\n' })
  })

  it('rejects text that is missing, ambiguous, or in a file that was not analysed', () => {
    const { rejected } = applyEdits(files, [
      { path: 'src/a.js', find: 'nope', replace: '' },
      { path: 'src/a.js', find: 'const', replace: 'let' },
      { path: 'src/other.js', find: 'x', replace: 'y' },
    ])
    expect(rejected.map((r) => r.reason)).toEqual(['text to replace was not found', 'text to replace is ambiguous', 'file was not part of the analysed code'])
  })

  it('matches LF edits against CRLF files and keeps CRLF', () => {
    expect(applyEdits(files, [{ path: 'src/c.js', find: 'x\ny', replace: 'x\nz' }]).files).toEqual({ 'src/c.js': 'x\r\nz\r\n' })
  })

  it('does not interpret $ patterns in the replacement', () => {
    expect(applyEdits(files, [{ path: 'src/a.js', find: 'a + 1', replace: "'$&'" }]).files['src/a.js']).toContain("'$&'")
  })
})

// ─── Logs, prompts and parsing ──────────────────────────────────
describe('CI log helpers', () => {
  it('finds repository files mentioned in a log', () => {
    const log = [
      '2026-10-02T10:00:00.000Z FAIL src/utils/sum.test.js',
      '    at sum (/home/runner/work/app/app/src/utils/sum.js:3:10)',
      '    at node_modules/jest/index.js:1:1',
      'Error: see D:\\a\\app\\app\\lib\\config.ts:5',
    ].join('\n')
    expect(referencedPaths(log).sort()).toEqual(['lib/config.ts', 'src/utils/sum.js', 'src/utils/sum.test.js'])
  })

  it('strips timestamps and colours and redacts secrets', () => {
    const out = cleanLog('2026-10-02T10:00:00.1234567Z \x1b[31mError: token=ghp_abcdefghijklmnopqrstuvwxyz123456\x1b[0m')
    expect(out).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz123456')
    expect(out).not.toContain('\x1b[')
    expect(out).not.toContain('2026-10-02T')
  })

  it('reviews source files but not lockfiles, builds or vendored code', () => {
    expect(isReviewableFile('src/App.tsx')).toBe(true)
    expect(['package-lock.json', 'dist/app.js', 'node_modules/x/y.js', 'public/app.min.js', 'logo.png'].some(isReviewableFile)).toBe(false)
  })
})

describe('parseFixResponse', () => {
  it('accepts fenced JSON and fills defaults', () => {
    const parsed = parseFixResponse('```json\n{"hasIssues": false, "confidence": 0.2}\n```')
    expect(parsed).toMatchObject({ hasIssues: false, edits: [], title: '', severity: 'medium' })
  })

  it('rejects malformed output', () => {
    expect(() => parseFixResponse('not json')).toThrow()
    expect(() => parseFixResponse('{"confidence": 2}')).toThrow()
  })
})

it('PR body explains the problem and links the run and commit', () => {
  const body = buildPrBody(
    { source: 'ci_failure', sha: 'abcdef1234567', branch: 'main', workflowName: 'CI', runUrl: 'https://run', commitUrl: 'https://commit' },
    { rootCause: 'sum subtracts', explanation: 'details', suggestedFix: 'use +' },
    ['src/sum.js'],
    { html_url: 'https://github.com/acme/app' },
  )
  expect(body).toContain('sum subtracts')
  expect(body).toContain('`src/sum.js`')
  expect(body).toContain('https://run')
  expect(body).toContain('Review the change before merging')
})

// ─── End-to-end orchestration (GitHub, Gemini, Slack mocked) ─────
describe('processPipelineEvent', () => {
  const trigger = {
    source: 'ci_failure', dedupeKey: 'ci:9:1', sha: 'abcdef1234567', branch: 'main',
    commitMessage: 'feat: sum', commitUrl: 'https://commit', actor: 'dev', workflowName: 'CI', runId: 9, runUrl: 'https://run',
  }
  const gemini = (overrides = {}) => ({
    ok: true,
    model: 'gemini-test',
    text: JSON.stringify({
      hasIssues: true, confidence: 0.95, severity: 'high', title: 'sum subtracts instead of adds',
      rootCause: 'sum uses -', explanation: 'test expects 3', suggestedFix: 'use +',
      edits: [{ path: 'src/sum.js', find: 'a - b', replace: 'a + b' }],
      ...overrides,
    }),
  })

  beforeEach(() => {
    jest.clearAllMocks()
    state.claimed = [{ id: 'alert-1', repository_id: 'r1' }]
    state.updates = []
    state.existingPr = []
    github.getFailedJobLogs.mockResolvedValue([{ name: 'test', failedSteps: ['Run tests'], log: 'FAIL src/sum.test.js\n at src/sum.js:1' }])
    github.getChangedFiles.mockResolvedValue([{ path: 'src/sum.js', status: 'modified', patch: '-a + b\n+a - b' }])
    github.getFileContent.mockImplementation(async (_t, _r, filePath) => (filePath === 'src/sum.js' ? 'export const sum = (a, b) => a - b\n' : null))
    github.createFixPullRequest.mockResolvedValue({ number: 12, html_url: 'https://github.com/acme/app/pull/12' })
    generateContent.mockResolvedValue(gemini())
  })

  it('diagnoses a failed run, opens a fix PR and alerts Slack', async () => {
    const result = await processPipelineEvent({ trigger, repositoryIds: ['r1'] })

    expect(result).toEqual({ result: 'fix_proposed', pr: 'https://github.com/acme/app/pull/12' })
    const [, fullName, pr] = github.createFixPullRequest.mock.calls[0]
    expect(fullName).toBe('acme/app')
    expect(pr).toMatchObject({ baseSha: 'abcdef1234567', baseBranch: 'main', files: { 'src/sum.js': 'export const sum = (a, b) => a + b\n' } })
    expect(pr.branch).toMatch(/^pipelineiq\/fix-abcdef1-[0-9a-f]{4}$/)
    expect(generateContent.mock.calls[0][0]).toContain('=== FILE: src/sum.js ===')
    expect(slack.sendPipelineAlert).toHaveBeenCalledWith(expect.objectContaining({ fix_pr_number: 12, status: 'fix_proposed' }), expect.objectContaining({ id: 'r1' }))
  })

  it('does nothing for a redelivered webhook', async () => {
    state.claimed = []
    expect(await processPipelineEvent({ trigger, repositoryIds: ['r1'] })).toEqual({ skipped: 'duplicate' })
    expect(generateContent).not.toHaveBeenCalled()
  })

  it('alerts without a PR when the edit does not match the code', async () => {
    generateContent.mockResolvedValue(gemini({ edits: [{ path: 'src/sum.js', find: 'a * b', replace: 'a + b' }] }))
    const result = await processPipelineEvent({ trigger, repositoryIds: ['r1'] })
    expect(result.result).toBe('alerted')
    expect(github.createFixPullRequest).not.toHaveBeenCalled()
    expect(state.updates.at(-1).fix_note).toMatch(/could not be applied exactly/)
    expect(slack.sendPipelineAlert).toHaveBeenCalled()
  })

  it('reuses the fix PR already opened for the same commit', async () => {
    state.existingPr = [{ fix_branch: 'pipelineiq/fix-abcdef1-0000', fix_pr_number: 11, fix_pr_url: 'https://github.com/acme/app/pull/11' }]
    const result = await processPipelineEvent({ trigger, repositoryIds: ['r1'] })
    expect(result.pr).toBe('https://github.com/acme/app/pull/11')
    expect(github.createFixPullRequest).not.toHaveBeenCalled()
  })

  it('stays quiet when a push review is not confident there is a bug', async () => {
    generateContent.mockResolvedValue(gemini({ hasIssues: true, confidence: 0.5 }))
    const review = { ...trigger, source: 'diff_review', dedupeKey: 'push:abc', before: 'f'.repeat(40) }
    expect(await processPipelineEvent({ trigger: review, repositoryIds: ['r1'] })).toEqual({ result: 'no_issue' })
    expect(github.createFixPullRequest).not.toHaveBeenCalled()
    expect(slack.sendPipelineAlert).not.toHaveBeenCalled()
  })

  it('still alerts a failed CI run when Gemini is down, without a diagnosis or PR', async () => {
    generateContent.mockResolvedValue({ ok: false, status: 503 })
    const result = await processPipelineEvent({ trigger, repositoryIds: ['r1'] })
    expect(result.result).toBe('alerted')
    expect(state.updates.at(-1)).toMatchObject({ status: 'alerted', analysis: null, title: 'CI failed' })
    expect(github.createFixPullRequest).not.toHaveBeenCalled()
    expect(slack.sendPipelineAlert).toHaveBeenCalled()
  })

  it('records a push review as failed (no alert) when Gemini is down', async () => {
    generateContent.mockResolvedValue({ ok: false, status: 503 })
    const review = { ...trigger, source: 'diff_review', dedupeKey: 'push:abc', before: 'f'.repeat(40) }
    const result = await processPipelineEvent({ trigger: review, repositoryIds: ['r1'] })
    expect(result.result).toBe('failed')
    expect(state.updates.at(-1)).toMatchObject({ status: 'failed' })
    expect(slack.sendPipelineAlert).not.toHaveBeenCalled()
  })
})
