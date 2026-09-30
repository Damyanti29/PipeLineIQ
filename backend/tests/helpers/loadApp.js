import { jest } from '@jest/globals'
import { fileURLToPath } from 'node:url'
import { createFakeSupabase } from './fakeSupabase.js'

export const src = (path) => fileURLToPath(new URL(`../../src/${path}`, import.meta.url))

export const TEST_USER = { id: '11111111-1111-4111-8111-111111111111', email: 'dev@example.com' }
export const VALID_TOKEN = 'valid-test-token'

export const QUEUES = {
  errorProcessing: 'error-processing',
  aiAnalysis: 'ai-analysis',
  slackNotification: 'slack-notification',
  githubIssue: 'github-issue',
}

function unwrap({ data, error }) {
  if (error) throw Object.assign(new Error(error.message), { code: error.code })
  return data
}

// Registers mocks for Supabase, the queue and any services, then imports the Express app.
// Must be called before anything else imports from src/ in the test file.
export async function loadApp({ admin = createFakeSupabase(), userDb = createFakeSupabase(), serviceMocks = {} } = {}) {
  const getUser = jest.fn(async (token) =>
    token === VALID_TOKEN
      ? { data: { user: TEST_USER }, error: null }
      : { data: { user: null }, error: { message: 'invalid JWT' } },
  )
  const createUserClient = jest.fn(() => userDb)
  const queue = {
    QUEUES,
    enqueue: jest.fn(async () => ({ id: 'job-1' })),
    enqueueOrRun: jest.fn(async () => {}),
    checkRedis: jest.fn(async () => 'down'),
    initQueues: jest.fn(),
    closeQueues: jest.fn(async () => {}),
    warnThrottled: jest.fn(),
    createRedisConnection: jest.fn(),
  }

  jest.unstable_mockModule(src('supabase/client.js'), () => ({ supabase: { auth: { getUser } }, createUserClient }))
  jest.unstable_mockModule(src('supabase/adminClient.js'), () => ({ supabaseAdmin: admin, requireAdmin: () => admin, unwrap }))
  jest.unstable_mockModule(src('workers/queue.js'), () => queue)
  for (const [path, factory] of Object.entries(serviceMocks)) {
    jest.unstable_mockModule(src(path), factory)
  }

  const { createApp } = await import(src('app.js'))
  return { app: createApp(), admin, userDb, queue, getUser, createUserClient }
}

export const authHeader = { Authorization: `Bearer ${VALID_TOKEN}` }
