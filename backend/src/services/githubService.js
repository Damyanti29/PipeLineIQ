import { env, features } from '../config/env.js'
import { requireAdmin, unwrap } from '../supabase/adminClient.js'
import { createGithubAppJwt, signState, verifyState } from '../utils/crypto.js'
import { HttpError, badRequest, forbidden, notConfigured, notFound } from '../utils/httpError.js'

const API = 'https://api.github.com'

function assertConfigured() {
  if (!features.githubApp) throw notConfigured('GitHub')
}

let clockSkewMs = 0
let clockSkewSynced = false

async function syncClockSkew() {
  try {
    const res = await fetch('https://api.github.com', { method: 'HEAD', signal: AbortSignal.timeout(5000) })
    const ghDate = res.headers.get('date')
    if (ghDate) {
      clockSkewMs = new Date(ghDate).getTime() - Date.now()
      clockSkewSynced = true
    }
  } catch {}
}

export async function githubRequest(path, { token, method = 'GET', body, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(path.startsWith('http') ? path : `${API}${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'PipelineIQ',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  })
  const ghDate = response.headers?.get?.('date')
  if (ghDate) {
    clockSkewMs = new Date(ghDate).getTime() - Date.now()
    clockSkewSynced = true
  }
  const data = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) {
    const error = new HttpError(response.status === 404 ? 404 : 502, `GitHub API error: ${data?.message ?? response.status}`, {
      code: 'github_error',
    })
    error.githubStatus = response.status
    throw error
  }
  return data
}

async function appJwt() {
  if (!clockSkewSynced) {
    await syncClockSkew()
  }
  const nowSeconds = Math.floor((Date.now() + clockSkewMs) / 1000)
  return createGithubAppJwt(env.githubAppId, env.githubAppPrivateKey, nowSeconds)
}

let appInfoCache = null
async function getAppInfo() {
  if (!appInfoCache) {
    const jwt = await appJwt()
    appInfoCache = await githubRequest('/app', { token: jwt })
  }
  return appInfoCache
}

const tokenCache = new Map()
export async function getInstallationToken(installationId) {
  assertConfigured()
  const cached = tokenCache.get(installationId)
  if (cached && cached.expiresAt - (Date.now() + clockSkewMs) > 5 * 60 * 1000) return cached.token

  const jwt = await appJwt()
  const data = await githubRequest(`/app/installations/${installationId}/access_tokens`, { token: jwt, method: 'POST' })
  tokenCache.set(installationId, { token: data.token, expiresAt: new Date(data.expires_at).getTime() })
  return data.token
}

// ─── Connect flow ───────────────────────────────────────────────

export async function getConnectUrl(userId) {
  assertConfigured()
  const state = signState({ uid: userId, p: 'github' })
  return `https://github.com/login/oauth/authorize?client_id=${env.githubClientId}&redirect_uri=${encodeURIComponent(env.githubRedirectUri)}&state=${encodeURIComponent(state)}`
}

async function exchangeCodeForUserToken(code) {
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.githubClientId,
      client_secret: env.githubClientSecret,
      code,
      redirect_uri: env.githubRedirectUri,
    }),
    signal: AbortSignal.timeout(15000),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data.access_token) throw badRequest(`GitHub authorization failed: ${data.error ?? response.status}`)
  return data.access_token
}

// GitHub redirects here after installation (with "Request user authorization during installation"
// enabled). The user token proves which installations this user can really access, so a forged
// installation_id in the URL cannot link someone else's installation.
export async function handleCallback({ code, state, installationId }) {
  assertConfigured()
  const statePayload = verifyState(state)
  if (!statePayload || statePayload.p !== 'github') throw badRequest('Invalid or expired state')
  if (!code) throw badRequest('Missing authorization code')

  const userToken = await exchangeCodeForUserToken(code)
  const { installations = [] } = await githubRequest('/user/installations?per_page=100', { token: userToken })

  const appId = String(env.githubAppId)
  let accessible = installations.filter((inst) => String(inst.app_id) === appId)
  if (installationId) {
    accessible = accessible.filter((inst) => String(inst.id) === String(installationId))
    if (!accessible.length) throw forbidden('This GitHub installation is not accessible to your account')
  }

  const rows = accessible.map((inst) => ({
    user_id: statePayload.uid,
    installation_id: inst.id,
    account_login: inst.account?.login ?? 'unknown',
    account_type: inst.account?.type ?? 'User',
  }))
  if (rows.length) {
    unwrap(await requireAdmin().from('github_installations').upsert(rows, { onConflict: 'user_id,installation_id' }))
  }
  return rows.length
}

// ─── Installations & repositories ───────────────────────────────

export async function listInstallations(userId) {
  return unwrap(
    await requireAdmin()
      .from('github_installations')
      .select('id, installation_id, account_login, account_type, created_at')
      .eq('user_id', userId)
      .order('created_at'),
  )
}

export async function userHasInstallation(userId, installationId) {
  const rows = unwrap(
    await requireAdmin().from('github_installations').select('id').eq('user_id', userId).eq('installation_id', installationId).limit(1),
  )
  return rows.length > 0
}

const toRepoSummary = (repo, installationId) => ({
  github_repo_id: repo.id,
  installation_id: installationId,
  name: repo.name,
  full_name: repo.full_name,
  owner: repo.owner?.login,
  default_branch: repo.default_branch,
  html_url: repo.html_url,
  private: repo.private,
  description: repo.description,
  language: repo.language,
})

