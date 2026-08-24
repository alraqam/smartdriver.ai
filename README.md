# SmartDriverAI

AI-assisted driving-licence theory exam prep for Uzbekistan. A learner signs in
with their phone, practises official traffic-rule questions by topic, takes
timed mock exams, and gets an AI explanation of every question they miss. The
app tracks which topics they keep failing, weights practice toward those, and
shows an exam-readiness score. A tutor chat answers free-form rules questions,
grounded in the rule text and citing it.

Uzbek and Russian throughout. Mobile-first web app.

```
api/       NestJS + Prisma + Postgres        → :3003
web/       Vite + React, mobile-first        → :5175 (dev), :8082 (docker)
content/   seed questions, rules, topics + the import format
```

---

## Running it

Postgres comes from the shared infra stack, with a `smartdriverai` database and
role:

```bash
docker compose -f ../_shared-infra/docker-compose.yml up -d
```

```bash
docker exec shared-postgres psql -U postgres -c "CREATE ROLE smartdriverai LOGIN PASSWORD 'smartdriverai' CREATEDB;" -c "CREATE DATABASE smartdriverai OWNER smartdriverai;"
```

API:

```bash
cd api && npm install && npx prisma migrate dev && npm run start:dev
```

Content (topics first — questions reference them):

```bash
cd api && npm run content:import -- ../content/topics.json ../content/rules.seed.json ../content/questions.seed.json
```

Web:

```bash
cd web && npm install && npm run dev
```

Then open http://localhost:5175. Or run the whole thing in containers with
`docker compose up --build` (web on :8082) — note that `NODE_ENV=production` in
the compose file makes the API refuse to boot without real Eskiz credentials,
by design; see below.

---

## Mock mode

Both external services degrade to a mock instead of failing, so the entire app
runs offline, in CI, and on a laptop with no credentials:

| Unset | Behaviour |
|---|---|
| `ESKIZ_EMAIL` / `ESKIZ_PASSWORD` | No SMS is sent. **The OTP is shown in the sign-in screen and prefilled**, and also printed to the API log as `[MOCK SMS]`. |
| `ANTHROPIC_API_KEY` | Explanations and tutor answers are canned and say so. Nothing is written to the explanation cache, so configuring a real key later does not leave placeholder text behind. |

`GET /api/health` reports which mode each one is in.

In production the API **refuses to start** in Eskiz mock mode: nobody could
sign in, and anyone with log access could sign in as anyone.

### The demo OTP display

Showing a one-time code in the UI defeats the point of sending it
out-of-band, so it is gated three ways and cannot reach production:

1. Only when Eskiz is in **mock mode** — the code was never sent by SMS, so it
   is not a secret in the first place.
2. Never when `NODE_ENV=production`.
3. Never when `DEMO_SHOW_OTP=false`.

Gates 1 and 2 overlap deliberately: `assertRequiredConfig()` in `main.ts`
already refuses to boot production in mock mode, so gate 1 alone is
sufficient — gate 2 is there in case someone ever weakens that assertion. The
API logs a loud `DEMO MODE` warning at boot whenever the echo is active, and
`src/auth/auth.service.spec.ts` pins all three conditions.

To demo with the display off, set `DEMO_SHOW_OTP=false` and read the code from
the API log instead.

---

## How it works

**Auth** is phone + SMS OTP. Codes are stored as bcrypt hashes, expire in 5
minutes, burn after 5 wrong guesses, and are superseded the moment a new one is
issued. Phone numbers are normalised to E.164 on the way in, so every way of
typing one number resolves to the same account.

**Practice** comes in three modes. `practice` is a single topic with immediate
feedback; `weak_topics` weights selection toward what the learner keeps missing
(and toward topics they have never opened, which rank higher still); `exam` is a
timed mock spread evenly across topics, with no feedback until the end.

Two things the quiz engine does that are easy to get wrong:

- The correct answer is **never sent to the client for an unanswered question**.
  Reveal is decided per item, not per session.
- Options are **shuffled deterministically per item**. The seed bank listed the
  correct answer first in all 54 questions, which made "always pick the first
  option" score 100%. The shuffle is stable, so review shows the same order.

**Mastery** is an exponentially-weighted moving average per topic, discounted
toward neutral while the evidence is thin so a 1-of-1 topic cannot claim
mastery. **Readiness** blends mastery across *every* topic (so untouched topics
count against you) with recent mock-exam scores, and reports its own
`confidence` rather than dressing up a guess.

**AI explanations** are cached in Postgres per (question, locale, wrong answer,
prompt version). A question is explained once and served from the database
forever after — this is what keeps API spend flat as usage grows. Bumping
`PROMPT_VERSION` in `api/src/ai/explain.service.ts` invalidates the cache with
no migration.

**The tutor** retrieves rule sections with Postgres full-text search and answers
only from them, citing codes like `[PDD-6.2]`. When retrieval finds nothing it
declines outright rather than answering from general knowledge — traffic law
differs by country and a confident wrong answer here can get someone failed or
hurt. Answers stream over SSE.

---

## Content

`content/schema.md` documents the import format. The importer upserts on a
stable key, so **re-running an import is a no-op, not a duplicate**, and it
validates the whole file before writing anything. It refuses an import that
would retire more than 20% of the live bank unless you pass
`--allow-mass-retire`.

```bash
cd api && npm run content:import -- ../content/questions.seed.json --dry-run
```

The seed set is 12 topics, 20 rule sections and 54 questions — enough to
demo every screen. It is **not** the real bank, and the rule text in
`rules.seed.json` should be checked against the official source before anyone
studies from it.

---

## Tests

```bash
cd api && npm run lint && npm test
```

Unit tests cover the parts where being wrong is silent: phone normalisation,
mastery/readiness scoring, question selection, option shuffling, and importer
validation.

Retrieval cannot be unit tested — it is a SQL query against real content — so
it has its own eval against the live database:

```bash
cd api && npm run eval:retrieval
```

It reports top-1 / top-k accuracy on questions phrased the way a learner would
phrase them, and checks that off-corpus questions return nothing. Extend
`api/test/retrieval-cases.json` as the real rule corpus lands; that file is the
only thing standing between the tutor and confidently citing the wrong rule.

Current: **top-1 12/14, top-k 14/14, off-corpus 4/4 clean** on the seed corpus.

---

## Known gaps

1. **Exam parameters** are seeded as 20 questions / 25 minutes / 2 errors
   allowed, in the `Setting` table (`GET /api/meta/exam`, no deploy needed to
   change). Confirm against the current official rules.
2. **The rule corpus is a 20-section starter set.** The tutor is only as good
   as it — it will decline a lot of legitimate questions until the full
   traffic-rules text is imported. Retrieval precision also improves on its own
   as the corpus grows, because document-frequency statistics are close to
   meaningless across twenty sections.
3. **Question images.** Many real questions are diagrams. The schema and UI
   carry `imageUrl`, but no seed question has one, and there is no image
   hosting yet — files are served from the web container.
4. **`signs` and `markings` have one question each.** They are the two topics
   that genuinely need diagrams, so they are thin until images exist.
5. **No payments.** Everything is free in v1.
