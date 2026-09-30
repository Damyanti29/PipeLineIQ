import { z } from 'zod'
import { env, features } from '../config/env.js'
import { logger } from '../utils/logger.js'
import { redactSecrets, stripQuery } from '../utils/redact.js'

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'
const MAX_STACK_CHARS = 6000

export const aiAnalysisSchema = z.object({
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  rootCause: z.string().trim().min(1).max(4000),
  explanation: z.string().trim().min(1).max(8000),
  suggestedFix: z.string().trim().min(1).max(8000),
  affectedArea: z.string().trim().min(1).max(1000),
})

// Only debugging-relevant fields, with secrets redacted. Metadata, user agents and
// query strings are deliberately excluded because they commonly carry credentials.
export function buildErrorContext(error, repository) {
  return {
    repository: repository?.full_name,
    errorType: error.error_type,
    message: redactSecrets(error.message),
    file: error.file_name ?? null,
    line: error.line_number ?? null,
    column: error.column_number ?? null,
    environment: error.environment,
    occurrences: error.occurrences,
    requestPath: stripQuery(error.request_url) ?? undefined,
    stackTrace: redactSecrets((error.stack_trace ?? '').slice(0, MAX_STACK_CHARS)),
  }
}

export function buildPrompt(context) {
  return [
    'You are a senior software engineer diagnosing a production application error.',
    'Analyze the error below and respond with ONLY a JSON object with exactly these keys:',
    '{"severity": "critical" | "high" | "medium" | "low", "rootCause": string, "explanation": string, "suggestedFix": string, "affectedArea": string}',
    'severity guide: critical = outage/data loss/crash on core flow; high = broken feature for many users; medium = degraded or partial failure; low = cosmetic/warning.',
    'suggestedFix should contain a concrete code change when possible.',
    '',
    'Error details:',
    JSON.stringify(context, null, 2),
  ].join('\n')
}

export function parseAnalysis(text) {
  const cleaned = String(text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim()
  return aiAnalysisSchema.parse(JSON.parse(cleaned))
}

const unavailable = (reason) => ({ status: 'unavailable', reason, analyzedAt: new Date().toISOString() })

// Never throws: failures return { status: 'unavailable' } so error processing continues.
export async function analyzeError(error, repository, { fetchImpl = fetch } = {}) {
  if (!features.gemini) return unavailable('not_configured')

  try {
    const response = await fetchImpl(`${GEMINI_ENDPOINT}/${encodeURIComponent(env.geminiModel)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.geminiApiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: buildPrompt(buildErrorContext(error, repository)) }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
      }),
      signal: AbortSignal.timeout(30000),
    })

    if (!response.ok) {
      logger.warn('Gemini request failed', { status: response.status, errorId: error.id })
      return unavailable(`gemini_http_${response.status}`)
    }

    const body = await response.json()
    const text = body?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('')
    if (!text) return unavailable('empty_response')

    const analysis = parseAnalysis(text)
    return { status: 'completed', model: env.geminiModel, analyzedAt: new Date().toISOString(), ...analysis }
  } catch (err) {
    logger.warn('Gemini analysis unavailable', { errorId: error.id, error: err.message })
    return unavailable(err instanceof z.ZodError || err instanceof SyntaxError ? 'invalid_response' : 'request_failed')
  }
}
