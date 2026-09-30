import { Router } from 'express'
import * as repositoryController from '../controllers/repositoryController.js'
import { requireAuth } from '../middleware/authMiddleware.js'
import { validate } from '../middleware/validate.js'
import { idParams } from './params.js'

const router = Router()

router.use(requireAuth)
router.get('/', repositoryController.list)
router.post('/', validate(repositoryController.createSchema), repositoryController.create)
router.get('/:id', validate(idParams, 'params'), repositoryController.get)
router.patch('/:id', validate(idParams, 'params'), validate(repositoryController.updateSchema), repositoryController.update)
router.get('/:id/events', validate(idParams, 'params'), repositoryController.events)

export default router
