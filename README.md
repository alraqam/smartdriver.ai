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
web/       Vite + React, desktop web app     → :5175 (dev), :8082 (docker)
content/   seed questions, rules, topics + the import format
```

The interface implements the **SmartDriverAi Web App** design from Claude
Design: a fixed sidebar over a centred panel, light and dark themes, and the
"road ahead" home screen where progress is a literal winding road. See
[The UI](#the-ui) for what was adapted and why.

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

**Practice** comes in four modes. `practice` is a single topic with immediate
feedback; `weak_topics` weights selection toward what the learner keeps missing
(and toward topics they have never opened, which rank higher still); `exam` is a
timed mock spread evenly across topics, with no feedback until the end; `review`
drills whatever the mistake bank says is due.

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

**The mistake bank** is the retention loop. A question enters it the moment a
learner gets it wrong and comes back on a Leitner schedule (due now, then 1, 3,
7 and 16 days), leaving only after five correct recalls spread over about a
month. Any later miss sends it straight back to the start, including a question
that had already graduated — forgetting a rule you had fixed is exactly the
signal worth catching. It is deliberately *not* a schedule over the whole
question bank: with several hundred items, scheduling everything buries the
handful someone actually struggles with. Complementary to topic mastery, not a
duplicate of it — mastery is per topic and drives readiness and weak-topic
weighting; this is per question and drives retention. Exam answers feed it too.

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
mastery/readiness scoring, question selection, option shuffling, the spaced
repetition schedule, the demo-OTP gate, and importer validation.

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
6. **No admin HTTP endpoints yet.** Content is imported with the CLI
   (`npm run content:import`), which needs shell access to the server. The
   original plan called for `POST /admin/import` and a draft-review queue so a
   content person could work without a terminal; that is still to build.

---

## The UI

Ported from the Claude Design project **SmartDriverAi → `SmartDriverAi Web
App.html`**. The design was a prototype running on hardcoded data with no auth,
so it was implemented as the real app's interface rather than copied verbatim.
Three deliberate departures:

**Locales are uz + ru, not uz + en.** The design shipped Uzbek and English; the
product targets Uzbekistan, so the English strings were translated to Russian.

**No invented gamification.** The prototype showed XP, a level ("Lv 4") and
quiz "hearts". None has anything behind it in the data, and rendering invented
numbers in a live app is worse than omitting them. What survives is what is
real: the streak is derived from actual session dates, accuracy and readiness
come from mastery. Hearts are gone outright — a lives mechanic that ends a
study session early is hostile in exam prep.

**Nothing is locked.** The prototype's road had locked stops. Every topic here
stays open: refusing to let an adult practise pedestrians until they finish
signals is gamification getting in the way of studying. A road node is only
inert when the topic genuinely has no questions imported.

What maps onto real data:

| Design screen | Backed by |
|---|---|
| The road, with a stop per module | The 12 real topics; node state comes from mastery |
| Lesson detail | `GET /topics/:id/rules` — the rule sections the topic's questions cite, ordered by how many lean on each |
| Quiz | A real `practice` session, with **Why?** calling the explanation endpoint |
| Mock exam | A real `exam` session — the server picks the questions, owns the clock and scores it |
| Sign library | Static; the one screen with no backend, deliberately |
| Profile | Real readiness, weak topics and coverage |

The mock-exam runner is why `answer()` now lets an **exam** answer be revised
until submission: navigating back to change your mind is how the real test
works. Exam scoring and mastery are applied once, at `finish()`, so revising
cannot double-count. Practice answers stay final — feedback has already been
shown, so changing one afterwards would only be a way to fake a score.
