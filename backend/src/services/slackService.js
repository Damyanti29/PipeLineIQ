import { env, features } from '../config/env.js'
import { requireAdmin, unwrap } from '../supabase/adminClient.js'
import { decrypt, encrypt, signState, verifyState } from '../utils/crypto.js'
import { badRequest, notConfigured, notFound } from '../utils/httpError.js'
import { logger } from '../utils/logger.js'
import { redactSecrets } from '../utils/redact.js'
import { displayLocation } from './fingerprintService.js'

const SLACK_API = 'https://slack.com/api'
const SCOPES = ['chat:write', 'chat:write.public', 'incoming-webhook']
// Slack errors that retrying will not fix.
const PERMANENT_ERRORS = new Set(['channel_not_found', 'not_in_channel', 'invalid_auth', 'token_revoked', 'account_inactive', 'is_archived'])

const SEVERITY_EMOJI = { critical: '🔴', high: '🟠', medium: '🟡', low: '🔵' }

function assertConfigured() {
  if (!features.slack) throw notConfigured('Slack')
}

async function slackApi(method, { token, json, form, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(`${SLACK_API}/${method}`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': json ? 'application/json; charset=utf-8' : 'application/x-www-form-urlencoded',
    },
    body: json ? JSON.stringify(json) : new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error(`Slack ${method} HTTP ${response.status}`)
  return response.json()
}

// ─── OAuth ──────────────────────────────────────────────────────

export function getAuthorizeUrl(userId) {
  assertConfigured()
  const params = new URLSearchParams({
    client_id: env.slackClientId,
    scope: SCOPES.join(','),
    redirect_uri: env.slackRedirectUri,
    state: signState({ uid: userId, p: 'slack' }),
  })
  return `https://slack.com/oauth/v2/authorize?${params}`
}

export async function handleOAuthCallback({ code, state }) {
  assertConfigured()
  const statePayload = verifyState(state)
  if (!statePayload || statePayload.p !== 'slack') throw badRequest('Invalid or expired state')
  if (!code) throw badRequest('Missing authorization code')

  const data = await slackApi('oauth.v2.access', {
    form: { client_id: env.slackClientId, client_secret: env.slackClientSecret, code, redirect_uri: env.slackRedirectUri },
  })
  if (!data.ok) throw badRequest(`Slack authorization failed: ${data.error}`)
  if (!data.incoming_webhook?.channel_id) throw badRequest('No Slack channel was selected')

  unwrap(
    await requireAdmin()
      .from('slack_integrations')
      .upsert(
        {
          user_id: statePayload.uid,
          workspace_id: data.team.id,
          workspace_name: data.team.name,
          channel_id: data.incoming_webhook.channel_id,
          channel_name: data.incoming_webhook.channel,
          access_token: encrypt(data.access_token),
        },
        { onConflict: 'user_id' },
      ),
  )
}

async function getIntegration(userId) {
  return unwrap(await requireAdmin().from('slack_integrations').select('*').eq('user_id', userId).maybeSingle())
}

// Public view of the integration. The access token is never returned.
export async function getStatus(userId) {
  const integration = features.supabase ? await getIntegration(userId) : null
  return {
    configured: features.slack,
    connected: Boolean(integration),
    workspace_name: integration?.workspace_name ?? null,
    channel_name: integration?.channel_name ?? null,
    connected_at: integration?.created_at ?? null,
  }
}

export async function disconnect(userId) {
  const integration = await getIntegration(userId)
  if (!integration) throw notFound('Slack is not connected')
  try {
    await slackApi('auth.revoke', { token: decrypt(integration.access_token), form: {} })
  } catch (error) {
    logger.warn('Slack token revoke failed; deleting integration anyway', { error: error.message })
  }
  unwrap(await requireAdmin().from('slack_integrations').delete().eq('user_id', userId))
}

// ─── Messaging ──────────────────────────────────────────────────

async function postMessage(integration, message) {
  const data = await slackApi('chat.postMessage', {
    token: decrypt(integration.access_token),
    json: { channel: integration.channel_id, unfurl_links: false, ...message },
  })
  if (data.ok) return { ok: true, ts: data.ts, channel: data.channel }
  if (PERMANENT_ERRORS.has(data.error)) {
    logger.warn('Slack message dropped (permanent error)', { error: data.error })
    return { ok: false, skipped: data.error }
  }
  // Transient: throw so the queue retries.
  throw new Error(`Slack chat.postMessage failed: ${data.error}`)
}

const truncate = (text, max) => (text && text.length > max ? `${text.slice(0, max - 1)}…` : text ?? '')

export function buildErrorAlertBlocks({ incident, error, repository, frontendUrl = env.frontendUrl }) {
  const ai = error.ai_analysis?.status === 'completed' ? error.ai_analysis : null
  const location = displayLocation(error) ?? 'unknown'
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: '🚨 PipelineIQ Alert', emoji: true } },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Repository:*\n${repository.full_name}` },
        { type: 'mrkdwn', text: `*Severity:*\n${SEVERITY_EMOJI[incident.severity] ?? ''} ${incident.severity.toUpperCase()}` },
        { type: 'mrkdwn', text: `*Error:*\n${truncate(redactSecrets(`${error.error_type}: ${error.message}`), 500)}` },
        { type: 'mrkdwn', text: `*File:*\n\`${truncate(location, 200)}\`` },
        { type: 'mrkdwn', text: `*Occurrences:*\n${error.occurrences}` },
        { type: 'mrkdwn', text: `*Environment:*\n${error.environment}` },
      ],
    },
  ]
  if (ai) {
    blocks.push(
      { type: 'section', text: { type: 'mrkdwn', text: `*AI Diagnosis:*\n${truncate(ai.rootCause, 2500)}` } },
      { type: 'section', text: { type: 'mrkdwn', text: `*Suggested Fix:*\n\`\`\`${truncate(ai.suggestedFix, 2400)}\`\`\`` } },
    )
  } else {
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: '_AI diagnosis unavailable for this error._' }] })
  }
  blocks.push({
    type: 'actions',
    elements: [
      { type: 'button', text: { type: 'plain_text', text: 'View Error' }, url: `${frontendUrl}/errors/${error.id}`, action_id: 'view_error' },
      { type: 'button', text: { type: 'plain_text', text: 'View GitHub' }, url: repository.html_url, action_id: 'view_github' },
      ...(incident.github_issue_number
        ? []
        : [{ type: 'button', style: 'primary', text: { type: 'plain_text', text: 'Create GitHub Issue' }, action_id: 'create_github_issue', value: incident.id }]),
    ],
  })
  return blocks
}

