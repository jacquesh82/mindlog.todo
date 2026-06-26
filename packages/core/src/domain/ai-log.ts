/** Kinds of generative AI activity recorded for transparency / cost tracking. */
export const AI_LOG_KINDS = ['ask'] as const;
export type AiLogKind = (typeof AI_LOG_KINDS)[number];

export interface AiLog {
  id: string;
  userId: string;
  kind: AiLogKind;
  model: string | null;
  prompt: string;
  response: string | null;
  inputTokens: number;
  outputTokens: number;
  createdAt: string;
}

export interface AiUsage {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}
