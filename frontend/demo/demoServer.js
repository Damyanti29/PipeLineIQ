// Demo-only mock of Supabase Auth + the PipelineIQ API, with sample data in memory.
// Response shapes mirror backend/src (snake_case, { data } envelopes). Not used by the real app.
import http from 'node:http'

const now = Date.now()
const ago = (ms) => new Date(now - ms).toISOString()
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

const user = {
  id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated',
  email: 'demo@pipelineiq.dev', user_metadata: { full_name: 'Demo User' }, app_metadata: { provider: 'email' }, created_at: ago(30 * DAY),
}
const session = () => ({
  access_token: 'demo-token', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'demo-refresh', user,
})

// ─── Sample data ────────────────────────────────────────────────
const repos = [
  { id: 'a0000000-0000-4000-8000-000000000001', github_repo_id: 101, name: 'splitwise-app', owner: 'acme', default_branch: 'main' },
  { id: 'a0000000-0000-4000-8000-000000000002', github_repo_id: 102, name: 'api-gateway', owner: 'acme', default_branch: 'main' },
  { id: 'a0000000-0000-4000-8000-000000000003', github_repo_id: 103, name: 'dashboard-ui', owner: 'acme', default_branch: 'develop' },
].map((r) => ({
  ...r, installation_id: 7, full_name: `${r.owner}/${r.name}`, html_url: `https://github.com/${r.owner}/${r.name}`,
  monitoring_enabled: true, ingest_key: 'demo0ingest0key0f3a9c1d2e', created_at: ago(20 * DAY), updated_at: ago(DAY),
}))

const ai = (severity, rootCause, explanation, suggestedFix, affectedArea) => ({
  status: 'completed', severity, rootCause, explanation, suggestedFix, affectedArea, model: 'gemini-2.5-flash', analyzedAt: ago(HOUR),
})

const errors = [
  {
    id: 'e0000000-0000-4000-8000-000000000001', repository_id: repos[0].id, error_type: 'TypeError',
    message: "Cannot read properties of undefined (reading 'name')", file_name: 'src/components/Expense.jsx', line_number: 47, column_number: 23,
    severity: 'critical', environment: 'production', occurrences: 127, status: 'open', first_seen: ago(4 * DAY), last_seen: ago(2 * MIN),
    stack_trace: "TypeError: Cannot read properties of undefined (reading 'name')\n    at ExpenseCard (src/components/Expense.jsx:47:23)\n    at renderWithHooks (react-dom.production.min.js:14985:18)\n    at mountIndeterminateComponent (react-dom.production.min.js:17811:13)",
    ai_analysis: ai('critical',
      'The user object is undefined after the session expires, but ExpenseCard reads user.name without a guard.',
      'When the auth token expires mid-session the /me request returns 401 and the user context becomes undefined. ExpenseCard renders before the redirect to login happens, so line 47 throws on every expense in the list.',
      "// Expense.jsx line 47\nconst displayName = user?.name ?? 'Unknown user'\n\n// or guard the whole card:\nif (!user) return <ExpenseSkeleton />",
      'Expense list (every signed-in page)'),
  },
  {
    id: 'e0000000-0000-4000-8000-000000000002', repository_id: repos[1].id, error_type: 'Error',
    message: 'connect ETIMEDOUT 10.0.3.12:5432 (database connection pool exhausted)', file_name: 'src/db/pool.js', line_number: 89, column_number: 11,
    severity: 'high', environment: 'production', occurrences: 23, status: 'open', first_seen: ago(9 * HOUR), last_seen: ago(14 * MIN),
    stack_trace: 'Error: connect ETIMEDOUT 10.0.3.12:5432\n    at Pool.connect (src/db/pool.js:89:11)\n    at getUsers (src/routes/users.js:34:18)',
    ai_analysis: ai('high',
      'The Postgres connection pool (max 10) is exhausted under peak load, so new requests time out waiting for a connection.',
      'Long-running report queries hold connections for several seconds. At more than 50 requests/second every connection is busy and new ones wait past the 5s timeout.',
      "const pool = new Pool({\n  max: 25,\n  idleTimeoutMillis: 30_000,\n  connectionTimeoutMillis: 10_000,\n})",
      'User and billing APIs'),
  },
  {
    id: 'e0000000-0000-4000-8000-000000000003', repository_id: repos[0].id, error_type: 'ReferenceError',
    message: 'useGroupContext is not defined', file_name: 'src/pages/GroupDetail.jsx', line_number: 12, column_number: 28,
    severity: 'high', environment: 'production', occurrences: 45, status: 'open', first_seen: ago(DAY), last_seen: ago(40 * MIN),
    stack_trace: 'ReferenceError: useGroupContext is not defined\n    at GroupDetail (src/pages/GroupDetail.jsx:12:28)',
    ai_analysis: { status: 'pending' },
  },
  {
    id: 'e0000000-0000-4000-8000-000000000004', repository_id: repos[2].id, error_type: 'ChunkLoadError',
    message: 'Loading chunk 12 failed', file_name: 'assets/index.js', line_number: 1, column_number: 1,
    severity: 'medium', environment: 'production', occurrences: 18, status: 'open', first_seen: ago(6 * HOUR), last_seen: ago(3 * HOUR),
    stack_trace: 'ChunkLoadError: Loading chunk 12 failed.\n    at requireEnsure (assets/index.js:1:1)',
    ai_analysis: { status: 'unavailable', reason: 'request_failed' },
  },
  {
    id: 'e0000000-0000-4000-8000-000000000005', repository_id: repos[2].id, error_type: 'Warning',
    message: 'Each child in a list should have a unique "key" prop', file_name: 'src/MetricList.jsx', line_number: 34, column_number: 5,
    severity: 'low', environment: 'development', occurrences: 3, status: 'resolved', first_seen: ago(3 * DAY), last_seen: ago(2 * DAY),
    stack_trace: 'Warning: Each child in a list should have a unique "key" prop.\n    at MetricList (src/MetricList.jsx:34:5)',
    ai_analysis: { status: 'unavailable', reason: 'not_configured' },
  },
].map((e) => ({ ...e, fingerprint: e.id.slice(-8), created_at: e.first_seen, updated_at: e.last_seen }))

