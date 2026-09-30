import { jest } from '@jest/globals'
import crypto from 'node:crypto'
import request from 'supertest'
import { loadApp } from './helpers/loadApp.js'

const SECRET = 'test-webhook-secret' // from tests/setupEnv.js
const handleGithubEvent = jest.fn(async () => ({ handled: 'push' }))
let app

beforeAll(async () => {
  ;({ app } = await loadApp({
    serviceMocks: {
      'services/webhookService.js': () => ({ handleGithubEvent, TRACKED_EVENTS: [], summarizeEvent: jest.fn() }),
    },
  }))
})

beforeEach(() => handleGithubEvent.mockClear())

const sign = (body, secret = SECRET) => `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`
const payload = JSON.stringify({ ref: 'refs/heads/main', repository: { id: 42 }, sender: { login: 'octocat' } })

const deliver = (body, signature, event = 'push') => {
  const req = request(app)
    .post('/api/webhooks/github')
    .set('Content-Type', 'application/json')
    .set('X-GitHub-Event', event)
    .set('X-GitHub-Delivery', 'delivery-1')
  if (signature) req.set('X-Hub-Signature-256', signature)
  return req.send(body)
}

describe('POST /api/webhooks/github', () => {
  it('processes a delivery with a valid X-Hub-Signature-256', async () => {
    const res = await deliver(payload, sign(payload))
    expect(res.status).toBe(202)
    expect(handleGithubEvent).toHaveBeenCalledWith({
      event: 'push',
      deliveryId: 'delivery-1',
      payload: JSON.parse(payload),
    })
  })

  it('rejects a missing signature without processing', async () => {
    const res = await deliver(payload, null)
    expect(res.status).toBe(401)
    expect(handleGithubEvent).not.toHaveBeenCalled()
  })

  it('rejects a signature made with the wrong secret', async () => {
    const res = await deliver(payload, sign(payload, 'wrong-secret'))
    expect(res.status).toBe(401)
    expect(handleGithubEvent).not.toHaveBeenCalled()
  })

  it('rejects a tampered body (signature of a different payload)', async () => {
    const tampered = payload.replace('octocat', 'mallory')
    const res = await deliver(tampered, sign(payload))
    expect(res.status).toBe(401)
    expect(handleGithubEvent).not.toHaveBeenCalled()
  })

  it('rejects malformed signature headers', async () => {
    const res = await deliver(payload, 'sha1=abc')
    expect(res.status).toBe(401)
    expect(handleGithubEvent).not.toHaveBeenCalled()
  })

  it('verifies against the exact raw bytes (whitespace matters)', async () => {
    const pretty = JSON.stringify(JSON.parse(payload), null, 2)
    const res = await deliver(pretty, sign(pretty))
    expect(res.status).toBe(202)
  })
})
