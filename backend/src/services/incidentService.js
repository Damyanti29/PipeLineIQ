import { env } from '../config/env.js'
import { requireAdmin, unwrap } from '../supabase/adminClient.js'
import { conflict, forbidden, notFound } from '../utils/httpError.js'
import { logger } from '../utils/logger.js'
import { redactSecrets } from '../utils/redact.js'
import { QUEUES, enqueueOrRun } from '../workers/queue.js'
import { displayLocation } from './fingerprintService.js'
import * as githubService from './githubService.js'
import * as slackService from './slackService.js'

export const INCIDENT_STATUSES = ['open', 'investigating', 'resolved', 'ignored']
const ISSUE_LOCK_MS = 2 * 60 * 1000

const INCIDENT_SELECT =
  '*, error:errors(id, error_type, message, file_name, line_number, severity, environment, occurrences, status, last_seen), repository:repositories(id, name, full_name, html_url)'

// Low severity never pages anyone; medium only when it happens in production.
export function shouldOpenIncident(error) {
  if (['critical', 'high'].includes(error.severity)) return true
  return error.severity === 'medium' && error.environment === 'production'
}

export function incidentTitle(error) {
  const location = error.file_name ? ` in ${displayLocation(error)}` : ''
  return `${error.error_type}${location}`.slice(0, 200)
}

// Opens an incident for an error group unless one is already active (enforced by a unique index).
export async function openIncidentForError(error) {
  const admin = requireAdmin()
  const { data, error: insertError } = await admin
    .from('incidents')
    .insert({ repository_id: error.repository_id, error_id: error.id, title: incidentTitle(error), severity: error.severity })
    .select('*')
    .single()

  if (!insertError) return { incident: data, created: true }
  if (insertError.code !== '23505') throw new Error(insertError.message)

  const existing = unwrap(
    await admin.from('incidents').select('*').eq('error_id', error.id).in('status', ['open', 'investigating']).maybeSingle(),
  )
  return { incident: existing, created: false }
}

export function queueSlackNotification(incidentId, type) {
  const run = {
    alert: () => slackService.sendErrorAlert(incidentId),
    resolution: () => slackService.sendResolutionNotification(incidentId),
  }[type] ?? (() => slackService.sendIncidentUpdate(incidentId, type))
  return enqueueOrRun(QUEUES.slackNotification, { incidentId, type }, run)
}

// ─── User-facing (db = user-scoped client, RLS applies) ─────────

export async function listIncidents(db, { status, repositoryId, limit = 50 } = {}) {
  let query = db.from('incidents').select(INCIDENT_SELECT).order('created_at', { ascending: false }).limit(limit)
  if (status) query = query.eq('status', status)
  if (repositoryId) query = query.eq('repository_id', repositoryId)
  return unwrap(await query)
}

export async function getIncident(db, id) {
  const incident = unwrap(await db.from('incidents').select(INCIDENT_SELECT).eq('id', id).maybeSingle())
  if (!incident) throw notFound('Incident not found')
  return incident
}

// Incident status drives the error group's status, so a resolved error that re-occurs
// is detected as a regression and opens a fresh incident.
const ERROR_STATUS_FOR = { open: 'open', investigating: 'open', resolved: 'resolved', ignored: 'ignored' }

export async function updateIncidentStatus(db, id, status) {
  const current = await getIncident(db, id)
  if (current.status === status) return current

  const incident = unwrap(
    await db
      .from('incidents')
      .update({ status, resolved_at: status === 'resolved' ? new Date().toISOString() : null })
      .eq('id', id)
      .select(INCIDENT_SELECT)
      .single(),
  )
  unwrap(await db.from('errors').update({ status: ERROR_STATUS_FOR[status] }).eq('id', incident.error_id))

  await queueSlackNotification(id, status === 'resolved' ? 'resolution' : `🔄 Incident status changed to *${status}*`)
  return incident
}

// ─── GitHub issues ──────────────────────────────────────────────