const incidents = errors.slice(0, 4).map((e, i) => ({
  id: `i0000000-0000-4000-8000-00000000000${i + 1}`, repository_id: e.repository_id, error_id: e.id,
  title: `${e.error_type} in ${e.file_name.split('/').pop()}:${e.line_number}`, severity: e.severity,
  status: i === 1 ? 'investigating' : 'open', slack_message_ts: '1700000000.0001', slack_channel_id: 'C123',
  github_issue_number: i === 1 ? 214 : null, github_issue_url: i === 1 ? 'https://github.com/acme/api-gateway/issues/214' : null,
  created_at: e.first_seen, updated_at: e.last_seen, resolved_at: null,
}))

const events = [
  ['workflow_run', 'CI · test & build', 'success', 'main', 'Demo User', 25 * MIN],
  ['deployment_status', 'Deployment to production', 'success', 'main', 'Demo User', 50 * MIN],
  ['pull_request', '#58 Guard against missing user in ExpenseCard', 'open', 'fix/expense-null-user', 'Demo User', 2 * HOUR],
  ['push', 'feat: add expense category filters', null, 'main', 'Demo User', 5 * HOUR],
  ['workflow_run', 'CI · test & build', 'failure', 'feat/filters', 'Demo User', 6 * HOUR],
].map(([event_type, title, status, ref, actor, age], i) => ({
  id: `g${i}`, delivery_id: `d${i}`, event_type, action: null, title, status, ref, sha: `9f8e7d6c5b4a${i}`, actor, url: 'https://github.com', created_at: ago(age),
}))

