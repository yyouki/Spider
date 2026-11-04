import { spawn } from "node:child_process";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDockerRun, truncateUtf8, validateSandboxInput, MAX_OUTPUT_BYTES } from "./sandbox-runtime.mjs";

const hostEnv = {
  PATH: process.env.PATH ?? "/usr/bin:/bin",
  HOME: process.env.HOME ?? "/home/runner"
};

function runDockerPull(image) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["pull", image], { env: hostEnv, stdio: "ignore" });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Container image preparation timed out."));
    }, 90_000);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(new Error("Docker is unavailable: " + error.message));
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error("Could not prepare the sandbox runtime image."));
    });
  });
}

function collectBounded(stream, limit) {
  const chunks = [];
  let retained = 0;
  let truncated = false;
  stream.on("data", (chunk) => {
    const bytes = Buffer.from(chunk);
    const remaining = limit - retained;
    if (remaining > 0) {
      const piece = bytes.subarray(0, remaining);
      chunks.push(piece);
      retained += piece.length;
    }
    if (bytes.length > remaining) truncated = true;
  });
  return () => {
    const value = Buffer.concat(chunks, retained).toString("utf8");
    return truncated ? truncateUtf8(value + "x".repeat(limit), limit) : value;
  };
}

function runContainer({ name, args, timeoutSeconds }) {
  return new Promise((resolve) => {
    const child = spawn("docker", args, { env: hostEnv, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = collectBounded(child.stdout, MAX_OUTPUT_BYTES);
    const stderr = collectBounded(child.stderr, MAX_OUTPUT_BYTES);
    let timedOut = false;
    let settled = false;
    const timer = setTimeout(() => {
      timedOut = true;
      const kill = spawn("docker", ["kill", name], { env: hostEnv, stdio: "ignore" });
      kill.once("close", () => child.kill("SIGKILL"));
      kill.once("error", () => child.kill("SIGKILL"));
    }, timeoutSeconds * 1_000);

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...result, stdout: stdout(), stderr: stderr() });
    };

    child.once("error", (error) => finish({
      status: "failed",
      exitCode: null,
      error: "Docker execution failed: " + error.message
    }));
    child.once("close", (code) => finish({
      status: timedOut ? "timed_out" : code === 0 ? "succeeded" : "failed",
      exitCode: typeof code === "number" ? code : null,
      ...(timedOut ? { error: "Execution reached its configured time limit." } : {})
    }));
  });
}

async function main() {
  const taskId = process.env.TASK_ID ?? "";
  const language = process.env.LANGUAGE ?? "";
  const encryptedSource = process.env.SOURCE_ENCRYPTED ?? "";
  const timeoutSeconds = Number(process.env.TIMEOUT_SECONDS ?? "10");
  const taskKey = Buffer.from(process.env.TASK_KEY ?? "", "base64");
  const validTaskId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(taskId);
  const safeTaskId = validTaskId ? taskId : "invalid-task";
  const outputDirectory = join(process.env.RUNNER_TEMP ?? tmpdir(), "space-sandbox-" + safeTaskId);
  const outputFile = join(outputDirectory, "result.bin");
  const base = {
    taskId,
    language,
    status: "failed",
    exitCode: null,
    stdout: "",
    stderr: "",
    error: "Sandbox task did not complete."
  };

  let result = base;
  try {
    if (!validTaskId) throw new Error("Invalid task ID.");
    if (taskKey.byteLength !== 32) throw new Error("The one-time sandbox task key is invalid.");
    const encrypted = Buffer.from(encryptedSource, "base64");
    if (encrypted.length < 28 || encrypted.length > 32_000) {
      throw new Error("Encrypted source payload has an invalid size.");
    }

    const sourceIv = encrypted.subarray(0, 12);
    const sourceTag = encrypted.subarray(encrypted.length - 16);
    const sourceCiphertext = encrypted.subarray(12, encrypted.length - 16);
    const decipher = createDecipheriv("aes-256-gcm", taskKey, sourceIv);
    decipher.setAuthTag(sourceTag);
    const source = Buffer.concat([decipher.update(sourceCiphertext), decipher.final()]).toString("utf8");

    validateSandboxInput({ taskId, language, source, timeoutSeconds });
    const docker = buildDockerRun({ taskId, language, source });
    await runDockerPull(docker.image);
    const execution = await runContainer({ ...docker, timeoutSeconds });
    result = { ...base, ...execution, ...(execution.error ? {} : { error: undefined }) };
  } catch (error) {
    result = {
      ...base,
      error: error instanceof Error ? error.message.slice(0, 500) : "Sandbox execution failed."
    };
  }

  await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
  if (taskKey.byteLength !== 32) throw new Error("Cannot encrypt sandbox result without the one-time task key.");
  const resultIv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", taskKey, resultIv);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(result), "utf8")),
    cipher.final()
  ]);
  await writeFile(outputFile, Buffer.concat([resultIv, ciphertext, cipher.getAuthTag()]), { mode: 0o600 });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}