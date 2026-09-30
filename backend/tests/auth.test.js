import { jest } from '@jest/globals'
import request from 'supertest'
import { TEST_USER, authHeader, loadApp } from './helpers/loadApp.js'
import { createFakeSupabase } from './helpers/fakeSupabase.js'

const addRepository = jest.fn(async (userId, githubRepoId) => ({ id: 'r1', user_id: userId, github_repo_id: githubRepoId }))
let app, getUser, createUserClient

beforeAll(async () => {
  const userDb = createFakeSupabase({ tables: { repositories: { data: [], error: null } } })
  ;({ app, getUser, createUserClient } = await loadApp({
    userDb,
    serviceMocks: {
      'services/repositoryService.js': () => ({
        addRepository,
        listRepositories: jest.fn(async () => []),
        getRepository: jest.fn(),
        setMonitoring: jest.fn(),
        listRepositoryEvents: jest.fn(),
        findMonitoredByGithubId: jest.fn(),
      }),
    },
  }))
})

beforeEach(() => jest.clearAllMocks())

describe('authMiddleware', () => {
  it('rejects requests without a token', async () => {
    const res = await request(app).get('/api/repositories')
    expect(res.status).toBe(401)
    expect(getUser).not.toHaveBeenCalled()
  })

  it('rejects non-Bearer authorization schemes', async () => {
    const res = await request(app).get('/api/repositories').set('Authorization', 'Basic abc')
    expect(res.status).toBe(401)
  })

  it('rejects invalid or expired tokens', async () => {
    const res = await request(app).get('/api/repositories').set('Authorization', 'Bearer forged.token.value')
    expect(res.status).toBe(401)
    expect(res.body.error.message).toMatch(/invalid or expired/i)
    expect(getUser).toHaveBeenCalledWith('forged.token.value')
  })

  it('accepts a valid token and scopes the database client to that user', async () => {
    const res = await request(app).get('/api/repositories').set(authHeader)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ data: [] })
    expect(createUserClient).toHaveBeenCalledWith('valid-test-token')
  })

  it('derives the owner from the token, never from req.body.user_id', async () => {
    const res = await request(app)
      .post('/api/repositories')
      .set(authHeader)
      .send({ githubRepoId: 555, user_id: 'attacker-chosen-id', userId: 'attacker-chosen-id' })

    expect(res.status).toBe(201)
    expect(addRepository).toHaveBeenCalledWith(TEST_USER.id, 555)
    expect(res.body.data.user_id).toBe(TEST_USER.id)
  })
})