const pipelineAlerts = [
  {
    id: 'p0000000-0000-4000-8000-000000000001', repository_id: repos[0].id, source: 'ci_failure', status: 'fix_proposed', severity: 'high',
    title: 'Expense filter test fails: category is undefined for uncategorised expenses', branch: 'feat/filters',
    commit_sha: '9f8e7d6c5b4a4', commit_message: 'feat: add expense category filters', commit_url: 'https://github.com/acme/splitwise-app/commit/9f8e7d6c5b4a4',
    actor: 'Demo User', workflow_name: 'CI · test & build', workflow_run_id: 9001, run_url: 'https://github.com/acme/splitwise-app/actions/runs/9001',
    fix_branch: 'pipelineiq/fix-9f8e7d6-a1b2', fix_pr_number: 61, fix_pr_url: 'https://github.com/acme/splitwise-app/pull/61', fix_note: null,
    analysis: {
      severity: 'high', confidence: 0.93, model: 'gemini-3.5-flash',
      rootCause: 'filterByCategory() reads expense.category.id, but expenses created before categories existed have category = null.',
      explanation: 'The new test "filters uncategorised expenses" passes a legacy expense, so the filter throws TypeError and the suite fails.',
      suggestedFix: 'Use optional chaining and treat a missing category as "uncategorised" in src/utils/filters.js.',
    },
    created_at: ago(6 * HOUR),
  },
  {
    id: 'p0000000-0000-4000-8000-000000000002', repository_id: repos[1].id, source: 'diff_review', status: 'alerted', severity: 'critical',
    title: 'AWS secret key committed in config/storage.js', branch: 'main',
    commit_sha: '3c2b1a0f9e8d7', commit_message: 'chore: switch uploads to S3', commit_url: 'https://github.com/acme/api-gateway/commit/3c2b1a0f9e8d7',
    actor: 'Demo User', workflow_name: null, workflow_run_id: null, run_url: null,
    fix_branch: null, fix_pr_number: null, fix_pr_url: null,
    fix_note: 'Gemini did not find a safe code change for this. See the suggested fix.',
    analysis: {
      severity: 'critical', confidence: 0.97, model: 'gemini-3.5-flash',
      rootCause: 'A hard-coded AWS secret access key was pushed to main in config/storage.js.',
      explanation: 'Anyone with read access to the repository can use the key. Removing it from the code does not remove it from git history.',
      suggestedFix: 'Rotate the key in AWS IAM now, then read it from process.env.AWS_SECRET_ACCESS_KEY.',
    },
    created_at: ago(2 * HOUR),
  },
  {
    id: 'p0000000-0000-4000-8000-000000000003', repository_id: repos[2].id, source: 'ci_failure', status: 'resolved', severity: 'medium',
    title: 'Build fails: MetricList imports a renamed hook', branch: 'develop',
    commit_sha: '7a6b5c4d3e2f1', commit_message: 'refactor: rename useMetrics to useMetricData', commit_url: 'https://github.com/acme/dashboard-ui/commit/7a6b5c4d3e2f1',
    actor: 'Demo User', workflow_name: 'Build', workflow_run_id: 9002, run_url: 'https://github.com/acme/dashboard-ui/actions/runs/9002',
    fix_branch: 'pipelineiq/fix-7a6b5c4-c3d4', fix_pr_number: 44, fix_pr_url: 'https://github.com/acme/dashboard-ui/pull/44', fix_note: null,
    analysis: {
      severity: 'medium', confidence: 0.99, model: 'gemini-3.5-flash',
      rootCause: 'src/MetricList.jsx still imports useMetrics, which was renamed to useMetricData in this commit.',
      explanation: 'Vite fails to resolve the import, so the production build stops.',
      suggestedFix: 'Update the import and the call in src/MetricList.jsx to useMetricData.',
    },
    created_at: ago(DAY), resolved_at: ago(20 * HOUR),
  },
]

// ─── Derived views (same shapes as the backend) ─────────────────
const repoRef = (id) => { const r = repos.find((x) => x.id === id); return { id: r.id, name: r.name, full_name: r.full_name, html_url: r.html_url } }
const statsFor = (repoId) => {
  const errs = errors.filter((e) => !repoId || e.repository_id === repoId)
  const open = errs.filter((e) => e.status === 'open')
  return {
    total_errors: errs.length, open_errors: open.length, open_critical: open.filter((e) => e.severity === 'critical').length,
    total_occurrences: errs.reduce((n, e) => n + e.occurrences, 0), last_error_at: errs.map((e) => e.last_seen).sort().at(-1) ?? null,
  }
}
const trend = (repoId) => Array.from({ length: 14 }, (_, i) => {
  const seed = (i * 37 + (repoId ? repoId.charCodeAt(35) : 11)) % 29
  return { date: new Date(now - (13 - i) * DAY).toISOString().slice(0, 10), events: seed + (i > 9 ? 15 : 3), critical: i > 9 ? (seed % 5) + 1 : seed % 2 }
})
const withRepo = (e) => ({ ...e, ai_status: e.ai_analysis?.status, repository: repoRef(e.repository_id) })
const incidentView = (inc) => {
  const e = errors.find((x) => x.id === inc.error_id)
  return { ...inc, error: { id: e.id, error_type: e.error_type, message: e.message, file_name: e.file_name, line_number: e.line_number, severity: e.severity, environment: e.environment, occurrences: e.occurrences, status: e.status, last_seen: e.last_seen }, repository: repoRef(inc.repository_id) }
}

// Explicit response markers (payloads themselves may contain "status"/"error" fields).
const RAW = Symbol('raw')
const FAIL = Symbol('fail')
const CREATED = Symbol('created')
const raw = (payload) => ({ [RAW]: payload })
const fail = (status, message) => ({ [FAIL]: { status, message } })
const created = (payload) => ({ [CREATED]: payload })

