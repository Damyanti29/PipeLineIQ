import { HttpError } from '../utils/httpError.js'
import { logger } from '../utils/logger.js'

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'not_found', message: `Route ${req.method} ${req.path} not found` } })
}

// Express identifies error handlers by their four-argument signature, so `next` must stay.
export function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } })
  }

  // body-parser errors
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'invalid_json', message: 'Request body is not valid JSON' } })
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'payload_too_large', message: 'Request body is too large' } })
  }

  // Postgres invalid input (e.g. malformed uuid in a filter)
  if (err?.code === '22P02') {
    return res.status(400).json({ error: { code: 'bad_request', message: 'Invalid identifier' } })
  }

  // Postgres unique violation (e.g. reopening an incident while another is active)
  if (err?.code === '23505') {
    return res.status(409).json({ error: { code: 'conflict', message: 'Conflicts with an existing record' } })
  }

  logger.error('Unhandled request error', { method: req.method, path: req.path, error: err })
  res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } })
}
