import { applyQuoteVerification, deriveOverallVerdict } from './assessment.logic';
import { ModelAssertion } from './assessment.schema';

const EVIDENCE =
  'For detection of any AF episode of 30 seconds or longer, the patch algorithm achieved a sensitivity of 96.4% (95% CI 91.8–98.8%).';

function assertion(overrides: Partial<ModelAssertion>): ModelAssertion {
  return {
    text: 'Detects AF with 96.4% sensitivity',
    verdict: 'SUPPORTED',
    confidence: 90,
    rationale: 'The study reports this figure directly.',
    quotedExcerpt: 'achieved a sensitivity of 96.4%',
    ...overrides,
  };
}

describe('applyQuoteVerification', () => {
  it('keeps the model verdict and records the match position when the quote is found', () => {
    const [result] = applyQuoteVerification([assertion({})], EVIDENCE);

    expect(result.verdict).toBe('SUPPORTED');
    expect(result.quoteVerified).toBe(true);
    expect(result.matchedAt).toBe(EVIDENCE.indexOf('achieved a sensitivity'));
  });

  it('keeps a PARTIAL verdict when its quote is verified', () => {
    const [result] = applyQuoteVerification([assertion({ verdict: 'PARTIAL' })], EVIDENCE);
    expect(result.verdict).toBe('PARTIAL');
  });

  it('forces UNSUPPORTED when the quote is fabricated, even at confidence 100', () => {
    const [result] = applyQuoteVerification(
      [assertion({ quotedExcerpt: 'achieved a sensitivity of 98%', confidence: 100 })],
      EVIDENCE,
    );

    expect(result.verdict).toBe('UNSUPPORTED');
    expect(result.quoteVerified).toBe(false);
    expect(result.matchedAt).toBeNull();
    // The model's own confidence is kept for the record, not used for the decision.
    expect(result.confidence).toBe(100);
  });

  it('forces UNSUPPORTED when the quote is empty', () => {
    const [result] = applyQuoteVerification([assertion({ quotedExcerpt: '' })], EVIDENCE);
    expect(result.verdict).toBe('UNSUPPORTED');
    expect(result.quoteVerified).toBe(false);
  });

  it('verifies each assertion independently', () => {
    const results = applyQuoteVerification(
      [assertion({}), assertion({ quotedExcerpt: 'cleared by the FDA' })],
      EVIDENCE,
    );
    expect(results.map((r) => r.verdict)).toEqual(['SUPPORTED', 'UNSUPPORTED']);
  });
});

describe('deriveOverallVerdict', () => {
  it('is SUBSTANTIATED only when every assertion is SUPPORTED', () => {
    expect(deriveOverallVerdict(['SUPPORTED', 'SUPPORTED'])).toBe('SUBSTANTIATED');
  });

  it('is NOT_SUBSTANTIATED when any assertion is UNSUPPORTED', () => {
    expect(deriveOverallVerdict(['SUPPORTED', 'PARTIAL', 'UNSUPPORTED'])).toBe('NOT_SUBSTANTIATED');
  });

  it('is PARTIAL for a mix of SUPPORTED and PARTIAL', () => {
    expect(deriveOverallVerdict(['SUPPORTED', 'PARTIAL'])).toBe('PARTIAL');
    expect(deriveOverallVerdict(['PARTIAL'])).toBe('PARTIAL');
  });

  it('refuses to derive a verdict from zero assertions', () => {
    expect(() => deriveOverallVerdict([])).toThrow(/zero assertions/);
  });
});
