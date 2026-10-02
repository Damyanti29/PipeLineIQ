// `npm run simulate`: prototype run of the whole pipeline with the real service code and live
// credentials from .env. Read-only: nothing is written to Supabase, posted to Slack or filed on GitHub.
// Grouping mirrors the ingest_error RPC in memory; everything else calls the production functions.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runChecks } from '../src/config/checkEnv.js'
import { analyzeError } from '../src/services/aiService.js'
import { estimateSeverity } from '../src/services/errorService.js'
import { generateFingerprint } from '../src/services/fingerprintService.js'
import { buildIssueBody, incidentTitle, shouldOpenIncident } from '../src/services/incidentService.js'
import { buildErrorAlertBlocks } from '../src/services/slackService.js'
import { lineDiff, runPushScenarios } from './simulatePush.js'

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'simulation-output')
const repository = { id: 'sim-repo-0001', full_name: 'acme/splitwise-app', html_url: 'https://github.com/acme/splitwise-app' }

// ─── Sample SDK traffic ─────────────────────────────────────────
// Ids, emails and timings vary per occurrence so fingerprinting has something to normalize.
const uuid = () => crypto.randomUUID()
const scenarios = [
  {
    count: 40,
    event: () => ({
      errorType: 'TypeError',
      message: "Cannot read properties of undefined (reading 'name')",
      fileName: 'https://app.acme.io/assets/Expense.4f9c2a1b.js?v=3',
      lineNumber: 47, columnNumber: 23, environment: 'production',
      stackTrace: "TypeError: Cannot read properties of undefined (reading 'name')\n    at ExpenseCard (src/components/Expense.jsx:47:23)\n    at renderWithHooks (react-dom.production.min.js:14985:18)",
      requestUrl: `https://app.acme.io/groups/${uuid()}/expenses?token=abc123`,
    }),
  },
  {
    count: 12,
    event: () => ({
      errorType: 'Error',
      message: `connect ETIMEDOUT 10.0.3.${Math.floor(Math.random() * 250)}:5432 after ${4000 + Math.floor(Math.random() * 2000)}ms`,
      fileName: 'src/db/pool.js', lineNumber: 89, columnNumber: 11, environment: 'production',
      stackTrace: 'Error: connect ETIMEDOUT\n    at Pool.connect (src/db/pool.js:89:11)\n    at getUsers (src/routes/users.js:34:18)',
    }),
  },
  {
    count: 5,
    event: () => ({
      errorType: 'Warning',
      message: 'Each child in a list should have a unique "key" prop',
      fileName: 'src/MetricList.jsx', lineNumber: 34, columnNumber: 5, environment: 'development',
      stackTrace: 'Warning: Each child in a list should have a unique "key" prop.\n    at MetricList (src/MetricList.jsx:34:5)',
    }),
  },
]

