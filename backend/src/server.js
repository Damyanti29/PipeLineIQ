import { createApp } from './app.js'
import { assertProductionConfig, env, features } from './config/env.js'
import { logger } from './utils/logger.js'
import { closeQueues, initQueues } from './workers/queue.js'

assertProductionConfig()
initQueues()

const server = createApp().listen(env.port, () => {
  logger.info(`RepoSentinel API listening on http://localhost:${env.port}`, { env: env.nodeEnv, features })
})

async function shutdown(signal) {
  logger.info(`Received ${signal}, shutting down`)
  server.close()
  await closeQueues().catch(() => {})
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
