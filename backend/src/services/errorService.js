import { requireAdmin, unwrap } from '../supabase/adminClient.js'
import { notFound } from '../utils/httpError.js'
import { logger } from '../utils/logger.js'
import { QUEUES, enqueueOrRun } from '../workers/queue.js'
import * as aiService from './aiService.js'
import { generateFingerprint } from './fingerprintService.js'
import * as incidentService from './incidentService.js'

export const ERROR_STATUSES = ['open', 'resolved', 'ignored']
const SEVERITY_RANK = { low: 0, medium: 1, high: 2, critical: 3 }

const CRITICAL_PATTERNS = /out of memory|heap|fatal|segmentation fault|database|ECONNREFUSED|ETIMEDOUT|deadlock|payment|unauthorized access/i
const HIGH_TYPES = new Set(['TypeError', 'ReferenceError', 'SyntaxError', 'RangeError', 'ChunkLoadError', 'UnhandledRejection'])

// Rule-based severity used until (or if) the AI analysis provides one.
export function estimateSeverity({ errorType, message, environment }) {
  const production = environment === 'production'
  if (production && CRITICAL_PATTERNS.test(`${errorType} ${message}`)) return 'critical'
  if (/warning|deprecat/i.test(`${errorType} ${message}`)) return 'low'
  if (HIGH_TYPES.has(errorType)) return production ? 'high' : 'medium'
  return production ? 'medium' : 'low'
}

// ─── Ingestion ──────────────────────────────────────────────────

// Groups one occurrence (atomically, in Postgres) and triggers follow-up work only when the
// group is new or has regressed — 100 identical errors produce one analysis and one alert.
export async function ingestError(payload) {
  const fingerprint = generateFingerprint(payload)
  const severity = estimateSeverity(payload)

  const [result] = unwrap(
    await requireAdmin().rpc('ingest_error', {
      p_repository_id: payload.repositoryId,
      p_fingerprint: fingerprint,
      p_error_type: payload.errorType,
      p_message: payload.message,
      p_stack_trace: payload.stackTrace ?? null,
      p_file_name: payload.fileName ?? null,
      p_line_number: payload.lineNumber ?? null,
      p_column_number: payload.columnNumber ?? null,
      p_severity: severity,
      p_environment: payload.environment,
      p_request_url: payload.requestUrl ?? null,
      p_user_agent: payload.userAgent ?? null,
      p_metadata: payload.metadata ?? {},
      p_timestamp: payload.timestamp ?? null,
    }),
  )

  const outcome = {
    errorId: result.error_id,
    fingerprint,
    isNew: result.is_new,
    isRegression: result.is_regression,
    occurrences: result.occurrences,
  }

  if (outcome.isNew || outcome.isRegression) {
    await enqueueOrRun(QUEUES.aiAnalysis, { errorId: outcome.errorId }, () => analyzeAndAlert(outcome.errorId))
  }
  return outcome
}

// ai-analysis job: diagnose with Gemini, then open an incident and alert Slack.
// AI failures never block the incident or the alert.
export async function analyzeAndAlert(errorId) {
  const admin = requireAdmin()
  const error = unwrap(
    await admin.from('errors').select('*, repository:repositories(id, full_name)').eq('id', errorId).maybeSingle(),
  )
  if (!error) return { skipped: 'error_not_found' }

  const [latestEvent] = unwrap(
    await admin.from('error_events').select('request_url').eq('error_id', errorId).order('timestamp', { ascending: false }).limit(1),
  )

  let analysis = error.ai_analysis
  if (analysis?.status !== 'completed') {
    analysis = await aiService.analyzeError({ ...error, request_url: latestEvent?.request_url }, error.repository)
  }
  const severity = analysis.status === 'completed' ? analysis.severity : error.severity

  const errorRow = unwrap(
    await admin.from('errors').update({ ai_analysis: analysis, severity }).eq('id', errorId).select('*').single(),
  )

  if (errorRow.status !== 'open' || !incidentService.shouldOpenIncident(errorRow)) {
    return { analysis: analysis.status, incident: null }
  }

  const { incident, created } = await incidentService.openIncidentForError(errorRow)
  if (created) await incidentService.queueSlackNotification(incident.id, 'alert')
  logger.info('Error group processed', { errorId, analysis: analysis.status, incidentId: incident?.id, created })
  return { analysis: analysis.status, incident: incident?.id ?? null, created }
}