async function loadIncidentContext(incidentId) {
  const incident = unwrap(
    await requireAdmin()
      .from('incidents')
      .select('*, error:errors(*), repository:repositories(id, user_id, full_name, html_url)')
      .eq('id', incidentId)
      .maybeSingle(),
  )
  if (!incident) return null
  const integration = await getIntegration(incident.repository.user_id)
  return { incident, integration }
}

export async function sendErrorAlert(incidentId) {
  const context = await loadIncidentContext(incidentId)
  if (!context) return { skipped: 'incident_not_found' }
  const { incident, integration } = context
  if (!integration) return { skipped: 'slack_not_connected' }
  if (incident.slack_message_ts) return { skipped: 'already_sent' }

  const result = await postMessage(integration, {
    text: `🚨 ${incident.severity.toUpperCase()}: ${incident.title} in ${incident.repository.full_name}`,
    blocks: buildErrorAlertBlocks({ incident, error: incident.error, repository: incident.repository }),
  })
  if (result.ok) {
    unwrap(
      await requireAdmin().from('incidents').update({ slack_channel_id: result.channel, slack_message_ts: result.ts }).eq('id', incidentId),
    )
  }
  return result
}

// Posts into the alert's thread. Falls back to a top-level message if there was no alert.
export async function sendIncidentUpdate(incidentId, text) {
  const context = await loadIncidentContext(incidentId)
  if (!context) return { skipped: 'incident_not_found' }
  const { incident, integration } = context
  if (!integration) return { skipped: 'slack_not_connected' }

  const threaded = incident.slack_message_ts && incident.slack_channel_id === integration.channel_id
  return postMessage(integration, {
    text: `${text} — ${incident.title} (${incident.repository.full_name})`,
    ...(threaded ? { thread_ts: incident.slack_message_ts } : {}),
  })
}

export async function sendResolutionNotification(incidentId) {
  return sendIncidentUpdate(incidentId, '✅ Incident resolved')
}

