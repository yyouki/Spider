import test from "node:test";
import assert from "node:assert/strict";
import { evaluateReleaseCandidate } from "./release-gate.js";

const passingEvidence = () => ({
  risk: "low",
  requiredChecks: [
    { name: "typecheck", status: "passed" },
    { name: "unit-tests", status: "passed" },
    { name: "security-scan", status: "passed" },
    { name: "build", status: "passed" }
  ],
  evaluation: { passed: 120, total: 120 },
  securityFindings: { critical: 0, high: 0, medium: 0 },
  protectedAreasChanged: false,
  rollbackVerified: true,
  stagingHealth: { passed: 8, total: 8 },
  artifactIntegrityVerified: true,
  budgetApproved: true
});

test("allows a low-risk candidate only when every release gate passes", () => {
  const result = evaluateReleaseCandidate(passingEvidence());
  assert.equal(result.autoPromote, true);
  assert.equal(result.requiresOwnerApproval, false);
  assert.deepEqual(result.reasons, []);
});

test("blocks promotion when one evaluation case fails", () => {
  const evidence = passingEvidence();
  evidence.evaluation.passed = 119;

  const result = evaluateReleaseCandidate(evidence);
  assert.equal(result.autoPromote, false);
  assert.ok(result.reasons.some((reason) => reason.includes("evaluation")));
});

test("blocks promotion for protected authentication or security changes", () => {
  const evidence = passingEvidence();
  evidence.protectedAreasChanged = true;

  const result = evaluateReleaseCandidate(evidence);
  assert.equal(result.autoPromote, false);
  assert.ok(result.reasons.some((reason) => reason.includes("require owner review")));
});

test("blocks promotion when rollback is not verified", () => {
  const evidence = passingEvidence();
  evidence.rollbackVerified = false;

  const result = evaluateReleaseCandidate(evidence);
  assert.equal(result.autoPromote, false);
  assert.ok(result.reasons.some((reason) => reason.includes("rollback")));
});

test("blocks promotion when a check is skipped", () => {
  const evidence = passingEvidence();
  evidence.requiredChecks[0].status = "skipped";

  const result = evaluateReleaseCandidate(evidence);
  assert.equal(result.autoPromote, false);
});

test("blocks promotion when risk is medium or high", () => {
  const evidence = passingEvidence();
  evidence.risk = "medium";

  const result = evaluateReleaseCandidate(evidence);
  assert.equal(result.autoPromote, false);
  assert.ok(result.reasons.some((reason) => reason.includes("low-risk")));
});
