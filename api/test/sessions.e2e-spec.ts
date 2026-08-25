import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { auth, createTestApp, makeUser, resetDb, seedContent } from './helpers';

// The practice and exam flows, over HTTP, against a real database.
//
// Everything here is something a unit test cannot see: whether the answer key
// reaches the client, whether an exam answer can be revised, whether mastery
// lands once rather than twice.

describe('sessions (e2e)', () => {
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
    ({ token } = await makeUser(app, prisma, '+998900000001'));
  });

  const correctOptionFor = async (questionId: string) => {
    const o = await prisma.answerOption.findFirst({ where: { questionId, isCorrect: true } });
    return o!.id;
  };
  const wrongOptionFor = async (questionId: string) => {
    const o = await prisma.answerOption.findFirst({ where: { questionId, isCorrect: false } });
    return o!.id;
  };

  describe('practice', () => {
    it('never sends the answer key for an unanswered question', async () => {
      // The whole point of the per-item reveal. If this regresses, the quiz is
      // readable from the network tab and every score becomes meaningless.
      const { body } = await request(server)
        .post('/api/sessions').set(auth(token))
        .send({ mode: 'practice', topicId, count: 4 }).expect(201);

      for (const item of body.items) {
        for (const opt of item.question.options) {
          expect(opt).not.toHaveProperty('isCorrect');
        }
        expect(item.question.ruleRefs).toEqual([]);
      }
    });

    it('reveals the key for an answered question only', async () => {
      const created = await request(server)
        .post('/api/sessions').set(auth(token))
        .send({ mode: 'practice', topicId, count: 4 }).expect(201);

      const first = created.body.items[0];
      await request(server)
        .post(`/api/sessions/${created.body.id}/answer`).set(auth(token))
        .send({ itemId: first.id, optionId: await correctOptionFor(first.question.id) })
        .expect(200);

      const { body } = await request(server)
        .get(`/api/sessions/${created.body.id}`).set(auth(token)).expect(200);

      const answered = body.items.find((i: any) => i.id === first.id);
      const untouched = body.items.filter((i: any) => i.id !== first.id);

      expect(answered.question.options.some((o: any) => 'isCorrect' in o)).toBe(true);
      expect(untouched.every((i: any) => i.question.options.every((o: any) => !('isCorrect' in o)))).toBe(true);
    });

    it('refuses to re-answer, so a score cannot be corrected after feedback', async () => {
      const created = await request(server)
        .post('/api/sessions').set(auth(token))
        .send({ mode: 'practice', topicId, count: 3 }).expect(201);
      const item = created.body.items[0];

      await request(server)
        .post(`/api/sessions/${created.body.id}/answer`).set(auth(token))
        .send({ itemId: item.id, optionId: await wrongOptionFor(item.question.id) })
        .expect(200);

      await request(server)
        .post(`/api/sessions/${created.body.id}/answer`).set(auth(token))
        .send({ itemId: item.id, optionId: await correctOptionFor(item.question.id) })
        .expect(409);
    });

    it('rejects an option belonging to a different question', async () => {
      const created = await request(server)
        .post('/api/sessions').set(auth(token))
        .send({ mode: 'practice', topicId, count: 3 }).expect(201);

      await request(server)
        .post(`/api/sessions/${created.body.id}/answer`).set(auth(token))
        .send({
          itemId: created.body.items[0].id,
          optionId: await correctOptionFor(created.body.items[1].question.id),
        })
        .expect(400);
    });

    it('will not let one learner touch another learner\'s session', async () => {
      const created = await request(server)
        .post('/api/sessions').set(auth(token))
        .send({ mode: 'practice', topicId, count: 3 }).expect(201);

      const other = await makeUser(app, prisma, '+998900000002');
      await request(server)
        .get(`/api/sessions/${created.body.id}`).set(auth(other.token))
        .expect(403);
    });

    it('requires a topic, and refuses one for the other modes', async () => {
      await request(server).post('/api/sessions').set(auth(token))
        .send({ mode: 'practice' }).expect(400);
      await request(server).post('/api/sessions').set(auth(token))
        .send({ mode: 'exam', topicId }).expect(400);
    });
  });

  describe('exam', () => {
    const startExam = () =>
      request(server).post('/api/sessions').set(auth(token)).send({ mode: 'exam' }).expect(201);

    it('withholds correctness while the paper is open', async () => {
      const { body } = await startExam();
      const item = body.items[0];

      const res = await request(server)
        .post(`/api/sessions/${body.id}/answer`).set(auth(token))
        .send({ itemId: item.id, optionId: await correctOptionFor(item.question.id) })
        .expect(200);

      expect(res.body.isCorrect).toBeNull();
      expect(res.body.correctOptionId).toBeNull();
    });

    it('lets an answer be revised until submission', async () => {
      // This is what the mock-exam runner depends on, and the reason answer()
      // treats exam mode differently at all.
      const { body } = await startExam();
      const item = body.items[0];
      const wrong = await wrongOptionFor(item.question.id);
      const right = await correctOptionFor(item.question.id);

      await request(server).post(`/api/sessions/${body.id}/answer`).set(auth(token))
        .send({ itemId: item.id, optionId: wrong }).expect(200);
      await request(server).post(`/api/sessions/${body.id}/answer`).set(auth(token))
        .send({ itemId: item.id, optionId: right }).expect(200);

      const stored = await prisma.sessionItem.findUnique({ where: { id: item.id } });
      expect(stored!.chosenOptionId).toBe(right);
      expect(stored!.isCorrect).toBe(true);
    });

    it('scores only at submission, counting unanswered as wrong', async () => {
      const { body } = await startExam();
      const answerCount = 3;
      for (const item of body.items.slice(0, answerCount)) {
        await request(server).post(`/api/sessions/${body.id}/answer`).set(auth(token))
          .send({ itemId: item.id, optionId: await correctOptionFor(item.question.id) })
          .expect(200);
      }

      // Mid-exam the score is deliberately not maintained.
      const mid = await request(server).get(`/api/sessions/${body.id}`).set(auth(token)).expect(200);
      expect(mid.body.correctCount).toBe(0);

      const done = await request(server)
        .post(`/api/sessions/${body.id}/finish`).set(auth(token)).expect(200);

      expect(done.body.correctCount).toBe(answerCount);
      expect(done.body.passed).toBe(false); // the rest were left blank
    });

    it('applies mastery once at submission, not once per revision', async () => {
      // Revising an answer three times must not count as three attempts.
      const { body } = await startExam();
      const item = body.items[0];
      const right = await correctOptionFor(item.question.id);
      const wrong = await wrongOptionFor(item.question.id);

      for (const opt of [wrong, right, wrong, right]) {
        await request(server).post(`/api/sessions/${body.id}/answer`).set(auth(token))
          .send({ itemId: item.id, optionId: opt }).expect(200);
      }

      const beforeFinish = await prisma.topicMastery.findMany({ where: {} });
      expect(beforeFinish).toHaveLength(0);

      await request(server).post(`/api/sessions/${body.id}/finish`).set(auth(token)).expect(200);

      const mastery = await prisma.topicMastery.findMany({});
      const attempts = mastery.reduce((s, m) => s + m.attempts, 0);
      expect(attempts).toBe(1);
    });

    it('reveals the key once the paper is submitted', async () => {
      const { body } = await startExam();
      const done = await request(server)
        .post(`/api/sessions/${body.id}/finish`).set(auth(token)).expect(200);
      expect(done.body.items[0].question.options.some((o: any) => 'isCorrect' in o)).toBe(true);
    });

    it('refuses an answer once the paper is submitted', async () => {
      const { body } = await startExam();
      await request(server).post(`/api/sessions/${body.id}/finish`).set(auth(token)).expect(200);
      const item = body.items[0];
      await request(server).post(`/api/sessions/${body.id}/answer`).set(auth(token))
        .send({ itemId: item.id, optionId: await correctOptionFor(item.question.id) })
        .expect(409);
    });
  });
});
