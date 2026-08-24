// Rule-retrieval eval.
//
//   npm run eval:retrieval
//
// Retrieval decides which rules the tutor is allowed to answer from, so its
// quality is the tutor's quality. Nothing about it can be unit tested — the
// logic is a SQL query against real content — so this measures it against the
// live database instead.
//
// It talks to the RetrievalService directly rather than over HTTP: no server,
// no auth, no model calls, no cost.
//
// Two numbers matter:
//   top-1 / top-k  — does a question phrased like a learner would phrase it
//                    reach the rule that answers it?
//   off-corpus     — does a question the rules do not cover return nothing?
//
// Retrieval deliberately favours recall: it returns CANDIDATES, and the model
// is instructed to decline when they do not answer the question. An off-corpus
// question that still returns a section is a precision loss, not a wrong
// answer to the learner. Expect precision to improve on its own as the real
// corpus lands — document-frequency statistics are close to meaningless
// across only twenty sections.
require('dotenv/config');
const { readFileSync } = require('fs');
const { join } = require('path');
const { PrismaClient } = require('@prisma/client');
const { RetrievalService } = require('../dist/ai/retrieval.service');

const cases = JSON.parse(readFileSync(join(__dirname, 'retrieval-cases.json'), 'utf8'));

(async () => {
  const prisma = new PrismaClient();
  const svc = new RetrievalService(prisma);

  const total = await prisma.ruleSection.count();
  if (total === 0) {
    console.error('No RuleSection rows. Import ../content/rules.seed.json first.');
    process.exit(2);
  }
  console.log(`corpus: ${total} rule sections\n`);

  let top1 = 0;
  let topk = 0;
  console.log('ON-CORPUS');
  for (const c of cases.onCorpus) {
    const hits = await svc.search(c.q, c.locale);
    const codes = hits.map((h) => h.code);
    const isTop1 = codes[0] === c.expect;
    const isTopK = codes.includes(c.expect);
    if (isTop1) top1++;
    if (isTopK) topk++;
    const mark = isTop1 ? 'TOP1 ' : isTopK ? 'top-k' : 'MISS ';
    console.log(`  ${mark} [${c.locale}] ${c.q.slice(0, 52).padEnd(52)} want=${c.expect.padEnd(9)} got=${codes.slice(0, 3).join(',') || '(none)'}`);
  }

  let clean = 0;
  console.log('\nOFF-CORPUS (should return nothing)');
  for (const c of cases.offCorpus) {
    const hits = await svc.search(c.q, c.locale);
    if (hits.length === 0) clean++;
    console.log(`  ${hits.length === 0 ? 'ok   ' : 'noise'} [${c.locale}] ${c.q.slice(0, 52).padEnd(52)} got=${hits.map((h) => h.code).join(',') || '(none)'}`);
  }

  const n = cases.onCorpus.length;
  console.log(`\ntop-1 ${top1}/${n}  top-k ${topk}/${n}  off-corpus-clean ${clean}/${cases.offCorpus.length}`);

  await prisma.$disconnect();
  // top-k is the number that gates usefulness: if the right rule is in the
  // set, the model can find it. A regression there is a real regression.
  process.exit(topk < n * 0.8 ? 1 : 0);
})();
