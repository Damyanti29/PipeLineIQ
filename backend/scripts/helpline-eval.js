// Evaluates the PipelineIQ Helpline (Data Science component).
//
//   npm run helpline:eval            intent classification + knowledge retrieval (offline, no credentials)
//   npm run helpline:eval -- --live  also asks Gemini a fixed set of questions: latency, out-of-scope
//                                    handling and a groundedness proxy (uses GEMINI_API_KEY)
//
// 1. Intent classification: stratified 5-fold cross-validation on data/intents.csv. Accuracy,
//    per-class precision / recall / F1, macro and weighted averages, confusion matrix, and a
//    majority-class baseline. Also a sweep of the confidence threshold used for UNKNOWN.
// 2. Retrieval: data/retrieval_eval.json pairs a paraphrased question with the knowledge entry
//    that answers it. Top-1, top-3 and MRR, with the intent boost used in production, without it, and with a stronger one.
// Results are printed and saved to simulation-output/helpline-eval.json (git-ignored).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MIN_CONFIDENCE, UNKNOWN, loadIntentDataset, predictIntent, trainClassifier } from '../src/helpline/intentClassifier.js'
import { INTENT_BOOST, buildIndex, searchKnowledge } from '../src/helpline/knowledgeSearch.js'
import { tokenize } from '../src/helpline/textPreprocess.js'

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = path.join(BACKEND_DIR, 'src', 'helpline', 'data')
const OUTPUT_FILE = path.join(BACKEND_DIR, 'simulation-output', 'helpline-eval.json')
const FOLDS = 5
const live = process.argv.includes('--live')

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'))
const pct = (value) => `${(value * 100).toFixed(1)}%`
const pad = (text, width) => String(text).padEnd(width)
const padStart = (text, width) => String(text).padStart(width)

// ─── Intent classification ──────────────────────────────────────

// Each class is spread evenly over the folds, so every fold sees every intent.
function stratifiedFolds(examples, k) {
  const folds = Array.from({ length: k }, () => [])
  const byIntent = new Map()
  examples.forEach((example, i) => byIntent.set(example.intent, [...(byIntent.get(example.intent) ?? []), i]))
  for (const indices of byIntent.values()) indices.forEach((index, i) => folds[i % k].push(index))
  return folds
}

function crossValidate(examples, minConfidence) {
  const predictions = new Array(examples.length)
  for (const testFold of stratifiedFolds(examples, FOLDS)) {
    const testSet = new Set(testFold)
    const model = trainClassifier(examples.filter((_, i) => !testSet.has(i)))
    for (const i of testFold) predictions[i] = predictIntent(model, examples[i].question, { minConfidence }).intent
  }
  return predictions
}

function classificationReport(actual, predicted) {
  const labels = [...new Set(actual)].sort()
  const perClass = labels.map((label) => {
    const tp = actual.filter((a, i) => a === label && predicted[i] === label).length
    const fp = actual.filter((a, i) => a !== label && predicted[i] === label).length
    const fn = actual.filter((a, i) => a === label && predicted[i] !== label).length
    const precision = tp + fp ? tp / (tp + fp) : 0
    const recall = tp + fn ? tp / (tp + fn) : 0
    const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0
    return { label, precision, recall, f1, support: tp + fn }
  })
  const total = actual.length
  const average = (key, weighted) =>
    perClass.reduce((sum, row) => sum + row[key] * (weighted ? row.support / total : 1 / perClass.length), 0)
  const confusion = labels.map((a) => labels.map((p) => actual.filter((x, i) => x === a && predicted[i] === p).length))
  return {
    accuracy: actual.filter((a, i) => a === predicted[i]).length / total,
    macro: { precision: average('precision'), recall: average('recall'), f1: average('f1') },
    weighted: { precision: average('precision', true), recall: average('recall', true), f1: average('f1', true) },
    perClass,
    labels,
    confusion,
  }
}

