import { DurableObject } from "cloudflare:workers";
import { validateExecutionRequest, buildExecutionCommand, limitOutput } from "./execution-policy.js";

type TaskStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelling"
  | "cancelled"
  | "timed_out";

type CodeTaskRecord = {
  id: string;
  language: "python" | "javascript";
  status: TaskStatus;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  finishedAt?: number;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  error?: string;
};

type ActiveRun = {
  controller: AbortController;
  cancelReason: "cancelled" | "timed_out" | null;
  timeout: ReturnType<typeof setTimeout>;
};

const TASK_PREFIX = "code-task:";
const TASK_HISTORY_LIMIT = 30;
const TASK_LIST_LIMIT = 20;
const CONTAINER_IDLE_TIMEOUT_MS = 60_000;

/** Drain output streams while retaining only a small, bounded prefix. */
async function readBoundedStream(
  stream: ReadableStream<Uint8Array> | null | undefined
): Promise<string> {
  if (!stream) return "";

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  const maxBytes = 6_000;
  let retainedBytes = 0;
  let truncated = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      const remaining = maxBytes - retainedBytes;
      if (remaining > 0) {
        const chunk = value.slice(0, remaining);
        chunks.push(chunk);
        retainedBytes += chunk.byteLength;
      }
      if (value.byteLength > remaining) truncated = true;
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(retainedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const text = new TextDecoder().decode(combined);
  return truncated ? limitOutput(text + "\n...[output truncated]") : text;
}

export class SandboxRunner extends DurableObject<Env> {
  private readonly activeRuns = new Map<string, ActiveRun>();

  /** Start one bounded task and return a task ID without exposing shell access. */
  async startCodeTask(input: unknown) {
    const validation = validateExecutionRequest(input);
    if (!validation.ok) {
      throw new Error(validation.error);
    }

    if (this.activeRuns.size > 0) {
      throw new Error("A sandbox task is already running for this workspace.");
    }

    const { language, source, timeoutSeconds } = validation.value;
    const taskId = crypto.randomUUID();
    const now = Date.now();
    const record: CodeTaskRecord = {
      id: taskId,
      language,
      status: "queued",
      createdAt: now,
      updatedAt: now
    };

    const active: ActiveRun = {
      controller: new AbortController(),
      cancelReason: null,
      timeout: setTimeout(() => {
        active.cancelReason = "timed_out";
        active.controller.abort();
      }, timeoutSeconds * 1_000)
    };

    this.activeRuns.set(taskId, active);
    await this.persistTask(record);

    // The source is kept only in this in-memory execution closure, never in the ledger.
    this.ctx.waitUntil(this.executeTask(record, source, active));

    return {
      accepted: true,
      taskId,
      status: "queued" as const,
      language,
      timeoutSeconds,
      note: "Task queued in an isolated offline Linux container. Use getCodeTaskStatus to inspect the result."
    };
  }

  async getTaskStatus(taskId: string) {
    if (!this.isTaskId(taskId)) throw new Error("Invalid task ID.");
    return (await this.ctx.storage.get<CodeTaskRecord>(TASK_PREFIX + taskId)) ?? null;
  }

  async listTasks() {
    const entries = await this.ctx.storage.list<CodeTaskRecord>({ prefix: TASK_PREFIX });
    return Array.from(entries.values())
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, TASK_LIST_LIMIT);
  }

  async cancelTask(taskId: string) {
    const record = await this.getTaskStatus(taskId);
    if (!record) return { found: false, cancelled: false };

    if (["succeeded", "failed", "cancelled", "timed_out"].includes(record.status)) {
      return { found: true, cancelled: false, status: record.status };
    }

    const active = this.activeRuns.get(taskId);
    if (active) {
      active.cancelReason = "cancelled";
      active.controller.abort();
    } else if (this.ctx.container?.running) {
      // If the DO restarted and lost its in-memory process signal, destroy this
      // task-dedicated container rather than claiming the process was stopped.
      await this.ctx.container.destroy("Sandbox task cancelled by owner.");
    }

    await this.persistTask({
      ...record,
      status: "cancelling",
      updatedAt: Date.now()
    });

    return { found: true, cancelled: true, status: "cancelling" as const };
  }

  private isTaskId(value: string): boolean {
    return typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  private async persistTask(record: CodeTaskRecord) {
    await this.ctx.storage.put(TASK_PREFIX + record.id, record);

    // Retain only the latest bounded history; source code is never persisted.
    const entries = await this.ctx.storage.list<CodeTaskRecord>({ prefix: TASK_PREFIX });
    const oldest = Array.from(entries.entries())
      .sort((left, right) => right[1].createdAt - left[1].createdAt)
      .slice(TASK_HISTORY_LIMIT);

    await Promise.all(oldest.map(([key]) => this.ctx.storage.delete(key)));
  }

  private async executeTask(
    record: CodeTaskRecord,
    source: string,
    active: ActiveRun
  ): Promise<void> {
    const startedAt = Date.now();

    try {
      await this.persistTask({
        ...record,
        status: "running",
        startedAt,
        updatedAt: startedAt
      });

      const container = this.ctx.container;
      if (!container) {
        throw new Error("The SandboxRunner container binding is not configured.");
      }

      if (!container.running) {
        container.start({
          image: container.images.base,
          instance: "lite",
          enableInternet: false,
          entrypoint: ["sleep", "infinity"]
        });
      }

      await container.setInactivityTimeout(CONTAINER_IDLE_TIMEOUT_MS);

      if (active.controller.signal.aborted) {
        throw new Error("Execution was cancelled before the process started.");
      }

      const command = buildExecutionCommand(record.language, source);
      const process = await container.exec(command, {
        cwd: "/workspace",
        signal: active.controller.signal,
        env: {
          HOME: "/tmp",
          TMPDIR: "/tmp",
          PYTHONDONTWRITEBYTECODE: "1"
        }
      });

      // Read both streams concurrently and bound retained output to protect DO memory.
      const exitCodePromise = process.exitCode.then((exitCode) => {
        clearTimeout(active.timeout);
        return exitCode;
      });
      const [stdout, stderr, exitCode] = await Promise.all([
        readBoundedStream(process.stdout),
        readBoundedStream(process.stderr),
        exitCodePromise
      ]);

      const finishedAt = Date.now();
      const status: TaskStatus = active.cancelReason === "timed_out"
        ? "timed_out"
        : active.cancelReason === "cancelled"
          ? "cancelled"
          : exitCode === 0
            ? "succeeded"
            : "failed";

      await this.persistTask({
        ...record,
        status,
        startedAt,
        finishedAt,
        updatedAt: finishedAt,
        exitCode,
        stdout,
        stderr
      });
    } catch {
      const finishedAt = Date.now();
      const status: TaskStatus = active.cancelReason === "timed_out"
        ? "timed_out"
        : active.cancelReason === "cancelled"
          ? "cancelled"
          : "failed";

      await this.persistTask({
        ...record,
        status,
        startedAt,
        finishedAt,
        updatedAt: finishedAt,
        error: status === "timed_out"
          ? "Execution reached its configured time limit."
          : status === "cancelled"
            ? "Execution was cancelled."
            : "Sandbox startup or execution failed. Verify the Workers Paid plan and container deployment."
      });
    } finally {
      clearTimeout(active.timeout);
      this.activeRuns.delete(record.id);
    }
  }
}
