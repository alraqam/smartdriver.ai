import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { EskizService } from './eskiz/eskiz.service';
import { Public } from './auth/decorators';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eskiz: EskizService,
  ) {}

  // Reports which integrations are live vs mocked, because "the app is up" and
  // "the app can actually send an SMS" are different questions and the second
  // one is the one that pages someone.
  @Public()
  @Get()
  async health() {
    let db = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = 'up';
    } catch {
      db = 'down';
    }
    return {
      status: db === 'up' ? 'ok' : 'degraded',
      db,
      sms: this.eskiz.isMock ? 'mock' : 'live',
      ai: process.env.ANTHROPIC_API_KEY ? 'live' : 'mock',
      time: new Date().toISOString(),
    };
  }
}
