import { Module } from '@nestjs/common';
import { AnthropicService } from './anthropic.service';
import { ExplainService } from './explain.service';
import { RetrievalService } from './retrieval.service';
import { TutorService } from './tutor.service';
import { AiController } from './ai.controller';

@Module({
  controllers: [AiController],
  providers: [AnthropicService, ExplainService, RetrievalService, TutorService],
  exports: [AnthropicService, ExplainService, RetrievalService, TutorService],
})
export class AiModule {}
