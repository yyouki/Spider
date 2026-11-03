/**
 * Decide whether a release candidate may be auto-promoted.
 * This is a policy gate, not a deployer. Call it only with evidence produced
 * by trusted CI, security scanning, staging, and rollback verification.
 *
 * @typedef {{ name: string, status: "passed" | "failed" | "skipped" }} CheckResult
 * @typedef {{
 *   risk: "low" | "medium" | "high";
 *   requiredChecks: CheckResult[];
 *   evaluation: { passed: number; total: number };
 *   securityFindings: { critical: number; high: number; medium: number };
 *   protectedAreasChanged: boolean;
 *   rollbackVerified: boolean;
 *   stagingHealth: { passed: number; total: number };
 *   artifactIntegrityVerified: boolean;
 *   budgetApproved: boolean;
 * }} ReleaseEvidence
 */

/**
 * @param {ReleaseEvidence} evidence
 * @returns {{ autoPromote: boolean; requiresOwnerApproval: boolean; reasons: string[] }}
 */
export function evaluateReleaseCandidate(evidence) {
  const reasons = [];

  if (evidence.risk !== "low") {
    reasons.push("Only low-risk application changes may be auto-promoted.");
  }

  const checks = Array.isArray(evidence.requiredChecks) ? evidence.requiredChecks : [];
  if (checks.length === 0 || checks.some((check) => check.status !== "passed")) {
    reasons.push("Every required CI check must pass; failed or skipped checks block promotion.");
  }

  const evaluation = evidence.evaluation;
  if (
    !evaluation ||
    !Number.isInteger(evaluation.total) ||
    evaluation.total <= 0 ||
    evaluation.passed !== evaluation.total
  ) {
    reasons.push("Every registered evaluation case must pass.");
  }

  const findings = evidence.securityFindings;
  if (
    !findings ||
    findings.critical !== 0 ||
    findings.high !== 0 ||
    findings.medium !== 0
  ) {
    reasons.push("Unresolved critical, high, or medium security findings block promotion.");
  }

  if (evidence.protectedAreasChanged) {
    reasons.push("Authentication, security policy, permissions, and secrets-related files require owner review.");
  }

  if (!evidence.rollbackVerified) {
    reasons.push("A verified rollback artifact is required.");
  }

  const staging = evidence.stagingHealth;
  if (
    !staging ||
    !Number.isInteger(staging.total) ||
    staging.total <= 0 ||
    staging.passed !== staging.total
  ) {
    reasons.push("Every staging health check must pass.");
  }

  if (!evidence.artifactIntegrityVerified) {
    reasons.push("The release artifact integrity must be verified.");
  }

  if (!evidence.budgetApproved) {
    reasons.push("The release must fit within the owner's configured resource and cost budget.");
  }

  return {
    autoPromote: reasons.length === 0,
    requiresOwnerApproval: reasons.length > 0,
    reasons
  };
}