export function buildIssueBody(incident, error, repository) {
  const ai = error.ai_analysis?.status === 'completed' ? error.ai_analysis : null
  const location = displayLocation(error) ?? 'unknown'
  return [
    `## ${error.error_type}: ${redactSecrets(error.message)}`,
    '',
    `| | |`,
    `|---|---|`,
    `| **Repository** | ${repository.full_name} |`,
    `| **Severity** | ${incident.severity} |`,
    `| **Occurrences** | ${error.occurrences} |`,
    `| **Environment** | ${error.environment} |`,
    `| **Location** | \`${location}\` |`,
    `| **First seen** | ${error.first_seen} |`,
    `| **Last seen** | ${error.last_seen} |`,
    '',
    '### Stack trace',
    '```',
    redactSecrets(error.stack_trace ?? 'No stack trace captured').slice(0, 20000),
    '```',
    '',
    '### AI diagnosis',
    ai ? `**Root cause:** ${ai.rootCause}\n\n${ai.explanation}\n\n**Affected area:** ${ai.affectedArea}` : '_AI diagnosis unavailable._',
    '',
    '### Suggested fix',
    ai ? ai.suggestedFix : '_No suggestion available._',
    '',
    `---\n_Created by [PipelineIQ](${env.frontendUrl}/errors/${error.id})_`,
  ].join('\n')
}

// Creates exactly one GitHub issue per incident. `userId` must own the incident's repository.
export async function createGithubIssue(incidentId, userId) {
  const admin = requireAdmin()
  const incident = unwrap(
    await admin.from('incidents').select('*, error:errors(*), repository:repositories(*)').eq('id', incidentId).maybeSingle(),
  )
  if (!incident || incident.repository.user_id !== userId) throw notFound('Incident not found')
  if (incident.github_issue_number) return { incident, created: false }

  if (!(await githubService.userHasInstallation(userId, incident.repository.installation_id))) {
    throw forbidden('The GitHub installation for this repository is no longer connected')
  }

  // Claim a short lock so concurrent requests cannot create duplicate issues.
  const staleBefore = new Date(Date.now() - ISSUE_LOCK_MS).toISOString()
  const claimed = unwrap(
    await admin
      .from('incidents')
      .update({ github_issue_lock_at: new Date().toISOString() })
      .eq('id', incidentId)
      .is('github_issue_number', null)
      .or(`github_issue_lock_at.is.null,github_issue_lock_at.lt.${staleBefore}`)
      .select('id'),
  )
  if (!claimed.length) throw conflict('A GitHub issue is already being created for this incident')

  try {
    const issue = await githubService.createIssue(incident.repository.installation_id, incident.repository.full_name, {
      title: `[PipelineIQ] ${incident.title}`,
      body: buildIssueBody(incident, incident.error, incident.repository),
      labels: ['bug', 'pipelineiq'],
    })
    const updated = unwrap(
      await admin
        .from('incidents')
        .update({ github_issue_number: issue.number, github_issue_url: issue.html_url, github_issue_lock_at: null })
        .eq('id', incidentId)
        .select('*')
        .single(),
    )
    await queueSlackNotification(incidentId, `📝 GitHub issue created: <${issue.html_url}|#${issue.number}>`)
    return { incident: updated, created: true }
  } catch (error) {
    await admin.from('incidents').update({ github_issue_lock_at: null }).eq('id', incidentId)
    throw error
  }
}

// github-issue job (from the Slack button): acts as the owner of the incident's repository.
export async function createGithubIssueAsOwner(incidentId) {
  const incident = unwrap(
    await requireAdmin().from('incidents').select('id, repository:repositories(user_id)').eq('id', incidentId).maybeSingle(),
  )
  if (!incident) return { skipped: 'incident_not_found' }
  return createGithubIssue(incidentId, incident.repository.user_id)
}

// Called from the `issues.closed` webhook: closing the linked GitHub issue resolves the incident.
export async function resolveIncidentsForIssue(repositoryId, issueNumber) {
  const admin = requireAdmin()
  const incidents = unwrap(
    await admin
      .from('incidents')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('repository_id', repositoryId)
      .eq('github_issue_number', issueNumber)
      .in('status', ['open', 'investigating'])
      .select('id, error_id'),
  )
  for (const incident of incidents) {
    unwrap(await admin.from('errors').update({ status: 'resolved' }).eq('id', incident.error_id))
    await queueSlackNotification(incident.id, 'resolution')
    logger.info('Incident resolved by GitHub issue close', { incidentId: incident.id, issueNumber })
  }
  return incidents.length
}
