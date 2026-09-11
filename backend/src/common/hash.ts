import { createHash } from 'node:crypto';

/** Hex-encoded SHA-256 of a UTF-8 string. Used for evidenceHash and promptHash. */
export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
