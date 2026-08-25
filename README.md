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

Then open http://localhost:5175.

### In containers

```bash
NODE_ENV=development docker compose up --build
```

Web on :8082, API on :3003, both proxied through nginx so images and the API
share an origin. Migrations run at container start, and uploads live on the
`uploads` volume.

The compose file defaults to `NODE_ENV=production`, where the API deliberately
**refuses to boot** without real Eskiz credentials and a strong `JWT_SECRET`.
That default is what makes a real deploy safe without anyone remembering to ask
for it — hence overriding it for a local smoke test rather than weakening it.

For a real deploy see **[DEPLOY.md](DEPLOY.md)** — an EasyPanel checklist
covering the volume the uploads need, the `API_UPSTREAM` value that decides
whether the site can reach its own API, how the first admin is minted, and every
guard that will stop the container rather than let it serve traffic
half-configured.

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
cd api && npm run lint && npm test && npm run test:e2e
```

Unit tests cover the parts where being wrong is silent: phone normalisation,
mastery/readiness scoring, question selection, option shuffling, the spaced
repetition schedule, the demo-OTP gate, and importer validation.

End-to-end tests drive the real HTTP surface against a **separate** database
(`smartdriverai_test`), so they can never touch development data — the setup
refuses to run if `DATABASE_URL` does not name it:

```bash
docker exec shared-postgres psql -U postgres -c "CREATE DATABASE smartdriverai_test OWNER smartdriverai;"
```

```bash
cd api && npx dotenv -e .env.test -- npx prisma migrate deploy && npm run test:e2e
```

They cover what a unit test structurally cannot see: that the answer key never
reaches the client for an unanswered question, that an exam answer stays
revisable until submission and that revising it does not double-count mastery,
that a mistake actually lands in the bank and is scheduled forward when
recalled, and that admin authority follows the database rather than the role
claim in a month-old token. The sign-in flow is driven over HTTP in one place
on purpose; everywhere else mints tokens directly, because the OTP endpoints
are rate limited and a suite that signs in per test spends that budget on
setup.

The frontend has its own suite over the pure derivations that were previously
inline in components — streaks, road-node status, review due-dates:

```bash
cd web && npm test
```

Writing it caught a real bug: the "give a new learner somewhere to stand"
fallback fired whenever no topic was current, which includes the case where a
learner has **mastered every topic** — relabelling their first finished topic
"you are here" and undoing the one thing the road exists to show.

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
   that genuinely need diagrams. Uploads exist now, so this is a content job
   rather than a missing feature.
5. **No payments.** Everything is free in v1.

**Every response carries a request id** (`X-Request-Id`, and `requestId` in any
error body). It is eight hex characters so a learner can read it down a phone,
and it is the join between "it said `a3f19c2b`" and the one log line holding the
stack. Requests are logged with method, path, duration, user — and a **masked**
phone, because "which user" has to be answerable while a log quietly
accumulating full phone numbers is a PII store nobody decided to build. Bodies
are never logged: the two busiest endpoints carry a phone and a one-time code.
Health checks and image requests are excluded, or they drown everything else.

An unhandled error returns a generic message and the request id, never the
underlying text — an unhandled error is by definition one nobody wrote a
message for, and its wording tends to name tables, files and queries.

### Contrast and focus

The palette is measured against WCAG AA, not eyeballed. Every semantic colour
carries **two** values, because one cannot do both jobs: a colour light enough
to read as text on a dark surface is too light for white text to sit on. The
design's `#3AA2FF` reads at 7.0 against the dark background but left white at
**2.7** — that was the primary call to action, the active nav item and the "you
are here" badge. `a` / `success` / `danger` / `warn` are for text and vary by
theme; the `*Fill` values are backgrounds white sits on and all clear 5:1.

Focus is the one piece of interaction styling in `styles.css` rather than an
inline style, because an inline style cannot express `:focus-visible`. There
was previously no focus indicator at all beyond the browser default, which
disappears against a filled accent button. It draws two rings — a contrasting
halo then the accent — so it survives landing on a pale card or a saturated
button.

Both were verified by measuring every text node on every route in both themes,
excluding gradients (unsampleable) and disabled controls (which WCAG 1.4.3
exempts).

---

## Admin

Content operations for whoever maintains the question bank. Everything is under
`/api/admin` and guarded by `AdminGuard`.

| | |
|---|---|
| `POST /admin/import` | Bulk load. Same code path as the CLI — kind detected from the file's shape, whole file validated before anything is written, upsert key makes a re-import a no-op. Takes `dryRun` and `allowMassRetire`. |
| `GET /admin/questions` | Review queue. Filter by `status`, `topicId`, `q` (searches both locales and `externalId`), with `skip`/`take`. |
| `PATCH /admin/questions/:id/status` | Publish or retire one, stamping `reviewedAt`. |
| `POST /admin/questions/status` | Same for a batch — a reviewer clearing a queue should not make one request per question. Ids that do not exist are **reported**, not silently dropped. |
| `GET /admin/imports` | Load history. |
| `GET /admin/stats` | Counts by status and topic, plus two content-health figures invisible to learners: published questions with no `ruleRefs` (their explanations have nothing to cite) and `ruleRefs` pointing at rules that do not exist. |
| `GET /admin/ai-usage` | Spend by feature, and how many explanations are cached — i.e. calls that never had to be made twice. |
| `POST /admin/uploads` | Store a question diagram, returns the URL to reference it by. |
| `PATCH /admin/questions/:id` | Attach or clear that image (`imageUrl: null` removes it). |

