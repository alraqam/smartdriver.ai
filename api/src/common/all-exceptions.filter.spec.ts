import { ArgumentsHost, ConflictException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { describeRequest, formatContext, newRequestId } from './request-context';

// The filter is the last thing between an internal error and the caller. Its
// failure mode is quiet and bad: a stack trace, a table name or a connection
// string rendered into a response body.

function harness(req: any = {}) {
  const res: any = {
    headersSent: false,
    statusCode: 200,
    _json: undefined,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this._json = body; return this; },
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }),
  } as unknown as ArgumentsHost;
  return { res, host };
}

const REQ = {
  method: 'POST',
  originalUrl: '/api/sessions',
  requestId: 'a3f19c2b',
  user: { sub: 'user-1', phone: '+998901234567', role: 'learner' },
};

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let errors: any[];
  let warns: any[];

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    errors = [];
    warns = [];
    jest.spyOn((filter as any).logger, 'error').mockImplementation((...a: any[]) => errors.push(a));
    jest.spyOn((filter as any).logger, 'warn').mockImplementation((...a: any[]) => warns.push(a));
  });

  it('passes an expected refusal through with its own message', async () => {
    const { res, host } = harness(REQ);
    filter.catch(new ConflictException('Sessiya allaqachon yakunlangan'), host);

    expect(res.statusCode).toBe(HttpStatus.CONFLICT);
    expect(res._json.message).toBe('Sessiya allaqachon yakunlangan');
    expect(res._json.requestId).toBe('a3f19c2b');
    // Expected refusals are warn, not error — a 409 is not an incident.
    expect(warns).toHaveLength(1);
    expect(errors).toHaveLength(0);
  });

  it('turns an unexpected error into a generic 500', async () => {
    const { res, host } = harness(REQ);
    filter.catch(new Error('connect ECONNREFUSED 10.0.0.5:5432'), host);

    expect(res.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(res._json.requestId).toBe('a3f19c2b');
  });

  it('never renders internals into the response body', async () => {
    // The whole point. A stack, a host, a query — none of it goes to a caller.
    const { res, host } = harness(REQ);
    const err = new Error('relation "User" does not exist at /app/dist/prisma.js:42');
    filter.catch(err, host);

    const body = JSON.stringify(res._json);
    expect(body).not.toContain('User');
    expect(body).not.toContain('prisma');
    expect(body).not.toContain('does not exist');
    expect(body).not.toContain('stack');
  });

  it('still puts the stack in the log', async () => {
    const { host } = harness(REQ);
    filter.catch(new Error('boom'), host);

    expect(errors).toHaveLength(1);
    const [message, stack] = errors[0];
    expect(message).toContain('500');
    expect(message).toContain('a3f19c2b');
    expect(String(stack)).toContain('Error: boom');
  });

  it('masks the phone number in the log', async () => {
    // "which user" has to be answerable; a log slowly accumulating full phone
    // numbers is a PII store nobody decided to build.
    const { host } = harness(REQ);
    filter.catch(new Error('boom'), host);

    const line = String(errors[0][0]);
    expect(line).not.toContain('+998901234567');
    expect(line).toContain('****');
    expect(line).toContain('user-1');
  });

  it('does not try to answer a response already being streamed', async () => {
    // The tutor's SSE endpoint sends its own error frame; writing a second
    // status here would throw on top of the original failure.
    const { res, host } = harness(REQ);
    res.headersSent = true;
    filter.catch(new Error('mid-stream'), host);

    expect(res._json).toBeUndefined();
    expect(res.statusCode).toBe(200);
    expect(errors).toHaveLength(1);
  });

  it('handles a signed-out request without printing undefined fields', async () => {
    const { res, host } = harness({ method: 'GET', originalUrl: '/api/topics', requestId: 'ff00ff00' });
    filter.catch(new UnauthorizedException('Token talab qilinadi'), host);

    expect(res.statusCode).toBe(HttpStatus.UNAUTHORIZED);
    expect(String(warns[0][0])).not.toContain('undefined');
  });

  it('handles something thrown that is not an Error at all', async () => {
    const { res, host } = harness(REQ);
    filter.catch('a bare string', host);
    expect(res.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(errors).toHaveLength(1);
  });
});

describe('request context', () => {
  it('mints a short id that is readable aloud', () => {
    const id = newRequestId();
    expect(id).toMatch(/^[0-9a-f]{8}$/);
    expect(newRequestId()).not.toBe(id);
  });

  it('never includes the request body', () => {
    // The OTP endpoints carry a phone and a one-time code.
    const ctx = describeRequest({
      method: 'POST',
      originalUrl: '/api/auth/otp/verify',
      requestId: 'aa',
      ...({ body: { phone: '+998901234567', code: '123456' } } as any),
    });
    expect(JSON.stringify(ctx)).not.toContain('123456');
    expect(Object.keys(ctx)).not.toContain('body');
  });

  it('drops undefined fields when formatting', () => {
    const line = formatContext(describeRequest({ method: 'GET', originalUrl: '/x', requestId: 'bb' }));
    expect(line).toBe('requestId=bb method=GET path=/x');
  });
});