// ─── Routes ─────────────────────────────────────────────────────
const routes = [
  ['GET', /^\/api\/health$/, () => raw({ status: 'ok', timestamp: new Date().toISOString(), uptime: 4242, services: { supabase: 'configured', redis: 'up', github: 'configured', githubWebhooks: 'configured', slack: 'configured', gemini: 'configured' } })],
  ['GET', /^\/api\/errors\/stats$/, (_, q) => {
    const repoId = q.get('repositoryId')
    const s = statsFor(repoId)
    const repoCount = repoId ? 1 : repos.length
    const openIncidents = incidents.filter((i) => ['open', 'investigating'].includes(i.status) && (!repoId || i.repository_id === repoId)).length
    return { repositories: repoCount, total_errors: s.total_errors, open_errors: s.open_errors, critical_errors: s.open_critical, total_occurrences: s.total_occurrences, open_incidents: openIncidents, trend: trend(repoId) }
  }],
  ['GET', /^\/api\/errors$/, (_, q) => {
    const rank = { critical: 3, high: 2, medium: 1, low: 0 }
    const search = (q.get('search') ?? '').toLowerCase()
    let list = errors.filter((e) =>
      (!q.get('repositoryId') || e.repository_id === q.get('repositoryId')) &&
      (!q.get('status') || e.status === q.get('status')) &&
      (!q.get('severity') || e.severity === q.get('severity')) &&
      (!search || `${e.error_type} ${e.message} ${e.file_name}`.toLowerCase().includes(search)))
    const sort = q.get('sort')
    list = [...list].sort((a, b) => sort === 'occurrences' ? b.occurrences - a.occurrences : sort === 'severity' ? rank[b.severity] - rank[a.severity] : b.last_seen.localeCompare(a.last_seen))
    return list.slice(0, Number(q.get('limit') ?? 100)).map(withRepo)
  }],
  ['GET', /^\/api\/errors\/([\w-]+)$/, ([id]) => {
    const e = errors.find((x) => x.id === id)
    if (!e) return fail(404, 'Error not found')
    const recent = Array.from({ length: Math.min(e.occurrences, 6) }, (_, i) => ({ id: `${id}-ev${i}`, timestamp: new Date(new Date(e.last_seen).getTime() - i * 7 * MIN).toISOString(), request_url: 'https://app.acme.dev/expenses', user_agent: 'Mozilla/5.0', environment: e.environment, metadata: { release: '2.4.1' } }))
    const incs = incidents.filter((i) => i.error_id === id).map(({ id: iid, title, severity, status, github_issue_number, github_issue_url, created_at, resolved_at }) => ({ id: iid, title, severity, status, github_issue_number, github_issue_url, created_at, resolved_at }))
    return { ...e, repository: { ...repoRef(e.repository_id), default_branch: 'main' }, recent_events: recent, incidents: incs }
  }],
  ['PATCH', /^\/api\/errors\/([\w-]+)\/status$/, ([id], _, body) => {
    const e = errors.find((x) => x.id === id)
    e.status = body.status
    if (body.status !== 'open') incidents.filter((i) => i.error_id === id && ['open', 'investigating'].includes(i.status)).forEach((i) => { i.status = body.status })
    return { id, status: e.status, updated_at: new Date().toISOString() }
  }],
  ['GET', /^\/api\/incidents$/, (_, q) => incidents.filter((i) => !q.get('status') || i.status === q.get('status')).slice(0, Number(q.get('limit') ?? 50)).map(incidentView)],
  ['PATCH', /^\/api\/incidents\/([\w-]+)\/status$/, ([id], _, body) => {
    const inc = incidents.find((x) => x.id === id)
    inc.status = body.status
    inc.resolved_at = body.status === 'resolved' ? new Date().toISOString() : null
    errors.find((e) => e.id === inc.error_id).status = { open: 'open', investigating: 'open', resolved: 'resolved', ignored: 'ignored' }[body.status]
    return incidentView(inc)
  }],
  ['POST', /^\/api\/incidents\/([\w-]+)\/github-issue$/, ([id]) => {
    const inc = incidents.find((x) => x.id === id)
    if (!inc.github_issue_number) {
      inc.github_issue_number = 215 + incidents.indexOf(inc)
      inc.github_issue_url = `${repoRef(inc.repository_id).html_url}/issues/${inc.github_issue_number}`
      return created({ created: true, github_issue_number: inc.github_issue_number, github_issue_url: inc.github_issue_url })
    }
    return { created: false, github_issue_number: inc.github_issue_number, github_issue_url: inc.github_issue_url }
  }],
  ['GET', /^\/api\/pipeline-alerts$/, (_, q) => pipelineAlerts
    .filter((a) => (!q.get('status') || a.status === q.get('status')) && (!q.get('repositoryId') || a.repository_id === q.get('repositoryId')))
    .map((a) => ({ ...a, repository: repoRef(a.repository_id) }))],
  ['PATCH', /^\/api\/pipeline-alerts\/([\w-]+)\/status$/, ([id], _, body) => {
    const alert = pipelineAlerts.find((a) => a.id === id)
    if (!alert) return fail(404, 'Pipeline alert not found')
    alert.status = body.status
    alert.resolved_at = body.status === 'resolved' ? new Date().toISOString() : null
    return alert
  }],
  ['GET', /^\/api\/repositories$/, () => repos.map(({ ingest_key: _k, ...r }) => ({ ...r, stats: statsFor(r.id) }))],
  ['POST', /^\/api\/repositories$/, () => (fail(400, 'Adding repositories is disabled in demo mode'))],
  ['GET', /^\/api\/repositories\/([\w-]+)$/, ([id]) => { const r = repos.find((x) => x.id === id); return r ? { ...r, stats: statsFor(id) } : fail(404, 'Repository not found') }],
  ['PATCH', /^\/api\/repositories\/([\w-]+)$/, ([id], _, body) => { const r = repos.find((x) => x.id === id); r.monitoring_enabled = body.monitoringEnabled; const { ingest_key: _k, ...rest } = r; return rest }],
  ['GET', /^\/api\/repositories\/([\w-]+)\/events$/, () => events],
  ['GET', /^\/api\/github\/status$/, () => ({ configured: true, connected: true, installations: [{ id: 'x', installation_id: 7, account_login: 'acme', account_type: 'Organization', created_at: ago(20 * DAY) }] })],
  ['GET', /^\/api\/github\/repositories$/, () => [...repos.map((r) => ({ github_repo_id: r.github_repo_id, installation_id: 7, name: r.name, full_name: r.full_name, owner: r.owner, private: false, description: null, repository_id: r.id, monitored: r.monitoring_enabled })), { github_repo_id: 104, installation_id: 7, name: 'mobile-app', full_name: 'acme/mobile-app', owner: 'acme', private: true, description: 'React Native client', repository_id: null, monitored: false }]],
  ['GET', /^\/api\/github\/connect$/, () => (fail(400, 'GitHub connect is disabled in demo mode'))],
  ['GET', /^\/api\/slack\/status$/, () => ({ configured: true, connected: true, workspace_name: 'Acme Engineering', channel_name: '#alerts-production', connected_at: ago(15 * DAY) })],
  ['POST', /^\/api\/slack\/test$/, () => ({ sent: true })],
  ['GET', /^\/api\/slack\/connect$/, () => (fail(400, 'Slack connect is disabled in demo mode'))],
  ['DELETE', /^\/api\/slack\/disconnect$/, () => (fail(400, 'Disconnect is disabled in demo mode'))],
]

