import { Controller, Get } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { Public } from '../auth/decorators';

@Controller('meta')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  // Public: the web app shows "20 questions, 25 minutes" on the sign-in-gated
  // home screen but also needs it before any session exists, and there is
  // nothing sensitive about the shape of the exam.
  //
  // This exists so the exam parameters are NOT duplicated as constants in the
  // frontend. They live in the Setting table precisely so they can be
  // corrected without a deploy, which a hardcoded 20 in a React component
  // would quietly undo.
  @Public()
  @Get('exam')
  exam() {
    return this.settings.examConfig();
  }
}
