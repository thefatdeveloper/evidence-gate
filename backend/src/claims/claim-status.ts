export const CLAIM_STATUS = {
  DRAFTED: 'DRAFTED',
  ASSESSED: 'ASSESSED',
  APPROVED: 'APPROVED',
  SENT_BACK: 'SENT_BACK',
} as const;

export type ClaimStatus = (typeof CLAIM_STATUS)[keyof typeof CLAIM_STATUS];

export const DECISION_OUTCOMES = [CLAIM_STATUS.APPROVED, CLAIM_STATUS.SENT_BACK] as const;
export type DecisionOutcome = (typeof DECISION_OUTCOMES)[number];
