import { verifyQuote } from './quote-verifier';

// Reads like a real test report: line wraps, en dashes, smart quotes.
const SOURCE = `Results: six production units completed the battery test (firmware 1.4.2, volume 40–60%).
With noise cancelling off and the charging case included, the earbuds
reached a charging efficiency of 96.4% (range 91.8–98.8%). Testers described the fit as “comfortable” and ‘easy to forget’.
Standby drain was 45% lower in the first week.`;

describe('verifyQuote', () => {
  it('verifies an exact quote and returns its index in the original text', () => {
    const quote = 'Standby drain was 45% lower in the first week.';
    const result = verifyQuote(quote, SOURCE);

    expect(result.verified).toBe(true);
    expect(result.matchedAt).toBe(SOURCE.indexOf(quote));
    expect(result.matchedLength).toBe(quote.length);
  });

  it('verifies a quote whose whitespace was reformatted (line breaks, double spaces)', () => {
    const quote = 'the earbuds   reached a charging\tefficiency of 96.4%';
    const result = verifyQuote(quote, SOURCE);

    expect(result.verified).toBe(true);
    // Source wraps after "earbuds"; the index still points at the real passage.
    expect(result.matchedAt).toBe(SOURCE.indexOf('the earbuds\nreached'));
    // The highlighted span is the source's own text, line break included.
    expect(highlight(SOURCE, result)).toBe('the earbuds\nreached a charging efficiency of 96.4%');
    expect(result.normalizedQuote).toBe('the earbuds reached a charging efficiency of 96.4%');
  });

  it('verifies straight quotes against smart quotes in the source', () => {
    const result = verifyQuote(`described the fit as "comfortable" and 'easy to forget'`, SOURCE);

    expect(result.verified).toBe(true);
    expect(highlight(SOURCE, result)).toBe('described the fit as “comfortable” and ‘easy to forget’');
  });

  it('verifies smart quotes in the quote against straight quotes in the source', () => {
    const source = 'Reviewers called it "comfortable" overall.';
    expect(verifyQuote('called it “comfortable”', source).verified).toBe(true);
  });

  it('treats en/em dashes and ASCII hyphens as equivalent', () => {
    const result = verifyQuote('range 91.8-98.8%', SOURCE);

    expect(result.verified).toBe(true);
    expect(result.matchedAt).toBe(SOURCE.indexOf('range 91.8'));
  });

  it('is case-insensitive', () => {
    expect(verifyQuote('STANDBY DRAIN WAS 45%', SOURCE).verified).toBe(true);
  });

  it('rejects a quote that is genuinely absent', () => {
    const result = verifyQuote('the earbuds are waterproof to 10 metres', SOURCE);

    expect(result).toEqual({
      verified: false,
      matchedAt: null,
      matchedLength: null,
      normalizedQuote: 'the earbuds are waterproof to 10 metres',
    });
  });

  it.each([
    ['empty', ''],
    ['whitespace-only', '  \n\t '],
  ])('rejects an %s quote', (_label, quote) => {
    expect(verifyQuote(quote, SOURCE)).toEqual({
      verified: false,
      matchedAt: null,
      matchedLength: null,
      normalizedQuote: '',
    });
  });

  it('rejects a near-miss where the number differs (45% vs 54%)', () => {
    const result = verifyQuote('Standby drain was 54% lower in the first week.', SOURCE);

    expect(result.verified).toBe(false);
    expect(result.matchedAt).toBeNull();
    expect(result.matchedLength).toBeNull();
  });

  describe('number boundaries', () => {
    it('rejects a quote that starts mid-number ("6.4%" inside "96.4%")', () => {
      expect(verifyQuote('6.4% (range', SOURCE).verified).toBe(false);
    });

    it('rejects a quote that starts after a decimal point ("4%" inside "96.4%")', () => {
      expect(verifyQuote('4% (range', SOURCE).verified).toBe(false);
    });

    it('rejects a quote that truncates a decimal ("96" from "96.4%")', () => {
      expect(verifyQuote('a charging efficiency of 96', SOURCE).verified).toBe(false);
    });

    it('rejects a quote that starts mid-word', () => {
      expect(verifyQuote('harging efficiency of 96.4%', SOURCE).verified).toBe(false);
    });

    it('skips a mid-number occurrence and finds a later clean one', () => {
      const source = 'Overall 96.4% efficiency; at 5 °C, 6.4% lower.';
      const result = verifyQuote('6.4%', source);

      expect(result.verified).toBe(true);
      expect(result.matchedAt).toBe(source.indexOf(' 6.4%') + 1);
      expect(highlight(source, result)).toBe('6.4%');
    });
  });

  it('returns an index that highlights the real passage despite leading whitespace and wraps', () => {
    const source = '\n\n   Primary result:\n   efficiency   of\n96.4%   was met.';
    const result = verifyQuote('Efficiency of 96.4% was met', source);

    expect(result.verified).toBe(true);
    // Span covers the source's own spacing and ends exactly at "met" — no trailing whitespace.
    expect(highlight(source, result)).toBe('efficiency   of\n96.4%   was met');
  });

  it('includes the whole final character when it is outside the BMP (two code units)', () => {
    // U+1D6FC MATHEMATICAL ITALIC SMALL ALPHA, as it appears in some typeset PDFs.
    const source = 'Listener agreement was high (Cronbach 𝛼) across sessions.';
    const result = verifyQuote('agreement was high (Cronbach 𝛼', source);

    expect(result.verified).toBe(true);
    expect(highlight(source, result)).toBe('agreement was high (Cronbach 𝛼');
  });
});

/** The passage a UI would highlight: sourceText.slice(matchedAt, matchedAt + matchedLength). */
function highlight(source: string, result: ReturnType<typeof verifyQuote>): string {
  if (result.matchedAt === null || result.matchedLength === null) {
    throw new Error('expected a verified match');
  }
  return source.slice(result.matchedAt, result.matchedAt + result.matchedLength);
}
