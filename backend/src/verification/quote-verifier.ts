/**
 * Checks that a quote the model attributes to the evidence actually appears in it.
 *
 * Matching is tolerant of cosmetic reformatting (whitespace, smart quotes,
 * dashes, letter case) but never of content: digits, units, percent signs and
 * decimal points are compared exactly, and a match must start and end on a
 * word/number boundary so "6.4%" cannot verify against "96.4%".
 */

export interface QuoteVerification {
  verified: boolean;
  /** Index into the ORIGINAL sourceText where the match starts; null if unverified. */
  matchedAt: number | null;
  normalizedQuote: string;
}

interface Normalized {
  text: string;
  /** map[i] = index in the original string of the character that produced text[i]. */
  map: number[];
}

const WORD_CHAR = /[\p{L}\p{N}]/u;
const DIGIT = /\p{Nd}/u;
const DECIMAL_SEPARATOR = /[.,]/;

/** Cosmetic folding for a single character. Must never remove or merge content. */
function foldChar(ch: string): string {
  switch (ch) {
    case '“': // “
    case '”': // ”
    case '„': // „
    case '‟': // ‟
      return '"';
    case '‘': // ‘
    case '’': // ’
    case '‚': // ‚
    case '‛': // ‛
      return "'";
    case '–': // – en dash
    case '—': // — em dash
    case '−': // − minus sign
      return '-';
    default:
      return ch.toLowerCase();
  }
}

/**
 * Collapses whitespace runs to one space, trims, folds quotes/dashes/case, and
 * records where each output character came from in the input.
 */
function normalizeWithMap(input: string): Normalized {
  let text = '';
  const map: number[] = [];
  let pendingSpaceAt = -1;
  let i = 0;

  for (const ch of input) {
    if (/\s/u.test(ch)) {
      if (pendingSpaceAt < 0) pendingSpaceAt = i;
    } else {
      // Emit a collapsed space only between non-space content (this also trims).
      if (pendingSpaceAt >= 0 && text.length > 0) {
        text += ' ';
        map.push(pendingSpaceAt);
      }
      pendingSpaceAt = -1;
      // Lower-casing can lengthen a character (e.g. "İ"); map every code unit.
      const folded = foldChar(ch);
      for (let k = 0; k < folded.length; k++) map.push(i);
      text += folded;
    }
    i += ch.length;
  }

  return { text, map };
}

export function normalizeForMatch(input: string): string {
  return normalizeWithMap(input).text;
}

/** True if a match of `quote` at `start` in `source` does not begin mid-word or mid-number. */
function startsOnBoundary(source: string, start: number, quote: string): boolean {
  if (start === 0) return true;
  const first = quote[0];
  const prev = source[start - 1];
  if (WORD_CHAR.test(first) && WORD_CHAR.test(prev)) return false;
  // "4%" must not match the tail of "96.4%".
  if (
    DIGIT.test(first) &&
    DECIMAL_SEPARATOR.test(prev) &&
    start >= 2 &&
    DIGIT.test(source[start - 2])
  ) {
    return false;
  }
  return true;
}

/** True if a match of `quote` ending at `end` (exclusive) does not stop mid-word or mid-number. */
function endsOnBoundary(source: string, end: number, quote: string): boolean {
  if (end === source.length) return true;
  const last = quote[quote.length - 1];
  const next = source[end];
  if (WORD_CHAR.test(last) && WORD_CHAR.test(next)) return false;
  // "96" must not match the head of "96.4".
  if (
    DIGIT.test(last) &&
    DECIMAL_SEPARATOR.test(next) &&
    end + 1 < source.length &&
    DIGIT.test(source[end + 1])
  ) {
    return false;
  }
  return true;
}

export function verifyQuote(quotedExcerpt: string, sourceText: string): QuoteVerification {
  const quote = normalizeForMatch(quotedExcerpt);
  const unverified: QuoteVerification = { verified: false, matchedAt: null, normalizedQuote: quote };
  if (quote.length === 0) return unverified;

  const source = normalizeWithMap(sourceText);

  // Take the first occurrence that sits on clean boundaries, not merely the first occurrence.
  for (
    let at = source.text.indexOf(quote);
    at !== -1;
    at = source.text.indexOf(quote, at + 1)
  ) {
    if (
      startsOnBoundary(source.text, at, quote) &&
      endsOnBoundary(source.text, at + quote.length, quote)
    ) {
      return { verified: true, matchedAt: source.map[at], normalizedQuote: quote };
    }
  }

  return unverified;
}
