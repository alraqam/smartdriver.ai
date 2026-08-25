import { MiddlewareConsumer, Module, NestModule, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
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
import { ReviewsModule } from './reviews/reviews.module';
import { AdminModule } from './admin/admin.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { HealthController } from './health.controller';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { RequestLoggerMiddleware } from './common/request-logger.middleware';

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
    ReviewsModule,
    AiModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
    },
    // Catches everything that reaches the edge: the log gets the context and
    // the stack, the caller gets a status and a request id.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Order matters: authenticate before checking roles, so RolesGuard always
    // has a user to look at.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Every route, so every request has an id before anything can fail.
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
