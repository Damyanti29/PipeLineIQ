import { configIssues, env, features, missingVariables } from './env.js'

const LABELS = {
  supabase: 'Supabase (database + auth)',
  githubApp: 'GitHub App',
  githubWebhooks: 'GitHub webhooks',
  slack: 'Slack',
  slackInteractions: 'Slack buttons',
  gemini: 'Gemini AI diagnosis',
  pushMonitoring: 'Push monitoring + fix PRs',
}

// Human-readable configuration report printed when the API starts.
export function configSummary() {
  const missing = missingVariables()
  const lines = ['', 'PipelineIQ configuration:']
  for (const [key, label] of Object.entries(LABELS)) {
    const ok = features[key]
    const detail = key === 'pushMonitoring'
      ? (ok ? `push review ${env.pushReview ? 'on' : 'off'}, auto fix PRs ${env.autoFixPr ? 'on' : 'off'}` : 'needs GitHub App, webhook secret, Gemini and Supabase')
      : (ok ? '' : `missing ${missing[key].join(', ') || 'a valid value (see below)'}`)
    lines.push(`  ${ok ? '✔' : '✘'} ${label.padEnd(28)}${detail}`)
  }
  if (configIssues.length) {
    lines.push('', 'Configuration notes:')
    for (const { level, variable, message } of configIssues) {
      lines.push(`  ${{ error: '✘', warn: '!', info: 'i' }[level]} ${variable}: ${message}`)
    }
  }
  lines.push(
    '',
    'Redirect / webhook URLs to register:',
    `  GitHub App callback URL   ${env.githubRedirectUri}`,
    `  GitHub App webhook URL    ${env.publicApiUrl}/api/webhooks/github`,
    `  Slack redirect URL        ${env.slackRedirectUri}`,
    `  Slack interactivity URL   ${env.publicApiUrl}/api/slack/interactions`,
    '',
    'Run `npm run check-env` to test every credential against the live services.',
    '',
  )
  return lines.join('\n')
}
