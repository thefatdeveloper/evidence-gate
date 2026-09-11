import { verifyQuote } from './quote-verifier';

// Reads like a real study: line wraps, en dashes, smart quotes.
const SOURCE = `Results: 412 participants completed monitoring (median age 64 years, range 22–84; 47% female).
For detection of any AF episode of 30 seconds or longer, the patch algorithm
achieved a sensitivity of 96.4% (95% CI 91.8–98.8%). Participants described the patch as “comfortable” and ‘easy to forget’.
Adherence was 45% in the first week.`;

describe('verifyQuote', () => {
  it('verifies an exact quote and returns its index in the original text', () => {
    const quote = 'Adherence was 45% in the first week.';
    const result = verifyQuote(quote, SOURCE);

    expect(result.verified).toBe(true);
    expect(result.matchedAt).toBe(SOURCE.indexOf(quote));
  });

  it('verifies a quote whose whitespace was reformatted (line breaks, double spaces)', () => {
    const quote = 'the patch   algorithm achieved a sensitivity\tof 96.4%';
    const result = verifyQuote(quote, SOURCE);

    expect(result.verified).toBe(true);
    // Source wraps after "algorithm"; the index still points at the real passage.
    expect(result.matchedAt).toBe(SOURCE.indexOf('the patch algorithm'));
    expect(result.normalizedQuote).toBe('the patch algorithm achieved a sensitivity of 96.4%');
  });

  it('verifies straight quotes against smart quotes in the source', () => {
    const result = verifyQuote(`described the patch as "comfortable" and 'easy to forget'`, SOURCE);

    expect(result.verified).toBe(true);
    expect(result.matchedAt).toBe(SOURCE.indexOf('described the patch'));
  });

  it('verifies smart quotes in the quote against straight quotes in the source', () => {
    const source = 'Patients called it "comfortable" overall.';
    expect(verifyQuote('called it “comfortable”', source).verified).toBe(true);
  });

  it('treats en/em dashes and ASCII hyphens as equivalent', () => {
    const result = verifyQuote('95% CI 91.8-98.8%', SOURCE);

    expect(result.verified).toBe(true);
    expect(result.matchedAt).toBe(SOURCE.indexOf('95% CI'));
  });

  it('is case-insensitive', () => {
    expect(verifyQuote('ADHERENCE WAS 45%', SOURCE).verified).toBe(true);
  });

  it('rejects a quote that is genuinely absent', () => {
    const result = verifyQuote('the device was cleared by the FDA for home use', SOURCE);

    expect(result).toEqual({
      verified: false,
      matchedAt: null,
      normalizedQuote: 'the device was cleared by the fda for home use',
    });
  });

  it.each([
    ['empty', ''],
    ['whitespace-only', '  \n\t '],
  ])('rejects an %s quote', (_label, quote) => {
    expect(verifyQuote(quote, SOURCE)).toEqual({
      verified: false,
      matchedAt: null,
      normalizedQuote: '',
    });
  });

  it('rejects a near-miss where the number differs (45% vs 54%)', () => {
    const result = verifyQuote('Adherence was 54% in the first week.', SOURCE);

    expect(result.verified).toBe(false);
    expect(result.matchedAt).toBeNull();
  });

  describe('number boundaries', () => {
    it('rejects a quote that starts mid-number ("6.4%" inside "96.4%")', () => {
      expect(verifyQuote('6.4% (95% CI', SOURCE).verified).toBe(false);
    });

    it('rejects a quote that starts after a decimal point ("4%" inside "96.4%")', () => {
      expect(verifyQuote('4% (95% CI', SOURCE).verified).toBe(false);
    });

    it('rejects a quote that truncates a decimal ("96" from "96.4%")', () => {
      expect(verifyQuote('a sensitivity of 96', SOURCE).verified).toBe(false);
    });

    it('rejects a quote that starts mid-word', () => {
      expect(verifyQuote('nsitivity of 96.4%', SOURCE).verified).toBe(false);
    });

    it('skips a mid-number occurrence and finds a later clean one', () => {
      const source = 'Overall 96.4% sensitivity; in women, 6.4% missed.';
      const result = verifyQuote('6.4%', source);

      expect(result.verified).toBe(true);
      expect(result.matchedAt).toBe(source.indexOf(' 6.4%') + 1);
    });
  });

  it('returns an index that highlights the real passage despite leading whitespace and wraps', () => {
    const source = '\n\n   Primary endpoint:\n   sensitivity   of\n96.4%   was met.';
    const result = verifyQuote('Sensitivity of 96.4% was met', source);

    expect(result.verified).toBe(true);
    expect(source.slice(result.matchedAt!)).toMatch(/^sensitivity\s+of\s+96\.4%\s+was met/);
  });
});
