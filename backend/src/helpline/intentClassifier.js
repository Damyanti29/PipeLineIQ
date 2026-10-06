// Intent classification for the Helpline: TF-IDF features + multinomial logistic regression,
// written out in plain JavaScript so every step can be read and explained (no ML library).
//
//   question → preprocess (textPreprocess.js) → TF-IDF vector → softmax(W·x + b) → intent
//
// The model is trained in memory from data/intents.csv the first time it is needed
// (a few hundred rows, well under a second) and then reused.
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { extractFeatures } from './textPreprocess.js'

export const INTENTS_CSV = fileURLToPath(new URL('./data/intents.csv', import.meta.url))
export const UNKNOWN = 'UNKNOWN'

// A question with no PipelineIQ vocabulary needs at least this probability to be answered.
export const MIN_CONFIDENCE = 0.5

// Common words that appear in PipelineIQ questions but say nothing about the topic.
const GENERIC_WORDS = new Set(
  'how why what when where who which whom my mine our not no use using work need want see make mean help explain tell show know keep'.split(' '),
)

// ─── Dataset ────────────────────────────────────────────────────

// Parses "question,intent" lines. Questions may be quoted and contain commas ("" escapes a quote).
export function parseIntentsCsv(text) {
  const rows = []
  for (const line of text.split(/\r?\n/).slice(1)) {
    if (!line.trim() || line.startsWith('#')) continue
    const match = line.match(/^\s*(?:"((?:[^"]|"")*)"|([^,]*)),\s*([A-Z_]+)\s*$/)
    if (!match) throw new Error(`Invalid intents.csv line: ${line}`)
    rows.push({ question: (match[1] ?? match[2]).replace(/""/g, '"').trim(), intent: match[3] })
  }
  return rows
}

export const loadIntentDataset = (file = INTENTS_CSV) => parseIntentsCsv(fs.readFileSync(file, 'utf8'))

// ─── TF-IDF ─────────────────────────────────────────────────────

// Sparse TF-IDF vector as [[featureIndex, weight], ...], L2-normalized.
// tf is sublinear (1 + ln count) so a repeated word does not dominate.
function vectorize(features, vocab, idf) {
  const counts = new Map()
  for (const feature of features) {
    const index = vocab.get(feature)
    if (index !== undefined) counts.set(index, (counts.get(index) ?? 0) + 1)
  }
  const vector = [...counts].map(([index, count]) => [index, (1 + Math.log(count)) * idf[index]])
  const norm = Math.sqrt(vector.reduce((sum, [, value]) => sum + value * value, 0)) || 1
  return vector.map(([index, value]) => [index, value / norm])
}

// ─── Logistic regression ────────────────────────────────────────

function softmax(logits) {
  const max = Math.max(...logits)
  const exps = logits.map((logit) => Math.exp(logit - max))
  const total = exps.reduce((a, b) => a + b, 0)
  return exps.map((value) => value / total)
}

const logitsFor = (model, vector) =>
  model.labels.map((_, k) => vector.reduce((sum, [index, value]) => sum + model.weights[k][index] * value, model.bias[k]))

// Deterministic pseudo-random order for SGD, so training gives the same model every time.
function shuffledIndices(n, seed) {
  const order = Array.from({ length: n }, (_, i) => i)
  let state = seed
  for (let i = n - 1; i > 0; i -= 1) {
    state = (state * 1664525 + 1013904223) % 4294967296
    const j = state % (i + 1)
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order
}

// Trains on [{ question, intent }]. Stochastic gradient descent on the cross-entropy loss with
// L2 regularization; the gradient for class k is (p_k − y_k)·x.
export function trainClassifier(examples, { epochs = 60, learningRate = 0.5, l2 = 1e-4, seed = 42 } = {}) {
  const labels = [...new Set(examples.map((e) => e.intent))].sort()
  const docs = examples.map((e) => extractFeatures(e.question))

  const documentFrequency = new Map()
  for (const features of docs) for (const feature of new Set(features)) documentFrequency.set(feature, (documentFrequency.get(feature) ?? 0) + 1)
  const vocab = new Map([...documentFrequency.keys()].map((feature, i) => [feature, i]))
  const n = docs.length
  // Smoothed idf, as in scikit-learn's TfidfVectorizer.
  const idf = [...documentFrequency.values()].map((df) => Math.log((1 + n) / (1 + df)) + 1)

  // Domain lexicon: words used in PipelineIQ questions and never in the off-topic examples
  // (pipelineiq, slack, dsn, incident, fix, ...). Learned from the training data, not hand-written.
  const offTopicWords = new Set(examples.flatMap((e, i) => (e.intent === UNKNOWN ? docs[i] : [])))
  const domainLexicon = new Set(
    examples.flatMap((e, i) => (e.intent === UNKNOWN ? [] : docs[i].filter((f) => !f.includes('_') && !offTopicWords.has(f) && !GENERIC_WORDS.has(f)))),
  )

  const model = {
    labels,
    vocab,
    idf,
    domainLexicon,
    weights: labels.map(() => new Float64Array(vocab.size)),
    bias: new Float64Array(labels.length),
  }
  const vectors = docs.map((features) => vectorize(features, vocab, idf))
  const targets = examples.map((e) => labels.indexOf(e.intent))

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    const rate = learningRate / (1 + epoch * 0.05)
    for (const i of shuffledIndices(n, seed + epoch)) {
      const probabilities = softmax(logitsFor(model, vectors[i]))
      for (let k = 0; k < labels.length; k += 1) {
        const gradient = probabilities[k] - (k === targets[i] ? 1 : 0)
        model.bias[k] -= rate * gradient
        for (const [index, value] of vectors[i]) {
          model.weights[k][index] -= rate * (gradient * value + l2 * model.weights[k][index])
        }
      }
    }
  }
  return model
}

// Returns { intent, confidence, probabilities, inDomain }. The question is UNKNOWN (out of scope) when
//   1. none of its words were seen in training, or
//   2. UNKNOWN is the most probable intent, or
//   3. it has no PipelineIQ vocabulary and the best intent is below minConfidence.
// A question that does use PipelineIQ vocabulary is always answered, even when it is ambiguous
// between two intents: retrieval does not depend on the intent being exactly right.
export function predictIntent(model, text, { minConfidence = MIN_CONFIDENCE } = {}) {
  const features = extractFeatures(text)
  const vector = vectorize(features, model.vocab, model.idf)
  if (vector.length === 0) return { intent: UNKNOWN, confidence: 1, probabilities: {}, inDomain: false }

  const probabilities = softmax(logitsFor(model, vector))
  const best = probabilities.indexOf(Math.max(...probabilities))
  const byLabel = Object.fromEntries(model.labels.map((label, k) => [label, Number(probabilities[k].toFixed(4))]))
  const confidence = Number(probabilities[best].toFixed(4))
  const inDomain = features.some((feature) => model.domainLexicon.has(feature))
  const intent = model.labels[best] === UNKNOWN || (!inDomain && confidence < minConfidence) ? UNKNOWN : model.labels[best]
  return { intent, confidence, probabilities: byLabel, inDomain }
}

// ─── Shared instance ────────────────────────────────────────────

let sharedModel = null

export function getClassifier() {
  sharedModel ??= trainClassifier(loadIntentDataset())
  return sharedModel
}

export const classifyIntent = (text) => predictIntent(getClassifier(), text)
