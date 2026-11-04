import test from "node:test";
import assert from "node:assert/strict";
import { buildDockerRun, truncateUtf8, validateSandboxInput } from "./sandbox-runtime.mjs";

const taskId = "12345678-1234-4234-8234-123456789abc";

test("accepts bounded Python and JavaScript snippets", () => {
  assert.doesNotThrow(() => validateSandboxInput({ taskId, language: "python", source: "print(42)", timeoutSeconds: 10 }));
  assert.doesNotThrow(() => validateSandboxInput({ taskId, language: "javascript", source: "console.log(42)", timeoutSeconds: 1 }));
});

test("rejects unsupported language, empty or oversized source, and invalid timeout", () => {
  assert.throws(() => validateSandboxInput({ taskId, language: "bash", source: "id", timeoutSeconds: 2 }));
  assert.throws(() => validateSandboxInput({ taskId, language: "python", source: " ", timeoutSeconds: 2 }));
  assert.throws(() => validateSandboxInput({ taskId, language: "python", source: "x".repeat(16_001), timeoutSeconds: 2 }));
  assert.throws(() => validateSandboxInput({ taskId, language: "python", source: "print(1)", timeoutSeconds: 31 }));
});

test("Docker disables networking and never interpolates source into a shell", () => {
  const source = "print('hello; $(touch /tmp/pwned)')";
  const command = buildDockerRun({ taskId, language: "python", source });
  assert.ok(command.args.includes("--network=none"));
  assert.ok(command.args.includes("--read-only"));
  assert.ok(command.args.includes("--cap-drop=ALL"));
  assert.ok(command.args.includes("--user=65534:65534"));
  assert.ok(command.args.includes("/tmp:rw,noexec,nosuid,nodev,size=16m,uid=65534,gid=65534"));
  assert.equal(command.args.at(-1), source);
  assert.equal(command.args.includes("sh"), false);
  assert.equal(command.args.some((value) => value.includes("volume")), false);
});

test("truncates output within the configured UTF-8 byte limit", () => {
  const output = truncateUtf8("x".repeat(100), 32);
  assert.ok(Buffer.byteLength(output, "utf8") <= 32);
  assert.match(output, /output truncated/);
});