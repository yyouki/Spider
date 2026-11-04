export type SandboxLanguage = "python" | "javascript";

export type ExecutionValidation =
  | { ok: true; value: { language: SandboxLanguage; source: string; timeoutSeconds: number } }
  | { ok: false; error: string };

export declare const MAX_SOURCE_BYTES: number;
export declare const DEFAULT_TIMEOUT_SECONDS: number;
export declare const MAX_TIMEOUT_SECONDS: number;
export declare const MAX_OUTPUT_BYTES_PER_STREAM: number;

export declare function validateExecutionRequest(input: unknown): ExecutionValidation;
export declare function buildExecutionCommand(language: SandboxLanguage, source: string): string[];
export declare function limitOutput(value: unknown, maxBytes?: number): string;
