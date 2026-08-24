# Content import format

Three file kinds, each a JSON array. Load them in this order — questions
reference topics by `topicSlug`, so topics must exist first.

```bash
npm run content:import -- ../content/topics.json
npm run content:import -- ../content/rules.seed.json
npm run content:import -- ../content/questions.seed.json
```

Add `--dry-run` to validate and report without writing anything.

Every file is upserted on a stable key, so **re-running an import is a no-op**,
not a duplicate. Nothing is ever deleted: a question dropped from a later file
is left alone, and a question you want gone is retired by setting
`"status": "retired"` on it. That way historical practice sessions always still
resolve to the question that was actually asked.

The file kind is detected from the shape of the first element, so the filename
does not matter.

---

## topics

Key: `slug`.

```json
[
  { "slug": "signs", "order": 3, "titleUz": "Yo'l belgilari", "titleRu": "Дорожные знаки" }
]
```

| field | required | notes |
|---|---|---|
| `slug` | yes | stable identifier, `[a-z0-9-]` |
| `order` | yes | display order in the topic list |
| `titleUz` / `titleRu` | yes | both locales are mandatory — a missing one shows as a blank row in the app |

## rules

Key: `code`. This is the corpus the AI cites; a question whose `ruleRefs` point
at codes that do not exist here will still work, but its explanation will be
ungrounded.

```json
[
  {
    "code": "PDD-6.2",
    "order": 62,
    "titleUz": "Svetofor signallari",
    "titleRu": "Сигналы светофора",
    "bodyUz": "Qizil signal, shu jumladan chaqnovchi qizil signal harakatni taqiqlaydi...",
    "bodyRu": "Красный сигнал, в том числе мигающий, запрещает движение..."
  }
]
```

| field | required | notes |
|---|---|---|
| `code` | yes | citable id, e.g. `PDD-6.2`. Shown to learners as the source |
| `order` | yes | reading order |
| `titleUz` / `titleRu` | yes | |
| `bodyUz` / `bodyRu` | yes | the rule text itself. Keep sections small — one rule per row beats one chapter per row, because retrieval returns whole rows |

## questions

Key: `externalId`.

```json
[
  {
    "externalId": "uz-signals-001",
    "topicSlug": "signals",
    "difficulty": 2,
    "imageUrl": null,
    "textUz": "Svetoforning sariq signali nimani anglatadi?",
    "textRu": "Что означает жёлтый сигнал светофора?",
    "ruleRefs": ["PDD-6.2"],
    "status": "published",
    "options": [
      { "textUz": "Harakatni davom ettirish mumkin", "textRu": "Можно продолжать движение", "isCorrect": false },
      { "textUz": "Harakat taqiqlanadi", "textRu": "Движение запрещено", "isCorrect": true }
    ]
  }
]
```

| field | required | notes |
|---|---|---|
| `externalId` | yes | stable id from the source bank — the upsert key |
| `topicSlug` | yes | must match an imported topic |
| `difficulty` | no | 1–5, default 3. Used to keep exam sets balanced |
| `imageUrl` | no | relative path, served by `web/`. Diagrams go here |
| `textUz` / `textRu` | yes | |
| `sourceNoteUz` / `sourceNoteRu` | no | the official rationale, if the source bank ships one. Authoritative — shown above the AI explanation, not replaced by it |
| `ruleRefs` | no | `RuleSection.code` values. Strongly recommended: this is what the explanation is grounded in |
| `status` | no | `draft` (default) / `published` / `retired`. Only `published` questions are served |
| `options` | yes | 2–6 of them, **exactly one** `isCorrect: true`. Order is the array order |

### Validation the importer enforces

A file that trips any of these is rejected whole — nothing is written:

- unknown `topicSlug`
- fewer than 2 or more than 6 options
- not exactly one correct option
- duplicate `externalId` within the file
- missing `uz` or `ru` text anywhere
- an import that would retire more than 20% of the currently published bank
  (override with `--allow-mass-retire` once you have looked at why)
