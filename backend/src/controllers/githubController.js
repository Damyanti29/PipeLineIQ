import { env, features } from '../config/env.js'
import * as githubService from '../services/githubService.js'
import * as repositoryService from '../services/repositoryService.js'
import * as webhookService from '../services/webhookService.js'
import { logger } from '../utils/logger.js'

export async function connect(req, res) {
  res.json({ data: { url: await githubService.getConnectUrl(req.user.id) } })
}

// Browser redirect from GitHub: always lands back on the Integrations page.
export async function callback(req, res) {
  const { code, state, installation_id: installationId } = req.query
  try {
    await githubService.handleCallback({ code, state, installationId })
    res.redirect(`${env.frontendUrl}/integrations?github=connected`)
  } catch (error) {
    logger.warn('GitHub callback failed', { error: error.message })
    res.redirect(`${env.frontendUrl}/integrations?github=error`)
  }
}

export async function status(req, res) {
  const installations = features.githubApp && features.supabase ? await githubService.listInstallations(req.user.id) : []
  res.json({ data: { configured: features.githubApp, connected: installations.length > 0, installations } })
}

// Repositories the user's installations can access, flagged when already monitored.
export async function listRepositories(req, res) {
  const [available, monitored] = await Promise.all([
    githubService.listAccessibleRepositories(req.user.id),
    repositoryService.listRepositories(req.db),
  ])
  const monitoredByGithubId = new Map(monitored.map((repo) => [Number(repo.github_repo_id), repo]))
  res.json({
    data: available.map((repo) => ({
      ...repo,
      repository_id: monitoredByGithubId.get(repo.github_repo_id)?.id ?? null,
      monitored: Boolean(monitoredByGithubId.get(repo.github_repo_id)?.monitoring_enabled),
    })),
  })
}

export async function getRepository(req, res) {
  res.json({ data: await githubService.getAccessibleRepository(req.user.id, req.params.repoId) })
}

// POST /api/webhooks/github — only reached after the signature has been verified.
export async function webhook(req, res) {
  const event = req.get('x-github-event')
  const deliveryId = req.get('x-github-delivery')
  if (!event || !deliveryId) {
    return res.status(400).json({ error: { code: 'bad_request', message: 'Missing GitHub event headers' } })
  }
  // Supports both "application/json" and "application/x-www-form-urlencoded" webhook content types.
  const payload = typeof req.body?.payload === 'string' ? JSON.parse(req.body.payload) : req.body
  const result = await webhookService.handleGithubEvent({ event, deliveryId, payload })
  res.status(202).json({ data: result })
}
