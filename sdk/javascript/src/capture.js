export const SDK_NAME = '@pipelineiq/sdk'
export const SDK_VERSION = '0.1.0'

const MAX_MESSAGE = 5000
const MAX_STACK = 50000
const MAX_METADATA_BYTES = 10000

const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined'

// Matches V8 ("at fn (file:1:2)" / "at file:1:2") and Firefox/Safari ("fn@file:1:2") frames.
const FRAME = /(?:\(|@|\bat\s+)((?:[a-z][a-z0-9+.-]*:\/\/|\/|[a-z]:\\|node:)?[^\s()@]*?):(\d+):(\d+)\)?\s*$/i

export function parseTopFrame(stack) {
  if (typeof stack !== 'string') return {}
  for (const line of stack.split('\n').slice(0, 30)) {
    const match = line.trim().match(FRAME)
    if (match && match[1] && !match[1].startsWith('node:internal')) {
      return { fileName: match[1], lineNumber: Number(match[2]), columnNumber: Number(match[3]) }
    }
  }
  return {}
}

function normalizeError(input) {
  if (input instanceof Error) return input
  if (input && typeof input === 'object' && 'message' in input) {
    const error = new Error(String(input.message))
    error.name = input.name ? String(input.name) : 'Error'
    if (input.stack) error.stack = String(input.stack)
    return error
  }
  let text
  try {
    text = typeof input === 'string' ? input : JSON.stringify(input)
  } catch {
    text = String(input)
  }
  // Synthetic: its stack points into the SDK, so it is not reported.
  const error = new Error(`Non-Error value thrown: ${text}`)
  error.synthetic = true
  return error
}

function limitMetadata(metadata) {
  try {
    const json = JSON.stringify(metadata ?? {})
    return json.length <= MAX_METADATA_BYTES ? JSON.parse(json) : { truncated: true }
  } catch {
    return { unserializable: true }
  }
}

function baseContext(config, context) {
  return {
    repositoryId: config.repositoryId,
    environment: context.environment ?? config.environment,
    requestUrl: context.requestUrl ?? (isBrowser ? window.location.href : undefined),
    userAgent: isBrowser ? navigator.userAgent : undefined,
    timestamp: new Date().toISOString(),
    metadata: limitMetadata({
      sdk: { name: SDK_NAME, version: SDK_VERSION },
      runtime: isBrowser ? 'browser' : 'node',
      ...(config.release ? { release: config.release } : {}),
      ...config.metadata,
      ...context.metadata,
    }),
  }
}

export function buildExceptionEvent(config, input, context = {}) {
  const error = normalizeError(input)
  const stack = error.synthetic ? undefined : error.stack
  const frame = parseTopFrame(stack)
  return {
    ...baseContext(config, context),
    errorType: (error.name || 'Error').slice(0, 200),
    message: (error.message || '(no message)').slice(0, MAX_MESSAGE),
    stackTrace: stack ? String(stack).slice(0, MAX_STACK) : undefined,
    ...frame,
  }
}

export function buildMessageEvent(config, message, context = {}) {
  const level = context.level ?? 'info'
  return {
    ...baseContext(config, context),
    errorType: `Message:${level}`,
    message: String(message).slice(0, MAX_MESSAGE),
  }
}

// Installs global handlers. Returns a function that removes them.
export function installGlobalHandlers(onError) {
  if (isBrowser) {
    const handleError = (event) => onError(event.error ?? { name: 'Error', message: event.message, stack: event.error?.stack })
    const handleRejection = (event) => onError(event.reason, { metadata: { mechanism: 'unhandledrejection' } })
    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleRejection)
    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleRejection)
    }
  }

  if (typeof process !== 'undefined' && typeof process.on === 'function') {
    // Mirrors Node's default behaviour (print and exit 1) after the event is sent.
    const fatal = (mechanism) => async (error) => {
      await onError(error, { metadata: { mechanism } }, { flush: true })
      console.error(error)
      process.exit(1)
    }
    const handleException = fatal('uncaughtException')
    const handleRejection = fatal('unhandledRejection')
    process.on('uncaughtException', handleException)
    process.on('unhandledRejection', handleRejection)
    return () => {
      process.off('uncaughtException', handleException)
      process.off('unhandledRejection', handleRejection)
    }
  }
  return () => {}
}
