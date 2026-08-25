import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { describeRequest, formatContext, newRequestId } from './request-context';

/// A request the container's own health check makes every ten seconds. Logging
/// it drowns everything else and tells nobody anything.
const QUIET_PATHS = [/^\/api\/health$/, /^\/api\/uploads\//];

/// Anything slower than this gets flagged. Chosen to sit well above a normal
/// query and below the point a learner would call it broken, so the line means
/// "look at this" rather than firing constantly.
export const SLOW_MS = 1000;

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('Http');

  use(req: Request & { requestId?: string }, res: Response, next: NextFunction) {
    // Assigned here, before anything can fail, so even a request that blows up
    // in a guard has an id to report.
    req.requestId = newRequestId();
    res.setHeader('X-Request-Id', req.requestId);

    if (QUIET_PATHS.some((p) => p.test(req.originalUrl))) return next();

    const startedAt = Date.now();

    // 'finish' rather than wrapping res.end: it fires once the response is
    // actually written, so the duration is the real one and the status is
    // final — including a status some later middleware changed.
    res.once('finish', () => {
      const ms = Date.now() - startedAt;
      // The user is attached by the auth guard, which runs after this
      // middleware — so it is read HERE, at finish, not above.
      const line = `${res.statusCode} ${ms}ms ${formatContext(describeRequest(req as any))}`;

      // Errors are logged by the exception filter, with the stack. Repeating
      // them here would double every failure in the log.
      if (res.statusCode >= 500) return;
      if (res.statusCode >= 400) return;
      if (ms >= SLOW_MS) this.logger.warn(`SLOW ${line}`);
      else this.logger.log(line);
    });

    next();
  }
}
