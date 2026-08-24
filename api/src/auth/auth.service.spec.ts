import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { EskizService } from '../eskiz/eskiz.service';

// The demo OTP echo is the one place in this codebase where a secret is
// deliberately returned over HTTP. These tests pin the conditions under which
// that can happen, because a regression here is a silent authentication
// bypass rather than a visible bug.

function makeService(opts: { isMock: boolean }) {
  const otpRows: any[] = [];
  const prisma = {
    otpCode: {
      findFirst: async () => null,
      updateMany: async () => ({ count: 0 }),
      create: async ({ data }: any) => {
        otpRows.push(data);
        return data;
      },
    },
  } as unknown as PrismaService;

  const eskiz = {
    isMock: opts.isMock,
    sent: [] as string[],
    async sendSms(_phone: string, message: string) {
      this.sent.push(message);
      return { mode: 'mock' as const, ok: true, id: 'x', to: _phone };
    },
  };

  const jwt = { signAsync: async () => 'token' } as any;
  return {
    service: new AuthService(prisma, jwt, eskiz as unknown as EskizService),
    eskiz,
  };
}

/// The code the service actually issued, recovered from the SMS text, so the
/// tests compare the echoed value against the real one.
function codeFromSms(text: string): string {
  return /(\d{6})/.exec(text)![1];
}

describe('AuthService demo OTP echo', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns the code in mock mode so a demo needs no log access', async () => {
    delete process.env.NODE_ENV;
    delete process.env.DEMO_SHOW_OTP;
    const { service, eskiz } = makeService({ isMock: true });

    const res: any = await service.requestOtp('901234567');

    expect(res.mock).toBe(true);
    expect(res.devCode).toBe(codeFromSms(eskiz.sent[0]));
  });

  // The important one: the moment real SMS is configured, the code is a real
  // secret travelling out-of-band and must never come back over HTTP.
  it('never returns the code once Eskiz is live', async () => {
    delete process.env.NODE_ENV;
    delete process.env.DEMO_SHOW_OTP;
    const { service, eskiz } = makeService({ isMock: false });

    const res: any = await service.requestOtp('901234567');
    const issued = codeFromSms(eskiz.sent[0]);

    expect(res.mock).toBe(false);
    expect(res.devCode).toBeUndefined();
    // Checked against the ACTUAL issued code rather than any six-digit run:
    // the phone number in the response legitimately contains one.
    expect(JSON.stringify(res)).not.toContain(issued);
  });

  it('never returns the code in production, even in mock mode', async () => {
    // Belt and braces: main.ts already refuses to boot production in mock
    // mode, so this state should be unreachable. It is checked anyway,
    // because the cost of the two guards disagreeing is an open door.
    process.env.NODE_ENV = 'production';
    delete process.env.DEMO_SHOW_OTP;
    const { service } = makeService({ isMock: true });

    const res: any = await service.requestOtp('901234567');

    expect(res.devCode).toBeUndefined();
  });

  it('honours DEMO_SHOW_OTP=false as an explicit opt-out', async () => {
    delete process.env.NODE_ENV;
    process.env.DEMO_SHOW_OTP = 'false';
    const { service } = makeService({ isMock: true });

    const res: any = await service.requestOtp('901234567');

    expect(res.devCode).toBeUndefined();
  });

  it('sends the same code it echoes, not a second one', async () => {
    // A copy-paste slip that generated the displayed code separately would
    // make the demo silently unusable while looking correct.
    delete process.env.NODE_ENV;
    delete process.env.DEMO_SHOW_OTP;
    const { service, eskiz } = makeService({ isMock: true });

    const res: any = await service.requestOtp('901234567');

    expect(eskiz.sent).toHaveLength(1);
    expect(eskiz.sent[0]).toContain(res.devCode);
  });
});
