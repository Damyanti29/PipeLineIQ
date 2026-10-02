// Push-time monitoring. Two triggers, one flow:
//   ci_failure  — a GitHub Actions run failed: read the failed job logs and the code they point at.
//   diff_review — every push: Gemini reviews the changed code for definite bugs.
// Gemini returns a diagnosis plus exact search/replace edits. If every edit applies cleanly, the fix
// is committed to a new `pipelineiq/fix-*` branch and opened as a pull request; the Slack alert links it.
import crypto from 'node:crypto'
import { z } from 'zod'
import { env } from '../config/env.js'
import { requireAdmin, unwrap } from '../supabase/adminClient.js'
import { notFound } from '../utils/httpError.js'
import { logger } from '../utils/logger.js'
import { redactSecrets } from '../utils/redact.js'
import { generateContent } from './aiService.js'
import * as githubService from './githubService.js'
import * as slackService from './slackService.js'

export const FIX_BRANCH_PREFIX = 'pipelineiq/'
const REVIEW_MIN_CONFIDENCE = 0.8
const LIMITS = { files: 6, fileChars: 60_000, totalFileChars: 90_000, patchChars: 40_000, logChars: 16_000 }

const CODE_FILE = /\.(?:m?jsx?|cjs|tsx?|py|go|rb|java|kt|cs|php|rs|swift|c|cc|cpp|h|hpp|vue|svelte|json|ya?ml|toml|css|scss|html|sh|sql)$/i
const IGNORED_FILE = /(?:^|\/)(?:node_modules|dist|build|vendor|coverage|\.next|\.git)\/|\.min\.|(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|\.lock)$/i
export const isReviewableFile = (filePath) => CODE_FILE.test(filePath) && !IGNORED_FILE.test(filePath)

// ─── Triggers ───────────────────────────────────────────────────

// Turns a webhook into a trigger, or { skip } with the reason. Never reacts to its own fix
// branches or to bot pushes, so a fix PR cannot start another round.
export function extractTrigger(event, payload) {
  const repoUrl = payload.repository?.html_url
  if (event === 'push') {
    const branch = payload.ref?.startsWith('refs/heads/') ? payload.ref.slice('refs/heads/'.length) : null
    if (!branch) return { skip: 'not a branch push' }
    if (payload.deleted || !payload.after || /^0+$/.test(payload.after)) return { skip: 'branch deleted' }
    if (branch.startsWith(FIX_BRANCH_PREFIX)) return { skip: 'PipelineIQ fix branch' }
    if (payload.sender?.type === 'Bot') return { skip: 'bot push' }
    if (!env.pushReview) return { skip: 'push review disabled (PUSH_REVIEW=false)' }
    if (/\[skip pipelineiq\]/i.test(payload.head_commit?.message ?? '')) return { skip: 'skipped by commit message' }
    return {
      source: 'diff_review',
      dedupeKey: `push:${payload.after}`,
      sha: payload.after,
      before: payload.before,
      branch,
      commitMessage: payload.head_commit?.message ?? null,
      commitUrl: payload.head_commit?.url ?? `${repoUrl}/commit/${payload.after}`,
      actor: payload.pusher?.name ?? payload.sender?.login ?? null,
    }
  }

  if (event === 'workflow_run') {
    const run = payload.workflow_run ?? {}
    if (payload.action !== 'completed' || !['failure', 'timed_out'].includes(run.conclusion)) return { skip: 'run did not fail' }
    if (run.head_branch?.startsWith(FIX_BRANCH_PREFIX)) return { skip: 'PipelineIQ fix branch' }
    if (run.head_repository?.id && payload.repository?.id && run.head_repository.id !== payload.repository.id) {
      return { skip: 'run from a fork' }
    }
    return {
      source: 'ci_failure',
      dedupeKey: `ci:${run.id}:${run.run_attempt ?? 1}`,
      sha: run.head_sha,
      before: null,
      branch: run.head_branch ?? null,
      commitMessage: run.head_commit?.message ?? null,
      commitUrl: `${repoUrl}/commit/${run.head_sha}`,
      actor: run.actor?.login ?? payload.sender?.login ?? null,
      workflowName: run.name ?? null,
      runId: run.id,
      runUrl: run.html_url ?? null,
    }
  }
  return { skip: `event ${event} is not monitored` }
}

// ─── Context collection ─────────────────────────────────────────