function printClassification(report, baseline, sweep, scope) {
  console.log(`\n━━ 1. Intent classification (TF-IDF + logistic regression, ${FOLDS}-fold stratified CV) ━━`)
  console.log(`Accuracy           ${pct(report.accuracy)}   (majority-class baseline ${pct(baseline)})`)
  console.log(`Macro    P/R/F1    ${pct(report.macro.precision)} / ${pct(report.macro.recall)} / ${pct(report.macro.f1)}`)
  console.log(`Weighted P/R/F1    ${pct(report.weighted.precision)} / ${pct(report.weighted.recall)} / ${pct(report.weighted.f1)}`)
  console.log(`Out-of-scope       ${pct(scope.unknownRecall)} of off-topic questions rejected, ${pct(scope.falseRejection)} of PipelineIQ questions wrongly rejected`)

  console.log(`\n${pad('intent', 17)}${padStart('precision', 10)}${padStart('recall', 9)}${padStart('f1', 8)}${padStart('n', 5)}`)
  for (const row of report.perClass) {
    console.log(`${pad(row.label, 17)}${padStart(pct(row.precision), 10)}${padStart(pct(row.recall), 9)}${padStart(pct(row.f1), 8)}${padStart(row.support, 5)}`)
  }

  const short = report.labels.map((label) => label.slice(0, 4))
  console.log('\nConfusion matrix (rows = actual, columns = predicted)')
  console.log(`${pad('', 17)}${short.map((s) => padStart(s, 5)).join('')}`)
  report.confusion.forEach((row, i) => console.log(`${pad(report.labels[i], 17)}${row.map((n) => padStart(n || '·', 5)).join('')}`))

  console.log('\nConfidence threshold for UNKNOWN (current value marked *)')
  for (const { threshold, accuracy, macroF1 } of sweep) {
    console.log(`  ${threshold === MIN_CONFIDENCE ? '*' : ' '} ${threshold.toFixed(2)}   accuracy ${pct(accuracy)}   macro F1 ${pct(macroF1)}`)
  }
}

// ─── Retrieval ──────────────────────────────────────────────────

function evaluateRetrieval(model, knowledge, cases, intentBoost) {
  const index = buildIndex(knowledge)
  let top1 = 0
  let top3 = 0
  let reciprocalRank = 0
  const misses = []
  for (const { query, expected } of cases) {
    const intent = predictIntent(model, query).intent
    const results = searchKnowledge(index, query, { intent, limit: 3, intentBoost }).map((r) => r.row.question)
    const rank = results.indexOf(expected) + 1
    if (rank === 1) top1 += 1
    if (rank >= 1) {
      top3 += 1
      reciprocalRank += 1 / rank
    } else misses.push({ query, expected, got: results[0] ?? '(nothing)' })
  }
  return { top1: top1 / cases.length, top3: top3 / cases.length, mrr: reciprocalRank / cases.length, misses }
}

// ─── Chatbot (live Gemini) ──────────────────────────────────────

const LIVE_QUESTIONS = [
  { question: 'What is PipelineIQ?', inScope: true },
  { question: 'How do I add a repository and send my first error?', inScope: true },
  { question: 'Why is my pipeline failing?', inScope: true },
  { question: 'Why am I not receiving Slack alerts?', inScope: true },
  { question: 'What does Fix PR ready mean?', inScope: true },
  { question: "I don't understand this PipelineIQ feature", inScope: true },
  { question: 'Who is the Prime Minister of India?', inScope: false },
  { question: 'Write a Python game for me', inScope: false },
]

// Share of the answer's content words that also appear in the retrieved context. A rough,
// automatic proxy: a grounded answer reuses the context's vocabulary.
function groundedness(answer, contextText) {
  const contextTokens = new Set(tokenize(contextText))
  const answerTokens = tokenize(answer).filter((token) => token.length > 2)
  return answerTokens.length ? answerTokens.filter((token) => contextTokens.has(token)).length / answerTokens.length : 0
}

async function evaluateLive(model, knowledge) {
  const { answerWithContext, OUT_OF_SCOPE_ANSWER } = await import('../src/services/helplineService.js')
  const { features } = await import('../src/config/env.js')
  if (!features.gemini) {
    console.log('\n━━ 3. Chatbot (live) ━━\nSkipped: GEMINI_API_KEY is not set in backend/.env')
    return null
  }
  const index = buildIndex(knowledge)
  const rows = []
  console.log('\n━━ 3. Chatbot (live Gemini) ━━')
  for (const { question, inScope } of LIVE_QUESTIONS) {
    const prediction = predictIntent(model, question)
    const started = Date.now()
    let answer
    let sources = []
    let error = null
    if (prediction.intent === UNKNOWN) answer = OUT_OF_SCOPE_ANSWER
    else {
      try {
        const result = await answerWithContext({ question, prediction, index })
        answer = result.answer
        sources = result.sources
      } catch (err) {
        error = err.message
      }
    }
    const latencyMs = Date.now() - started
    const context = knowledge.filter((k) => sources.some((s) => s.question === k.question)).map((k) => `${k.question} ${k.answer}`).join(' ')
    const row = {
      question,
      expectedInScope: inScope,
      intent: prediction.intent,
      scopeHandledCorrectly: inScope ? prediction.intent !== UNKNOWN : prediction.intent === UNKNOWN,
      latencyMs,
      groundedness: sources.length ? Number(groundedness(answer ?? '', context).toFixed(3)) : null,
      sources: sources.map((s) => s.question),
      answer: answer ?? null,
      error,
    }
    rows.push(row)
    console.log(`\nQ: ${question}\n   intent ${row.intent} · ${latencyMs} ms · scope ${row.scopeHandledCorrectly ? 'ok' : 'WRONG'}` +
      `${row.groundedness !== null ? ` · groundedness ${pct(row.groundedness)}` : ''}${error ? ` · ERROR ${error}` : ''}`)
    if (answer) console.log(`   ${answer.replace(/\n/g, '\n   ')}`)
  }
  const answered = rows.filter((r) => r.groundedness !== null)
  const summary = {
    scopeAccuracy: rows.filter((r) => r.scopeHandledCorrectly).length / rows.length,
    meanLatencyMs: Math.round(rows.filter((r) => r.intent !== UNKNOWN).reduce((s, r) => s + r.latencyMs, 0) / (rows.filter((r) => r.intent !== UNKNOWN).length || 1)),
    meanGroundedness: answered.length ? answered.reduce((s, r) => s + r.groundedness, 0) / answered.length : null,
    errors: rows.filter((r) => r.error).length,
  }
  console.log(`\nScope handled correctly ${pct(summary.scopeAccuracy)} · mean Gemini latency ${summary.meanLatencyMs} ms` +
    `${summary.meanGroundedness !== null ? ` · mean groundedness ${pct(summary.meanGroundedness)}` : ''} · errors ${summary.errors}`)
  console.log('Correctness and relevance need a human: read the answers above (also saved in the JSON report).')
  return { summary, rows }
}

