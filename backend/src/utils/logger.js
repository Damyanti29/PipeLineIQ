import { env } from '../config/env.js'
import { redactSecrets } from './redact.js'

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 }
const minLevel = env.isTest ? LEVELS.error + 1 : env.isProduction ? LEVELS.info : LEVELS.debug

function serialize(value) {
  if (value instanceof Error) {
    return { name: value.name, message: redactSecrets(value.message), stack: env.isProduction ? undefined : value.stack }
  }
  return value
}

function write(level, message, context = {}) {
  if (LEVELS[level] < minLevel) return
  const fields = Object.fromEntries(Object.entries(context).map(([k, v]) => [k, serialize(v)]))
  const line = redactSecrets(JSON.stringify({ time: new Date().toISOString(), level, message, ...fields }))
  if (level === 'error' || level === 'warn') console.error(line)
  else console.log(line)
}

export const logger = {
  debug: (message, context) => write('debug', message, context),
  info: (message, context) => write('info', message, context),
  warn: (message, context) => write('warn', message, context),
  error: (message, context) => write('error', message, context),
}
