import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { json, urlencoded } from 'express';
import { PrismaClient, Role } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerStorage } from '@nestjs/throttler';
import { AppModule } from '../src/app.module';

// Shared setup for the e2e suite.
//
// These tests run against a REAL database — a separate one, `smartdriverai_test`,
// configured in .env.test — because the things most worth testing here are the
// things a mock would paper over: that an exam answer can be revised, that a
// mistake actually lands in the bank, that the answer key is not in the
// response body.

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ bodyParser: false });

  // Mirror main.ts. If these drift, the suite stops testing the real app —
  // the body-parser bug that broke every POST would have slipped straight
  // through a setup that skipped this.
  app.use(json({ limit: '25mb' }));
  app.use(urlencoded({ extended: true, limit: '1mb' }));
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );

  await app.init();
  return app;
}

/// Wipe every table between suites. Ordered so foreign keys never block it.
export async function resetDb(prisma: PrismaClient) {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "QuestionReview", "SessionItem", "Session", "TopicMastery",
      "QuestionExplanation", "ChatMessage", "ChatThread", "AiUsage",
      "AnswerOption", "Question", "RuleSection", "Topic",
      "ContentImport", "OtpCode", "User", "Setting"
    RESTART IDENTITY CASCADE
  `);
}

/// Minimal content: two topics with enough questions to build a session from.
///
/// Deliberately not the real seed file — a fixture the test owns cannot be
/// changed out from under the suite by a content edit, and the assertions can
/// name exact counts.
export async function seedContent(prisma: PrismaClient) {
  const rule = await prisma.ruleSection.create({
    data: {
      code: 'TEST-1.1', order: 1,
      titleUz: 'Sinov qoidasi', titleRu: 'Тестовое правило',
      bodyUz: 'Sinov uchun qoida matni.', bodyRu: 'Текст правила для теста.',
    },
  });

  const topics = [];
  for (const [i, slug] of ['alpha', 'beta'].entries()) {
    const topic = await prisma.topic.create({
      data: { slug, order: i + 1, titleUz: `Mavzu ${slug}`, titleRu: `Тема ${slug}` },
    });
    for (let n = 0; n < 6; n++) {
      await prisma.question.create({
        data: {
          externalId: `${slug}-${n}`,
          topicId: topic.id,
          status: 'published',
          ruleRefs: [rule.code],
          textUz: `${slug} savol ${n}`,
          textRu: `${slug} вопрос ${n}`,
          options: {
            create: [
              // The correct option is deliberately NOT always first, so a test
              // that accidentally depends on position fails loudly.
              { order: 0, textUz: 'A', textRu: 'А', isCorrect: n % 2 === 1 },
              { order: 1, textUz: 'B', textRu: 'Б', isCorrect: n % 2 === 0 },
              { order: 2, textUz: 'C', textRu: 'В', isCorrect: false },
            ],
          },
        },
      });
    }
    topics.push(topic);
  }
  return { topics, rule };
}

/// Create a learner and mint a token for them directly.
///
/// Deliberately NOT by driving the OTP endpoints: those are rate limited to 5
/// requests a minute per IP, which is correct behaviour that a suite signing in
/// on every test would spend on setup instead of testing. The real sign-in flow
/// — including that limit — is exercised once, on purpose, in auth.e2e-spec.ts.
export async function makeUser(
  app: INestApplication,
  prisma: PrismaClient,
  phone: string,
  role: Role = Role.learner,
) {
  const user = await prisma.user.upsert({
    where: { phone },
    create: { phone, role },
    update: { role },
  });

  // Signed with the app's own JwtService, so the token is exactly what the
  // guard expects — a hand-rolled one would drift from the real payload.
  const jwt = app.get(JwtService);
  const token = await jwt.signAsync({
    sub: user.id,
    phone: user.phone,
    name: user.name,
    role: user.role,
    locale: user.locale,
  });

  return { user, token };
}

/// Clear the rate-limiter's counters.
///
/// The OTP endpoints are capped at 5 requests a minute per IP, which is
/// correct and worth keeping — but a suite that exercises sign-in properly
/// makes more than five requests from one address. Resetting between tests
/// keeps the limiter real in production while letting the tests reach the
/// behaviour underneath it.
export function resetThrottle(app: INestApplication) {
  const storage = app.get<ThrottlerStorage>(ThrottlerStorage, { strict: false }) as any;
  const bucket = storage?._storage ?? storage?.storage;
  if (!bucket) return;
  if (bucket instanceof Map) bucket.clear();
  else for (const k of Object.keys(bucket)) delete bucket[k];
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
