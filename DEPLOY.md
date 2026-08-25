# SmartDriverAi — EasyPanel deployment checklist

Three services: **Postgres**, **api**, **web**. All config — no code changes.

The app is deliberately hostile to a half-configured production deploy: it
refuses to boot rather than come up quietly wrong. Section 6 lists every guard
and the exact message, because you will meet at least one of them.

## 0. Prerequisites

- [ ] Repo on GitHub: `alraqam/smartdriver.ai`
- [ ] DNS: one subdomain for the app, e.g. `app.smartdriver.ai`
- [ ] EasyPanel connected to GitHub
- [ ] A strong JWT secret: `openssl rand -hex 32`
- [ ] Eskiz.uz credentials — **required in production**, see §6
- [ ] An Anthropic API key (optional; without it the AI features run in a
      clearly-labelled mock mode and the app still works)

## 1. Project

- [ ] Create a project (e.g. **smartdriverai**). Services in it reach each other
      by service name on the internal network.

## 2. Service: Postgres (create first)

- [ ] Add service → **Postgres** template (v16)
- [ ] Note the generated user / password / db and the internal host (the service
      name, e.g. `smartdriverai_postgres`)
- [ ] Enable **scheduled backups** (S3) — the one operational must-do

## 3. Service: api

- [ ] Add **App** → GitHub → `alraqam/smartdriver.ai`, branch `main`
- [ ] Build: **Dockerfile**, build context **`api`** (not the repo root)
- [ ] Proxy: container port **3003**. It does not need its own domain — the web
      service proxies `/api` to it internally. Expose one only if you want the
      API reachable directly.
- [ ] Health check path: `/api/health`
- [ ] **Mount a volume at `/app/uploads`** — question diagrams live here.
      Without it every image vanishes on the next deploy.
- [ ] Environment:

```
NODE_ENV      = production
DATABASE_URL  = postgresql://<user>:<pass>@<postgres-service>:5432/<db>?schema=public
JWT_SECRET    = <openssl rand -hex 32>
JWT_EXPIRES_IN= 30d
CORS_ORIGINS  = https://app.smartdriver.ai
UPLOAD_DIR    = /app/uploads

# SMS — required in production, see §6
ESKIZ_EMAIL    = ...
ESKIZ_PASSWORD = ...
ESKIZ_FROM     = 4546

# AI — omit for mock mode; explanations and tutor replies then say so
ANTHROPIC_API_KEY = sk-ant-...
ANTHROPIC_MODEL   = claude-opus-5
TUTOR_DAILY_LIMIT = 30

# The first admin, see §5. Promote-only; it never demotes anyone.
ADMIN_PHONE = +998901234567
ADMIN_NAME  = Content Admin
```

Migrations run automatically at container start (`prisma migrate deploy`), so a
redeploy never serves traffic against an old schema.

## 4. Service: web

- [ ] Add **App** → same repo, branch `main`
- [ ] Build: **Dockerfile**, build context **`web`**
- [ ] Proxy: container port **80** → `app.smartdriver.ai` (HTTPS on)
- [ ] Environment:

```
API_UPSTREAM = <api-service>:3003      # e.g. smartdriverai_api:3003
```

`API_UPSTREAM` is the one that catches people. nginx proxies `/api` to it, and
the default (`api:3003`) is the docker-compose service name — on EasyPanel the
service is called something else, and a wrong value here is a site that loads
and then 502s on every request.

## 5. First run

1. **Sign in** on the domain with the `ADMIN_PHONE` number. The account is
   created at boot and signs in by SMS like any other; setting the variable
   grants the role, it does not create a password.
2. **Load content** — go to **Boshqaruv → Import** and upload, in this order:
   `content/topics.json`, `content/rules.seed.json`, `content/questions.seed.json`
   from the repo. Run the dry run first; the apply button only appears once it
   has. The CLI importer is *not* in the image (no `ts-node` in the runtime
   stage) — the admin screen is the supported path on a deployed instance.
3. **Check `Boshqaruv → Umumiy`.** It reports two things invisible to learners:
   published questions with no rule references (their AI explanations have
   nothing to cite) and references pointing at rules that do not exist.

## 6. The guards you will hit

Each of these stops the container rather than letting it serve traffic in a
state someone would have to discover from user reports.

| Condition | What happens |
|---|---|
| `NODE_ENV=production` and no `ESKIZ_EMAIL` / `ESKIZ_PASSWORD` | Refuses to boot: *"Eskiz would run in MOCK mode in production"*. In mock mode no SMS is sent and codes go to the log — nobody could sign in, and anyone with log access could sign in as anyone. |
| `JWT_SECRET` missing, under 16 chars, or the dev default | Refuses to boot. |
| `CORS_ORIGINS` unset in production | Boots, but **denies all cross-origin requests** and warns. Harmless when web and api share a domain through nginx; fatal if you split them. |
| `DATABASE_URL` missing or not `postgresql://` | Refuses to boot. |

The demo OTP display (the code shown on the sign-in screen) is off in
production automatically — it is gated on Eskiz mock mode, which production
cannot reach. `DEMO_SHOW_OTP=false` turns it off anywhere else.

## 7. Back up

Two things, not one:

- [ ] **Postgres** — accounts, progress, the question bank, the mistake bank
- [ ] **The uploads volume** — question diagrams. A question whose image is
      gone is a question nobody can answer, and it will not come back with a
      database restore.

## 8. After a deploy

- [ ] `GET /api/health` returns `{"status":"ok","db":"up","sms":"live","ai":...}`
      — check `sms` says **live**, not `mock`
- [ ] Sign in with a real phone and confirm the SMS arrives
- [ ] Start a mock exam and confirm it has the expected number of questions
- [ ] If `ai` says `live`, open one explanation and confirm it returns

## Scaling notes

- The API is stateless apart from `/app/uploads`. More than one replica needs
  that volume shared, or uploads land on whichever replica served the request.
- Rate limits are per-instance and in-memory: 120 req/min/IP globally, 5/min on
  OTP requests. Across replicas the effective limit multiplies by the replica
  count. Move to a shared store before that matters.
- The explanation cache is in Postgres, so it is shared correctly across
  replicas already.
