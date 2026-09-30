import { Router } from 'express'
import * as slackController from '../controllers/slackController.js'
import { requireAuth } from '../middleware/authMiddleware.js'
import { verifySlackRequest } from '../middleware/webhookMiddleware.js'

const router = Router()

router.get('/connect', requireAuth, slackController.connect)
router.get('/callback', slackController.callback)
router.get('/status', requireAuth, slackController.status)
router.delete('/disconnect', requireAuth, slackController.disconnect)
router.post('/test', requireAuth, slackController.test)
router.post('/interactions', verifySlackRequest, slackController.interactions)

export default router
