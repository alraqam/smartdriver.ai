import { INestApplication } from '@nestjs/common';
import { PrismaClient, Role } from '@prisma/client';
import request from 'supertest';
import { auth, createTestApp, makeUser, resetDb, seedContent } from './helpers';

// The mistake bank end to end, and the admin authorisation boundary.

describe('mistake bank (e2e)', () => {
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
    ({ token } = await makeUser(app, prisma, '+998900000010'));
  });

  const optionFor = async (questionId: string, correct: boolean) =>
    (await prisma.answerOption.findFirst({ where: { questionId, isCorrect: correct } }))!.id;

  /// Answer a whole practice session, right or wrong on demand.
  async function practise(count: number, correct: boolean) {
    const { body } = await request(server)
      .post('/api/sessions').set(auth(token))
      .send({ mode: 'practice', topicId, count }).expect(201);

    for (const item of body.items) {
      await request(server)
        .post(`/api/sessions/${body.id}/answer`).set(auth(token))
        .send({ itemId: item.id, optionId: await optionFor(item.question.id, correct) })
        .expect(200);
    }
    await request(server).post(`/api/sessions/${body.id}/finish`).set(auth(token)).expect(200);
    return body.items.map((i: any) => i.question.id);
  }

  it('stays empty while the learner gets everything right', async () => {
    // A mistake bank of questions nobody got wrong is just the question bank.
    await practise(4, true);
    const { body } = await request(server).get('/api/me/reviews').set(auth(token)).expect(200);
    expect(body.counts.open).toBe(0);
  });

  it('takes in every question answered wrong, due immediately', async () => {
    const asked = await practise(4, false);
    const { body } = await request(server).get('/api/me/reviews').set(auth(token)).expect(200);

    expect(body.counts.open).toBe(asked.length);
    expect(body.counts.due).toBe(asked.length);
    expect(body.items.every((i: any) => i.due && i.box === 0 && i.wrongCount === 1)).toBe(true);
  });

  it('builds a review drill from exactly what is due', async () => {
    const asked = await practise(4, false);
    const { body } = await request(server)
      .post('/api/sessions').set(auth(token)).send({ mode: 'review' }).expect(201);

    expect(body.mode).toBe('review');
    expect(body.items).toHaveLength(asked.length);
    expect(body.items.every((i: any) => asked.includes(i.question.id))).toBe(true);
  });

  it('refuses a drill when nothing is owed', async () => {
    await request(server)
      .post('/api/sessions').set(auth(token)).send({ mode: 'review' }).expect(409);
  });

  it('schedules a question forward when it is finally recalled', async () => {
    await practise(2, false);

    const drill = await request(server)
      .post('/api/sessions').set(auth(token)).send({ mode: 'review' }).expect(201);
    for (const item of drill.body.items) {
      await request(server)
        .post(`/api/sessions/${drill.body.id}/answer`).set(auth(token))
        .send({ itemId: item.id, optionId: await optionFor(item.question.id, true) })
        .expect(200);
    }
    await request(server).post(`/api/sessions/${drill.body.id}/finish`).set(auth(token)).expect(200);

    const { body } = await request(server).get('/api/me/reviews').set(auth(token)).expect(200);
    expect(body.counts.due).toBe(0);          // nothing owed today any more
    expect(body.counts.open).toBe(2);         // but still being tracked
    expect(body.items.every((i: any) => i.box === 1 && !i.due)).toBe(true);
    // And a second drill has nothing to offer.
    await request(server)
      .post('/api/sessions').set(auth(token)).send({ mode: 'review' }).expect(409);
  });

  it('counts a repeat mistake without ever lowering the tally', async () => {
    await practise(2, false);
    const drill = await request(server)
      .post('/api/sessions').set(auth(token)).send({ mode: 'review' }).expect(201);
    for (const item of drill.body.items) {
      await request(server)
        .post(`/api/sessions/${drill.body.id}/answer`).set(auth(token))
        .send({ itemId: item.id, optionId: await optionFor(item.question.id, false) })
        .expect(200);
    }
    await request(server).post(`/api/sessions/${drill.body.id}/finish`).set(auth(token)).expect(200);

    const { body } = await request(server).get('/api/me/reviews').set(auth(token)).expect(200);
    expect(body.items.every((i: any) => i.wrongCount === 2 && i.box === 0 && i.due)).toBe(true);
  });

  it('keeps one learner\'s mistakes out of another\'s bank', async () => {
    await practise(3, false);
    const other = await makeUser(app, prisma, '+998900000011');
    const { body } = await request(server).get('/api/me/reviews').set(auth(other.token)).expect(200);
    expect(body.counts.open).toBe(0);
  });
});

