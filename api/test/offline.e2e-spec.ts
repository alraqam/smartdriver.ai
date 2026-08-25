import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { auth, createTestApp, makeUser, resetDb, seedContent } from './helpers';

// Offline practice, over HTTP, against a real database.
//
// The pack hands the answer key to the device, so everything the device sends
// back has to be treated as a claim rather than a fact. These tests are mostly
// about what the server refuses to take the client's word for: the score, the
// mode, the clock, and whether a drill has already been counted.

describe('offline practice (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let server: any;
  let token: string;
  let topicId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    app = await createTestApp();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    const { topics } = await seedContent(prisma);
    topicId = topics[0].id;
    ({ token } = await makeUser(app, prisma, '+998900000201'));
  });

  const questionsOfTopic = () =>
    prisma.question.findMany({
      where: { topicId },
      orderBy: { externalId: 'asc' },
      include: { options: true },
    });

  const drill = (
    clientId: string,
    answers: { questionId: string; optionId: string }[],
    over: Record<string, unknown> = {},
  ) => ({
    clientId,
    topicId,
    startedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    finishedAt: new Date(Date.now() - 60_000).toISOString(),
    answers,
    ...over,
  });

  // ── the pack ────────────────────────────────────────────────

  describe('GET /api/offline/pack', () => {
    it('ships the published bank with the answer key', async () => {
      const res = await request(server).get('/api/offline/pack').set(auth(token)).expect(200);

      expect(res.body.questions).toHaveLength(12);
      expect(res.body.topics).toHaveLength(2);
      // Practice runs on the device, so the device needs to be able to grade.
      // This is the deliberate exception to "the key never leaves the server".
      const opts = res.body.questions[0].options;
      expect(opts.some((o: any) => o.isCorrect === true)).toBe(true);
      // ...and the payload says out loud what it may be used for.
      expect(res.body.modes).toEqual(['practice']);
    });

    it('never ships unpublished questions', async () => {
      const [q] = await questionsOfTopic();
      await prisma.question.update({ where: { id: q.id }, data: { status: 'draft' } });

      const res = await request(server).get('/api/offline/pack').set(auth(token)).expect(200);
      expect(res.body.questions).toHaveLength(11);
      expect(res.body.questions.map((x: any) => x.id)).not.toContain(q.id);
    });

    it('answers 304 when the client already holds the current version', async () => {
      const first = await request(server).get('/api/offline/pack').set(auth(token)).expect(200);
      const etag = first.headers.etag;
      expect(etag).toBeTruthy();

      const second = await request(server)
        .get('/api/offline/pack')
        .set(auth(token))
        .set('If-None-Match', etag)
        .expect(304);
      expect(second.body).toEqual({});
    });

    it('accepts a weak etag, which proxies hand back', async () => {
      const first = await request(server).get('/api/offline/pack').set(auth(token)).expect(200);
      await request(server)
        .get('/api/offline/pack')
        .set(auth(token))
        .set('If-None-Match', `W/${first.headers.etag}`)
        .expect(304);
    });

    it('stops matching once the bank changes', async () => {
      const first = await request(server).get('/api/offline/pack').set(auth(token)).expect(200);
      const [q] = await questionsOfTopic();
      await prisma.question.update({ where: { id: q.id }, data: { textUz: 'tahrirlangan' } });

      await request(server)
        .get('/api/offline/pack')
        .set(auth(token))
        .set('If-None-Match', first.headers.etag)
        .expect(200);
    });

    it('requires a token', async () => {
      await request(server).get('/api/offline/pack').expect(401);
    });
  });

  // ── syncing ─────────────────────────────────────────────────

  describe('POST /api/sessions/sync', () => {
    it('grades from the server, not from what the client claims', async () => {
      const qs = await questionsOfTopic();
      const answers = qs.slice(0, 4).map((q, i) => ({
        questionId: q.id,
        // Two right, two wrong.
        optionId: q.options.find((o) => o.isCorrect === (i < 2))!.id,
        // A client asserting its own score has nothing to assert to: there is
        // no `isCorrect` field in the request shape at all. Sending one is
        // stripped by the validation pipe.
        isCorrect: true,
      }));

      const res = await request(server)
        .post('/api/sessions/sync')
        .set(auth(token))
        .send({ sessions: [drill('drill-graded-1', answers)] })
        .expect(200);

      expect(res.body.accepted).toBe(1);
      expect(res.body.results[0].correctCount).toBe(2);

      const stored = await prisma.session.findFirst({ where: { clientId: 'drill-graded-1' } });
      expect(stored!.correctCount).toBe(2);
      expect(stored!.mode).toBe('practice');
    });

    it('is idempotent: the same drill twice counts once', async () => {
      const qs = await questionsOfTopic();
      const answers = qs.slice(0, 3).map((q) => ({
        questionId: q.id,
        optionId: q.options.find((o) => o.isCorrect)!.id,
      }));
      const body = { sessions: [drill('drill-dup-1', answers)] };

      const first = await request(server)
        .post('/api/sessions/sync')
        .set(auth(token))
        .send(body)
        .expect(200);
      expect(first.body.accepted).toBe(1);

      // The case this exists for: the queue flushed, the response was lost on a
      // flaky reconnect, and the queue flushed again.
      const second = await request(server)
        .post('/api/sessions/sync')
        .set(auth(token))
        .send(body)
        .expect(200);
      expect(second.body.duplicates).toBe(1);
      expect(second.body.accepted).toBe(0);
      expect(second.body.results[0].sessionId).toBe(first.body.results[0].sessionId);

      expect(await prisma.session.count({ where: { userId: undefined } })).toBe(1);
      const mastery = await prisma.topicMastery.findFirst({ where: { topicId } });
      // Three answers, counted once — not six.
      expect(mastery!.attempts).toBe(3);
    });

    it('lets two learners mint the same client id without collision', async () => {
      const other = await makeUser(app, prisma, '+998900000202');
      const qs = await questionsOfTopic();
      const answers = [{ questionId: qs[0].id, optionId: qs[0].options[0].id }];
      const body = { sessions: [drill('same-id-everywhere', answers)] };

      await request(server).post('/api/sessions/sync').set(auth(token)).send(body).expect(200);
      const res = await request(server)
        .post('/api/sessions/sync')
        .set(auth(other.token))
        .send(body)
        .expect(200);

      expect(res.body.accepted).toBe(1);
      expect(await prisma.session.count()).toBe(2);
    });

    it('moves mastery and the mistake bank exactly as online practice does', async () => {
      const qs = await questionsOfTopic();
      const answers = [
        { questionId: qs[0].id, optionId: qs[0].options.find((o) => o.isCorrect)!.id },
        { questionId: qs[1].id, optionId: qs[1].options.find((o) => !o.isCorrect)!.id },
      ];

      await request(server)
        .post('/api/sessions/sync')
        .set(auth(token))
        .send({ sessions: [drill('drill-mastery-1', answers)] })
        .expect(200);

      const mastery = await prisma.topicMastery.findFirst({ where: { topicId } });
      expect(mastery!.attempts).toBe(2);
      expect(mastery!.correct).toBe(1);

      // The missed question is owed a review; the correct one is not, because a
      // never-missed question answered right does not enter the bank.
      const reviews = await prisma.questionReview.findMany();
      expect(reviews.map((r) => r.questionId)).toEqual([qs[1].id]);
    });

    it('shows up in history and readiness like any other session', async () => {
      const qs = await questionsOfTopic();
      const answers = qs.slice(0, 2).map((q) => ({
        questionId: q.id,
        optionId: q.options.find((o) => o.isCorrect)!.id,
      }));

      const sync = await request(server)
        .post('/api/sessions/sync')
        .set(auth(token))
        .send({ sessions: [drill('drill-history-1', answers)] })
        .expect(200);
      expect(sync.body.readiness).toHaveProperty('percent');

      const list = await request(server).get('/api/sessions').set(auth(token)).expect(200);
      expect(list.body).toHaveLength(1);
      expect(list.body[0].mode).toBe('practice');
      expect(list.body[0].finishedAt).toBeTruthy();

      // And it reads back through the normal session endpoint, so the result
      // screen needs no special case for a drill that happened offline.
      const full = await request(server)
        .get(`/api/sessions/${sync.body.results[0].sessionId}`)
        .set(auth(token))
        .expect(200);
      expect(full.body.items).toHaveLength(2);
      expect(full.body.items[0].isCorrect).toBe(true);
    });

    it('clamps a drill dated in the future', async () => {
      const qs = await questionsOfTopic();
      const answers = [{ questionId: qs[0].id, optionId: qs[0].options[0].id }];
      const soon = new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString();

      const before = Date.now();
      await request(server)
        .post('/api/sessions/sync')
        .set(auth(token))
        .send({ sessions: [drill('drill-future-1', answers, { startedAt: soon, finishedAt: soon })] })
        .expect(200);

      const stored = await prisma.session.findFirst({ where: { clientId: 'drill-future-1' } });
      // A month-fast phone would otherwise hold a streak open for a month.
      expect(stored!.startedAt.getTime()).toBeLessThanOrEqual(Date.now());
      expect(stored!.startedAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    });

    it('counts a repeated question once', async () => {
      const qs = await questionsOfTopic();
      const opt = qs[0].options.find((o) => o.isCorrect)!.id;
      const answers = [
        { questionId: qs[0].id, optionId: opt },
        { questionId: qs[0].id, optionId: opt },
        { questionId: qs[0].id, optionId: opt },
      ];

      const res = await request(server)
        .post('/api/sessions/sync')
        .set(auth(token))
        .send({ sessions: [drill('drill-repeat-1', answers)] })
        .expect(200);

      expect(res.body.results[0].questionCount).toBe(1);
      const mastery = await prisma.topicMastery.findFirst({ where: { topicId } });
      expect(mastery!.attempts).toBe(1);
    });

    it('keeps the drill when one question has been deleted since download', async () => {
      const qs = await questionsOfTopic();
      const answers = qs.slice(0, 3).map((q) => ({
        questionId: q.id,
        optionId: q.options.find((o) => o.isCorrect)!.id,
      }));
      answers.push({ questionId: 'gone-from-the-bank', optionId: 'gone-too' });

      const res = await request(server)
        .post('/api/sessions/sync')
        .set(auth(token))
        .send({ sessions: [drill('drill-partial-1', answers)] })
        .expect(200);

      expect(res.body.accepted).toBe(1);
      expect(res.body.results[0].questionCount).toBe(3);
      expect(res.body.results[0].dropped).toBe(1);
    });

    it('rejects a drill whose questions have all gone, without losing the batch', async () => {
      const qs = await questionsOfTopic();
      const good = [{ questionId: qs[0].id, optionId: qs[0].options[0].id }];
      const bad = [{ questionId: 'nope', optionId: 'nope' }];

      const res = await request(server)
        .post('/api/sessions/sync')
        .set(auth(token))
        .send({ sessions: [drill('drill-ok-1', good), drill('drill-bad-1', bad)] })
        .expect(200);

      // One bad drill must not cost the learner the rest of the queue.
      expect(res.body.accepted).toBe(1);
      expect(res.body.rejected).toBe(1);
      expect(res.body.results.find((r: any) => r.clientId === 'drill-ok-1').status).toBe('accepted');
      expect(res.body.results.find((r: any) => r.clientId === 'drill-bad-1').status).toBe('rejected');
    });

    it('refuses an option that belongs to a different question', async () => {
      const qs = await questionsOfTopic();
      const answers = [{ questionId: qs[0].id, optionId: qs[1].options[0].id }];

      const res = await request(server)
        .post('/api/sessions/sync')
        .set(auth(token))
        .send({ sessions: [drill('drill-crossed-1', answers)] })
        .expect(200);

      expect(res.body.rejected).toBe(1);
    });

    it('cannot be talked into creating an exam', async () => {
      const qs = await questionsOfTopic();
      const answers = [{ questionId: qs[0].id, optionId: qs[0].options[0].id }];

      await request(server)
        .post('/api/sessions/sync')
        .set(auth(token))
        .send({
          // The whole point of an exam is that the server owns the paper and the
          // clock. `mode` is not in the request shape, and asking anyway must
          // not smuggle one in.
          sessions: [drill('drill-exam-1', answers, { mode: 'exam', passed: true, timeLimitSec: 1 })],
        })
        .expect(200);

      const stored = await prisma.session.findFirst({ where: { clientId: 'drill-exam-1' } });
      expect(stored!.mode).toBe('practice');
      expect(stored!.passed).toBeNull();
      expect(stored!.timeLimitSec).toBeNull();
    });

    it('rejects an unknown topic', async () => {
      const qs = await questionsOfTopic();
      const res = await request(server)
        .post('/api/sessions/sync')
        .set(auth(token))
        .send({
          sessions: [
            drill('drill-topic-1', [{ questionId: qs[0].id, optionId: qs[0].options[0].id }], {
              topicId: 'no-such-topic',
            }),
          ],
        })
        .expect(200);

      expect(res.body.rejected).toBe(1);
    });

    it('refuses a batch larger than the cap', async () => {
      const qs = await questionsOfTopic();
      const one = [{ questionId: qs[0].id, optionId: qs[0].options[0].id }];
      const sessions = Array.from({ length: 26 }, (_, i) => drill(`drill-flood-${i}`, one));

      await request(server)
        .post('/api/sessions/sync')
        .set(auth(token))
        .send({ sessions })
        .expect(400);
    });

    it('refuses an empty drill', async () => {
      await request(server)
        .post('/api/sessions/sync')
        .set(auth(token))
        .send({ sessions: [drill('drill-empty-1', [])] })
        .expect(400);
    });

    it('requires a token', async () => {
      await request(server).post('/api/sessions/sync').send({ sessions: [] }).expect(401);
    });
  });
});
