import request from 'supertest'
import { loadApp } from './helpers/loadApp.js'

const REPO = '0b7a8f7e-6a57-4d52-9d8b-0f4f1c2c9a11'
let app

beforeAll(async () => {
  ;({ app } = await loadApp())
})

const valid = {
  projectId: 'proj_1',
  repositoryId: REPO,
  errorType: 'TypeError',
  message: 'Cannot read properties of undefined',
  stackTrace: 'TypeError: ...\n    at Expense (Expense.jsx:47:12)',
  fileName: 'Expense.jsx',
  lineNumber: 47,
  columnNumber: 12,
  environment: 'production',
  requestUrl: 'https://app.example/expenses',
  userAgent: 'Mozilla/5.0',
  metadata: { release: '1.2.3' },
}

const post = (body) => request(app).post('/api/errors').send(body)
const paths = (res) => res.body.error.details.map((d) => d.path)

describe('POST /api/errors validation', () => {
  it.each([
    ['repositoryId', { repositoryId: undefined }],
    ['repositoryId', { repositoryId: 'not-a-uuid' }],
    ['errorType', { errorType: '' }],
    ['message', { message: undefined }],
    ['message', { message: 'x'.repeat(5001) }],
    ['lineNumber', { lineNumber: '47' }],
    ['lineNumber', { lineNumber: -1 }],
    ['columnNumber', { columnNumber: 1.5 }],
    ['metadata', { metadata: 'not-an-object' }],
    ['metadata', { metadata: { blob: 'x'.repeat(11000) } }],
    ['timestamp', { timestamp: 'yesterday' }],
  ])('rejects invalid %s', async (field, override) => {
    const res = await post({ ...valid, ...override })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('bad_request')
    expect(paths(res)).toContain(field)
  })

  it('passes validation for a well-formed payload (then requires the ingest key)', async () => {
    const res = await post(valid)
    expect(res.status).toBe(401)
    expect(res.body.error.message).toBe('Missing ingest key')
  })

  it('accepts a minimal payload', async () => {
    const res = await post({ repositoryId: REPO, errorType: 'Error', message: 'x' })
    expect(res.status).toBe(401) // valid body; fails only on the missing key
  })
})
