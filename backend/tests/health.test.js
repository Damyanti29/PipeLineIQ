import request from 'supertest'
import { loadApp } from './helpers/loadApp.js'

let app

beforeAll(async () => {
  ;({ app } = await loadApp())
})

describe('GET /api/health', () => {
  it('returns ok with the status of each service', async () => {
    const res = await request(app).get('/api/health')

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.services).toMatchObject({
      supabase: 'configured',
      redis: 'down',
      github: 'not_configured',
      githubWebhooks: 'configured',
      gemini: 'not_configured',
    })
  })

  it('does not leak secrets', async () => {
    const res = await request(app).get('/api/health')
    const body = JSON.stringify(res.body)
    expect(body).not.toContain('test-service-role-key')
    expect(body).not.toContain('test-webhook-secret')
  })
})

describe('route registration', () => {
  it.each([
    ['get', '/api/github/status'],
    ['get', '/api/repositories'],
    ['get', '/api/errors'],
    ['get', '/api/incidents'],
    ['get', '/api/slack/status'],
  ])('%s %s is registered and requires auth', async (method, path) => {
    const res = await request(app)[method](path)
    expect(res.status).toBe(401)
  })

  it('returns a JSON 404 for unknown routes', async () => {
    const res = await request(app).get('/api/does-not-exist')
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('not_found')
  })

  it('rejects malformed JSON with 400', async () => {
    const res = await request(app).post('/api/errors').set('Content-Type', 'application/json').send('{"broken"')
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('invalid_json')
  })
})

describe('CORS', () => {
  it('allows the configured frontend origin for the dashboard API', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'http://localhost:5173')
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173')
  })

  it('does not allow other origins on the dashboard API and never uses *', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'https://evil.example')
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('allows SDK ingestion preflight from any origin without wildcard', async () => {
    const res = await request(app)
      .options('/api/errors')
      .set('Origin', 'https://customer-app.example')
      .set('Access-Control-Request-Method', 'POST')
    expect(res.headers['access-control-allow-origin']).toBe('https://customer-app.example')
    expect(res.headers['access-control-allow-headers']).toContain('x-reposentinel-key')
  })
})