// ─── Main ───────────────────────────────────────────────────────

const examples = loadIntentDataset()
const knowledge = readJson('knowledge.json')
const retrievalCases = readJson('retrieval_eval.json')
const counts = examples.reduce((acc, e) => ({ ...acc, [e.intent]: (acc[e.intent] ?? 0) + 1 }), {})
console.log(`Dataset: ${examples.length} labeled questions, ${Object.keys(counts).length} intents · knowledge: ${knowledge.length} entries · retrieval cases: ${retrievalCases.length}`)

const actual = examples.map((e) => e.intent)
const report = classificationReport(actual, crossValidate(examples, MIN_CONFIDENCE))
const baseline = Math.max(...Object.values(counts)) / examples.length
const sweep = [0.3, 0.4, 0.5, 0.6, 0.7].map((threshold) => {
  const r = classificationReport(actual, crossValidate(examples, threshold))
  return { threshold, accuracy: r.accuracy, macroF1: r.macro.f1 }
})
const unknownRow = report.perClass.find((r) => r.label === UNKNOWN)
const inScopeIndices = actual.map((a, i) => (a !== UNKNOWN ? i : -1)).filter((i) => i >= 0)
const rejectedColumn = report.labels.indexOf(UNKNOWN)
const wronglyRejected = report.labels.reduce((sum, label, row) => (label === UNKNOWN ? sum : sum + report.confusion[row][rejectedColumn]), 0)
const scope = { unknownRecall: unknownRow?.recall ?? 0, falseRejection: wronglyRejected / inScopeIndices.length }
printClassification(report, baseline, sweep, scope)

const fullModel = trainClassifier(examples)
const withIntent = evaluateRetrieval(fullModel, knowledge, retrievalCases, INTENT_BOOST)
const withoutIntent = evaluateRetrieval(fullModel, knowledge, retrievalCases, 1)
const strongBoost = evaluateRetrieval(fullModel, knowledge, retrievalCases, 1.25)
console.log('\n━━ 2. Knowledge retrieval (BM25 over helpline_knowledge) ━━')
console.log(`                     top-1    top-3    MRR`)
console.log(`BM25 + boost ×${INTENT_BOOST}   ${pad(pct(withIntent.top1), 9)}${pad(pct(withIntent.top3), 9)}${withIntent.mrr.toFixed(3)}`)
console.log(`BM25 only            ${pad(pct(withoutIntent.top1), 9)}${pad(pct(withoutIntent.top3), 9)}${withoutIntent.mrr.toFixed(3)}`)
console.log(`BM25 + boost ×1.25   ${pad(pct(strongBoost.top1), 9)}${pad(pct(strongBoost.top3), 9)}${strongBoost.mrr.toFixed(3)}`)
if (withIntent.misses.length) {
  console.log('\nNot in top 3:')
  for (const miss of withIntent.misses) console.log(`  "${miss.query}"\n     expected: ${miss.expected}\n     got:      ${miss.got}`)
}

const liveResults = live ? await evaluateLive(fullModel, knowledge) : null

fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true })
fs.writeFileSync(
  OUTPUT_FILE,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      dataset: { examples: examples.length, perIntent: counts, knowledgeEntries: knowledge.length, retrievalCases: retrievalCases.length },
      classification: { folds: FOLDS, minConfidence: MIN_CONFIDENCE, baselineAccuracy: baseline, ...report, outOfScope: scope, thresholdSweep: sweep },
      retrieval: { intentBoost: INTENT_BOOST, withIntentBoost: withIntent, bm25Only: withoutIntent, strongBoost125: strongBoost },
      chatbot: liveResults,
    },
    null,
    2,
  ),
)
console.log(`\nSaved ${path.relative(process.cwd(), OUTPUT_FILE)}`)