export async function sendTestMessage(userId) {
  const integration = await getIntegration(userId)
  if (!integration) throw notFound('Slack is not connected')
  const result = await postMessage(integration, { text: '✅ PipelineIQ is connected. Error alerts will be posted in this channel.' })
  if (!result.ok) throw badRequest(`Slack rejected the message: ${result.skipped}`)
  return result
}

// Only the workspace connected by the incident's owner may act on it.
export async function canWorkspaceActOnIncident(workspaceId, incidentId) {
  const context = await loadIncidentContext(incidentId)
  return Boolean(context?.integration && context.integration.workspace_id === workspaceId)
}

// ─── Push monitoring alerts ─────────────────────────────────────

export function buildPipelineAlertBlocks({ alert, repository }) {
  const ai = alert.analysis ?? {}
  const sha7 = alert.commit_sha.slice(0, 7)
  const ci = alert.source === 'ci_failure'
  const commitLine = `<${alert.commit_url}|\`${sha7}\`> ${truncate(redactSecrets((alert.commit_message ?? '').split('\n')[0]), 150)}`
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: ci ? `🚨 CI failed: ${truncate(alert.workflow_name ?? 'workflow', 120)}` : '🔍 Bug found in a push', emoji: true } },
    { type: 'section', text: { type: 'mrkdwn', text: `*${truncate(redactSecrets(alert.title ?? ''), 300)}*` } },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Repository:*\n${repository.full_name}` },
        { type: 'mrkdwn', text: `*Severity:*\n${SEVERITY_EMOJI[alert.severity] ?? ''} ${(alert.severity ?? 'unknown').toUpperCase()}` },
        { type: 'mrkdwn', text: `*Branch:*\n\`${truncate(alert.branch ?? 'unknown', 100)}\`` },
        { type: 'mrkdwn', text: `*Pushed by:*\n${alert.actor ?? 'unknown'}` },
        { type: 'mrkdwn', text: `*Commit:*\n${commitLine}` },
      ],
    },
  ]
  if (ai.rootCause) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*AI Diagnosis:*\n${truncate(redactSecrets(ai.rootCause), 2500)}` } })
  if (ai.suggestedFix) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Suggested Fix:*\n${truncate(redactSecrets(ai.suggestedFix), 2500)}` } })
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: alert.fix_pr_url
        ? `🛠️ *Fix PR ready to review and merge:* <${alert.fix_pr_url}|#${alert.fix_pr_number}>`
        : `_No automatic fix PR: ${truncate(alert.fix_note ?? 'no safe change found', 300)}_`,
    },
  })
  blocks.push({
    type: 'actions',
    elements: [
      ...(alert.fix_pr_url ? [{ type: 'button', style: 'primary', text: { type: 'plain_text', text: 'Review Fix PR' }, url: alert.fix_pr_url, action_id: 'view_fix_pr' }] : []),
      ...(alert.run_url ? [{ type: 'button', text: { type: 'plain_text', text: 'View Failed Run' }, url: alert.run_url, action_id: 'view_run' }] : []),
      { type: 'button', text: { type: 'plain_text', text: 'View Commit' }, url: alert.commit_url, action_id: 'view_commit' },
    ],
  })
  return blocks
}

export async function sendPipelineAlert(alert, repository) {
  const integration = await getIntegration(repository.user_id)
  if (!integration) return { skipped: 'slack_not_connected' }
  if (alert.slack_message_ts) return { skipped: 'already_sent' }

  const kind = alert.source === 'ci_failure' ? 'CI failed' : 'Bug found'
  const result = await postMessage(integration, {
    text: `🚨 ${kind} in ${repository.full_name} (${alert.branch}): ${alert.title}${alert.fix_pr_url ? ` — fix PR ${alert.fix_pr_url}` : ''}`,
    blocks: buildPipelineAlertBlocks({ alert, repository }),
  })
  if (result.ok) {
    unwrap(await requireAdmin().from('pipeline_alerts').update({ slack_channel_id: result.channel, slack_message_ts: result.ts }).eq('id', alert.id))
  }
  return result
}

// Threaded follow-up on a pipeline alert (e.g. the fix PR was merged).
export async function sendPipelineUpdate(alert, repository, text) {
  const integration = await getIntegration(repository.user_id)
  if (!integration) return { skipped: 'slack_not_connected' }
  const threaded = alert.slack_message_ts && alert.slack_channel_id === integration.channel_id
  return postMessage(integration, { text, ...(threaded ? { thread_ts: alert.slack_message_ts } : {}) })
}