export async function listAccessibleRepositories(userId) {
  assertConfigured()
  const installations = await listInstallations(userId)
  const all = []
  for (const inst of installations) {
    const token = await getInstallationToken(inst.installation_id)
    for (let page = 1; page <= 10; page += 1) {
      const data = await githubRequest(`/installation/repositories?per_page=100&page=${page}`, { token })
      all.push(...data.repositories.map((repo) => toRepoSummary(repo, inst.installation_id)))
      if (data.repositories.length < 100) break
    }
  }
  return all
}

export async function getAccessibleRepository(userId, githubRepoId) {
  assertConfigured()
  const installations = await listInstallations(userId)
  for (const inst of installations) {
    const token = await getInstallationToken(inst.installation_id)
    try {
      const repo = await githubRequest(`/repositories/${Number(githubRepoId)}`, { token })
      return toRepoSummary(repo, inst.installation_id)
    } catch (error) {
      if (error.githubStatus !== 404) throw error
    }
  }
  throw notFound('Repository not found in your GitHub installations')
}

export async function createIssue(installationId, fullName, { title, body, labels = [] }) {
  const token = await getInstallationToken(installationId)
  return githubRequest(`/repos/${fullName}/issues`, { token, method: 'POST', body: { title, body, labels } })
}

export async function removeInstallation(installationId) {
  const admin = requireAdmin()
  unwrap(await admin.from('github_installations').delete().eq('installation_id', installationId))
  unwrap(await admin.from('repositories').update({ monitoring_enabled: false }).eq('installation_id', installationId))
  tokenCache.delete(installationId)
}

// ─── Push monitoring: code, CI logs and fix pull requests ───────

const encodePath = (filePath) => filePath.split('/').map(encodeURIComponent).join('/')

// Plain-text GitHub endpoints (job logs redirect to signed storage URLs; fetch drops the token there).
async function githubText(urlPath, token) {
  const response = await fetch(`${API}${urlPath}`, {
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'PipelineIQ', 'X-GitHub-Api-Version': '2022-11-28' },
    signal: AbortSignal.timeout(30000),
  })
  if (!response.ok) throw new HttpError(502, `GitHub API error: ${response.status}`, { code: 'github_error' })
  return response.text()
}

// Files changed by a push (compare) or a single commit, with their patches.
export async function getChangedFiles(token, fullName, { before, after }) {
  const isNewBranch = !before || /^0+$/.test(before)
  const data = isNewBranch
    ? await githubRequest(`/repos/${fullName}/commits/${after}`, { token })
    : await githubRequest(`/repos/${fullName}/compare/${before}...${after}`, { token })
  return (data.files ?? []).map((f) => ({ path: f.filename, status: f.status, patch: f.patch ?? '' }))
}

// File content at a commit, or null for missing, binary or oversized files.
export async function getFileContent(token, fullName, filePath, ref, maxBytes = 120_000) {
  try {
    const data = await githubRequest(`/repos/${fullName}/contents/${encodePath(filePath)}?ref=${encodeURIComponent(ref)}`, { token })
    if (Array.isArray(data) || data.type !== 'file' || !data.content || data.size > maxBytes) return null
    const text = Buffer.from(data.content, 'base64').toString('utf8')
    return text.includes('\u0000') ? null : text
  } catch (error) {
    if (error.githubStatus === 404) return null
    throw error
  }
}

// Failed jobs of a workflow run with the tail of each job's log.
export async function getFailedJobLogs(token, fullName, runId, { maxJobs = 3 } = {}) {
  const { jobs = [] } = await githubRequest(`/repos/${fullName}/actions/runs/${runId}/jobs?filter=latest&per_page=50`, { token })
  const failed = jobs.filter((job) => ['failure', 'timed_out'].includes(job.conclusion)).slice(0, maxJobs)
  return Promise.all(
    failed.map(async (job) => ({
      name: job.name,
      failedSteps: (job.steps ?? []).filter((s) => s.conclusion === 'failure').map((s) => s.name),
      log: await githubText(`/repos/${fullName}/actions/jobs/${job.id}/logs`, token).catch(() => ''),
    })),
  )
}

// One commit on a new branch with the changed files, then a ready-for-review pull request.
export async function createFixPullRequest(token, fullName, { baseSha, baseBranch, branch, files, commitMessage, title, body }) {
  const baseCommit = await githubRequest(`/repos/${fullName}/git/commits/${baseSha}`, { token })
  const tree = await githubRequest(`/repos/${fullName}/git/trees`, {
    token,
    method: 'POST',
    body: {
      base_tree: baseCommit.tree.sha,
      tree: Object.entries(files).map(([filePath, content]) => ({ path: filePath, mode: '100644', type: 'blob', content })),
    },
  })
  const commit = await githubRequest(`/repos/${fullName}/git/commits`, {
    token,
    method: 'POST',
    body: { message: commitMessage, tree: tree.sha, parents: [baseSha] },
  })
  await githubRequest(`/repos/${fullName}/git/refs`, { token, method: 'POST', body: { ref: `refs/heads/${branch}`, sha: commit.sha } })
  const pr = await githubRequest(`/repos/${fullName}/pulls`, {
    token,
    method: 'POST',
    body: { title, head: branch, base: baseBranch, body, maintainer_can_modify: true },
  })
  await githubRequest(`/repos/${fullName}/issues/${pr.number}/labels`, { token, method: 'POST', body: { labels: ['pipelineiq'] } }).catch(() => {})
  return pr
}
