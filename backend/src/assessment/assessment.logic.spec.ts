import { applyQuoteVerification, deriveOverallVerdict } from './assessment.logic';
import { ModelAssertion } from './assessment.schema';

const EVIDENCE =
  'With noise cancelling off and the case included, total playback time was 32.4 hours (range 30.9–33.6 hours).';

function assertion(overrides: Partial<ModelAssertion>): ModelAssertion {
  return {
    text: 'Lasts 32.4 hours with the case',
    verdict: 'SUPPORTED',
    confidence: 90,
    rationale: 'The report states this figure directly.',
    quotedExcerpt: 'total playback time was 32.4 hours',
    ...overrides,
  };
}

describe('applyQuoteVerification', () => {
  it('keeps the model verdict and records the match position when the quote is found', () => {
    const [result] = applyQuoteVerification([assertion({})], EVIDENCE);

    expect(result.verdict).toBe('SUPPORTED');
    expect(result.quoteVerified).toBe(true);
    expect(result.matchedAt).toBe(EVIDENCE.indexOf('total playback time'));
    expect(result.matchedLength).toBe('total playback time was 32.4 hours'.length);
  });

  it('keeps a PARTIAL verdict when its quote is verified', () => {
    const [result] = applyQuoteVerification([assertion({ verdict: 'PARTIAL' })], EVIDENCE);
    expect(result.verdict).toBe('PARTIAL');
  });

  it('forces UNSUPPORTED when the quote is fabricated, even at confidence 100', () => {
    const [result] = applyQuoteVerification(
      [assertion({ quotedExcerpt: 'total playback time was 40 hours', confidence: 100 })],
      EVIDENCE,
    );

    expect(result.verdict).toBe('UNSUPPORTED');
    expect(result.quoteVerified).toBe(false);
    expect(result.matchedAt).toBeNull();
    expect(result.matchedLength).toBeNull();
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
      [assertion({}), assertion({ quotedExcerpt: 'certified waterproof' })],
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
