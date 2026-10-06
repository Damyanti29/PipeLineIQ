// Text preprocessing for the Helpline. The intent classifier, the knowledge search and the
// evaluation script all use these functions, so a question is processed the same way everywhere.
//
//   "Why are my Slack notifications failing?"
//   → lowercase, keep letters/digits      why are my slack notifications failing
//   → drop stopwords                      why my slack notifications failing
//   → map synonyms                        why my slack alert failing
//   → stem                                why my slack alert fail

// Very common words that carry no meaning here. Question words (how, why, what) and "my" / "not"
// are kept on purpose: they separate "how does X work" from "why is my X broken".
const STOPWORDS = new Set(
  `a an the is are was were be been being am do does did doing to of in on at for from by with about as into
   and or but if then so than that this these those it its i me we us you he she they them their there here
   can could would should will shall may might must have has had having just very also please hi hello hey
   thanks thank some any one get got`.split(/\s+/),
)

// Different words users use for the same PipelineIQ concept.
const SYNONYMS = {
  repo: 'repository',
  repos: 'repository',
  notification: 'alert',
  notifications: 'alert',
  notify: 'alert',
  notified: 'alert',
  login: 'signin',
  logon: 'signin',
  signup: 'register',
  pr: 'pullrequest',
  prs: 'pullrequest',
  bugs: 'bug',
  exception: 'error',
  exceptions: 'error',
  cant: 'not',
  dont: 'not',
  doesnt: 'not',
  isnt: 'not',
  wont: 'not',
  never: 'not',
}

const VOWEL = /[aeiouy]/

// A small, explainable suffix-stripping stemmer (in the spirit of Porter's first steps):
// failing / failed / fails → fail, repositories → repository, configure / configured → configur.
export function stem(word) {
  if (word.length <= 3 || /\d/.test(word)) return word
  let w = word
  // Plurals first, so "settings" and "setting" end up the same.
  if (w.endsWith('ies') && w.length > 4) w = `${w.slice(0, -3)}y`
  else if (w.endsWith('s') && !/(ss|us|is)$/.test(w)) w = w.slice(0, -1)

  let strippedVerbEnding = false
  if (w.endsWith('ing') && w.length > 5 && VOWEL.test(w.slice(0, -3))) {
    w = w.slice(0, -3)
    strippedVerbEnding = true
  } else if (w.endsWith('ed') && w.length > 4 && VOWEL.test(w.slice(0, -2))) {
    w = w.slice(0, -2)
    strippedVerbEnding = true
  }

  // running → runn → run, stopped → stopp → stop
  if (strippedVerbEnding && /([^aeiouslz])\1$/.test(w)) w = w.slice(0, -1)
  if (w.endsWith('e') && w.length > 3) w = w.slice(0, -1)
  return w
}

// Normalized word tokens of a text.
export function tokenize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((word) => word.length > 1 && !STOPWORDS.has(word))
    .map((word) => stem(SYNONYMS[word] ?? word))
}

// Classifier features: unigrams plus bigrams, so "not working" and "push monitoring" count as phrases.
export function extractFeatures(text) {
  const tokens = tokenize(text)
  const bigrams = tokens.slice(1).map((token, i) => `${tokens[i]}_${token}`)
  return [...tokens, ...bigrams]
}
