import { DurableObject } from "cloudflare:workers";
import { unzipSync } from "fflate";
import { MAX_OUTPUT_BYTES_PER_STREAM, validateExecutionRequest } from "./execution-policy.js";

type TaskStatus = "queued" | "running" | "succeeded" | "failed" | "cancelling" | "cancelled" | "timed_out";
type Task = {
  id: string;
  language: "python" | "javascript";
  status: TaskStatus;
  createdAt: number;
  updatedAt: number;
  finishedAt?: number;
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
  error?: string;
  workflowRunId?: number;
};
type StoredTask = Task & { resultKey?: string };
type WorkflowRun = { id: number; display_title?: string; status: string; conclusion: string | null };
type Artifact = { name: string; expired: boolean; archive_download_url: string };

const API_ROOT = "https://api.github.com/repos/yyouki/space";
const WORKFLOW = "sandbox-run.yml";
const PREFIX = "code-task:";
const HISTORY_LIMIT = 30;
const TERMINAL: TaskStatus[] = ["succeeded", "failed", "cancelled", "timed_out"];

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export class SandboxRunner extends DurableObject<Env> {
  private submitting = false;

  private publicTask(task: StoredTask): Task {
    const { resultKey: _secret, ...safe } = task;
    return safe;
  }

  private async github(path: string, init: RequestInit = {}): Promise<Response> {
    const token = this.env.GITHUB_ACTIONS_TOKEN;
    if (!token) throw new Error("GitHub Actions integration is not configured.");
    const headers = new Headers(init.headers);
    headers.set("Authorization", "Bearer " + token);
    headers.set("Accept", "application/vnd.github+json");
    headers.set("X-GitHub-Api-Version", "2022-11-28");
    headers.set("User-Agent", "space-ai-sandbox");
    if (init.body) headers.set("Content-Type", "application/json");
    const response = await fetch(
      path.startsWith("https://") ? path : API_ROOT + "/" + path,
      { ...init, headers }
    );
    if (!response.ok) throw new Error("GitHub Actions API returned HTTP " + response.status + ".");
    return response;
  }

  private async encryptSource(source: string, keyBytes: Uint8Array): Promise<string> {
    const key = await crypto.subtle.importKey("raw", asArrayBuffer(keyBytes), "AES-GCM", false, ["encrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, tagLength: 128 },
      key,
      new TextEncoder().encode(source)
    );
    const payload = new Uint8Array(iv.length + ciphertext.byteLength);
    payload.set(iv, 0);
    payload.set(new Uint8Array(ciphertext), iv.length);
    // Only ciphertext is stored in the public GitHub workflow event.
    return base64(payload);
  }

  private async findRun(taskId: string): Promise<WorkflowRun | null> {
    const query = new URLSearchParams({ event: "workflow_dispatch", branch: "main", per_page: "100" });
    const response = await this.github("actions/workflows/" + WORKFLOW + "/runs?" + query.toString());
    const data = await response.json() as { workflow_runs?: WorkflowRun[] };
    const title = "space-sandbox-" + taskId;
    return data.workflow_runs?.find((run) => run.display_title === title) ?? null;
  }

  private async readArtifact(runId: number, taskId: string, encodedKey: string) {
    const response = await this.github("actions/runs/" + runId + "/artifacts?per_page=100");
    const data = await response.json() as { artifacts?: Artifact[] };
    const artifact = data.artifacts?.find((item) => item.name === "space-result-" + taskId && !item.expired);
    if (!artifact) throw new Error("Sandbox result artifact is not available yet.");

    const zipResponse = await this.github(artifact.archive_download_url);
    const zip = new Uint8Array(await zipResponse.arrayBuffer());
    if (zip.byteLength > 1_000_000) throw new Error("Sandbox result artifact is unexpectedly large.");
    const encrypted = unzipSync(zip)["result.bin"];
    if (!encrypted || encrypted.byteLength < 28) throw new Error("Sandbox result artifact is malformed.");

    const keyBytes = fromBase64(encodedKey);
    if (keyBytes.byteLength !== 32) throw new Error("Sandbox task key is invalid.");
    const key = await crypto.subtle.importKey("raw", asArrayBuffer(keyBytes), "AES-GCM", false, ["decrypt"]);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: asArrayBuffer(encrypted.subarray(0, 12)), tagLength: 128 },
      key,
      asArrayBuffer(encrypted.subarray(12))
    );
    const result = JSON.parse(new TextDecoder().decode(plaintext)) as {
      status?: TaskStatus;
      exitCode?: number | null;
      stdout?: string;
      stderr?: string;
      error?: string;
    };
    if (!result.status || !TERMINAL.includes(result.status)) throw new Error("Sandbox result status is invalid.");
    return {
      status: result.status,
      exitCode: typeof result.exitCode === "number" ? result.exitCode : null,
      stdout: String(result.stdout ?? "").slice(0, MAX_OUTPUT_BYTES_PER_STREAM),
      stderr: String(result.stderr ?? "").slice(0, MAX_OUTPUT_BYTES_PER_STREAM),
      ...(result.error ? { error: String(result.error).slice(0, 500) } : {})
    };
  }

  private async persist(task: StoredTask): Promise<void> {
    await this.ctx.storage.put(PREFIX + task.id, task);
    const rows = await this.ctx.storage.list<StoredTask>({ prefix: PREFIX });
    const oldest = [...rows.entries()]
      .sort((a, b) => b[1].createdAt - a[1].createdAt)
      .slice(HISTORY_LIMIT);
    await Promise.all(oldest.map(([key]) => this.ctx.storage.delete(key)));
  }

  async startCodeTask(input: unknown) {
    const validation = validateExecutionRequest(input);
    if (!validation.ok) throw new Error(validation.error);
    if (this.submitting) throw new Error("A sandbox task is already being submitted.");

    this.submitting = true;
    try {
      const rows = await this.ctx.storage.list<StoredTask>({ prefix: PREFIX });
      if ([...rows.values()].some((task) => ["queued", "running", "cancelling"].includes(task.status))) {
        throw new Error("A sandbox task is already active for this workspace.");
      }

      const { language, source, timeoutSeconds } = validation.value;
      const id = crypto.randomUUID();
      const now = Date.now();
      const keyBytes = crypto.getRandomValues(new Uint8Array(32));
      const resultKey = base64(keyBytes);
      const task: StoredTask = {
        id,
        language,
        status: "queued",
        createdAt: now,
        updatedAt: now,
        resultKey
      };
      await this.persist(task);

      try {
        const sourceEncrypted = await this.encryptSource(source, keyBytes);
        await this.github("actions/workflows/" + WORKFLOW + "/dispatches", {
          method: "POST",
          body: JSON.stringify({
            ref: "main",
            inputs: {
              task_id: id,
              language,
              task_key: resultKey,
              source_encrypted: sourceEncrypted,
              timeout_seconds: String(timeoutSeconds)
            }
          })
        });
      } catch (error) {
        const finishedAt = Date.now();
        await this.persist({
          ...task,
          resultKey: undefined,
          status: "failed",
          updatedAt: finishedAt,
          finishedAt,
          error: error instanceof Error ? error.message : "Could not dispatch sandbox task."
        });
        throw error;
      }

      return {
        accepted: true,
        taskId: id,
        status: "queued" as const,
        language,
        timeoutSeconds,
        note: "Submitted to a temporary GitHub-hosted Linux runner. Poll getCodeTaskStatus for the result."
      };
    } finally {
      this.submitting = false;
    }
  }

  async getTaskStatus(taskId: string): Promise<Task | null> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(taskId)) {
      throw new Error("Invalid task ID.");
    }
    const task = await this.ctx.storage.get<StoredTask>(PREFIX + taskId);
    if (!task) return null;
    if (TERMINAL.includes(task.status)) return this.publicTask(task);

    const run = await this.findRun(taskId);
    if (!run) return this.publicTask(task);

    if (run.status !== "completed") {
      const updated: StoredTask = {
        ...task,
        status: run.status === "in_progress" ? "running" : task.status,
        workflowRunId: run.id,
        updatedAt: Date.now()
      };
      await this.persist(updated);
      return this.publicTask(updated);
    }

    if (run.conclusion !== "success") {
      const finishedAt = Date.now();
      const updated: StoredTask = {
        ...task,
        resultKey: undefined,
        status: run.conclusion === "cancelled" ? "cancelled" : run.conclusion === "timed_out" ? "timed_out" : "failed",
        workflowRunId: run.id,
        updatedAt: finishedAt,
        finishedAt,
        error: "GitHub Actions finished with conclusion: " + (run.conclusion ?? "unknown") + "."
      };
      await this.persist(updated);
      return this.publicTask(updated);
    }

    try {
      if (!task.resultKey) throw new Error("Sandbox task key is missing.");
      const result = await this.readArtifact(run.id, taskId, task.resultKey);
      const finishedAt = Date.now();
      const updated: StoredTask = {
        ...task,
        ...result,
        resultKey: undefined,
        workflowRunId: run.id,
        updatedAt: finishedAt,
        finishedAt
      };
      await this.persist(updated);
      return this.publicTask(updated);
    } catch {
      // Artifact upload may finish shortly after the workflow reports success.
      return this.publicTask({
        ...task,
        status: "running",
        workflowRunId: run.id,
        error: "The runner finished; waiting for its encrypted result artifact."
      });
    }
  }

  async listTasks(): Promise<Task[]> {
    const rows = await this.ctx.storage.list<StoredTask>({ prefix: PREFIX });
    return [...rows.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 20)
      .map((task) => this.publicTask(task));
  }

  async cancelTask(taskId: string) {
    const task = await this.ctx.storage.get<StoredTask>(PREFIX + taskId);
    if (!task) return { found: false, cancelled: false };
    if (TERMINAL.includes(task.status)) return { found: true, cancelled: false, status: task.status };
    const run = await this.findRun(taskId);
    if (!run || run.status === "completed") {
      return { found: true, cancelled: false, status: task.status };
    }
    await this.github("actions/runs/" + run.id + "/cancel", { method: "POST" });
    const updated: StoredTask = {
      ...task,
      status: "cancelling",
      workflowRunId: run.id,
      updatedAt: Date.now()
    };
    await this.persist(updated);
    return { found: true, cancelled: true, status: "cancelling" as const };
  }
}