// ─── Reads & updates (db = user-scoped client, RLS applies) ─────

const LIST_COLUMNS =
  'id, repository_id, error_type, message, file_name, line_number, severity, environment, occurrences, status, first_seen, last_seen, ai_status:ai_analysis->>status, repository:repositories(id, name, full_name)'

export async function listErrors(db, { repositoryId, status, severity, environment, search, sort = 'last_seen', limit = 100 } = {}) {
  const orderColumn = sort === 'occurrences' ? 'occurrences' : 'last_seen'
  let query = db.from('errors').select(LIST_COLUMNS).order(orderColumn, { ascending: false }).limit(limit)
  if (repositoryId) query = query.eq('repository_id', repositoryId)
  if (status) query = query.eq('status', status)
  if (severity) query = query.eq('severity', severity)
  if (environment) query = query.eq('environment', environment)
  if (search) {
    const term = search.replace(/[%_,()]/g, ' ').trim()
    if (term) query = query.or(`error_type.ilike.%${term}%,message.ilike.%${term}%,file_name.ilike.%${term}%`)
  }
  const rows = unwrap(await query)
  if (sort === 'severity') rows.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])
  return rows
}

export async function getError(db, id) {
  const error = unwrap(
    await db.from('errors').select('*, repository:repositories(id, name, full_name, html_url, default_branch)').eq('id', id).maybeSingle(),
  )
  if (!error) throw notFound('Error not found')

  const [events, incidents] = await Promise.all([
    db.from('error_events').select('id, timestamp, request_url, user_agent, environment, metadata').eq('error_id', id).order('timestamp', { ascending: false }).limit(20),
    db.from('incidents').select('id, title, severity, status, github_issue_number, github_issue_url, created_at, resolved_at').eq('error_id', id).order('created_at', { ascending: false }),
  ])
  return { ...error, recent_events: unwrap(events), incidents: unwrap(incidents) }
}

// Resolving or ignoring an error group also closes its active incident, keeping both in sync.
export async function updateErrorStatus(db, id, status) {
  const error = unwrap(await db.from('errors').update({ status }).eq('id', id).select('id, status, updated_at').maybeSingle())
  if (!error) throw notFound('Error not found')

  if (status !== 'open') {
    const closed = unwrap(
      await db
        .from('incidents')
        .update({ status, resolved_at: status === 'resolved' ? new Date().toISOString() : null })
        .eq('error_id', id)
        .in('status', ['open', 'investigating'])
        .select('id'),
    )
    for (const incident of closed) {
      await incidentService.queueSlackNotification(incident.id, status === 'resolved' ? 'resolution' : '🙈 Incident ignored')
    }
  }
  return error
}

export async function getStats(db, { repositoryId, days = 14 } = {}) {
  let errorsQuery = db.from('errors').select('severity, status, occurrences')
  let incidentsQuery = db.from('incidents').select('id', { count: 'exact', head: true }).in('status', ['open', 'investigating'])
  let reposQuery = db.from('repositories').select('id', { count: 'exact', head: true })
  if (repositoryId) {
    errorsQuery = errorsQuery.eq('repository_id', repositoryId)
    incidentsQuery = incidentsQuery.eq('repository_id', repositoryId)
    reposQuery = reposQuery.eq('id', repositoryId)
  }

  const [errors, incidents, repos, trend] = await Promise.all([
    errorsQuery,
    incidentsQuery,
    reposQuery,
    db.rpc('error_trend', { p_days: days, p_repository_id: repositoryId ?? null }),
  ])
  const errorRows = unwrap(errors)
  unwrap(incidents)
  unwrap(repos)
  const open = errorRows.filter((e) => e.status === 'open')

  return {
    repositories: repos.count ?? 0,
    total_errors: errorRows.length,
    open_errors: open.length,
    critical_errors: open.filter((e) => e.severity === 'critical').length,
    total_occurrences: errorRows.reduce((sum, e) => sum + e.occurrences, 0),
    open_incidents: incidents.count ?? 0,
    trend: unwrap(trend).map((row) => ({ date: row.day, events: Number(row.events), critical: Number(row.critical) })),
  }
}
