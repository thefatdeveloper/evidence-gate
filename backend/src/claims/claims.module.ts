import { Module } from '@nestjs/common';
import { AssessmentModule } from '../assessment/assessment.module';
import { ClaimsController } from './claims.controller';
import { ClaimsService } from './claims.service';

@Module({
  imports: [AssessmentModule],
  controllers: [ClaimsController],
  providers: [ClaimsService],
})
export class ClaimsModule {}