// ─── Helpers ────────────────────────────────────────────────────
const c = { green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', dim: '\x1b[2m', bold: '\x1b[1m', reset: '\x1b[0m' }
const step = (title) => console.log(`\n${c.bold}▸ ${title}${c.reset}`)
const line = (ok, label, detail = '') => {
  const mark = ok === true ? `${c.green}✔` : ok === false ? `${c.red}✘` : `${c.yellow}•`
  console.log(`  ${mark}${c.reset} ${label}${detail ? ` ${c.dim}${detail}${c.reset}` : ''}`)
}
const timed = async (fn) => {
  const start = Date.now()
  const value = await fn()
  return { value, ms: Date.now() - start }
}

// ─── 1. Live service checks ─────────────────────────────────────
async function checkServices() {
  step('1. Checking live services from .env')
  const checks = await runChecks()
  for (const [name, r] of Object.entries(checks)) line(r.ok, name.padEnd(9), r.fix ? `${r.detail} → ${r.fix}` : r.detail)
  return checks
}

// ─── 2. Ingest + grouping ───────────────────────────────────────
function ingestTraffic() {
  const total = scenarios.reduce((sum, s) => sum + s.count, 0)
  step(`2. SDK sends ${total} error events → fingerprint + group`)
  const groups = new Map()
  const now = Date.now()

  for (const scenario of scenarios) {
    for (let i = 0; i < scenario.count; i++) {
      const payload = { repositoryId: repository.id, ...scenario.event() }
      const fingerprint = generateFingerprint(payload)
      const seenAt = new Date(now - (scenario.count - i) * 15_000).toISOString()
      const group = groups.get(fingerprint)
      if (group) {
        group.occurrences += 1
        group.last_seen = seenAt
        continue
      }
      groups.set(fingerprint, {
        id: `sim-${fingerprint.slice(0, 8)}`,
        fingerprint,
        repository_id: repository.id,
        error_type: payload.errorType,
        message: payload.message,
        file_name: payload.fileName,
        line_number: payload.lineNumber,
        column_number: payload.columnNumber,
        environment: payload.environment,
        stack_trace: payload.stackTrace,
        request_url: payload.requestUrl,
        severity: estimateSeverity(payload),
        status: 'open',
        occurrences: 1,
        first_seen: seenAt,
        last_seen: seenAt,
      })
    }
  }

  for (const g of groups.values()) {
    line(true, `${g.error_type} ×${g.occurrences}`, `→ 1 group, fingerprint ${g.fingerprint.slice(0, 12)}…, rule severity ${g.severity}`)
  }
  console.log(`  ${c.dim}${total} events collapsed into ${groups.size} groups (one AI call and at most one alert each)${c.reset}`)
  return [...groups.values()]
}

// ─── 3–5. Diagnose, open incidents, build alerts ────────────────
async function processGroups(groups) {
  step('3. Gemini diagnoses each new group (live API call)')
  const analyses = await Promise.all(groups.map((g) => timed(() => analyzeError(g, repository))))
  groups.forEach((g, i) => {
    const { value: analysis, ms } = analyses[i]
    g.ai_analysis = analysis
    if (analysis.status === 'completed') g.severity = analysis.severity
    line(analysis.status === 'completed', `${g.error_type}`, analysis.status === 'completed'
      ? `${ms}ms → severity ${analysis.severity}: ${analysis.rootCause.slice(0, 90)}${analysis.rootCause.length > 90 ? '…' : ''}`
      : `unavailable (${analysis.reason})`)
  })

  step('4. Incident rules')
  const results = groups.map((error) => {
    if (!shouldOpenIncident(error)) {
      line(null, `${error.error_type}`, `${error.severity} in ${error.environment} → no incident, nobody is paged`)
      return { error }
    }
    const incident = { id: `inc-${error.fingerprint.slice(0, 8)}`, title: incidentTitle(error), severity: error.severity, status: 'open' }
    line(true, `${error.error_type}`, `→ incident opened: "${incident.title}"`)
    return {
      error,
      incident,
      slackBlocks: buildErrorAlertBlocks({ incident, error, repository }),
      issue: { title: `[PipelineIQ] ${incident.title}`, body: buildIssueBody(incident, error, repository) },
    }
  })

  step('5. Slack alert + GitHub issue (built by production code, not sent)')
  for (const r of results.filter((x) => x.incident)) {
    line(true, `Slack alert for ${r.error.error_type}`, `${r.slackBlocks.length} Block Kit blocks`)
    line(true, `GitHub issue for ${r.error.error_type}`, `"${r.issue.title}"`)
  }
  return results
}

// ─── 6. Push monitoring ─────────────────────────────────────────
async function processPushes() {
  step('6. Push monitoring: failed CI run + push review (live Gemini, PR built but not opened)')
  const results = await runPushScenarios(repository)
  for (const r of results) {
    if (r.error) {
      line(false, r.name, r.error)
      continue
    }
    line(true, r.name, `${r.ms}ms → ${r.analysis.severity}: ${r.analysis.title}`)
    line(r.applied, '  fix PR', r.applied
      ? `${r.analysis.edits.length} edit(s) applied cleanly to ${Object.keys(r.after).join(', ')}`
      : `not opened: ${r.rejected[0]?.reason ?? 'no edits'}`)
  }
  return results
}

// ─── Report ─────────────────────────────────────────────────────
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch])
const mrkdwn = (s) => esc(s).replace(/```([\s\S]*?)```/g, '<pre>$1</pre>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/_([^_\n]+)_/g, '<i>$1</i>').replace(/\n/g, '<br>')

function renderSlack(blocks) {
  return blocks.map((b) => {
    if (b.type === 'header') return `<div class="s-head">${esc(b.text.text)}</div>`
    if (b.type === 'section' && b.fields) return `<div class="s-fields">${b.fields.map((f) => `<div>${mrkdwn(f.text)}</div>`).join('')}</div>`
    if (b.type === 'section') return `<div class="s-sec">${mrkdwn(b.text.text)}</div>`
    if (b.type === 'context') return `<div class="s-ctx">${b.elements.map((e) => mrkdwn(e.text)).join(' ')}</div>`
    if (b.type === 'actions') return `<div class="s-actions">${b.elements.map((e) => `<span class="s-btn ${e.style ?? ''}">${esc(e.text.text)}</span>`).join('')}</div>`
    return ''
  }).join('')
}

function renderPush(results) {
  return results.map((r) => {
    if (r.error) return `<section class="card"><h2>${esc(r.name)}</h2><p class="bad">${esc(r.error)}</p></section>`
    const diffs = Object.keys(r.after).map((p) => `<p class="meta"><code>${esc(p)}</code></p><pre class="diff">${lineDiff(r.before[p], r.after[p]).map((l) => `<span class="${l.sign === '+' ? 'add' : 'del'}">${l.sign} ${esc(l.text)}</span>`).join('\n')}</pre>`).join('')
    return `<section class="card">
      <div class="row"><h2>${esc(r.name)}: ${esc(r.analysis.title)}</h2><span class="sev sev-${esc(r.analysis.severity)}">${esc(r.analysis.severity)}</span></div>
      <p class="meta">${esc(r.trigger.branch)} · ${esc(r.trigger.commitMessage)} · confidence ${Math.round(r.analysis.confidence * 100)}% · ${esc(r.analysis.model)}</p>
      <p><b>Root cause:</b> ${esc(r.analysis.rootCause)}</p><p>${esc(r.analysis.explanation)}</p>
      <h3>Fix applied to the code</h3>${diffs || `<p class="muted">No PR: ${esc(r.rejected[0]?.reason ?? 'no edits returned')}</p>`}
      <div class="two"><div><h3>Slack alert preview</h3><div class="slack">${renderSlack(r.slackBlocks)}</div></div>
      <div><h3>Fix PR preview</h3>${r.pr ? `<div class="issue"><b>${esc(r.pr.title)}</b><pre>${esc(r.pr.body)}</pre></div>` : '<p class="muted">Not opened</p>'}</div></div>
    </section>`
  }).join('')
}

function writeReport(checks, results, pushes = []) {
  const sevClass = (s) => `sev sev-${s}`
  const cards = results.map(({ error: e, incident, slackBlocks, issue }) => {
    const ai = e.ai_analysis
    return `<section class="card">
      <div class="row"><h2>${esc(e.error_type)}: ${esc(e.message)}</h2><span class="${sevClass(e.severity)}">${esc(e.severity)}</span></div>
      <p class="meta">${esc(e.file_name)}:${e.line_number} · ${esc(e.environment)} · <b>${e.occurrences}</b> events → 1 group · fingerprint <code>${e.fingerprint.slice(0, 16)}…</code></p>
      <h3>AI diagnosis</h3>
      ${ai.status === 'completed'
        ? `<p><b>Root cause:</b> ${esc(ai.rootCause)}</p><p>${esc(ai.explanation)}</p><p><b>Affected area:</b> ${esc(ai.affectedArea)}</p><pre>${esc(ai.suggestedFix)}</pre><p class="meta">${esc(ai.model)}</p>`
        : `<p class="meta">Unavailable (${esc(ai.reason)})</p>`}
      ${incident
        ? `<div class="two"><div><h3>Slack alert preview</h3><div class="slack">${renderSlack(slackBlocks)}</div></div>
           <div><h3>GitHub issue preview</h3><div class="issue"><b>${esc(issue.title)}</b><pre>${esc(issue.body)}</pre></div></div></div>`
        : `<p class="muted">No incident: ${esc(e.severity)} severity in ${esc(e.environment)} doesn't page anyone.</p>`}
    </section>`
  }).join('')

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PipelineIQ Simulation</title><style>
:root{--bg:#f6f7f9;--card:#fff;--fg:#1c1f24;--muted:#6b7280;--line:#e5e7eb;--code:#f1f3f5;--accent:#4f46e5}
@media (prefers-color-scheme:dark){:root{--bg:#0f1115;--card:#171a20;--fg:#e6e8eb;--muted:#9aa1ab;--line:#2a2f37;--code:#1f2329;--accent:#818cf8}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,sans-serif}
main{max-width:1100px;margin:0 auto;padding:32px 16px}h1{margin:0 0 4px}h2{font-size:17px;margin:0;word-break:break-word}h3{font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin:20px 0 8px}
.meta,.muted{color:var(--muted);font-size:13px}.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px;margin:16px 0}
.row{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.two{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:760px){.two{grid-template-columns:1fr}}
pre{background:var(--code);padding:12px;border-radius:8px;overflow-x:auto;font-size:12.5px;white-space:pre-wrap;word-break:break-word}code{background:var(--code);padding:1px 5px;border-radius:4px;font-size:12.5px}
.sev{padding:2px 10px;border-radius:99px;font-size:12px;font-weight:600;text-transform:uppercase;white-space:nowrap}.sev-critical{background:#fee2e2;color:#b91c1c}.sev-high{background:#ffedd5;color:#c2410c}.sev-medium{background:#fef9c3;color:#a16207}.sev-low{background:#dbeafe;color:#1d4ed8}
.checks{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px}.check{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px}.check b{display:block;text-transform:capitalize}
.ok{color:#16a34a}.bad{color:#dc2626}.warn{color:#d97706}
.slack{border-left:4px solid #e01e5a;padding:4px 12px;font-size:14px}.s-head{font-weight:700;font-size:16px;margin:6px 0}.s-fields{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0;word-break:break-word}.s-sec{margin:8px 0}.s-ctx{color:var(--muted);font-size:12px}
.s-actions{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.s-btn{border:1px solid var(--line);border-radius:6px;padding:4px 10px;font-size:13px;font-weight:600}.s-btn.primary{background:#007a5a;color:#fff;border-color:#007a5a}
.issue{border:1px solid var(--line);border-radius:8px;padding:12px}
.diff span{display:block}.diff .add{background:rgba(22,163,74,.15)}.diff .del{background:rgba(220,38,38,.15)}
</style></head><body><main>
<h1>PipelineIQ pipeline simulation</h1><p class="meta">${new Date().toLocaleString()} · repository ${esc(repository.full_name)} (simulated) · read-only run</p>
<h3>Live services</h3><div class="checks">${Object.entries(checks).map(([k, r]) => `<div class="check"><b class="${r.ok === true ? 'ok' : r.ok === false ? 'bad' : 'warn'}">${r.ok === true ? '✔' : r.ok === false ? '✘' : '•'} ${k}</b><span class="meta">${esc(r.detail)}</span></div>`).join('')}</div>
<h3>Runtime errors (SDK)</h3>${cards}
<h3>Push monitoring</h3>${renderPush(pushes)}</main></body></html>`

  fs.mkdirSync(OUT_DIR, { recursive: true })
  const file = path.join(OUT_DIR, 'report.html')
  fs.writeFileSync(file, html)
  fs.writeFileSync(path.join(OUT_DIR, 'result.json'), JSON.stringify({ checks, results, pushes }, null, 2))
  return file
}

const checks = await checkServices()
const results = await processGroups(ingestTraffic())
const pushes = await processPushes()
const file = writeReport(checks, results, pushes)
step('Done')
console.log(`  Report: ${file}\n`)
process.exit(0)
