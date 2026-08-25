import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { ImportService } from '../content/import.service';
import { BulkStatusDto, ImportDto, QuestionQueryDto, UpdateQuestionStatusDto } from './dto';
import { AuthUser, CurrentUser } from '../auth/decorators';

/// Content operations for the team that maintains the question bank.
///
/// Guarded by AdminGuard rather than @Roles('admin'): the role is re-read from
/// the database on every call, so revoking someone's access takes effect at
/// once instead of whenever their 30-day token happens to expire.
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly importer: ImportService,
  ) {}

  @Get('stats')
  stats() {
    return this.admin.stats();
  }

  /// Bulk content load. Same code path as `npm run content:import`, so what a
  /// reviewer validates here is exactly what the CLI would do — the file kind
  /// is detected from its shape, the whole file is validated before anything
  /// is written, and the upsert key makes a re-import a no-op.
  ///
  /// Rate-limited hard: this rewrites the question bank, and there is no
  /// legitimate reason to call it in a loop.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('import')
  @HttpCode(200)
  import(@CurrentUser() user: AuthUser, @Body() dto: ImportDto) {
    return this.importer.import(dto.rows as any[], dto.filename || `admin-upload-${user.phone}`, {
      dryRun: dto.dryRun,
      allowMassRetire: dto.allowMassRetire,
    });
  }

  @Get('imports')
  imports(@Query('take') take?: string) {
    return this.admin.imports(take ? Number(take) : undefined);
  }

  /// The review queue.
  @Get('questions')
  questions(@Query() query: QuestionQueryDto) {
    return this.admin.questions(query);
  }

  @Patch('questions/:id/status')
  setStatus(@Param('id') id: string, @Body() dto: UpdateQuestionStatusDto) {
    return this.admin.setStatus(id, dto.status);
  }

  /// Publish or retire a batch — a reviewer clearing a queue of imported
  /// drafts should not have to make one request per question.
  @Post('questions/status')
  @HttpCode(200)
  setStatusBulk(@Body() dto: BulkStatusDto) {
    return this.admin.setStatusBulk(dto.ids, dto.status);
  }

  @Get('ai-usage')
  aiUsage(@Query('days') days?: string) {
    return this.admin.aiUsage(days ? Number(days) : undefined);
  }
}
