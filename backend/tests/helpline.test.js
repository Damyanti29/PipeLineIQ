import { jest } from '@jest/globals'
import request from 'supertest'
import { createFakeSupabase } from './helpers/fakeSupabase.js'
import { authHeader, loadApp, src } from './helpers/loadApp.js'

// The helpline needs Gemini configured; env.js reads it when the app is imported below.
process.env.GEMINI_API_KEY = 'test-gemini-key'

const KNOWLEDGE = [
  {
    id: 'k1',
    category: 'general',
    question: 'What is PipelineIQ?',
    answer: 'PipelineIQ is an AI-powered error and incident monitoring tool for GitHub repositories.',
    keywords: ['pipelineiq', 'overview'],
  },
  {
    id: 'k2',
    category: 'troubleshooting',
    question: 'Why is my pipeline failing?',
    answer: 'Open Push monitoring: failed GitHub Actions runs appear there with a root cause and suggested fix.',
    keywords: ['pipeline failing', 'ci failing', 'failed run'],
  },
  {
    id: 'k3',
    category: 'integration',
    question: 'How do I connect Slack?',
    answer: 'Open Integrations and click Connect Slack, then pick the alert channel.',
    keywords: ['slack', 'connect slack'],
  },
]

const tables = {
  helpline_knowledge: { data: KNOWLEDGE, error: null },
  pipeline_alerts: {
    data: [
      {
        source: 'ci_failure',
        status: 'alerted',
        severity: 'high',
        title: 'Unit tests fail on main',
        branch: 'main',
        analysis: { rootCause: 'formatCurrncy is not exported. token=ghp_abcdefghijklmnopqrstuvwxyz123456' },
        repository: { full_name: 'acme/app' },
      },
    ],
    error: null,
  },
  errors: { data: [], error: null },
}
const userDb = createFakeSupabase({ tables })
const admin = createFakeSupabase()
const generateContent = jest.fn()

const { app } = await loadApp({
  userDb,
  admin,
  serviceMocks: {
    'services/aiService.js': () => ({ generateContent, analyzeError: jest.fn() }),
  },
})
const helpline = await import(src('services/helplineService.js'))
const { classifyIntent, trainClassifier, predictIntent } = await import(src('helpline/intentClassifier.js'))
const { buildIndex, searchKnowledge } = await import(src('helpline/knowledgeSearch.js'))
const { tokenize } = await import(src('helpline/textPreprocess.js'))

const ask = (message) => request(app).post('/api/helpline/chat').set(authHeader).send({ message })
const promptSentToGemini = () => generateContent.mock.calls.at(-1)[0]

beforeEach(() => {
  helpline.clearKnowledgeCache()
  generateContent.mockReset()
  generateContent.mockResolvedValue({ ok: true, model: 'gemini-test', text: 'Here is how PipelineIQ works.' })
  tables.helpline_knowledge = { data: KNOWLEDGE, error: null }
  userDb.calls.length = 0
  admin.calls.length = 0
})

// ─── NLP building blocks ────────────────────────────────────────
describe('text preprocessing', () => {
  it('lowercases, drops stopwords, maps synonyms and stems', () => {
    expect(tokenize('Why are my Slack notifications failing?')).toEqual(['why', 'my', 'slack', 'alert', 'fail'])
    expect(tokenize('repositories')).toEqual(tokenize('repository'))
    expect(tokenize('settings')).toEqual(tokenize('setting'))
    expect(tokenize('configured')).toEqual(tokenize('configure'))
  })
})

