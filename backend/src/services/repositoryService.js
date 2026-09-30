import { requireAdmin, unwrap } from '../supabase/adminClient.js'
import { notFound } from '../utils/httpError.js'
import * as githubService from './githubService.js'

const REPOSITORY_COLUMNS =
  'id, github_repo_id, installation_id, name, full_name, owner, default_branch, html_url, monitoring_enabled, created_at, updated_at'

const EMPTY_STATS = { total_errors: 0, open_errors: 0, open_critical: 0, total_occurrences: 0, last_error_at: null }

async function attachStats(db, repositories) {
  if (!repositories.length) return []
  const stats = unwrap(
    await db.from('repository_error_stats').select('*').in('repository_id', repositories.map((r) => r.id)),
  )
  const byRepo = new Map(stats.map((s) => [s.repository_id, s]))
  return repositories.map((repo) => {
    const { repository_id: _id, ...repoStats } = byRepo.get(repo.id) ?? {}
    return { ...repo, stats: { ...EMPTY_STATS, ...repoStats } }
  })
}

// `db` is the user-scoped client (RLS): users only ever see their own repositories.
export async function listRepositories(db) {
  const repositories = unwrap(await db.from('repositories').select(REPOSITORY_COLUMNS).order('created_at', { ascending: false }))
  return attachStats(db, repositories)
}

export async function getRepository(db, id) {
  // The owner may read the ingest key: it is needed to build the SDK DSN.
  const repository = unwrap(await db.from('repositories').select(`${REPOSITORY_COLUMNS}, ingest_key`).eq('id', id).maybeSingle())
  if (!repository) throw notFound('Repository not found')
  const [withStats] = await attachStats(db, [repository])
  return withStats
}

// Starts monitoring a GitHub repository after verifying the user's installation can access it.
export async function addRepository(userId, githubRepoId) {
  const repo = await githubService.getAccessibleRepository(userId, githubRepoId)
  const row = {
    user_id: userId,
    installation_id: repo.installation_id,
    github_repo_id: repo.github_repo_id,
    name: repo.name,
    full_name: repo.full_name,
    owner: repo.owner,
    default_branch: repo.default_branch ?? 'main',
    html_url: repo.html_url,
    monitoring_enabled: true,
  }
  return unwrap(
    await requireAdmin()
      .from('repositories')
      .upsert(row, { onConflict: 'user_id,github_repo_id' })
      .select(REPOSITORY_COLUMNS)
      .single(),
  )
}

export async function setMonitoring(db, id, monitoringEnabled) {
  const repository = unwrap(
    await db.from('repositories').update({ monitoring_enabled: monitoringEnabled }).eq('id', id).select(REPOSITORY_COLUMNS).maybeSingle(),
  )
  if (!repository) throw notFound('Repository not found')
  return repository
}

export async function listRepositoryEvents(db, id, limit = 20) {
  await getRepositoryOrThrow(db, id)
  return unwrap(
    await db.from('github_events').select('*').eq('repository_id', id).order('created_at', { ascending: false }).limit(limit),
  )
}

async function getRepositoryOrThrow(db, id) {
  const repository = unwrap(await db.from('repositories').select('id').eq('id', id).maybeSingle())
  if (!repository) throw notFound('Repository not found')
  return repository
}

// Webhooks: all monitored copies of a GitHub repository (several users may monitor the same repo).
export async function findMonitoredByGithubId(githubRepoId) {
  return unwrap(
    await requireAdmin()
      .from('repositories')
      .select('id, user_id, installation_id, full_name')
      .eq('github_repo_id', githubRepoId)
      .eq('monitoring_enabled', true),
  )
}
