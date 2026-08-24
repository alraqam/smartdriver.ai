import { Global, Module } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { ReviewsController } from './reviews.controller';

// Global: SessionsService folds every answer into the mistake bank, and the
// alternative is threading this through three module imports.
@Global()
@Module({
  controllers: [ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
