import { Global, Module } from '@nestjs/common';
import { EskizService } from './eskiz.service';

@Global()
@Module({
  providers: [EskizService],
  exports: [EskizService],
})
export class EskizModule {}
