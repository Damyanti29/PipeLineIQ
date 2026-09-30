import crypto from 'node:crypto'
import { env } from '../config/env.js'

export const sha256Hex = (value) => crypto.createHash('sha256').update(value).digest('hex')

export const hmacSha256Hex = (secret, payload) =>
  crypto.createHmac('sha256', secret).update(payload).digest('hex')

// Constant-time string comparison; unequal lengths return false without leaking timing.
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

// GitHub: X-Hub-Signature-256: sha256=<hex hmac of raw body>
export function verifyGithubSignature(rawBody, signatureHeader, secret) {
  if (!secret || !Buffer.isBuffer(rawBody) || typeof signatureHeader !== 'string') return false
  const expected = `sha256=${hmacSha256Hex(secret, rawBody)}`
  return safeEqual(expected, signatureHeader)
}

// Slack: X-Slack-Signature: v0=<hex hmac of "v0:<timestamp>:<raw body>">, rejected when older than 5 minutes.
export function verifySlackSignature(rawBody, timestamp, signatureHeader, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!secret || !Buffer.isBuffer(rawBody) || typeof signatureHeader !== 'string') return false
  const ts = Number(timestamp)
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > 60 * 5) return false
  const expected = `v0=${hmacSha256Hex(secret, `v0:${ts}:${rawBody.toString('utf8')}`)}`
  return safeEqual(expected, signatureHeader)
}

// Separate keys for separate purposes, derived from APP_ENCRYPTION_KEY.
function deriveKey(purpose) {
  if (!env.appEncryptionKey) throw new Error('APP_ENCRYPTION_KEY is not set')
  return crypto.createHash('sha256').update(`${purpose}:${env.appEncryptionKey}`).digest()
}

// AES-256-GCM. Output: v1.<iv>.<authTag>.<ciphertext> (base64url parts).
export function encrypt(plaintext) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey('encryption'), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return ['v1', iv, cipher.getAuthTag(), ciphertext].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join('.')
}

export function decrypt(payload) {
  const [version, iv, tag, ciphertext] = String(payload).split('.')
  if (version !== 'v1' || !iv || !tag || !ciphertext) throw new Error('Unsupported encrypted payload')
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey('encryption'), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8')
}

// Signed, expiring OAuth `state` that binds a redirect back to the user who started it.
export function signState(data, ttlSeconds = 600) {
  const body = Buffer.from(JSON.stringify({ ...data, exp: Math.floor(Date.now() / 1000) + ttlSeconds, n: crypto.randomBytes(8).toString('hex') })).toString('base64url')
  const sig = crypto.createHmac('sha256', deriveKey('oauth-state')).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifyState(state) {
  if (typeof state !== 'string') return null
  const [body, sig] = state.split('.')
  if (!body || !sig) return null
  const expected = crypto.createHmac('sha256', deriveKey('oauth-state')).update(body).digest('base64url')
  if (!safeEqual(expected, sig)) return null
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (!data.exp || data.exp < Math.floor(Date.now() / 1000)) return null
    return data
  } catch {
    return null
  }
}

// RS256 JWT used to authenticate as the GitHub App (valid for up to 10 minutes).
export function createGithubAppJwt(appId, privateKey, nowSeconds = Math.floor(Date.now() / 1000)) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ iat: nowSeconds - 60, exp: nowSeconds + 9 * 60, iss: String(appId) })).toString('base64url')
  const signature = crypto.createSign('RSA-SHA256').update(`${header}.${payload}`).sign(privateKey, 'base64url')
  return `${header}.${payload}.${signature}`
}
