# PipelineIQ Helpline

An in-app assistant that answers questions **about PipelineIQ only**. It is the Data Science / NLP component of the project: question preprocessing, intent classification, keyword retrieval from Supabase, a grounded Gemini answer, and an evaluation script.

```
User ─▶ Help button (every page) ─▶ signed in? no ─▶ "Log In / Sign Up" prompt, no request
                                        │ yes
                                        ▼
                          POST /api/helpline/chat (requireAuth)
                                        │
                     ┌──────────────────┴──────────────────┐
                     ▼                                     ▼
           Intent classifier                     Supabase helpline_knowledge
   (TF-IDF + logistic regression)              (read as the user, RLS, BM25 ranking)
                     │                                     │
         UNKNOWN? ── fixed "PipelineIQ only" reply         │
                     └──────────────────┬──────────────────┘
                                        ▼
                    existing aiService.generateContent (Gemini)
                                        ▼
                             grounded PipelineIQ answer
```

There is no vector database, no embeddings, no RAG framework, no Python service and no second AI provider.

## Setup (once)

1. **Create the table.** In Supabase, open the SQL Editor and run `supabase/migrations/20261006000005_helpline_knowledge.sql`. It only creates the new table `helpline_knowledge` and changes nothing else. It is safe to run twice. Fresh installs that use `supabase/setup_all.sql` already include it.
2. **Load the starter knowledge:**
   ```powershell
   cd backend
   npm run helpline:seed
   ```
   This inserts the 57 entries from `backend/src/helpline/data/knowledge.json` whose question is not in the table yet. It never updates or deletes existing rows.
3. Restart the backend. Click the round help button at the bottom right of any page.

The button is shown to everyone, including on the landing and login pages, but only signed-in users get answers. A signed-out user who asks a question gets a "please log in or create an account" message with **Log In** and **Sign Up** buttons (both open the existing `/login` page, in sign-in or sign-up mode), and no request is sent. The question stays in the input so it can be sent again after logging in. This check is only for convenience: the API itself still rejects requests without a valid session (401). The conversation is cleared on logout.

No new environment variables are needed. The helpline uses the existing `GEMINI_API_KEY`, `GEMINI_MODEL` and Supabase settings.

## Teaching the bot something new

The database is the source of truth. A new feature needs one insert:

```sql
insert into public.helpline_knowledge (category, question, answer, keywords)
values ('pipeline', 'How do I ...?', 'Step-by-step answer ...', array['keyword', 'another keyword']);
```

- `category` should be one of the intents in lowercase (see below). It gives the entry a small ranking boost for matching questions.
- `keywords` are extra search terms, such as synonyms or the words users actually type.
- To hide an entry without deleting it: `update public.helpline_knowledge set is_active = false where question = '...'`.
- Changes are picked up within a minute, because the knowledge is cached for 60 seconds.

If the new feature also brings new kinds of questions, add a few labeled examples to `backend/src/helpline/data/intents.csv` and run `npm run helpline:eval`.

## How a question is answered

1. **Validation.** An empty question returns 400 with "Please enter a PipelineIQ-related question.". Questions are limited to 1000 characters.
2. **Preprocessing** (`helpline/textPreprocess.js`):
   - lowercase the text and keep only letters and digits
   - remove stopwords. Question words such as *how*, *why* and *what*, and the words *my* and *not*, are kept because they carry intent.
   - map synonyms, for example *repo → repository* and *notification → alert*
   - apply a small suffix-stripping stemmer, for example *failing / failed → fail*
   - add bigrams, for example *push_monitor*
3. **Intent classification** (`helpline/intentClassifier.js`):
   - TF-IDF uses sublinear term frequency, smoothed idf and L2 normalization.
   - Multinomial logistic regression (softmax) is trained with SGD and L2 regularization. Training is deterministic.
   - The model trains from `data/intents.csv` on the first question and takes well under a second.
   - The question is **UNKNOWN** (out of scope) when UNKNOWN is the most likely class, or when it uses no PipelineIQ vocabulary and confidence is below 0.5.
   - The *domain lexicon* is learned from the data: words that appear in PipelineIQ questions and never in the off-topic examples.
   - UNKNOWN questions get a fixed reply and never reach Supabase or Gemini.
4. **Retrieval** (`helpline/knowledgeSearch.js`):
   - Active rows are read from `helpline_knowledge` through the user's RLS-scoped client and ranked with **BM25**. The question and keywords count twice.
   - Entries in the predicted category get ×1.05. This only breaks near-ties, because a larger boost scored worse in evaluation.
   - Up to 3 entries above an absolute and a relative score threshold are kept.
