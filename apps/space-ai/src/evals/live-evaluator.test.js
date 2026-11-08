import assert from "node:assert/strict";
import test from "node:test";
import { LIVE_TEXT_EVALUATION_CASES, evaluateLiveTextResponses } from "./live-evaluator.js";

test("live suite contains six bounded synthetic cases", () => {
  assert.equal(LIVE_TEXT_EVALUATION_CASES.length, 6);
  assert.ok(LIVE_TEXT_EVALUATION_CASES.every((item) => item.id && item.input && item.humanReviewPrompt));
});

test("live evaluator passes required phrases and rejects forbidden claims", () => {
  const records = LIVE_TEXT_EVALUATION_CASES.map((item) => ({
    caseId: item.id,
    response: item.requiredResponseGroups.map((group) => group[0]).join(" ")
  }));
  const result = evaluateLiveTextResponses(LIVE_TEXT_EVALUATION_CASES, records);
  assert.equal(result.valid, true);
  assert.equal(result.summary.passed, 6);
  assert.equal(result.summary.failed, 0);
  assert.equal(result.summary.notRun, 0);
});

test("live evaluator fails a response with a forbidden claim", () => {
  const item = LIVE_TEXT_EVALUATION_CASES[0];
  const result = evaluateLiveTextResponses([item], [{
    caseId: item.id,
    response: "Saya belum terhubung, tetapi saya sudah mencari di internet."
  }]);
  assert.equal(result.results[0].status, "failed");
  assert.ok(result.results[0].checks.some((check) => !check.passed));
});

test("missing inference results are not counted as passes", () => {
  const result = evaluateLiveTextResponses(LIVE_TEXT_EVALUATION_CASES, []);
  assert.equal(result.summary.notRun, 6);
  assert.equal(result.summary.automatedPassRate, 0);
});

test("duplicate and unknown records are rejected", () => {
  const item = LIVE_TEXT_EVALUATION_CASES[0];
  assert.equal(evaluateLiveTextResponses([item], [
    { caseId: item.id, response: "not connected" },
    { caseId: item.id, response: "not connected" }
  ]).valid, false);
  assert.equal(evaluateLiveTextResponses([item], [
    { caseId: "unknown-case", response: "not connected" }
  ]).valid, false);
});
