// Background worker process: `npm run worker`.
// Consumes all RepoSentinel queues so the API never waits on AI, Slack or GitHub calls.
import { Worker } from 'bullmq'
import { assertProductionConfig } from '../config/env.js'
import * as errorService from '../services/errorService.js'
import * as incidentService from '../services/incidentService.js'
import * as slackService from '../services/slackService.js'
import { logger } from '../utils/logger.js'
import { QUEUES, closeQueues, createRedisConnection, initQueues, warnThrottled } from './queue.js'

const processors = {
  [QUEUES.errorProcessing]: (job) => errorService.ingestError(job.data),
  [QUEUES.aiAnalysis]: (job) => errorService.analyzeAndAlert(job.data.errorId),
  [QUEUES.slackNotification]: (job) => {
    const { incidentId, type } = job.data
    if (type === 'alert') return slackService.sendErrorAlert(incidentId)
    if (type === 'resolution') return slackService.sendResolutionNotification(incidentId)
    return slackService.sendIncidentUpdate(incidentId, type)
  },
  [QUEUES.githubIssue]: (job) => incidentService.createGithubIssueAsOwner(job.data.incidentId),
}

const CONCURRENCY = {
  [QUEUES.errorProcessing]: 10,
  [QUEUES.aiAnalysis]: 2,
  [QUEUES.slackNotification]: 5,
  [QUEUES.githubIssue]: 2,
}

function startWorkers() {
  assertProductionConfig()
  initQueues() // producers: processors enqueue follow-up jobs

  const workers = Object.entries(processors).map(([name, processor]) => {
    const worker = new Worker(name, processor, {
      connection: createRedisConnection(),
      concurrency: CONCURRENCY[name],
    })
    worker.on('completed', (job, result) => logger.debug('Job completed', { queue: name, jobId: job.id, result }))
    worker.on('failed', (job, error) =>
      logger.error('Job failed', { queue: name, jobId: job?.id, attempt: job?.attemptsMade, error }),
    )
    worker.on('error', (error) => warnThrottled(`worker:${name}`, error))
    return worker
  })

  logger.info('RepoSentinel workers started', { queues: Object.keys(processors) })

  const shutdown = async (signal) => {
    logger.info(`Received ${signal}, closing workers`)
    await Promise.all(workers.map((worker) => worker.close()))
    await closeQueues().catch(() => {})
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

startWorkers()