export function cleanLog(raw = '') {
  const lines = String(raw)
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z ?/gm, '')
    .split(/\r?\n/)
  const errorLines = [...new Set(lines.filter((l) => /##\[error\]|\berror\b|failed|exception|✕|✖|FAIL\b/i.test(l)))].slice(0, 60)
  const tail = lines.join('\n').slice(-12_000)
  return redactSecrets(`Error lines:\n${errorLines.join('\n')}\n\nLog tail:\n${tail}`)
}

// Repository-relative file paths mentioned in a CI log (runner checkout prefixes removed).
export function referencedPaths(log = '') {
  const text = String(log)
    .replace(/\/home\/runner\/work\/[^/\s]+\/[^/\s]+\//g, '')
    .replace(/[A-Z]:\\a\\[^\\\s]+\\[^\\\s]+\\/g, '')
    .replace(/\\/g, '/')
  const found = new Set()
  for (const match of text.matchAll(/(?:^|[\s('"`[])\.?\/?((?:[\w@.-]+\/)*[\w@-][\w@.-]*\.[a-z]{1,6})(?::\d+)?/gim)) {
    if (isReviewableFile(match[1]) && !match[1].startsWith('.')) found.add(match[1])
  }
  return [...found]
}

async function loadFiles(token, fullName, paths, ref) {
  const files = {}
  let total = 0
  for (const filePath of paths) {
    if (Object.keys(files).length >= LIMITS.files) break
    const content = await githubService.getFileContent(token, fullName, filePath, ref)
    if (content == null || content.length > LIMITS.fileChars || total + content.length > LIMITS.totalFileChars) continue
    files[filePath] = content
    total += content.length
  }
  return files
}

const formatPatches = (changed) =>
  changed.map((f) => `--- ${f.path} (${f.status})\n${f.patch}`).join('\n\n').slice(0, LIMITS.patchChars)

async function collectCiContext(token, repo, trigger) {
  const [jobs, changed] = await Promise.all([
    githubService.getFailedJobLogs(token, repo.full_name, trigger.runId),
    githubService.getChangedFiles(token, repo.full_name, { after: trigger.sha }).catch(() => []),
  ])
  const rawLogs = jobs.map((j) => j.log).join('\n')
  const paths = [...new Set([...referencedPaths(rawLogs), ...changed.filter((c) => c.status !== 'removed').map((c) => c.path)])]
    .filter(isReviewableFile)
  return {
    jobs: jobs.map(({ name, failedSteps }) => ({ name, failedSteps })),
    log: jobs.map((j) => `### Job "${j.name}" (failed steps: ${j.failedSteps.join(', ') || 'unknown'})\n${cleanLog(j.log)}`).join('\n\n').slice(0, LIMITS.logChars),
    patches: formatPatches(changed),
    files: await loadFiles(token, repo.full_name, paths, trigger.sha),
  }
}

async function collectPushContext(token, repo, trigger) {
  const changed = (await githubService.getChangedFiles(token, repo.full_name, { before: trigger.before, after: trigger.sha }))
    .filter((c) => c.status !== 'removed' && isReviewableFile(c.path))
  if (!changed.length) return { skip: 'No reviewable code changes in this push.' }
  return {
    patches: formatPatches(changed),
    files: await loadFiles(token, repo.full_name, changed.map((c) => c.path), trigger.sha),
  }
}

// ─── Gemini ─────────────────────────────────────────────────────

const severity = z.enum(['critical', 'high', 'medium', 'low'])
export const fixSchema = z.object({
  hasIssues: z.boolean(),
  confidence: z.number().min(0).max(1),
  severity: severity.catch('medium'),
  title: z.string().trim().max(200).default(''),
  rootCause: z.string().trim().max(4000).default(''),
  explanation: z.string().trim().max(8000).default(''),
  suggestedFix: z.string().trim().max(8000).default(''),
  edits: z.array(z.object({ path: z.string().min(1), find: z.string().min(1), replace: z.string() })).max(20).default([]),
})

const RESPONSE_FORMAT = [
  'Respond with ONLY a JSON object with exactly these keys:',
  '{"hasIssues": boolean, "confidence": number 0-1, "severity": "critical"|"high"|"medium"|"low", "title": string (under 80 chars),',
  ' "rootCause": string, "explanation": string, "suggestedFix": string (what to change, in plain words),',
  ' "edits": [{"path": string, "find": string, "replace": string}]}',
  '',
  'Rules for "edits":',
  '- Minimal search/replace edits that fix the problem. Only edit files shown under FILES.',
  '- "find" must be copied EXACTLY from the file (same indentation and line breaks) and must appear only once in it;',
  '  include a few surrounding lines when needed to make it unique.',
  '- Never weaken checks to hide the problem: do not delete or skip tests, disable lint rules or remove type checks.',
  '- If the fix is not a code change in the shown files (missing secret, infrastructure, flaky network, dependency outage),',
  '  return "edits": [] and explain what to do in "suggestedFix".',
]

const formatFiles = (files) =>
  Object.entries(files).map(([p, content]) => `=== FILE: ${p} ===\n${content}\n=== END FILE: ${p} ===`).join('\n\n') || '(none available)'

export function buildPrompt(trigger, context, repo) {
  const header = [
    `Repository: ${repo.full_name}`,
    `Branch: ${trigger.branch ?? 'unknown'}`,
    `Commit: ${trigger.sha} — ${redactSecrets(trigger.commitMessage ?? '').split('\n')[0]}`,
  ]
  if (trigger.source === 'ci_failure') {
    return [
      'You are a senior software engineer fixing a failed CI pipeline (GitHub Actions).',
      'Find the root cause of the failure from the log and the code, then propose a fix. "hasIssues" is true.',
      ...RESPONSE_FORMAT,
      '',
      ...header,
      `Workflow: ${trigger.workflowName ?? 'unknown'}`,
      `Failed jobs: ${context.jobs.map((j) => `${j.name} [${j.failedSteps.join(', ')}]`).join('; ')}`,
      '',
      'LOG:', context.log,
      '',
      'CHANGES IN THIS COMMIT:', context.patches || '(unavailable)',
      '',
      'FILES (content at the failing commit):', formatFiles(context.files),
    ].join('\n')
  }
  return [
    'You are a senior software engineer reviewing a git push before it reaches production.',
    'Report ONLY bugs that will definitely cause an error, crash, failed build or clearly wrong behaviour:',
    'syntax errors, undefined variables, wrong imports, calling something that does not exist, null access on an obvious path,',
    'broken logic that contradicts the code\'s intent, committed secrets. Ignore style, naming, performance, missing tests and opinions.',
    'If nothing is clearly broken, return "hasIssues": false and "edits": []. "confidence" is how sure you are the bug is real.',
    ...RESPONSE_FORMAT,
    '',
    ...header,
    '',
    'DIFF:', context.patches,
    '',
    'FILES (full content after the push):', formatFiles(context.files),
  ].join('\n')
}

export function parseFixResponse(text) {
  const cleaned = String(text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim()
  return fixSchema.parse(JSON.parse(cleaned))
}

async function analyze(trigger, context, repo) {
  const result = await generateContent(buildPrompt(trigger, context, repo), { timeoutMs: 90_000 })
  if (!result.ok) throw new Error(`Gemini request failed (HTTP ${result.status})`)
  return { ...parseFixResponse(result.text), model: result.model, analyzedAt: new Date().toISOString() }
}

// ─── Applying the fix ───────────────────────────────────────────

// All-or-nothing: returns the new content of every changed file, or the reasons edits were rejected.
export function applyEdits(files, edits) {
  const next = { ...files }
  const changed = new Set()
  const rejected = []
  for (const edit of edits) {
    if (!(edit.path in next)) {
      rejected.push({ path: edit.path, reason: 'file was not part of the analysed code' })
      continue
    }
    const content = next[edit.path]
    const crlf = content.includes('\r\n') && !edit.find.includes('\r\n')
    const find = crlf ? edit.find.replace(/\n/g, '\r\n') : edit.find
    const replace = crlf ? edit.replace.replace(/\n/g, '\r\n') : edit.replace
    const count = content.split(find).length - 1
    if (count !== 1) {
      rejected.push({ path: edit.path, reason: count ? 'text to replace is ambiguous' : 'text to replace was not found' })
      continue
    }
    if (find === replace) continue
    next[edit.path] = content.replace(find, () => replace)
    changed.add(edit.path)
  }
  return { files: Object.fromEntries([...changed].map((p) => [p, next[p]])), rejected }
}

export function buildPrBody(trigger, analysis, changedPaths, repo) {
  const sha7 = trigger.sha.slice(0, 7)
  const what = trigger.source === 'ci_failure'
    ? `the failed **${trigger.workflowName ?? 'CI'}** run`
    : 'a bug found while reviewing the push'
  const links = [
    trigger.runUrl && `- Failed run: ${trigger.runUrl}`,
    `- Commit: ${trigger.commitUrl ?? `${repo.html_url}/commit/${trigger.sha}`}`,
  ].filter(Boolean)
  return [
    '## 🤖 Automated fix by PipelineIQ',
    '',
    `> Temporary fix generated by Gemini for ${what} on \`${trigger.branch}\` at \`${sha7}\`.`,
    '> Review the change before merging.',
    '',
    '### What went wrong',
    analysis.rootCause,
    '',
    analysis.explanation,
    '',
    '### What this PR changes',
    analysis.suggestedFix,
    '',
    ...changedPaths.map((p) => `- \`${p}\``),
    '',
    '### Links',
    ...links,
    '',
    '---',
    '_Merging this PR marks the PipelineIQ alert as resolved._',
  ].join('\n')
}

async function existingFixPr(repositoryIds, sha) {
  const [row] = unwrap(
    await requireAdmin()
      .from('pipeline_alerts')
      .select('fix_branch, fix_pr_number, fix_pr_url')
      .in('repository_id', repositoryIds)
      .eq('commit_sha', sha)
      .not('fix_pr_url', 'is', null)
      .limit(1),
  )
  return row ?? null
}

async function proposeFix(token, repo, trigger, context, analysis, repositoryIds) {
  if (!env.autoFixPr) return { note: 'Automatic fix PRs are turned off (AUTO_FIX_PR=false).' }
  const existing = await existingFixPr(repositoryIds, trigger.sha)
  if (existing) return { ...existing, note: 'A fix PR for this commit was already opened.' }
  if (!trigger.branch) return { note: 'The failing commit is not on a branch, so no PR could be opened.' }
  if (!analysis.edits.length) return { note: 'Gemini did not find a safe code change for this. See the suggested fix.' }

  const { files, rejected } = applyEdits(context.files, analysis.edits)
  if (rejected.length || !Object.keys(files).length) {
    const reason = rejected[0] ? `${rejected[0].path}: ${rejected[0].reason}` : 'the edits changed nothing'
    return { note: `The suggested fix could not be applied exactly (${reason}), so no PR was opened.` }
  }

  const branch = `${FIX_BRANCH_PREFIX}fix-${trigger.sha.slice(0, 7)}-${crypto.randomBytes(2).toString('hex')}`
  try {
    const pr = await githubService.createFixPullRequest(token, repo.full_name, {
      baseSha: trigger.sha,
      baseBranch: trigger.branch,
      branch,
      files,
      commitMessage: `fix: ${analysis.title || 'PipelineIQ automated fix'}\n\nGenerated by PipelineIQ (Gemini) for ${trigger.sha.slice(0, 7)}.`,
      title: `🤖 PipelineIQ fix: ${analysis.title || `fix for ${trigger.sha.slice(0, 7)}`}`,
      body: buildPrBody(trigger, analysis, Object.keys(files), repo),
    })
    return { fix_branch: branch, fix_pr_number: pr.number, fix_pr_url: pr.html_url }
  } catch (error) {
    logger.warn('Fix PR could not be opened', { repo: repo.full_name, error: error.message })
    return { note: `Could not open the fix PR (${error.message}). The GitHub App needs Contents and Pull requests: Read & write.` }
  }
}

// ─── Orchestration ──────────────────────────────────────────────

// pipeline-analysis job. Claims the trigger once per repository row (webhook redeliveries are
// no-ops), analyses it once, opens at most one PR, then alerts every owner's Slack channel.
export async function processPipelineEvent({ trigger, repositoryIds }) {
  const admin = requireAdmin()
  const repos = unwrap(
    await admin
      .from('repositories')
      .select('id, user_id, installation_id, full_name, html_url, monitoring_enabled')
      .in('id', repositoryIds),
  ).filter((r) => r.monitoring_enabled)
  if (!repos.length) return { skipped: 'not_monitored' }

  const claimed = unwrap(
    await admin
      .from('pipeline_alerts')
      .upsert(
        repos.map((r) => ({
          repository_id: r.id,
          dedupe_key: trigger.dedupeKey,
          source: trigger.source,
          branch: trigger.branch,
          commit_sha: trigger.sha,
          commit_message: trigger.commitMessage?.slice(0, 1000) ?? null,
          commit_url: trigger.commitUrl,
          actor: trigger.actor,
          workflow_name: trigger.workflowName ?? null,
          workflow_run_id: trigger.runId ?? null,
          run_url: trigger.runUrl ?? null,
        })),
        { onConflict: 'repository_id,dedupe_key', ignoreDuplicates: true },
      )
      .select('id, repository_id'),
  )
  if (!claimed.length) return { skipped: 'duplicate' }

  const ids = claimed.map((c) => c.id)
  const repoById = new Map(repos.map((r) => [r.id, r]))
  const primary = repoById.get(claimed[0].repository_id)
  const update = async (fields) => unwrap(await admin.from('pipeline_alerts').update(fields).in('id', ids).select('*'))

  try {
    const token = await githubService.getInstallationToken(primary.installation_id)
    const context = trigger.source === 'ci_failure'
      ? await collectCiContext(token, primary, trigger)
      : await collectPushContext(token, primary, trigger)
    if (context.skip) {
      await update({ status: 'no_issue', fix_note: context.skip })
      return { result: 'no_issue', reason: context.skip }
    }

    // A failed CI run is a real problem even when Gemini is unavailable, so it is still alerted
    // (without a diagnosis). A push review without Gemini has nothing to report.
    let analysis
    try {
      analysis = await analyze(trigger, context, primary)
    } catch (error) {
      if (trigger.source !== 'ci_failure') throw error
      logger.warn('CI failure alerted without AI analysis', { sha: trigger.sha, error: error.message })
      analysis = null
    }
    const actionable = trigger.source === 'ci_failure' ||
      (analysis.hasIssues && analysis.confidence >= REVIEW_MIN_CONFIDENCE && analysis.severity !== 'low')
    if (!actionable) {
      await update({ status: 'no_issue', analysis, severity: analysis.severity })
      return { result: 'no_issue' }
    }

    const fix = analysis
      ? await proposeFix(token, primary, trigger, context, analysis, repos.map((r) => r.id))
      : { note: 'AI analysis is temporarily unavailable. Open the failed run for the details.' }
    const rows = await update({
      status: fix.fix_pr_url ? 'fix_proposed' : 'alerted',
      severity: analysis?.severity ?? 'high',
      title: (analysis?.title || (trigger.source === 'ci_failure' ? `${trigger.workflowName ?? 'CI'} failed` : 'Bug found in push')).slice(0, 200),
      analysis,
      fix_branch: fix.fix_branch ?? null,
      fix_pr_number: fix.fix_pr_number ?? null,
      fix_pr_url: fix.fix_pr_url ?? null,
      fix_note: fix.note ?? null,
    })

    for (const row of rows) {
      await slackService.sendPipelineAlert(row, repoById.get(row.repository_id)).catch((error) =>
        logger.warn('Pipeline Slack alert failed', { alertId: row.id, error: error.message }),
      )
    }
    logger.info('Pipeline event processed', { source: trigger.source, sha: trigger.sha, pr: fix.fix_pr_url ?? null })
    return { result: rows[0].status, pr: fix.fix_pr_url ?? null }
  } catch (error) {
    // Not rethrown: the trigger is already claimed, so a queue retry would be skipped as a duplicate anyway.
    logger.error('Pipeline analysis failed', { source: trigger.source, sha: trigger.sha, error })
    await update({ status: 'failed', fix_note: error.message.slice(0, 500) }).catch(() => {})
    return { result: 'failed', error: error.message }
  }
}

// pull_request.closed + merged on a fix branch: the alert is resolved.
export async function resolveByFixBranch(repositoryIds, branch) {
  const rows = unwrap(
    await requireAdmin()
      .from('pipeline_alerts')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .in('repository_id', repositoryIds)
      .eq('fix_branch', branch)
      .neq('status', 'resolved')
      .select('*, repository:repositories(user_id)'),
  )
  for (const row of rows) {
    await slackService.sendPipelineUpdate(row, row.repository, `✅ Fix PR merged: <${row.fix_pr_url}|#${row.fix_pr_number}>`).catch(() => {})
  }
  return rows.length
}

// ─── Reads & updates (db = user-scoped client, RLS applies) ─────

export const ALERT_STATUSES = ['analyzing', 'no_issue', 'alerted', 'fix_proposed', 'resolved', 'dismissed', 'failed']

export async function listAlerts(db, { status, repositoryId, includeClean = false, limit = 50 } = {}) {
  let query = db
    .from('pipeline_alerts')
    .select('*, repository:repositories(id, name, full_name, html_url)')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (status) query = query.eq('status', status)
  else if (!includeClean) query = query.neq('status', 'no_issue')
  if (repositoryId) query = query.eq('repository_id', repositoryId)
  return unwrap(await query)
}

export async function updateAlertStatus(db, id, status) {
  const resolvedAt = status === 'resolved' ? new Date().toISOString() : null
  const row = unwrap(
    await db.from('pipeline_alerts').update({ status, resolved_at: resolvedAt }).eq('id', id).select('*').maybeSingle(),
  )
  if (!row) throw notFound('Pipeline alert not found')
  return row
}
