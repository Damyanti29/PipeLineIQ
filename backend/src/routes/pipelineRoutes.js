import { Router } from 'express'
import * as pipelineController from '../controllers/pipelineController.js'
import { requireAuth } from '../middleware/authMiddleware.js'
import { validate } from '../middleware/validate.js'
import { idParams } from './params.js'

const router = Router()

router.use(requireAuth)
router.get('/', validate(pipelineController.listQuerySchema, 'query'), pipelineController.list)
router.patch('/:id/status', validate(idParams, 'params'), validate(pipelineController.statusSchema), pipelineController.updateStatus)

export default router
