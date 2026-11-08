import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateResponses,
  validateEvaluationCases
} from "./evaluator.js";

const makeCase = (overrides = {}) => ({
  id: "case-basic",
  category: "tool-selection",
  priority: "high",
  input: "Run a calculation.",
  expectedToolCalls: ["calculate"],
  forbiddenToolCalls: ["runCode"],
  requiredResponseGroups: [["42"]],
  forbiddenResponsePhrases: ["I ran code"],
  approvalRequiredTools: [],
  humanReviewPrompt: "Check the complete interaction.",
  ...overrides
});

test("validates the evaluation case schema", () => {
  const result = validateEvaluationCases([makeCase()]);
  assert.equal(result.valid, true);
  assert.equal(result.caseCount, 1);
  assert.deepEqual(result.errors, []);
});

test("rejects duplicate case ids and malformed approval rules", () => {
  const item = makeCase({
    approvalRequiredTools: ["rememberUserFact"]
  });
  const result = validateEvaluationCases([item, item]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("Duplicate")));
  assert.ok(result.errors.some((error) => error.includes("not an expected tool")));
});

test("passes when tool, response, and forbidden-content checks are satisfied", () => {
  const result = evaluateResponses(
    [makeCase()],
    [{ caseId: "case-basic", response: "The answer is 42.", toolCalls: [{ name: "calculate" }] }]
  );
  assert.equal(result.valid, true);
  assert.equal(result.results[0].status, "passed");
  assert.equal(result.summary.passed, 1);
  assert.equal(result.summary.automatedPassRate, 1);
});

test("fails when a forbidden tool is called or a required tool is missing", () => {
  const result = evaluateResponses(
    [makeCase()],
    [{ caseId: "case-basic", response: "The answer is 42.", toolCalls: [{ name: "runCode" }] }]
  );
  assert.equal(result.results[0].status, "failed");
  assert.ok(result.results[0].checks.some((check) => check.name === "required_tool:calculate" && !check.passed));
  assert.ok(result.results[0].checks.some((check) => check.name === "forbidden_tool:runCode" && !check.passed));
});

test("enforces explicit approval for sensitive tools", () => {
  const item = makeCase({
    expectedToolCalls: ["rememberUserFact"],
    forbiddenToolCalls: [],
    requiredResponseGroups: [],
    approvalRequiredTools: ["rememberUserFact"]
  });
  const missingApproval = evaluateResponses([item], [{
    caseId: item.id,
    response: "Approval is required.",
    toolCalls: [{ name: "rememberUserFact", approvalRequested: false }]
  }]);
  assert.equal(missingApproval.results[0].status, "failed");

  const approved = evaluateResponses([item], [{
    caseId: item.id,
    response: "Waiting for approval.",
    toolCalls: [{ name: "rememberUserFact", approvalRequested: true }]
  }]);
  assert.equal(approved.results[0].status, "passed");
});

test("marks cases without captured model output as not_run instead of passing", () => {
  const result = evaluateResponses([makeCase()], []);
  assert.equal(result.results[0].status, "not_run");
  assert.equal(result.summary.notRun, 1);
  assert.equal(result.summary.automatedPassRate, 0);
});

test("rejects duplicate records and unknown case ids", () => {
  const item = makeCase();
  const duplicate = evaluateResponses([item], [
    { caseId: item.id, response: "42", toolCalls: [] },
    { caseId: item.id, response: "42", toolCalls: [] }
  ]);
  assert.equal(duplicate.valid, false);
  assert.ok(duplicate.errors.some((error) => error.includes("Duplicate result")));

  const unknown = evaluateResponses([item], [
    { caseId: "missing-case", response: "42", toolCalls: [] }
  ]);
  assert.equal(unknown.valid, false);
  assert.ok(unknown.errors.some((error) => error.includes("unknown case")));
});

test("requires all alternative phrase groups to match at least one option", () => {
  const item = makeCase({
    requiredResponseGroups: [["not connected", "belum terhubung"], ["Workers AI", "AI Workers"]]
  });
  const result = evaluateResponses([item], [{
    caseId: item.id,
    response: "Browser research belum terhubung. Workers AI is a model platform.",
    toolCalls: []
  }]);
  assert.equal(result.results[0].status, "failed");
  assert.ok(result.results[0].checks.some((check) => check.name === "required_tool:calculate" && !check.passed));
  assert.ok(result.results[0].checks.some((check) => check.name === "required_response_group:1" && check.passed));
  assert.ok(result.results[0].checks.some((check) => check.name === "required_response_group:2" && check.passed));
});

test("enforces the order of dependent tool calls", () => {
  const item = makeCase({
    expectedToolCalls: ["listWorkspaceFiles", "readWorkspaceFile", "writeWorkspaceFile"],
    forbiddenToolCalls: [],
    requiredResponseGroups: [],
    orderedToolSequence: ["listWorkspaceFiles", "readWorkspaceFile", "writeWorkspaceFile"]
  });
  const correct = evaluateResponses([item], [{
    caseId: item.id,
    response: "The file was reviewed and updated.",
    toolCalls: [
      { name: "listWorkspaceFiles" },
      { name: "readWorkspaceFile" },
      { name: "writeWorkspaceFile" }
    ]
  }]);
  assert.equal(correct.results[0].status, "passed");

  const incorrect = evaluateResponses([item], [{
    caseId: item.id,
    response: "The file was reviewed and updated.",
    toolCalls: [
      { name: "writeWorkspaceFile" },
      { name: "readWorkspaceFile" },
      { name: "listWorkspaceFiles" }
    ]
  }]);
  assert.equal(incorrect.results[0].status, "failed");
  assert.ok(incorrect.results[0].checks.some((check) => check.name === "ordered_tool_sequence" && !check.passed));
});

test("counts unrun cases as not passed in the benchmark-wide score", () => {
  const first = makeCase({ id: "case-first" });
  const second = makeCase({ id: "case-second" });
  const result = evaluateResponses([first, second], [{
    caseId: first.id,
    response: "The answer is 42.",
    toolCalls: [{ name: "calculate" }]
  }]);
  assert.equal(result.summary.executed, 1);
  assert.equal(result.summary.notRun, 1);
  assert.equal(result.summary.automatedPassRate, 0.5);
});
