import { env } from '../config/env.js'
import * as incidentService from '../services/incidentService.js'
import * as slackService from '../services/slackService.js'
import { QUEUES, enqueueOrRun } from '../workers/queue.js'
import { logger } from '../utils/logger.js'

export async function connect(req, res) {
  res.json({ data: { url: slackService.getAuthorizeUrl(req.user.id) } })
}

export async function callback(req, res) {
  if (req.query.error) return res.redirect(`${env.frontendUrl}/integrations?slack=cancelled`)
  try {
    await slackService.handleOAuthCallback({ code: req.query.code, state: req.query.state })
    res.redirect(`${env.frontendUrl}/integrations?slack=connected`)
  } catch (error) {
    logger.warn('Slack callback failed', { error: error.message })
    res.redirect(`${env.frontendUrl}/integrations?slack=error`)
  }
}

export async function status(req, res) {
  res.json({ data: await slackService.getStatus(req.user.id) })
}

export async function disconnect(req, res) {
  await slackService.disconnect(req.user.id)
  res.status(204).end()
}

export async function test(req, res) {
  await slackService.sendTestMessage(req.user.id)
  res.json({ data: { sent: true } })
}

// Slack interactivity (button clicks). Slack needs a response within 3 seconds, so
// issue creation is queued and the result is posted back into the alert thread.
export async function interactions(req, res) {
  let payload
  try {
    payload = JSON.parse(req.body.payload)
  } catch {
    return res.status(400).json({ error: { code: 'bad_request', message: 'Invalid payload' } })
  }

  const action = payload.actions?.[0]
  if (payload.type !== 'block_actions' || action?.action_id !== 'create_github_issue') {
    return res.status(200).end() // link buttons and unknown actions just need an ack
  }

  const incidentId = action.value
  if (!(await slackService.canWorkspaceActOnIncident(payload.team?.id, incidentId))) {
    return res.status(200).json({ response_type: 'ephemeral', replace_original: false, text: 'This workspace cannot act on that incident.' })
  }

  await enqueueOrRun(QUEUES.githubIssue, { incidentId, requestedBy: `slack:${payload.user?.id}` }, () =>
    incidentService.createGithubIssueAsOwner(incidentId),
  )
  res.status(200).json({ response_type: 'ephemeral', replace_original: false, text: 'Creating GitHub issue…' })
}
