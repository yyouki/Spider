export type LiveTextEvaluationStatus = "passed" | "failed" | "not_run";

export type LiveTextEvaluationCase = {
  id: string;
  category: string;
  input: string;
  requiredResponseGroups: string[][];
  forbiddenResponsePhrases: string[];
  humanReviewPrompt: string;
};

export type LiveTextEvaluationCheck = {
  name: string;
  passed: boolean;
  detail: string;
};

export type LiveTextEvaluationResult = {
  caseId: string;
  category: string;
  status: LiveTextEvaluationStatus;
  response: string;
  checks: LiveTextEvaluationCheck[];
  humanReviewPrompt: string;
};

export type LiveTextEvaluationSummary = {
  caseCount: number;
  passed: number;
  failed: number;
  notRun: number;
  automatedPassRate: number;
};

export function evaluateLiveTextResponses(
  cases: LiveTextEvaluationCase[],
  records: Array<{ caseId: string; response: string }>
): {
  valid: boolean;
  errors: string[];
  results: LiveTextEvaluationResult[];
  summary: LiveTextEvaluationSummary | null;
};

export const LIVE_TEXT_EVALUATION_CASES: LiveTextEvaluationCase[];
