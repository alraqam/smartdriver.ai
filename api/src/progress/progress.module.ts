import { Module } from '@nestjs/common';
import { ProgressController } from './progress.controller';
import { SessionsModule } from '../sessions/sessions.module';

@Module({
  imports: [SessionsModule],
  controllers: [ProgressController],
})
export class ProgressModule {}
