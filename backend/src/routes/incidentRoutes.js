import { Router } from 'express'
import * as incidentController from '../controllers/incidentController.js'
import { requireAuth } from '../middleware/authMiddleware.js'
import { validate } from '../middleware/validate.js'
import { idParams } from './params.js'

const router = Router()

router.use(requireAuth)
router.get('/', validate(incidentController.listQuerySchema, 'query'), incidentController.list)
router.get('/:id', validate(idParams, 'params'), incidentController.get)
router.patch('/:id/status', validate(idParams, 'params'), validate(incidentController.statusSchema), incidentController.updateStatus)
router.post('/:id/github-issue', validate(idParams, 'params'), incidentController.createGithubIssue)

export default router
