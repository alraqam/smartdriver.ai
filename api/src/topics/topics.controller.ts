import { Controller, Get, Param, Query } from '@nestjs/common';
import { Locale } from '@prisma/client';
import { TopicsService } from './topics.service';
import { AuthUser, CurrentUser, OptionalAuth } from '../auth/decorators';

@Controller('topics')
export class TopicsController {
  constructor(private readonly topics: TopicsService) {}

  // Optional auth: signed out this is a plain catalogue, signed in it carries
  // the learner's progress. Same URL either way, so the web app does not have
  // to branch on whether it has a token.
  @OptionalAuth()
  @Get()
  list(@CurrentUser() user: AuthUser | undefined, @Query('locale') locale?: string) {
    const loc = locale === 'ru' ? Locale.ru : (user?.locale ?? Locale.uz);
    return this.topics.list(user?.sub, loc);
  }

  // The lesson screen: what this topic actually teaches, in rule text.
  @OptionalAuth()
  @Get(':id/rules')
  rules(@CurrentUser() user: AuthUser | undefined, @Param('id') id: string, @Query('locale') locale?: string) {
    const loc = locale === 'ru' ? Locale.ru : (user?.locale ?? Locale.uz);
    return this.topics.rules(id, loc);
  }
}