describe('intent classifier', () => {
  it.each([
    ['What is PipelineIQ?', 'GENERAL'],
    ['How do I use the dashboard?', 'DASHBOARD'],
    ['Why is my pipeline failing?', 'TROUBLESHOOTING'],
    ['How do I connect my integration?', 'INTEGRATION'],
    ['What is the capital of France?', 'UNKNOWN'],
    ['Who is the Prime Minister of India?', 'UNKNOWN'],
    ['Write a Python game for me', 'UNKNOWN'],
  ])('%s → %s', (question, intent) => {
    expect(classifyIntent(question).intent).toBe(intent)
  })

  it('treats a PipelineIQ question it cannot place precisely as in scope', () => {
    const result = classifyIntent("I don't understand this PipelineIQ feature")
    expect(result.intent).not.toBe('UNKNOWN')
    expect(result.inDomain).toBe(true)
  })

  it('returns UNKNOWN when no word was seen in training', () => {
    expect(classifyIntent('zxqv blorp')).toMatchObject({ intent: 'UNKNOWN', inDomain: false })
  })

  it('trains deterministically', () => {
    const examples = [
      { question: 'connect slack', intent: 'INTEGRATION' },
      { question: 'slack channel', intent: 'INTEGRATION' },
      { question: 'reset password', intent: 'ACCOUNT' },
      { question: 'change password', intent: 'ACCOUNT' },
    ]
    const a = predictIntent(trainClassifier(examples), 'slack')
    const b = predictIntent(trainClassifier(examples), 'slack')
    expect(a).toEqual(b)
    expect(a.intent).toBe('INTEGRATION')
  })
})

describe('knowledge search', () => {
  const index = buildIndex(KNOWLEDGE)

  it('ranks the matching entry first', () => {
    expect(searchKnowledge(index, 'my CI pipeline keeps failing')[0].row.id).toBe('k2')
    expect(searchKnowledge(index, 'how to connect a slack channel')[0].row.id).toBe('k3')
  })

  it('returns nothing for unrelated text', () => {
    expect(searchKnowledge(index, 'chocolate cake recipe')).toEqual([])
  })
})

