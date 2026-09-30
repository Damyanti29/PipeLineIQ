import { z } from 'zod'
import * as errorService from '../services/errorService.js'
import { QUEUES, enqueue } from '../workers/queue.js'
import { logger } from '../utils/logger.js'

const optionalText = (max) => z.string().trim().max(max).optional().nullable()

export const ingestSchema = z.object({
  // Reserved for multi-project support; the repository currently acts as the project.
  projectId: optionalText(200),
  repositoryId: z.uuid(),
  errorType: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(5000),
  stackTrace: z.string().max(50000).optional().nullable(),
  fileName: optionalText(1000),
  lineNumber: z.number().int().nonnegative().optional().nullable(),
  columnNumber: z.number().int().nonnegative().optional().nullable(),
  environment: z.string().trim().min(1).max(50).default('production'),
  requestUrl: optionalText(2000),
  userAgent: optionalText(1000),
  timestamp: z.iso.datetime({ offset: true }).optional(),
  metadata: z
    .record(z.string(), z.unknown())
    .default({})
    .refine((value) => JSON.stringify(value).length <= 10000, 'metadata must be at most 10KB'),
})

export const listQuerySchema = z.object({
  repositoryId: z.uuid().optional(),
  status: z.enum(errorService.ERROR_STATUSES).optional(),
  severity: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  environment: z.string().max(50).optional(),
  search: z.string().max(200).optional(),
  sort: z.enum(['last_seen', 'occurrences', 'severity']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
})

export const statsQuerySchema = z.object({
  repositoryId: z.uuid().optional(),
  days: z.coerce.number().int().min(1).max(90).optional(),
})

export const statusSchema = z.object({ status: z.enum(errorService.ERROR_STATUSES) })

// POST /api/errors — accepted quickly; grouping runs on the error-processing queue.
// If Redis is unavailable the occurrence is grouped inline so it is never dropped.
export async function ingest(req, res) {
  const payload = { ...req.body, repositoryId: req.repository.id }
  try {
    const job = await enqueue(QUEUES.errorProcessing, payload)
    res.status(202).json({ data: { accepted: true, queued: true, job_id: job.id } })
  } catch (queueError) {
    logger.warn('error-processing queue unavailable, ingesting inline', { error: queueError.message })
    const outcome = await errorService.ingestError(payload)
    res.status(202).json({ data: { accepted: true, queued: false, error_id: outcome.errorId, is_new: outcome.isNew } })
  }
}

export async function list(req, res) {
  res.json({ data: await errorService.listErrors(req.db, req.validatedQuery) })
}

export async function stats(req, res) {
  res.json({ data: await errorService.getStats(req.db, req.validatedQuery) })
}

export async function get(req, res) {
  res.json({ data: await errorService.getError(req.db, req.params.id) })
}

export async function updateStatus(req, res) {
  res.json({ data: await errorService.updateErrorStatus(req.db, req.params.id, req.body.status) })
}
