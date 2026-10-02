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

// Google retires model versions for new keys (404) and sheds load per model (503/429), so an
// overloaded model is retried once after a pause, then the always-current aliases are tried.
const FALLBACK_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest']
const RETRY_SAME_MODEL = new Set([429, 503])
const TRY_NEXT_MODEL = new Set([404, 429, 503])
export const geminiModels = () => [...new Set([env.geminiModel, ...FALLBACK_MODELS])]
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function generateContent(prompt, { fetchImpl = fetch, json = true, timeoutMs = 30000, retryDelayMs = env.isTest ? 0 : 3000 } = {}) {
  let response
  for (const model of geminiModels()) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      response = await fetchImpl(`${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.geminiApiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { ...(json ? { responseMimeType: 'application/json' } : {}), temperature: 0.2 },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (response.ok) {
        const body = await response.json()
        return { ok: true, model, text: body?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') }
      }
      if (attempt === 1 && RETRY_SAME_MODEL.has(response.status)) await sleep(retryDelayMs)
      else break
    }
    if (!TRY_NEXT_MODEL.has(response.status)) break
    logger.warn('Gemini model unavailable, trying fallback', { model, status: response.status })
  }
  return { ok: false, status: response.status }
}

// Never throws: failures return { status: 'unavailable' } so error processing continues.
export async function analyzeError(error, repository, { fetchImpl = fetch } = {}) {
  if (!features.gemini) return unavailable('not_configured')

  try {
    const result = await generateContent(buildPrompt(buildErrorContext(error, repository)), { fetchImpl })
    if (!result.ok) {
      logger.warn('Gemini request failed', { status: result.status, errorId: error.id })
      return unavailable(`gemini_http_${result.status}`)
    }
    if (!result.text) return unavailable('empty_response')

    const analysis = parseAnalysis(result.text)
    return { status: 'completed', model: result.model, analyzedAt: new Date().toISOString(), ...analysis }
  } catch (err) {
    logger.warn('Gemini analysis unavailable', { errorId: error.id, error: err.message })
    return unavailable(err instanceof z.ZodError || err instanceof SyntaxError ? 'invalid_response' : 'request_failed')
  }
}