// ─── API ────────────────────────────────────────────────────────
describe('POST /api/helpline/chat', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/helpline/chat').send({ message: 'What is PipelineIQ?' })
    expect(res.status).toBe(401)
    expect(generateContent).not.toHaveBeenCalled()
  })

  it('rejects an invalid session', async () => {
    const res = await request(app).post('/api/helpline/chat').set({ Authorization: 'Bearer wrong' }).send({ message: 'What is PipelineIQ?' })
    expect(res.status).toBe(401)
  })

  it.each([[''], ['   '], [undefined]])('asks for a question when the message is %p', async (message) => {
    const res = await ask(message)
    expect(res.status).toBe(400)
    expect(res.body.error.message).toBe('Please enter a PipelineIQ-related question.')
    expect(generateContent).not.toHaveBeenCalled()
  })

  it('rejects overly long messages', async () => {
    const res = await ask('a'.repeat(1001))
    expect(res.status).toBe(400)
  })

  it('answers a general question from Supabase knowledge through Gemini', async () => {
    const res = await ask('What is PipelineIQ?')
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({
      intent: 'GENERAL',
      answer: 'Here is how PipelineIQ works.',
      sources: [{ category: 'general', question: 'What is PipelineIQ?' }],
    })

    expect(generateContent).toHaveBeenCalledTimes(1)
    expect(generateContent.mock.calls[0][1]).toMatchObject({ json: false })
    const prompt = promptSentToGemini()
    expect(prompt).toContain('You are PipelineIQ Helpline')
    expect(prompt).toContain('Use only the PipelineIQ information')
    expect(prompt).toContain('Detected intent: GENERAL')
    expect(prompt).toContain(KNOWLEDGE[0].answer)
    expect(prompt).not.toContain(KNOWLEDGE[2].answer)

    // Knowledge is read through the user's RLS-scoped client, never the service role.
    expect(userDb.callsFor('helpline_knowledge')).toHaveLength(1)
    expect(admin.calls).toHaveLength(0)
  })

  it("adds the user's own alerts for 'my pipeline' questions, redacted", async () => {
    const res = await ask('Why is my pipeline failing?')
    expect(res.status).toBe(200)
    expect(res.body.data.intent).toBe('TROUBLESHOOTING')
    expect(res.body.data.sources[0].question).toBe('Why is my pipeline failing?')

    const prompt = promptSentToGemini()
    expect(prompt).toContain("the user's own PipelineIQ data")
    expect(prompt).toContain('acme/app')
    expect(prompt).toContain('Unit tests fail on main')
    expect(prompt).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz123456')
  })

  it('does not load personal data for general questions', async () => {
    await ask('What is PipelineIQ?')
    expect(userDb.callsFor('pipeline_alerts')).toHaveLength(0)
    expect(userDb.callsFor('errors')).toHaveLength(0)
  })

  it('redirects out-of-scope questions without calling Gemini or Supabase', async () => {
    const res = await ask('Who is the Prime Minister of India?')
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({
      intent: 'UNKNOWN',
      confidence: expect.any(Number),
      answer: helpline.OUT_OF_SCOPE_ANSWER,
      sources: [],
    })
    expect(generateContent).not.toHaveBeenCalled()
    expect(userDb.calls).toHaveLength(0)
  })

  it('tells Gemini when no knowledge matches instead of letting it improvise', async () => {
    tables.helpline_knowledge = { data: [], error: null }
    const res = await ask('How does the repository health status work?')
    expect(res.status).toBe(200)
    expect(res.body.data.sources).toEqual([])
    expect(promptSentToGemini()).toContain('No matching PipelineIQ knowledge was found')
  })

  it('redacts secrets pasted into the question before it reaches Gemini', async () => {
    await ask('My Slack bot token xoxb-123456789012-abcdefghijkl stopped working, how do I connect Slack?')
    const prompt = promptSentToGemini()
    expect(prompt).not.toContain('xoxb-123456789012-abcdefghijkl')
    expect(prompt).toContain('[REDACTED_SLACK_TOKEN]')
  })

  it('returns a friendly 503 when Gemini fails', async () => {
    generateContent.mockResolvedValue({ ok: false, status: 503 })
    const res = await ask('How do I connect Slack?')
    expect(res.status).toBe(503)
    expect(res.body.error).toMatchObject({ code: 'helpline_unavailable', message: helpline.UNAVAILABLE_MESSAGE })
  })

  it('returns a friendly 503 when the Gemini request throws', async () => {
    generateContent.mockRejectedValue(new Error('network down'))
    const res = await ask('How do I connect Slack?')
    expect(res.status).toBe(503)
    expect(res.body.error.message).toBe(helpline.UNAVAILABLE_MESSAGE)
  })

  it('returns a friendly 503 when Gemini returns an empty answer', async () => {
    generateContent.mockResolvedValue({ ok: true, text: '   ' })
    const res = await ask('How do I connect Slack?')
    expect(res.status).toBe(503)
  })

  it('returns a friendly 503 when Supabase fails', async () => {
    tables.helpline_knowledge = { data: null, error: { message: 'relation "helpline_knowledge" does not exist', code: '42P01' } }
    const res = await ask('How do I connect Slack?')
    expect(res.status).toBe(503)
    expect(res.body.error.message).toBe(helpline.UNAVAILABLE_MESSAGE)
    expect(generateContent).not.toHaveBeenCalled()
  })

  it('still answers when the personal context cannot be loaded', async () => {
    const saved = tables.pipeline_alerts
    tables.pipeline_alerts = { data: null, error: { message: 'boom' } }
    const res = await ask('Why is my pipeline failing?')
    tables.pipeline_alerts = saved
    expect(res.status).toBe(200)
    expect(promptSentToGemini()).not.toContain("the user's own PipelineIQ data")
  })

  it('caches knowledge between questions', async () => {
    await ask('What is PipelineIQ?')
    await ask('How do I connect Slack?')
    expect(userDb.callsFor('helpline_knowledge')).toHaveLength(1)
  })
})
