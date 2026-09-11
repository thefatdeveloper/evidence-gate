import { verifyQuote } from '../verification/quote-verifier';
import { AssertionVerdict, ModelAssertion, OverallVerdict } from './assessment.schema';

export interface VerifiedAssertion {
  text: string;
  /** Final verdict after quote verification — may differ from what the model said. */
  verdict: AssertionVerdict;
  confidence: number;
  rationale: string;
  quotedExcerpt: string;
  quoteVerified: boolean;
  matchedAt: number | null;
}

/**
 * Checks every quote against the evidence. An assertion whose quote cannot be
 * found is forced to UNSUPPORTED regardless of the model's verdict or
 * confidence: the model does not get the last word on its own evidence.
 */
export function applyQuoteVerification(
  assertions: ModelAssertion[],
  evidenceText: string,
): VerifiedAssertion[] {
  return assertions.map((assertion) => {
    const { verified, matchedAt } = verifyQuote(assertion.quotedExcerpt, evidenceText);
    return {
      text: assertion.text,
      verdict: verified ? assertion.verdict : 'UNSUPPORTED',
      confidence: assertion.confidence,
      rationale: assertion.rationale,
      quotedExcerpt: assertion.quotedExcerpt,
      quoteVerified: verified,
      matchedAt,
    };
  });
}

/** all SUPPORTED -> SUBSTANTIATED; any UNSUPPORTED -> NOT_SUBSTANTIATED; otherwise PARTIAL. */
export function deriveOverallVerdict(verdicts: AssertionVerdict[]): OverallVerdict {
  if (verdicts.length === 0) {
    // A verdict over zero assertions would read as "nothing wrong" — refuse instead.
    throw new Error('Cannot derive an overall verdict from zero assertions.');
  }
  if (verdicts.some((v) => v === 'UNSUPPORTED')) return 'NOT_SUBSTANTIATED';
  if (verdicts.every((v) => v === 'SUPPORTED')) return 'SUBSTANTIATED';
  return 'PARTIAL';
}
