import { Body, Controller, Get, HttpCode, Param, Post, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { Locale } from '@prisma/client';
import { ExplainService } from './explain.service';
import { TutorService } from './tutor.service';
import { AskDto, CreateThreadDto, ExplainDto } from './dto';
import { AuthUser, CurrentUser } from '../auth/decorators';

@Controller()
export class AiController {
  constructor(
    private readonly explainService: ExplainService,
    private readonly tutor: TutorService,
  ) {}

  // A cache hit is cheap, a miss is a model call. Rate-limited on the
  // assumption of misses, since a learner reviewing a fresh exam generates
  // twenty of them in a row.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('questions/:id/explain')
  @HttpCode(200)
  explain(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ExplainDto) {
    return this.explainService.explain(id, dto.locale ?? user.locale ?? Locale.uz, dto.wrongOptionId, user.sub);
  }

  @Post('tutor/threads')
  createThread(@CurrentUser() user: AuthUser, @Body() dto: CreateThreadDto) {
    return this.tutor.createThread(user.sub, dto.locale ?? user.locale ?? Locale.uz);
  }

  @Get('tutor/threads')
  listThreads(@CurrentUser() user: AuthUser) {
    return this.tutor.listThreads(user.sub);
  }

  @Get('tutor/quota')
  quota(@CurrentUser() user: AuthUser) {
    return this.tutor.remainingToday(user.sub);
  }

  @Get('tutor/threads/:id')
  getThread(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tutor.getThread(user.sub, id);
  }

  /// Server-sent events. Written against the raw response rather than Nest's
  /// @Sse decorator because the generator needs to surface thrown errors (rate
  /// limit, missing thread) as an SSE `error` frame the client can render,
  /// rather than as a dead stream.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('tutor/threads/:id/messages')
  async ask(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AskDto,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    // Nginx buffers proxied responses by default, which would hold the whole
    // answer until completion and defeat the point of streaming.
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      for await (const chunk of this.tutor.ask(user.sub, id, dto.question)) {
        send(chunk.type, chunk);
      }
    } catch (e: any) {
      send('error', {
        message: e?.response?.message ?? e?.message ?? 'Xatolik yuz berdi',
        statusCode: e?.status ?? 500,
      });
    } finally {
      res.end();
    }
  }
}
