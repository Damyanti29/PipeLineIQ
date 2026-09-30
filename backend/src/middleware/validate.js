import { badRequest } from '../utils/httpError.js'

// Validates req[source] against a zod schema and replaces it with the parsed value.
export const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source] ?? {})
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
    throw badRequest('Validation failed', details)
  }
  // Express 5 exposes req.query as a getter, so store parsed query separately.
  if (source === 'query') req.validatedQuery = result.data
  else req[source] = result.data
  next()
}
