export class HttpError extends Error {
  constructor(status, message, { code, details } = {}) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export const badRequest = (message, details) => new HttpError(400, message, { code: 'bad_request', details })
export const unauthorized = (message = 'Authentication required') => new HttpError(401, message, { code: 'unauthorized' })
export const forbidden = (message = 'Forbidden') => new HttpError(403, message, { code: 'forbidden' })
export const notFound = (message = 'Not found') => new HttpError(404, message, { code: 'not_found' })
export const conflict = (message) => new HttpError(409, message, { code: 'conflict' })
export const notConfigured = (feature) =>
  new HttpError(503, `${feature} integration is not configured on the server`, { code: 'not_configured' })
