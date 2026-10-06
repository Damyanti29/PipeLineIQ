import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { env } from './config/env.js'
import { errorHandler, notFoundHandler } from './middleware/errorMiddleware.js'
import errorRoutes from './routes/errorRoutes.js'
import githubRoutes from './routes/githubRoutes.js'
import healthRoutes from './routes/healthRoutes.js'
import helplineRoutes from './routes/helplineRoutes.js'
import incidentRoutes from './routes/incidentRoutes.js'
import pipelineRoutes from './routes/pipelineRoutes.js'
import repositoryRoutes from './routes/repositoryRoutes.js'
import slackRoutes from './routes/slackRoutes.js'
import webhookRoutes from './routes/webhookRoutes.js'
import { INGEST_KEY_HEADER } from './middleware/authMiddleware.js'

const allowedOrigins = env.frontendUrl.split(',').map((origin) => origin.trim()).filter(Boolean)

// The dashboard API only accepts the configured frontend origin(s).
// SDK ingestion (POST /api/errors) runs inside customers' apps on any origin; it is
// authenticated by the ingest key and never uses cookies, so the origin is reflected.
function corsOptions(req, callback) {
  const isIngest =
    req.path === '/api/errors' &&
    (req.method === 'POST' || (req.method === 'OPTIONS' && req.get('access-control-request-method') === 'POST'))
  callback(
    null,
    isIngest
      ? { origin: true, methods: ['POST'], allowedHeaders: ['Content-Type', INGEST_KEY_HEADER], credentials: false, maxAge: 86400 }
      : { origin: allowedOrigins, credentials: false, maxAge: 600 },
  )
}

// Keeps the exact bytes of the body for webhook / Slack signature verification.
const keepRawBody = (req, res, buf) => {
  req.rawBody = buf
}

export function createApp() {
  const app = express()

  app.disable('x-powered-by')
  app.set('trust proxy', 1)
  app.use(helmet())
  app.use(cors(corsOptions))
  app.use(express.json({ limit: '2mb', verify: keepRawBody }))
  app.use(express.urlencoded({ extended: false, limit: '2mb', verify: keepRawBody }))

  app.use('/api/health', healthRoutes)
  app.use('/api/github', githubRoutes)
  app.use('/api/repositories', repositoryRoutes)
  app.use('/api/errors', errorRoutes)
  app.use('/api/incidents', incidentRoutes)
  app.use('/api/pipeline-alerts', pipelineRoutes)
  app.use('/api/slack', slackRoutes)
  app.use('/api/helpline', helplineRoutes)
  app.use('/api/webhooks', webhookRoutes)

  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}
