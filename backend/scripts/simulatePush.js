// Push-monitoring part of `npm run simulate`: a failed CI run and a buggy push, analysed by live
// Gemini with the production prompt, parser and edit applier. The fix PR and Slack alert are built
// but not sent.
import { generateContent } from '../src/services/aiService.js'
import { applyEdits, buildPrBody, buildPrompt, parseFixResponse } from '../src/services/pipelineService.js'
import { buildPipelineAlertBlocks } from '../src/services/slackService.js'

const SPLIT_JS = `// Splits an expense between people. Amounts are in cents.
export function splitEvenly(totalCents, people) {
  const share = Math.floor(totalCents / people.length)
  return people.map((person) => ({ person: person.name, amount: share }))
}

export function owedBy(splits, name) {
  return splits.filter((s) => s.person === name).reduce((sum, s) => sum + s.amount, 0)
}
`

const SPLIT_TEST_JS = `import { splitEvenly } from './split.js'

test('shares add up to the total', () => {
  const people = [{ name: 'Asha' }, { name: 'Ben' }, { name: 'Chen' }]
  const shares = splitEvenly(100, people)
  expect(shares.reduce((sum, s) => sum + s.amount, 0)).toBe(100)
})
`

const CI_LOG = `2026-10-02T10:14:03.1234567Z > splitwise-app@1.4.0 test
2026-10-02T10:14:05.2234567Z FAIL src/utils/split.test.js
2026-10-02T10:14:05.2234567Z   ● shares add up to the total
2026-10-02T10:14:05.2234567Z     expect(received).toBe(expected) // Object.is equality
2026-10-02T10:14:05.2234567Z     Expected: 100
2026-10-02T10:14:05.2234567Z     Received: 99
2026-10-02T10:14:05.2234567Z       at Object.<anonymous> (/home/runner/work/splitwise-app/splitwise-app/src/utils/split.test.js:6:58)
2026-10-02T10:14:05.3234567Z Tests: 1 failed, 11 passed, 12 total
2026-10-02T10:14:05.4234567Z ##[error]Process completed with exit code 1.`

const USERS_JS = `import { formatCurrncy } from './format.js'
import { db } from './db.js'

export async function balanceLabel(userId) {
  const user = await db.users.findById(userId)
  return \`\${user.name} owes \${formatCurrncy(user.balanceCents)}\`
}
`

const FORMAT_JS = `export function formatCurrency(cents, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(cents / 100)
}
`

export const PUSH_SCENARIOS = [
  {
    name: 'CI failure',
    trigger: {
      source: 'ci_failure', sha: '4b1f9c2d7e8a0b3c5d6e7f8091a2b3c4d5e6f708', branch: 'feat/split-evenly',
      commitMessage: 'feat: split expenses evenly in cents', commitUrl: 'https://github.com/acme/splitwise-app/commit/4b1f9c2',
      actor: 'asha', workflowName: 'CI · test & build', runId: 101, runUrl: 'https://github.com/acme/splitwise-app/actions/runs/101',
    },
    context: {
      jobs: [{ name: 'test', failedSteps: ['Run npm test'] }],
      log: CI_LOG,
      patches: '--- src/utils/split.js (modified)\n-  const share = totalCents / people.length\n+  const share = Math.floor(totalCents / people.length)',
      files: { 'src/utils/split.js': SPLIT_JS, 'src/utils/split.test.js': SPLIT_TEST_JS },
    },
  },
  {
    name: 'Push review',
    trigger: {
      source: 'diff_review', sha: '9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d', branch: 'main',
      commitMessage: 'feat: show balance label', commitUrl: 'https://github.com/acme/splitwise-app/commit/9e8d7c6', actor: 'ben',
    },
    context: {
      patches: '--- src/api/users.js (added)\n+import { formatCurrncy } from \'./format.js\'\n+...\n+  return `${user.name} owes ${formatCurrncy(user.balanceCents)}`',
      files: { 'src/api/users.js': USERS_JS, 'src/api/format.js': FORMAT_JS },
    },
  },
]

// Returns one result per scenario; never throws so the rest of the simulation still runs.
export async function runPushScenarios(repository) {
  return Promise.all(
    PUSH_SCENARIOS.map(async ({ name, trigger, context }) => {
      const started = Date.now()
      try {
        const response = await generateContent(buildPrompt(trigger, context, repository), { timeoutMs: 90_000 })
        if (!response.ok) return { name, trigger, error: `Gemini HTTP ${response.status}` }
        const analysis = { ...parseFixResponse(response.text), model: response.model }
        const { files, rejected } = applyEdits(context.files, analysis.edits)
        const applied = Object.keys(files).length > 0 && rejected.length === 0
        const alert = {
          source: trigger.source, title: analysis.title, severity: analysis.severity, branch: trigger.branch,
          commit_sha: trigger.sha, commit_message: trigger.commitMessage, commit_url: trigger.commitUrl, actor: trigger.actor,
          workflow_name: trigger.workflowName, run_url: trigger.runUrl, analysis,
          fix_pr_number: applied ? 62 : null, fix_pr_url: applied ? `${repository.html_url}/pull/62` : null,
          fix_note: applied ? null : `edits could not be applied (${rejected[0]?.reason ?? 'no edits'})`,
        }
        return {
          name, trigger, analysis, ms: Date.now() - started, applied, rejected,
          before: context.files, after: files,
          pr: applied ? { title: `🤖 PipelineIQ fix: ${analysis.title}`, body: buildPrBody(trigger, analysis, Object.keys(files), repository) } : null,
          slackBlocks: buildPipelineAlertBlocks({ alert, repository }),
        }
      } catch (error) {
        return { name, trigger, error: error.message }
      }
    }),
  )
}

// Minimal line diff (changed region only) for the report.
export function lineDiff(before, after) {
  const a = before.split('\n')
  const b = after.split('\n')
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length - 1
  let endB = b.length - 1
  while (endA >= start && endB >= start && a[endA] === b[endB]) { endA--; endB-- }
  return [
    ...a.slice(start, endA + 1).map((l) => ({ sign: '-', text: l })),
    ...b.slice(start, endB + 1).map((l) => ({ sign: '+', text: l })),
  ]
}
