import { buildExceptionEvent, buildMessageEvent, installGlobalHandlers } from './capture.js'
import { flush, parseDsn, send } from './transport.js'

let config = null
let removeHandlers = null

function deliver(event) {
  if (!config) {
    console.warn('RepoSentinel: call RepoSentinel.init({ dsn }) before capturing events')
    return Promise.resolve({ ok: false, reason: 'not_initialized' })
  }
  if (config.sampleRate < 1 && Math.random() >= config.sampleRate) {
    return Promise.resolve({ ok: false, reason: 'sampled_out' })
  }
  const finalEvent = config.beforeSend ? config.beforeSend(event) : event
  if (!finalEvent) return Promise.resolve({ ok: false, reason: 'dropped_by_beforeSend' })
  return send(config, finalEvent)
}

/**
 * @param {object} options
 * @param {string} options.dsn               Project DSN from the RepoSentinel dashboard.
 * @param {string} [options.environment]     Defaults to "production".
 * @param {string} [options.release]         Your app version / commit sha.
 * @param {boolean} [options.captureUnhandled] Capture uncaught errors and rejections (default true).
 * @param {number} [options.sampleRate]      0..1, fraction of events to send (default 1).
 * @param {object} [options.metadata]        Extra data attached to every event.
 * @param {(event: object) => object|null} [options.beforeSend] Modify or drop (return null) events.
 * @param {boolean} [options.debug]          Log delivery failures to the console.
 */
function init(options = {}) {
  if (!options.dsn) throw new Error('RepoSentinel: `dsn` is required')

  removeHandlers?.()
  config = {
    ...parseDsn(options.dsn),
    environment: options.environment ?? 'production',
    release: options.release,
    sampleRate: typeof options.sampleRate === 'number' ? Math.min(Math.max(options.sampleRate, 0), 1) : 1,
    metadata: options.metadata ?? {},
    beforeSend: options.beforeSend,
    debug: Boolean(options.debug),
  }

  if (options.captureUnhandled !== false) {
    removeHandlers = installGlobalHandlers(async (error, context, { flush: shouldFlush } = {}) => {
      const result = deliver(buildExceptionEvent(config, error, context))
      if (shouldFlush) await flush(2000)
      return result
    })
  }
}

function captureException(error, context = {}) {
  if (!config) return deliver(null)
  return deliver(buildExceptionEvent(config, error, context))
}

function captureMessage(message, context = {}) {
  if (!config) return deliver(null)
  return deliver(buildMessageEvent(config, message, context))
}

function close() {
  removeHandlers?.()
  removeHandlers = null
  config = null
  return flush()
}

const RepoSentinel = { init, captureException, captureMessage, flush, close }

export { init, captureException, captureMessage, flush, close }
export default RepoSentinel
