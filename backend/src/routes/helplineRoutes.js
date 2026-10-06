import { Router } from 'express'
import * as helplineController from '../controllers/helplineController.js'
import { requireAuth } from '../middleware/authMiddleware.js'
import { validate } from '../middleware/validate.js'

const router = Router()

router.use(requireAuth)
router.post('/chat', validate(helplineController.chatSchema), helplineController.chat)

export default router
