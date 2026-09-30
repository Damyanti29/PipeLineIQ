import { Router } from 'express'
import { features } from '../config/env.js'
import { checkRedis } from '../workers/queue.js'

const router = Router()

router.get('/', async (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    services: {
      supabase: features.supabase ? 'configured' : 'not_configured',
      redis: await checkRedis(),
      github: features.githubApp ? 'configured' : 'not_configured',
      githubWebhooks: features.githubWebhooks ? 'configured' : 'not_configured',
      slack: features.slack ? 'configured' : 'not_configured',
      gemini: features.gemini ? 'configured' : 'not_configured',
    },
  })
})

export default router
