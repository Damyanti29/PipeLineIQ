import { z } from 'zod'
import * as pipelineService from '../services/pipelineService.js'

export const listQuerySchema = z.object({
  status: z.enum(pipelineService.ALERT_STATUSES).optional(),
  repositoryId: z.uuid().optional(),
  includeClean: z.stringbool().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
})

// Users may only close an alert out; the pipeline itself sets the other states.
export const statusSchema = z.object({ status: z.enum(['resolved', 'dismissed', 'alerted']) })

export async function list(req, res) {
  res.json({ data: await pipelineService.listAlerts(req.db, req.validatedQuery) })
}

export async function updateStatus(req, res) {
  res.json({ data: await pipelineService.updateAlertStatus(req.db, req.params.id, req.body.status) })
}
