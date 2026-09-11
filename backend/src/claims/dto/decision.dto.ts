import { IsIn, IsString, Matches, MaxLength } from 'class-validator';
import { DECISION_OUTCOMES, DecisionOutcome } from '../claim-status';

export class DecisionDto {
  @IsIn(DECISION_OUTCOMES)
  outcome: DecisionOutcome;

  @IsString()
  @Matches(/\S/, { message: '$property must not be blank' })
  @MaxLength(2_000)
  justification: string;
}
