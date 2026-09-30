import { Router } from 'express'
import * as githubController from '../controllers/githubController.js'
import { verifyGithubWebhook } from '../middleware/webhookMiddleware.js'

const router = Router()

router.post('/github', verifyGithubWebhook, githubController.webhook)

export default router
