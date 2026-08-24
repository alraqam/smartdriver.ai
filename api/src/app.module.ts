import { Module, ValidationPipe } from '@nestjs/common';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

import { PrismaModule } from './prisma/prisma.module';
import { EskizModule } from './eskiz/eskiz.module';
import { AuthModule } from './auth/auth.module';
import { ContentModule } from './content/content.module';
import { SettingsModule } from './settings/settings.module';
import { TopicsModule } from './topics/topics.module';
import { SessionsModule } from './sessions/sessions.module';
import { ProgressModule } from './progress/progress.module';
import { AiModule } from './ai/ai.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { HealthController } from './health.controller';

@Module({
  imports: [
    // Global rate limit: 120 requests / minute / IP. Auth routes set their own,
    // much tighter, limits.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    EskizModule,
    AuthModule,
    ContentModule,
    SettingsModule,
    TopicsModule,
    SessionsModule,
    ProgressModule,
    AiModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
    },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Order matters: authenticate before checking roles, so RolesGuard always
    // has a user to look at.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