The web app renders all of this under **Boshqaruv / Управление** in the
sidebar, visible only to an admin: an overview with content-health warnings and
AI spend, the review queue with multi-select and bulk publish/retire, and an
import tab that runs a dry run before it will let anything be applied.

**Authority is re-read from the database on every admin request**, rather than
trusted from the `role` claim in the JWT. Tokens live 30 days, so a role claim
in one can be a month out of date, and rewriting the question bank is not
authority to leave standing on a stale claim. It costs one indexed lookup, and
only on `/admin` routes.

To mint the first admin, set `ADMIN_PHONE` (and optionally `ADMIN_NAME`) and
restart. It is promote-only and never demotes, so clearing it later does not
strip access from whoever is running content. The account is created if absent;
they then sign in by OTP like anyone else. There is deliberately no self-serve
promotion endpoint — the person who can deploy is the person who can appoint an
admin, which is the authority they already have.

### Question diagrams

`POST /admin/uploads` takes one image and returns a URL; the review queue has a
per-row control that uploads and attaches in two clicks. Three things worth
knowing:

- **The format is decided by the file's magic bytes, not its name or declared
  MIME type** — both of those come from the client and neither is evidence. An
  HTML file renamed `.png` is rejected.
- **SVG is refused outright.** It can carry script, and one served from the
  app's own origin would be stored XSS against every learner who opened that
  question. PNG, JPEG and WEBP only.
- **The filename is the sha256 of the contents.** The client's filename never
  touches the filesystem, so there is no path traversal to defend against;
  re-uploading the same diagram is free rather than a duplicate; and the name
  changes whenever the bytes do, so the file is served `immutable`.

`imageUrl` only accepts a path this API produced — a full URL would let an
admin point every question at a third party who then sees every learner.

In Docker, uploads live on the `uploads` volume. **Back it up with the
database**: a question whose image is gone is a question nobody can answer.

Import bodies get a 25 MB limit on that one route (the seed file alone exceeds
Express's 100 KB default); every other route keeps 1 MB.

---

## On a phone

The app is responsive and installable. Below **900px** the desktop shell is
replaced rather than squeezed:

- the 248px sidebar becomes a **bottom tab bar** — Yo'l, Mavzular, Xatolar
  (carrying the due-review badge), Ustoz, Profil
- the centred, rounded panel goes **full-bleed**: no card, no radius, no shadow
- `env(safe-area-inset-*)` keeps the header clear of the notch and the tabs
  clear of the home indicator

Eight sidebar entries do not fit five tabs, so two are re-homed rather than
crammed in. The **mock exam** already sits at the finish flag at the end of the
road. The **sign library** gets a button in the topic-list header — including on
that screen's error state, because it is the one thing still worth reaching when
nothing else loaded. Admin, the language and theme toggles and sign-out all live
in Profil.

The tab bar is a flex sibling of the panel, not an overlay. Every screen is
`position: absolute; inset: 0`, so being a sibling confines them above the bar
automatically — no page has to know it exists, and the road's floating
"continue" button lands on top of it rather than underneath.

The road is the one screen with hand-computed geometry. Its swing is now capped
by the measured container width, because a node is a 64px tile plus a 104px
label and so reaches 89px either side of the tarmac: at 375px the original fixed
column pushed the outermost labels off both edges. Desktop is unchanged — the
swing was never the binding constraint inside a 560px panel.

### Installing, and what offline actually means

`web/public/manifest.webmanifest` plus a hand-written `web/public/sw.js`, ~60
lines, registered in production builds only. A build-time PWA plugin would have
been the largest dependency in a frontend that has three.

Icons are generated, not drawn: `node web/scripts/make-icons.mjs` writes the
192/512/maskable/apple-touch/favicon PNGs with nothing but Node's `zlib`. They
are committed; the script exists so the mark is reproducible.

**`/api` is never cached.** Auth, sessions, exams and the tutor must be live. A
cached exam paper or a cached `/auth/me` is worse than being honestly offline,
and answering against a stale session would silently lose progress. So:
navigation is network-first falling back to the cached shell, `/assets/` is
cache-first (the filenames are content-hashed), Google Fonts are
stale-while-revalidate, and nothing else is touched.

So offline you get **the shell and the 25-sign library**, because the sign
catalog is bundled rather than fetched. **Practice, exams and the tutor need a
connection** and fail through the app's normal error UI. This is not offline
practice — that needs question sync and answer queueing, which is a real feature
and not a side effect of a service worker.

Two things had to change to make that true rather than merely plausible.
`/auth/me` failing used to sign the learner out, so going offline bounced them
to a login screen they could not complete without a network; a 401 still signs
out, but a request that got **no answer at all** now leaves the stored session
alone. And the api client marks those as status 0, which `ErrorNote` renders as
a translated "no connection" rather than the browser's English "Failed to
fetch".

Bump `VERSION` in `sw.js` when changing it — old caches are dropped on activate,
so a deploy cannot leave a phone pinned to last month's bundle. nginx serves
`/sw.js` with `no-cache` for the same reason.

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
