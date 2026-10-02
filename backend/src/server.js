import { createApp } from './app.js'
import { assertProductionConfig, env, features } from './config/env.js'
import { configSummary } from './config/summary.js'
import { logger } from './utils/logger.js'
import { closeQueues, initQueues } from './workers/queue.js'

assertProductionConfig()
initQueues()

const server = createApp().listen(env.port, () => {
  logger.info(`PipelineIQ API listening on http://localhost:${env.port}`, { env: env.nodeEnv, features })
  if (!env.isProduction) console.log(configSummary())
})
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    logger.error(`Port ${env.port} is already in use. Stop the other process or set PORT in backend/.env.`)
    process.exit(1)
  }
  throw error
})

async function shutdown(signal) {
  logger.info(`Received ${signal}, shutting down`)
  server.close()
  await closeQueues().catch(() => {})
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
