// Parses a DSN of the form  <protocol>://<ingestKey>@<host>[:port][/base]/<repositoryId>
// e.g. http://a1b2c3...@localhost:5000/0b7a8f7e-6a57-4d52-9d8b-0f4f1c2c9a11
export function parseDsn(dsn) {
  let url
  try {
    url = new URL(dsn)
  } catch {
    throw new Error('RepoSentinel: invalid DSN')
  }
  const segments = url.pathname.split('/').filter(Boolean)
  const repositoryId = segments.pop()
  const ingestKey = decodeURIComponent(url.username)
  if (!ingestKey || !repositoryId) throw new Error('RepoSentinel: DSN must include an ingest key and repository id')

  const basePath = segments.length ? `/${segments.join('/')}` : ''
  return {
    endpoint: `${url.protocol}//${url.host}${basePath}/api/errors`,
    ingestKey,
    repositoryId,
  }
}

const pending = new Set()

// Sends one event. Never throws: monitoring must not break the host application.
export function send(config, payload) {
  if (typeof fetch !== 'function') return Promise.resolve({ ok: false, reason: 'fetch_unavailable' })

  const body = JSON.stringify(payload)
  const request = fetch(config.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-RepoSentinel-Key': config.ingestKey },
    body,
    // Lets browser requests finish while the page unloads (limited to 64KB bodies).
    keepalive: body.length < 60000,
  })
    .then((response) => ({ ok: response.ok, status: response.status }))
    .catch((error) => {
      if (config.debug) console.warn('RepoSentinel: failed to send event', error)
      return { ok: false, reason: 'network_error' }
    })
    .finally(() => pending.delete(request))

  pending.add(request)
  return request
}

// Resolves once in-flight events are sent, or after `timeoutMs`.
export function flush(timeoutMs = 2000) {
  const timeout = new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs))
  return Promise.race([Promise.all([...pending]).then(() => true), timeout])
}