export function startDemoServer(port) {
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*')
    res.setHeader('Access-Control-Allow-Headers', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS')
    if (req.method === 'OPTIONS') return res.writeHead(204).end()

    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      const url = new URL(req.url, 'http://localhost')
      const json = (status, payload) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(payload))

      // Supabase Auth: any email/password signs in as the demo user.
      if (url.pathname === '/auth/v1/token') return json(200, session())
      if (url.pathname === '/auth/v1/signup') return json(200, session())
      if (url.pathname === '/auth/v1/user') return json(200, user)
      if (url.pathname.startsWith('/auth/v1/')) return res.writeHead(204).end()

      const route = routes.find(([method, pattern]) => method === req.method && pattern.test(url.pathname))
      if (!route) return json(404, { error: { code: 'not_found', message: `Demo: ${req.method} ${url.pathname} not available` } })
      const result = route[2](url.pathname.match(route[1]).slice(1), url.searchParams, body ? JSON.parse(body) : {})
      if (result?.[RAW]) return json(200, result[RAW])
      if (result?.[FAIL]) return json(result[FAIL].status, { error: { code: 'demo', message: result[FAIL].message } })
      if (result?.[CREATED]) return json(201, { data: result[CREATED] })
      return json(200, { data: result })
    })
  })
  return new Promise((resolve) => server.listen(port, () => resolve(server)))
}
