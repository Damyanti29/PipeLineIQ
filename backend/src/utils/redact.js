// Removes credentials from free text before it is logged or sent to third parties (Gemini, Slack).

const PATTERNS = [
  // PEM blocks (private keys, certificates)
  [/-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----/g, '[REDACTED_PEM]'],
  // JWTs (Supabase access tokens, GitHub App JWTs)
  [/\beyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}/g, '[REDACTED_JWT]'],
  // GitHub tokens
  [/\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, '[REDACTED_GITHUB_TOKEN]'],
  // Slack tokens
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/g, '[REDACTED_SLACK_TOKEN]'],
  // Google API keys
  [/\bAIza[0-9A-Za-z_-]{30,}/g, '[REDACTED_GOOGLE_KEY]'],
  // Stripe-style / generic sk_ keys
  [/\b(sk|rk)_(live|test)_[A-Za-z0-9]{10,}/g, '[REDACTED_KEY]'],
  // Credentials embedded in URLs: scheme://user:pass@host
  [/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/:@]+:[^\s/@]+@/gi, '$1[REDACTED]@'],
  // Authorization headers
  [/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 [REDACTED]'],
  // key=value / key: value pairs whose key looks sensitive
  [/\b([\w-]*(?:password|passwd|pwd|secret|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key|client[_-]?secret|authorization|cookie|session)[\w-]*)(["']?\s*[:=]\s*["']?)[^\s"'&,;]+/gi, '$1$2[REDACTED]'],
]

export function redactSecrets(text) {
  if (typeof text !== 'string' || !text) return text
  return PATTERNS.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text)
}

// Drops the query string and fragment, which frequently carry tokens.
export function stripQuery(url) {
  if (typeof url !== 'string' || !url) return url
  return url.split(/[?#]/)[0]
}
