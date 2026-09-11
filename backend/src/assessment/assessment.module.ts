import { Module } from '@nestjs/common';
import { anthropicClientProvider } from './anthropic.provider';
import { AssessmentService } from './assessment.service';

@Module({
  providers: [anthropicClientProvider, AssessmentService],
  exports: [AssessmentService],
})
export class AssessmentModule {}
