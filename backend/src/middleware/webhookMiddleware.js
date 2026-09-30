import { env } from '../config/env.js'
import { verifyGithubSignature, verifySlackSignature } from '../utils/crypto.js'
import { HttpError, notConfigured } from '../utils/httpError.js'

// Rejects GitHub deliveries whose X-Hub-Signature-256 does not match the raw body.
export function verifyGithubWebhook(req, res, next) {
  if (!env.githubWebhookSecret) throw notConfigured('GitHub webhook')

  const signature = req.get('x-hub-signature-256')
  if (!verifyGithubSignature(req.rawBody, signature, env.githubWebhookSecret)) {
    throw new HttpError(401, 'Invalid webhook signature', { code: 'invalid_signature' })
  }
  next()
}

// Rejects Slack requests (interactivity) whose X-Slack-Signature is invalid or stale.
export function verifySlackRequest(req, res, next) {
  if (!env.slackSigningSecret) throw notConfigured('Slack')

  const ok = verifySlackSignature(
    req.rawBody,
    req.get('x-slack-request-timestamp'),
    req.get('x-slack-signature'),
    env.slackSigningSecret,
  )
  if (!ok) throw new HttpError(401, 'Invalid Slack signature', { code: 'invalid_signature' })
  next()
}
