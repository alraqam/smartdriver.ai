import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { describeRequest, formatContext } from './request-context';

/// Catches everything that reaches the edge.
///
/// Two jobs, and they pull in opposite directions:
///
///   · the LOG gets everything — which request, which user, the stack — so a
///     production failure is diagnosable
///   · the RESPONSE gets almost nothing — a status, a safe message, and the
///     request id — because an unhandled error is by definition one nobody
///     wrote a message for, and its text tends to name tables, files and
///     queries
///
/// The request id is what joins the two: a learner quotes it, and it leads
/// straight to the line that has the stack.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { requestId?: string }>();

    // A stream that has already started writing cannot be turned into an error
    // response — the tutor's SSE endpoint sends its own `error` frame instead.
    if (res.headersSent) {
      this.logger.error(
        `after headers sent ${formatContext(describeRequest(req as any))}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
      return;
    }

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const context = formatContext(describeRequest(req as any));

    if (isHttp) {
      // An expected refusal — a 401, a 409, a validation error. Worth a line at
      // warn so patterns are visible (a spike of 429s is an attack), but not an
      // incident, and the message was written to be read by the caller.
      const body = exception.getResponse();
      this.logger.warn(`${status} ${context} ${JSON.stringify(body)}`);
      res.status(status).json(
        typeof body === 'string'
          ? { statusCode: status, message: body, requestId: req.requestId }
          : { ...(body as object), requestId: req.requestId },
      );
      return;
    }

    // Genuinely unexpected. Everything goes to the log; the caller gets a
    // generic message and the id.
    this.logger.error(
      `500 ${context} ${exception instanceof Error ? exception.message : String(exception)}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: "Kutilmagan xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.",
      requestId: req.requestId,
    });
  }
}
