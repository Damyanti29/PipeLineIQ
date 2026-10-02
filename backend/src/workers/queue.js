import { Queue } from 'bullmq'
import IORedis from 'ioredis'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'

export const QUEUES = {
  errorProcessing: 'error-processing',
  aiAnalysis: 'ai-analysis',
  slackNotification: 'slack-notification',
  githubIssue: 'github-issue',
  pipelineAnalysis: 'pipeline-analysis',
}

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
}

// Workers need maxRetriesPerRequest: null (blocking commands). REDIS_URL supports redis:// and rediss://.
export function createRedisConnection(options = { maxRetriesPerRequest: null }) {
  return new IORedis(env.redisUrl, options)
}

const queues = new Map()

// ioredis retries forever while Redis is down; log at most once a minute per source.
const lastWarned = new Map()
export function warnThrottled(source, error) {
  const now = Date.now()
  if (now - (lastWarned.get(source) ?? 0) < 60000) return
  lastWarned.set(source, now)
  logger.warn('Redis connection error (is Redis running at REDIS_URL?)', { source, error: error.code || error.message })
}

function getQueue(name) {
  if (!queues.has(name)) {
    const queue = new Queue(name, {
      // Producers fail fast when Redis is down so callers can fall back instead of hanging.
      connection: createRedisConnection({ enableOfflineQueue: false, maxRetriesPerRequest: 1 }),
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    })
    queue.on('error', (error) => warnThrottled(name, error))
    queues.set(name, queue)
  }
  return queues.get(name)
}

// Opens producer connections at boot so the first enqueue does not race the connection.
export function initQueues() {
  Object.values(QUEUES).forEach(getQueue)
}

export async function enqueue(name, data, options = {}) {
  return getQueue(name).add(name, data, options)
}

// Enqueue, or — when Redis is unavailable — run the fallback in-process so work is not lost.
// The fallback is not awaited, so HTTP responses are never blocked by slow AI/Slack calls.
export async function enqueueOrRun(name, data, fallback, options = {}) {
  try {
    await enqueue(name, data, options)
  } catch (error) {
    logger.warn('Queue unavailable, running job in-process', { queue: name, error: error.message })
    Promise.resolve()
      .then(fallback)
      .catch((fallbackError) => logger.error('In-process job failed', { queue: name, error: fallbackError }))
  }
}

export async function checkRedis(timeoutMs = 1000) {
  try {
    const ping = getQueue(QUEUES.errorProcessing).client.then((client) => client.ping())
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs).unref())
    await Promise.race([ping, timeout])
    return 'up'
  } catch {
    return 'down'
  }
}

export async function closeQueues() {
  await Promise.all([...queues.values()].map((queue) => queue.close()))
  queues.clear()
}
