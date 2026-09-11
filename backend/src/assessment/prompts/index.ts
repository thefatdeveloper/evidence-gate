import { sha256 } from '../../common/hash';
import {
  AssessClaimInput,
  PROMPT_VERSION,
  SYSTEM_PROMPT,
  renderUserPrompt,
} from './assess-claim.v2';

export type { AssessClaimInput } from './assess-claim.v2';

export interface RenderedPrompt {
  promptVersion: string;
  system: string;
  user: string;
  /**
   * sha256 over everything sent that shapes the answer: system prompt, user
   * prompt, and the output schema. Editing any of them changes the hash.
   */
  promptHash: string;
}

/** Renders the current prompt version. Swap the import above to change versions. */
export function renderAssessmentPrompt(
  input: AssessClaimInput,
  outputSchema: Record<string, unknown>,
): RenderedPrompt {
  const system = SYSTEM_PROMPT;
  const user = renderUserPrompt(input);
  return {
    promptVersion: PROMPT_VERSION,
    system,
    user,
    promptHash: sha256(JSON.stringify({ system, user, outputSchema })),
  };
}