describe('admin authorisation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let server: any;

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
    await seedContent(prisma);
  });

  const ROUTES = [
    ['get', '/api/admin/stats'],
    ['get', '/api/admin/questions'],
    ['get', '/api/admin/imports'],
    ['get', '/api/admin/ai-usage'],
  ] as const;

  it('refuses every admin route without a token', async () => {
    for (const [method, url] of ROUTES) {
      await (request(server) as any)[method](url).expect(401);
    }
  });

  it('refuses every admin route to a signed-in learner', async () => {
    const { token } = await makeUser(app, prisma, '+998900000020', Role.learner);
    for (const [method, url] of ROUTES) {
      await (request(server) as any)[method](url).set(auth(token)).expect(403);
    }
  });

  it('lets an admin through', async () => {
    const { token } = await makeUser(app, prisma, '+998900000021', Role.admin);
    const { body } = await request(server).get('/api/admin/stats').set(auth(token)).expect(200);
    expect(body.questions.published).toBe(12);
  });

  // The reason AdminGuard reads the database instead of the token's role
  // claim: tokens live 30 days, so that claim can be a month out of date.
  it('honours a demotion immediately, even with an admin token in hand', async () => {
    const { user, token } = await makeUser(app, prisma, '+998900000022', Role.admin);
    await request(server).get('/api/admin/stats').set(auth(token)).expect(200);

    await prisma.user.update({ where: { id: user.id }, data: { role: Role.learner } });

    // Same token, still says admin, now correctly refused.
    await request(server).get('/api/admin/stats').set(auth(token)).expect(403);
  });

  it('honours a promotion immediately, on a token that predates it', async () => {
    const { user, token } = await makeUser(app, prisma, '+998900000023', Role.learner);
    await request(server).get('/api/admin/stats').set(auth(token)).expect(403);

    await prisma.user.update({ where: { id: user.id }, data: { role: Role.admin } });
    await request(server).get('/api/admin/stats').set(auth(token)).expect(200);
  });

  it('imports idempotently and refuses a broken file whole', async () => {
    const { token } = await makeUser(app, prisma, '+998900000024', Role.admin);
    const rows = [
      { slug: 'gamma', order: 9, titleUz: 'Yangi', titleRu: 'Новая' },
    ];

    const first = await request(server)
      .post('/api/admin/import').set(auth(token)).send({ rows, filename: 't.json' }).expect(200);
    expect(first.body.inserted).toBe(1);

    const second = await request(server)
      .post('/api/admin/import').set(auth(token)).send({ rows, filename: 't.json' }).expect(200);
    expect(second.body).toMatchObject({ inserted: 0, updated: 0, skipped: 1 });

    // A dry run must write nothing at all.
    const before = await prisma.topic.count();
    await request(server).post('/api/admin/import').set(auth(token))
      .send({ rows: [{ slug: 'delta', order: 10, titleUz: 'X', titleRu: 'Х' }], dryRun: true })
      .expect(200);
    expect(await prisma.topic.count()).toBe(before);

    // One bad row rejects the file; nothing partial is written.
    await request(server).post('/api/admin/import').set(auth(token))
      .send({ rows: [{ slug: 'ok', order: 1, titleUz: 'A', titleRu: 'А' }, { slug: 'bad' }] })
      .expect(400);
    expect(await prisma.topic.count()).toBe(before);
  });

  it('refuses an upload that is not really an image', async () => {
    const { token } = await makeUser(app, prisma, '+998900000025', Role.admin);
    await request(server)
      .post('/api/admin/uploads').set(auth(token))
      .attach('file', Buffer.from('<svg><script>alert(1)</script></svg>'), {
        filename: 'sign.svg', contentType: 'image/svg+xml',
      })
      .expect(400);
  });
});
