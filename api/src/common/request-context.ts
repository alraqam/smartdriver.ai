import { randomBytes } from 'crypto';
import { maskPhone } from './phone';

/// Short, quotable id attached to every request.
///
/// Eight hex characters rather than a UUID because its job is to survive being
/// read down a phone or pasted into a support message. A learner saying "it
/// said a3f19c2b" has to map to one log line, and 4 billion values is plenty
/// for that within a retention window.
export function newRequestId(): string {
  return randomBytes(4).toString('hex');
}

export interface RequestLike {
  method?: string;
  originalUrl?: string;
  url?: string;
  user?: { sub?: string; phone?: string; role?: string };
  requestId?: string;
  ip?: string;
}

/// Everything worth knowing about a request, and nothing that should not be
/// written to a log.
///
/// Deliberately does NOT include the body. The two most-hit endpoints in this
/// app carry a phone number and a one-time code, and a log that quietly
/// accumulates those is a credential store nobody decided to build. The phone
/// is included only masked, because "which user" is the question a log has to
/// answer and an opaque id alone often cannot be traced back by support.
export function describeRequest(req: RequestLike) {
  return {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl ?? req.url,
    userId: req.user?.sub,
    phone: req.user?.phone ? maskPhone(req.user.phone) : undefined,
    role: req.user?.role,
  };
}

/// One-line rendering for the log. Undefined fields are dropped rather than
/// printed as "undefined", so a signed-out request reads cleanly.
export function formatContext(ctx: ReturnType<typeof describeRequest>): string {
  return Object.entries(ctx)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');
}