5. **User-specific context.** This applies only to "my / our …" questions classified as pipeline, troubleshooting, error or incident:
   - the user's latest 3 active push-monitoring alerts and/or 3 open errors, read through the same RLS-scoped client, so only their own repositories are visible
   - only short summaries are used (repository, status, severity, title, Gemini's earlier root cause), and they are redacted with `redactSecrets`
6. **Gemini** (`services/helplineService.js`):
   - calls the existing `aiService.generateContent` in text mode
   - the prompt allows only the supplied context, forbids inventing features, says what to do when the context is insufficient, and treats the user question as data
   - the question is redacted before it is sent
   - when no knowledge matches, Gemini is told so and replies that it lacks PipelineIQ-specific information
7. **Failures.**
   - Gemini errors, empty Gemini answers, Supabase errors, or a missing Gemini key return 503 with "Sorry, the PipelineIQ Helpline is temporarily unavailable. Please try again."
   - In the browser, the widget sits inside its own error boundary, so it can never take the dashboard down.

### API

`POST /api/helpline/chat` (Bearer Supabase token, like every dashboard route)

```json
{ "message": "Why is my pipeline failing?" }
```

```json
{
  "data": {
    "intent": "TROUBLESHOOTING",
    "confidence": 0.97,
    "answer": "1. Open Push monitoring ...",
    "sources": [{ "category": "troubleshooting", "question": "Why is my pipeline failing?" }]
  }
}
```

## Intents

| Intent | Covers |
|---|---|
| GENERAL | what PipelineIQ is, features, how it works, tech stack |
| GETTING_STARTED | first steps, setup order, running locally |
| DASHBOARD | stat cards, 14-day chart, repository health, system status, API pill |
| REPOSITORY | adding repositories, monitoring toggle, DSN, SDK |
| ERROR | grouping/fingerprints, severity, AI diagnosis, statuses, regressions, search |
| INCIDENT | when incidents open, statuses, GitHub issues |
| PIPELINE | push monitoring, CI failure diagnosis, fix PRs, statuses, `[skip pipelineiq]` |
| INTEGRATION | GitHub App, Slack, Gemini, Redis/worker |
| NOTIFICATION | when Slack alerts are sent and what they contain |
| ACCOUNT | sign up/in, password, display name, theme, data privacy |
| TROUBLESHOOTING | things not working |
| UNKNOWN | anything not about PipelineIQ |

There is no REPORTS intent because PipelineIQ has no reports feature. Settings questions belong to ACCOUNT, because the Settings page only covers profile, password and appearance.

## Evaluation

```powershell
cd backend
npm run helpline:eval            # offline, no credentials
npm run helpline:eval -- --live  # also asks Gemini 6 questions (uses GEMINI_API_KEY)
```

The full report is saved to `backend/simulation-output/helpline-eval.json` (git-ignored).

Results at the time of writing (311 labeled questions, 12 intents, 57 knowledge entries, 57 retrieval cases):

| Metric | Result |
|---|---|
| Intent accuracy (5-fold stratified CV) | **75.6%** (majority-class baseline 16.1%) |
| Macro precision / recall / F1 | 75.3% / 74.5% / 74.4% |
| Off-topic questions rejected (UNKNOWN recall) | 90.0% |
| PipelineIQ questions wrongly rejected | 2.3% |
| Retrieval top-1 / top-3 / MRR | **96.5% / 98.2% / 0.974** |
| Retrieval with a stronger ×1.25 intent boost | 94.7% / 98.2% / 0.965 |
| Live: scope handled correctly | 8/8 |
| Live: groundedness proxy (answer words found in the retrieved context) | 85.5% mean |
| Live: Gemini latency | ~10–27 s. Google returned 503 for the primary model during the run, so the existing fallback chain was used |

How to read these numbers:

- Cross-validation tests every question on a model that never saw it, so 75.6% is a pessimistic estimate for new phrasings.
- Most confusions are between neighboring topics, such as PIPELINE and TROUBLESHOOTING. These rarely hurt the answer, because retrieval does not depend on the exact intent.
- The intent is used for three things: the out-of-scope gate, a tie-break boost in retrieval, and as context in the prompt.
- Correctness and relevance of the generated answers need human review. The live mode prints every answer for that.

## Tests

`backend/tests/helpline.test.js` has 31 tests. They cover:

- preprocessing, the classifier (including out-of-scope cases) and BM25 ranking
- authentication (no token, invalid token)
- empty and over-long messages
- grounded answers built from Supabase knowledge, which is read through the user's RLS client and never the service role
- personal context for "my pipeline" questions, redacted
- out-of-scope questions answered without Gemini or Supabase
- the no-knowledge prompt
- secrets redacted from questions
- Gemini failure, exception and empty answer, and Supabase failure, each returning 503
- a failed personal-context lookup still producing an answer
- knowledge caching

## Limitations

- **Single-turn.** Each question is answered on its own, so follow-ups such as "and how do I fix that?" have no memory of the previous question. Chat history is not stored.
- **Keyword retrieval.** BM25 matches words, not meaning. A question phrased with none of the entry's words can miss. Adding keywords to the entry is the fix.
- **Static training set.** The intent classifier learns from `intents.csv`, not from the database. New topics need a few labeled examples there.
- **No rate limit.** There is no per-user rate limit on the endpoint. The rest of the API has none either.
- **Demo mode.** `npm run demo` (the mock backend) has no helpline route, so the widget shows the mock's "not available" message there.
