import { Controller, Get, Query } from '@nestjs/common';
import { Locale } from '@prisma/client';
import { SessionsService } from '../sessions/sessions.service';
import { AuthUser, CurrentUser } from '../auth/decorators';

@Controller('me')
export class ProgressController {
  constructor(private readonly sessions: SessionsService) {}

  @Get('progress')
  progress(@CurrentUser() user: AuthUser, @Query('locale') locale?: string) {
    const loc = locale === 'ru' ? Locale.ru : (user.locale ?? Locale.uz);
    return this.sessions.progress(user.sub, loc);
  }
}
