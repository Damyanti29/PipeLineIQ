import request from 'supertest'
import { authHeader, loadApp } from './helpers/loadApp.js'
import { createFakeSupabase } from './helpers/fakeSupabase.js'

const OWN_REPO = '0b7a8f7e-6a57-4d52-9d8b-0f4f1c2c9a11'
const OTHER_REPO = '9c1f5a8e-2f3b-4a8c-8d9e-1a2b3c4d5e6f'
const DISABLED_REPO = '5d6e7f80-1a2b-4c3d-8e9f-0a1b2c3d4e5f'

const idFilter = (chain) => chain.find(([method, column]) => method === 'eq' && column === 'id')?.[2]

// RLS-scoped client: only OWN_REPO is visible to the signed-in user.
const userDb = createFakeSupabase({
  tables: {
    repositories: (chain) =>
      idFilter(chain) === OWN_REPO
        ? { data: { id: OWN_REPO, name: 'app', full_name: 'me/app', ingest_key: 'k' }, error: null }
        : { data: null, error: null },
    repository_error_stats: { data: [], error: null },
    github_events: { data: [], error: null },
  },
})

// Service-role client used by ingestion: returns repositories with their ingest keys.
const admin = createFakeSupabase({
  tables: {
    repositories: (chain) => {
      const id = idFilter(chain)
      if (id === OWN_REPO) return { data: { id, user_id: 'u1', monitoring_enabled: true, ingest_key: 'correct-key' }, error: null }
      if (id === DISABLED_REPO) return { data: { id, user_id: 'u1', monitoring_enabled: false, ingest_key: 'correct-key' }, error: null }
      return { data: null, error: null }
    },
  },
})

let app, queue

beforeAll(async () => {
  ;({ app, queue } = await loadApp({ admin, userDb }))
})

const validError = (repositoryId) => ({ repositoryId, errorType: 'TypeError', message: 'boom', environment: 'production' })

describe('repository authorization (dashboard)', () => {
  it('returns the repository to its owner', async () => {
    const res = await request(app).get(`/api/repositories/${OWN_REPO}`).set(authHeader)
    expect(res.status).toBe(200)
    expect(res.body.data.id).toBe(OWN_REPO)
    expect(res.body.data.stats.total_errors).toBe(0)
  })

  it('returns 404 (not 403) for a repository owned by someone else', async () => {
    const res = await request(app).get(`/api/repositories/${OTHER_REPO}`).set(authHeader)
    expect(res.status).toBe(404)
  })

  it('cannot read events of a repository owned by someone else', async () => {
    const res = await request(app).get(`/api/repositories/${OTHER_REPO}/events`).set(authHeader)
    expect(res.status).toBe(404)
  })

  it('rejects malformed ids with 400', async () => {
    const res = await request(app).get('/api/repositories/not-a-uuid').set(authHeader)
    expect(res.status).toBe(400)
  })
})

describe('repository authorization (SDK ingest key)', () => {
  it('rejects a missing ingest key', async () => {
    const res = await request(app).post('/api/errors').send(validError(OWN_REPO))
    expect(res.status).toBe(401)
  })

  it('rejects a wrong ingest key', async () => {
    const res = await request(app).post('/api/errors').set('X-RepoSentinel-Key', 'wrong-key').send(validError(OWN_REPO))
    expect(res.status).toBe(401)
    expect(queue.enqueue).not.toHaveBeenCalled()
  })

  it('gives the same answer for unknown repositories (no id probing)', async () => {
    const res = await request(app).post('/api/errors').set('X-RepoSentinel-Key', 'correct-key').send(validError(OTHER_REPO))
    expect(res.status).toBe(401)
    expect(res.body.error.message).toBe('Invalid ingest key')
  })

  it('rejects ingestion when monitoring is disabled', async () => {
    const res = await request(app).post('/api/errors').set('X-RepoSentinel-Key', 'correct-key').send(validError(DISABLED_REPO))
    expect(res.status).toBe(403)
  })

  it('accepts a valid key and queues processing without waiting for it', async () => {
    const res = await request(app).post('/api/errors').set('X-RepoSentinel-Key', 'correct-key').send(validError(OWN_REPO))
    expect(res.status).toBe(202)
    expect(res.body.data).toMatchObject({ accepted: true, queued: true })
    expect(queue.enqueue).toHaveBeenCalledWith(
      'error-processing',
      expect.objectContaining({ repositoryId: OWN_REPO, errorType: 'TypeError' }),
    )
  })
})
