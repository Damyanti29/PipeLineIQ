import { features } from '../config/env.js'
import { requireAdmin, unwrap } from '../supabase/adminClient.js'
import { logger } from '../utils/logger.js'
import { QUEUES, enqueueOrRun } from '../workers/queue.js'
import * as githubService from './githubService.js'
import * as incidentService from './incidentService.js'
import * as pipelineService from './pipelineService.js'
import * as repositoryService from './repositoryService.js'

export const TRACKED_EVENTS = ['push', 'pull_request', 'workflow_run', 'deployment', 'deployment_status', 'issues']

// Reduces a webhook payload to the few fields the dashboard shows.
export function summarizeEvent(event, payload) {
  const actor = payload.sender?.login ?? null
  switch (event) {
    case 'push':
      return {
        title: payload.head_commit?.message?.split('\n')[0] ?? `${payload.commits?.length ?? 0} commit(s)`,
        ref: payload.ref?.replace('refs/heads/', ''),
        sha: payload.after,
        url: payload.compare ?? payload.head_commit?.url,
        status: null,
        actor,
      }
    case 'pull_request':
      return {
        title: `#${payload.pull_request?.number} ${payload.pull_request?.title ?? ''}`.trim(),
        ref: payload.pull_request?.head?.ref,
        sha: payload.pull_request?.head?.sha,
        url: payload.pull_request?.html_url,
        status: payload.pull_request?.merged ? 'merged' : payload.pull_request?.state,
        actor,
      }
    case 'workflow_run':
      return {
        title: payload.workflow_run?.name ?? payload.workflow_run?.display_title,
        ref: payload.workflow_run?.head_branch,
        sha: payload.workflow_run?.head_sha,
        url: payload.workflow_run?.html_url,
        status: payload.workflow_run?.conclusion ?? payload.workflow_run?.status,
        actor,
      }
    case 'deployment':
      return {
        title: `Deployment to ${payload.deployment?.environment ?? 'unknown'}`,
        ref: payload.deployment?.ref,
        sha: payload.deployment?.sha,
        url: payload.deployment?.url,
        status: 'created',
        actor,
      }
    case 'deployment_status':
      return {
        title: `Deployment to ${payload.deployment?.environment ?? 'unknown'}`,
        ref: payload.deployment?.ref,
        sha: payload.deployment?.sha,
        url: payload.deployment_status?.target_url ?? payload.deployment_status?.log_url,
        status: payload.deployment_status?.state,
        actor,
      }
    case 'issues':
      return {
        title: `#${payload.issue?.number} ${payload.issue?.title ?? ''}`.trim(),
        ref: null,
        sha: null,
        url: payload.issue?.html_url,
        status: payload.issue?.state,
        actor,
      }
    default:
      return { title: event, ref: null, sha: null, url: null, status: null, actor }
  }
}

// Handles a signature-verified GitHub delivery. Idempotent per (repository, delivery id).
export async function handleGithubEvent({ event, deliveryId, payload }) {
  if (event === 'ping') return { handled: 'ping' }

  if (event === 'installation' && payload.action === 'deleted') {
    await githubService.removeInstallation(payload.installation.id)
    return { handled: 'installation_deleted' }
  }

  if (!TRACKED_EVENTS.includes(event)) return { ignored: `unsupported event: ${event}` }

  const githubRepoId = payload.repository?.id
  if (!githubRepoId) return { ignored: 'no repository in payload' }

  const repositories = await repositoryService.findMonitoredByGithubId(githubRepoId)
  if (!repositories.length) return { ignored: 'repository not monitored' }

  const summary = summarizeEvent(event, payload)
  const rows = repositories.map((repo) => ({
    repository_id: repo.id,
    delivery_id: deliveryId,
    event_type: event,
    action: payload.action ?? null,
    ...summary,
    title: summary.title?.slice(0, 300) ?? null,
  }))
  unwrap(
    await requireAdmin().from('github_events').upsert(rows, { onConflict: 'repository_id,delivery_id', ignoreDuplicates: true }),
  )

  let resolved = 0
  if (event === 'issues' && payload.action === 'closed' && payload.issue?.number) {
    for (const repo of repositories) {
      resolved += await incidentService.resolveIncidentsForIssue(repo.id, payload.issue.number)
    }
  }

  const repositoryIds = repositories.map((repo) => repo.id)
  const pr = payload.pull_request
  if (event === 'pull_request' && payload.action === 'closed' && pr?.merged && pr.head?.ref?.startsWith(pipelineService.FIX_BRANCH_PREFIX)) {
    resolved += await pipelineService.resolveByFixBranch(repositoryIds, pr.head.ref)
  }

  // Push monitoring runs in the background so GitHub gets its response within its 10 s timeout.
  let pipeline = null
  if (features.pushMonitoring && ['push', 'workflow_run'].includes(event)) {
    const trigger = pipelineService.extractTrigger(event, payload)
    pipeline = trigger.skip ? { skipped: trigger.skip } : { queued: trigger.source }
    if (!trigger.skip) {
      await enqueueOrRun(QUEUES.pipelineAnalysis, { trigger, repositoryIds }, () =>
        pipelineService.processPipelineEvent({ trigger, repositoryIds }),
      )
    }
  }

  logger.info('GitHub webhook processed', { event, deliveryId, repositories: repositories.length, resolved, pipeline })
  return { handled: event, repositories: repositories.length, resolvedIncidents: resolved, ...(pipeline ? { pipeline } : {}) }
}
