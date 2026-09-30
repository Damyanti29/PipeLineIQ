import { Router } from 'express'
import { z } from 'zod'
import * as githubController from '../controllers/githubController.js'
import { requireAuth } from '../middleware/authMiddleware.js'
import { validate } from '../middleware/validate.js'

const router = Router()

router.get('/connect', requireAuth, githubController.connect)
router.get('/callback', githubController.callback)
router.get('/status', requireAuth, githubController.status)
router.get('/repositories', requireAuth, githubController.listRepositories)
router.get(
  '/repositories/:repoId',
  requireAuth,
  validate(z.object({ repoId: z.coerce.number().int().positive() }), 'params'),
  githubController.getRepository,
)

export default router
