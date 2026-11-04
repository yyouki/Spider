export const MAX_SOURCE_BYTES = 16_000;
export const MAX_TIMEOUT_SECONDS = 30;
export const MAX_OUTPUT_BYTES = 6_000;

export function validateSandboxInput({ taskId, language, source, timeoutSeconds }) {
  if (typeof taskId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(taskId)) {
    throw new TypeError("Invalid task ID.");
  }
  if (language !== "python" && language !== "javascript") {
    throw new TypeError("Only Python and JavaScript are supported.");
  }
  if (typeof source !== "string" || source.trim().length === 0) {
    throw new TypeError("Source must not be empty.");
  }
  if (source.includes("\0") || Buffer.byteLength(source, "utf8") > MAX_SOURCE_BYTES) {
    throw new RangeError("Source exceeds the 16 KB limit or contains a null byte.");
  }
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > MAX_TIMEOUT_SECONDS) {
    throw new RangeError("Timeout must be an integer from 1 to 30 seconds.");
  }
}

/** Build argv directly; source code is never parsed by a shell. */
export function buildDockerRun({ taskId, language, source }) {
  const name = "space-sandbox-" + taskId;
  const image = language === "python" ? "python:3.13-alpine" : "node:24-alpine";
  const command = language === "python"
    ? ["python3", "-I", "-c", source]
    : ["node", "--disable-proto=throw", "-e", source];

  return {
    name,
    image,
    args: [
      "run", "--rm", "--pull=never", "--name", name,
      "--network=none", "--read-only", "--cap-drop=ALL",
      "--security-opt=no-new-privileges:true",
      "--pids-limit=32", "--memory=256m", "--memory-swap=256m", "--cpus=0.5",
      "--ulimit", "core=0", "--user=65534:65534",
      "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=16m,uid=65534,gid=65534",
      "--env", "HOME=/tmp", "--env", "TMPDIR=/tmp",
      "--env", "PYTHONDONTWRITEBYTECODE=1",
      image,
      ...command
    ]
  };
}

export function truncateUtf8(value, maxBytes = MAX_OUTPUT_BYTES) {
  const buffer = Buffer.from(String(value ?? ""), "utf8");
  if (buffer.byteLength <= maxBytes) return buffer.toString("utf8");
  const marker = "\n...[output truncated]";
  const keep = Math.max(0, maxBytes - Buffer.byteLength(marker, "utf8"));
  return buffer.subarray(0, keep).toString("utf8") + marker;
}