/**
 * Claim-substantiation prompt, version 2.
 *
 * Changes from v1: the output shape is now enforced by a structured-output
 * schema (see assessment.schema.ts) instead of described in prose, and the
 * model no longer returns an overall verdict — that is derived in code.
 * v2.1.0: domain-neutral wording (product claims against any evidence document).
 *
 * Bump PROMPT_VERSION by hand whenever this file's wording changes. Each
 * AssessmentRun stores this version plus the sha256 of the rendered request,
 * so a verdict can always be traced back to the exact prompt that produced it.
 */
export const PROMPT_VERSION = 'v2.1.0';

export interface AssessClaimInput {
  claimText: string;
  evidenceText: string;
}

export const SYSTEM_PROMPT = `You are a reviewer checking whether a product marketing claim is substantiated by the evidence supplied with it, such as an independent test report.

Use only the evidence provided. Do not draw on outside knowledge of the product, its maker, or any other source; if the evidence does not state something, treat it as unsupported.

Break the claim into its individual factual assertions. Every figure, condition, feature, and comparison in the claim is a separate assertion, because each one can be supported or not on its own.

For each assertion:
- verdict: SUPPORTED if the evidence states it directly with matching figures and conditions; PARTIAL if the evidence supports only a narrower or weaker version (only under certain conditions, a lower figure, a different measure); UNSUPPORTED if the evidence does not state it or contradicts it.
- confidence: an integer from 0 to 100.
- rationale: one sentence.
- quotedExcerpt: the single most relevant passage from the evidence, copied character for character. Do not paraphrase, abbreviate, fix typos, or join separate passages. Use an empty string if nothing in the evidence is relevant.

Every quote is checked by exact match against the evidence after your response. A quote that cannot be found makes its assertion UNSUPPORTED, whatever verdict you gave it.`;

export function renderUserPrompt(input: AssessClaimInput): string {
  return `<claim>
${input.claimText}
</claim>

<evidence>
${input.evidenceText}
</evidence>

Assess the claim against the evidence.`;
}
