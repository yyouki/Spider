import test from "node:test";
import assert from "node:assert/strict";
import {
  buildExecutionCommand,
  DEFAULT_TIMEOUT_SECONDS,
  MAX_SOURCE_BYTES,
  MAX_TIMEOUT_SECONDS,
  limitOutput,
  validateExecutionRequest
} from "./execution-policy.js";

test("accepts a bounded Python request and supplies the default timeout", () => {
  const result = validateExecutionRequest({ language: "python", source: "print(2 + 2)" });

  assert.equal(result.ok, true);
  assert.equal(result.value.timeoutSeconds, DEFAULT_TIMEOUT_SECONDS);
  assert.deepEqual(
    buildExecutionCommand(result.value.language, result.value.source),
    ["python3", "-I", "-c", "print(2 + 2)"]
  );
});

test("accepts JavaScript as fixed argv without a shell", () => {
  const result = validateExecutionRequest({
    language: "javascript",
    source: "console.log(2 + 2)"
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    buildExecutionCommand(result.value.language, result.value.source),
    ["node", "--disable-proto=throw", "-e", "console.log(2 + 2)"]
  );
});

test("rejects unsupported languages and non-object requests", () => {
  assert.equal(validateExecutionRequest(null).ok, false);
  assert.equal(validateExecutionRequest({ language: "bash", source: "echo hi" }).ok, false);
});

test("rejects empty source and null bytes", () => {
  assert.equal(validateExecutionRequest({ language: "python", source: "  " }).ok, false);
  assert.equal(validateExecutionRequest({ language: "python", source: "print('x')\0" }).ok, false);
});

test("enforces the UTF-8 source size limit", () => {
  const source = "a".repeat(MAX_SOURCE_BYTES + 1);
  const result = validateExecutionRequest({ language: "javascript", source });

  assert.equal(result.ok, false);
  assert.match(result.error, /16 KB/);
});

test("enforces the execution timeout range", () => {
  assert.equal(
    validateExecutionRequest({ language: "python", source: "print(1)", timeoutSeconds: 0 }).ok,
    false
  );
  assert.equal(
    validateExecutionRequest({
      language: "python",
      source: "print(1)",
      timeoutSeconds: MAX_TIMEOUT_SECONDS + 1
    }).ok,
    false
  );
  assert.equal(
    validateExecutionRequest({ language: "python", source: "print(1)", timeoutSeconds: 5 }).ok,
    true
  );
});

test("caps retained output without changing short output", () => {
  assert.equal(limitOutput("done"), "done");
  assert.match(limitOutput("x".repeat(20), 5), /output truncated/);
});
