import { Router } from 'express'
import * as errorController from '../controllers/errorController.js'
import { requireAuth, requireIngestKey } from '../middleware/authMiddleware.js'
import { validate } from '../middleware/validate.js'
import { idParams } from './params.js'

const router = Router()

// SDK ingestion: authenticated by the repository ingest key, not a user session.
router.post('/', validate(errorController.ingestSchema), requireIngestKey, errorController.ingest)

// Dashboard
router.get('/', requireAuth, validate(errorController.listQuerySchema, 'query'), errorController.list)
router.get('/stats', requireAuth, validate(errorController.statsQuerySchema, 'query'), errorController.stats)
router.get('/:id', requireAuth, validate(idParams, 'params'), errorController.get)
router.patch('/:id/status', requireAuth, validate(idParams, 'params'), validate(errorController.statusSchema), errorController.updateStatus)

export default router
