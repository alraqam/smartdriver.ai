import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp, resetDb, resetThrottle } from './helpers';

// The real sign-in flow, driven over HTTP exactly as a learner's phone would.
//
// Every other suite mints tokens directly to stay under the rate limit, so
// this is the ONE place the OTP path itself is proven to work. If it breaks,
// nobody can get into the app at all.

describe('auth (e2e)', () => {
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
    // Each test gets a clean rate-limit budget; the limiter itself stays on.
    resetThrottle(app);
  });

  const requestOtp = (phone: string) =>
    request(server).post('/api/auth/otp/request').send({ phone });
  const verify = (phone: string, code: string) =>
    request(server).post('/api/auth/otp/verify').send({ phone, code });

  it('signs a learner in and creates the account on first verify', async () => {
    const otp = await requestOtp('+998901111111').expect(200);
    expect(otp.body.sent).toBe(true);

    const res = await verify('+998901111111', otp.body.devCode).expect(200);
    expect(res.body.isNewUser).toBe(true);
    expect(res.body.user.phone).toBe('+998901111111');
    expect(typeof res.body.accessToken).toBe('string');

    const me = await request(server)
      .get('/api/auth/me')
      .set({ Authorization: `Bearer ${res.body.accessToken}` })
      .expect(200);
    expect(me.body.phone).toBe('+998901111111');
  });

  it('resolves every spelling of one number to the same account', async () => {
    // The reason phone normalisation exists: otherwise a learner who typed it
    // differently on their second visit silently gets a new empty account.
    const first = await requestOtp('901111111').expect(200);
    await verify('901111111', first.body.devCode).expect(200);

    await prisma.otpCode.deleteMany({}); // clear the resend cooldown
    const second = await requestOtp('+998 90 111 11 11').expect(200);
    const res = await verify('998901111111', second.body.devCode).expect(200);

    expect(res.body.isNewUser).toBe(false);
    expect(await prisma.user.count()).toBe(1);
  });

  it('rejects a wrong code and burns the attempt', async () => {
    const otp = await requestOtp('+998902222222').expect(200);
    await verify('+998902222222', '000000').expect(401);

    const row = await prisma.otpCode.findFirst({ where: { phone: '+998902222222' } });
    expect(row!.attempts).toBe(1);
  });

  it('will not let a code be used twice', async () => {
    const otp = await requestOtp('+998903333333').expect(200);
    await verify('+998903333333', otp.body.devCode).expect(200);
    await verify('+998903333333', otp.body.devCode).expect(401);
  });

  it('burns a code after too many wrong guesses', async () => {
    const otp = await requestOtp('+998904444444').expect(200);
    for (let i = 0; i < 5; i++) await verify('+998904444444', '111111').expect(401);
    // Even the RIGHT code is now refused — the code is spent, not the account.
    await verify('+998904444444', otp.body.devCode).expect(401);
  });

  it('refuses an expired code', async () => {
    const otp = await requestOtp('+998905555555').expect(200);
    await prisma.otpCode.updateMany({
      where: { phone: '+998905555555' },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await verify('+998905555555', otp.body.devCode).expect(401);
  });

  it('supersedes an older code when a new one is issued', async () => {
    const first = await requestOtp('+998906666666').expect(200);
    await prisma.otpCode.updateMany({
      where: { phone: '+998906666666' },
      data: { createdAt: new Date(Date.now() - 120_000) },
    });
    const second = await requestOtp('+998906666666').expect(200);

    await verify('+998906666666', first.body.devCode).expect(401);
    await verify('+998906666666', second.body.devCode).expect(200);
  });

  it('holds off a resend for the same number', async () => {
    await requestOtp('+998907777777').expect(200);
    await requestOtp('+998907777777').expect(429);
  });

  it('rejects a number that is not an Uzbek mobile', async () => {
    await requestOtp('+7 900 123 45 67').expect(400);
  });

  it('refuses an unauthenticated request and a forged token', async () => {
    await request(server).get('/api/auth/me').expect(401);
    await request(server).get('/api/auth/me').set({ Authorization: 'Bearer not-a-token' }).expect(401);
  });

  it('stores the code hashed, never in the clear', async () => {
    // A database leak must not be replayable into account takeovers.
    const otp = await requestOtp('+998908888888').expect(200);
    const row = await prisma.otpCode.findFirst({ where: { phone: '+998908888888' } });
    expect(row!.codeHash).not.toContain(otp.body.devCode);
    expect(row!.codeHash.startsWith('$2')).toBe(true); // bcrypt
  });
});
