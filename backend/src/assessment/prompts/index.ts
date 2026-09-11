import { sha256 } from '../../common/hash';
import {
  AssessClaimInput,
  PROMPT_VERSION,
  SYSTEM_PROMPT,
  renderUserPrompt,
} from './assess-claim.v1';

export type { AssessClaimInput } from './assess-claim.v1';

export interface RenderedPrompt {
  promptVersion: string;
  system: string;
  user: string;
  /** sha256 over exactly what is sent to the model (system + user). */
  promptHash: string;
}

/** Renders the current prompt version. Swap the import above to change versions. */
export function renderAssessmentPrompt(input: AssessClaimInput): RenderedPrompt {
  const system = SYSTEM_PROMPT;
  const user = renderUserPrompt(input);
  return {
    promptVersion: PROMPT_VERSION,
    system,
    user,
    promptHash: sha256(JSON.stringify({ system, user })),
  };
}
