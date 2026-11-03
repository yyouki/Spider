export const MAX_SOURCE_BYTES = 16_000;
export const DEFAULT_TIMEOUT_SECONDS = 10;
export const MAX_TIMEOUT_SECONDS = 30;
export const MAX_OUTPUT_BYTES_PER_STREAM = 6_000;

/**
 * Validate a source-only execution request before it reaches the container.
 * The runtime never accepts an executable path, shell command, cwd, or env.
 */
export function validateExecutionRequest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Execution request must be an object." };
  }

  const { language, source } = input;
  const timeoutSeconds = input.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;

  if (language !== "python" && language !== "javascript") {
    return { ok: false, error: "Only Python and JavaScript are supported." };
  }

  if (typeof source !== "string" || source.trim().length === 0) {
    return { ok: false, error: "Source code must be a non-empty string." };
  }

  if (source.includes("\0")) {
    return { ok: false, error: "Null bytes are not allowed in source code." };
  }

  if (new TextEncoder().encode(source).byteLength > MAX_SOURCE_BYTES) {
    return { ok: false, error: "Source code exceeds the 16 KB limit." };
  }

  if (
    !Number.isInteger(timeoutSeconds) ||
    timeoutSeconds < 1 ||
    timeoutSeconds > MAX_TIMEOUT_SECONDS
  ) {
    return {
      ok: false,
      error: "Timeout must be an integer from 1 to " + MAX_TIMEOUT_SECONDS + " seconds.\n    };
  }

  return {
    ok: true,
    value: { language, source, timeoutSeconds }
  };
}

/**
 * Build a fixed executable + argv pair. User input is always a single argv
 * element and is never interpreted by a shell.
 */
export function buildExecutionCommand(language, source) {
  if (language === "python") {
    return ["python3", "-I", "-c", source];
  }

  if (language === "javascript") {
    return ["node", "--disable-proto=throw", "-e", source];
  }

  throw new TypeError("Unsupported sandbox language.");
}

/** Keep bounded diagnostic output in the persistent task ledger. */
export function limitOutput(value, maxBytes = MAX_OUTPUT_BYTES_PER_STREAM) {
  const bytes = new TextEncoder().encode(String(value ?? ""));
  if (bytes.byteLength <= maxBytes) return String(value ?? "");

  const decoder = new TextDecoder();
  const kept = decoder.decode(bytes.slice(0, maxBytes));
  return kept + "\\n...[output truncated]";\n}
