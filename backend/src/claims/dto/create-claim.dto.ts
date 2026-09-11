import { IsString, Matches, MaxLength } from 'class-validator';

const NOT_BLANK = /\S/;
const notBlank = { message: '$property must not be blank' };

export class CreateClaimDto {
  @IsString()
  @Matches(NOT_BLANK, notBlank)
  @MaxLength(100)
  productRef: string;

  @IsString()
  @Matches(NOT_BLANK, notBlank)
  @MaxLength(2_000)
  claimText: string;

  @IsString()
  @Matches(NOT_BLANK, notBlank)
  @MaxLength(50)
  market: string;

  // Stored and hashed exactly as sent — deliberately not trimmed or normalised.
  // The whole text goes to the model on every assessment, so the cap also bounds
  // the cost of one run (~25k tokens at most).
  @IsString()
  @Matches(NOT_BLANK, notBlank)
  @MaxLength(100_000)
  evidenceText: string;
}
