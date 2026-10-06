// Ranks Helpline knowledge rows (loaded from the Supabase table helpline_knowledge) against a
// question with BM25, the classic keyword relevance score used by search engines. No embeddings.
//
// Each entry is indexed on its question and keywords (counted twice, they are the most specific
// text) plus its answer. Entries whose category matches the detected intent get a small boost that
// only breaks near-ties: in evaluation a larger boost lowered top-1 accuracy, because a wrongly
// predicted intent then pulls in the wrong entry (see npm run helpline:eval).
import { tokenize } from './textPreprocess.js'

const K1 = 1.2
const B = 0.75
export const INTENT_BOOST = 1.05
// Results must clear an absolute score and be reasonably close to the best match, so weak
// matches are not passed to Gemini as if they were relevant.
export const MIN_SCORE = 1.5
const MIN_RELATIVE_SCORE = 0.4

export function buildIndex(rows) {
  const documents = rows.map((row) => {
    const keywords = (row.keywords ?? []).join(' ')
    const tokens = tokenize(`${row.question} ${row.question} ${keywords} ${keywords} ${row.answer}`)
    const termFrequency = new Map()
    for (const token of tokens) termFrequency.set(token, (termFrequency.get(token) ?? 0) + 1)
    return { row, termFrequency, length: tokens.length }
  })

  const documentFrequency = new Map()
  for (const doc of documents) for (const token of doc.termFrequency.keys()) documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1)
  const averageLength = documents.reduce((sum, doc) => sum + doc.length, 0) / (documents.length || 1)

  return { documents, documentFrequency, averageLength, size: documents.length }
}

function bm25(index, doc, queryTokens) {
  let score = 0
  for (const token of queryTokens) {
    const tf = doc.termFrequency.get(token)
    if (!tf) continue
    const df = index.documentFrequency.get(token)
    const idf = Math.log(1 + (index.size - df + 0.5) / (df + 0.5))
    score += (idf * tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * doc.length) / index.averageLength))
  }
  return score
}

// Returns up to `limit` [{ row, score }], best first.
export function searchKnowledge(index, question, { intent, limit = 3, minScore = MIN_SCORE, intentBoost = INTENT_BOOST } = {}) {
  const queryTokens = [...new Set(tokenize(question))]
  if (!queryTokens.length || !index.size) return []

  const category = intent?.toLowerCase()
  const scored = index.documents
    .map((doc) => {
      const score = bm25(index, doc, queryTokens)
      return { row: doc.row, score: doc.row.category === category ? score * intentBoost : score }
    })
    .filter((result) => result.score >= minScore)
    .sort((a, b) => b.score - a.score)

  const best = scored[0]?.score ?? 0
  return scored.filter((result) => result.score >= best * MIN_RELATIVE_SCORE).slice(0, limit)
}
