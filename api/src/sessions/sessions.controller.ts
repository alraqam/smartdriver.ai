import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { AnswerDto, CreateSessionDto } from './dto';
import { SyncSessionsDto } from './sync.dto';
import { AuthUser, CurrentUser } from '../auth/decorators';

@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSessionDto) {
    return this.sessions.create(user.sub, dto.mode, { topicId: dto.topicId, count: dto.count });
  }

  /// Replay practice drills done offline. Declared before the `:id` routes so
  /// the literal path is never shadowed by one of them.
  @Post('sync')
  @HttpCode(200)
  sync(@CurrentUser() user: AuthUser, @Body() dto: SyncSessionsDto) {
    return this.sessions.syncOffline(user.sub, dto.sessions);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('take') take?: string) {
    return this.sessions.list(user.sub, take ? Number(take) : undefined);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sessions.get(user.sub, id);
  }

  @Post(':id/answer')
  @HttpCode(200)
  answer(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AnswerDto) {
    return this.sessions.answer(user.sub, id, dto.itemId, dto.optionId, dto.msSpent);
  }

  @Post(':id/finish')
  @HttpCode(200)
  finish(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sessions.finish(user.sub, id);
  }
}
