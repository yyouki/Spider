export type WorkspaceFileMetadata = {
  path: string;
  language: string;
  sizeBytes: number;
  updatedAt: number;
};

export type WorkspaceFile = WorkspaceFileMetadata & {
  content: string;
};

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  c: "c",
  css: "css",
  csv: "plaintext",
  go: "go",
  html: "html",
  java: "java",
  js: "javascript",
  json: "json",
  jsx: "javascript",
  md: "markdown",
  mjs: "javascript",
  py: "python",
  rb: "ruby",
  rs: "rust",
  sh: "shell",
  sql: "sql",
  toml: "toml",
  ts: "typescript",
  tsx: "typescript",
  txt: "plaintext",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml"
};

const BLOCKED_SEGMENTS = new Set([
  ".env",
  ".dev.vars",
  ".git",
  ".wrangler",
  "node_modules",
  "secrets",
  "credentials"
]);

export function normalizeWorkspacePath(input: string): string {
  const path = input.trim().replace(/^\/+|\/+$/g, "");
  if (!path || path.length > 240 || path.includes("\\") || /[\u0000-\u001f]/.test(path)) {
    throw new Error("Use a valid relative workspace file path.");
  }

  const segments = path.split("/");
  if (segments.some((segment) =>
    !segment ||
    segment.startsWith(" ") ||
    segment.endsWith(" ") ||
    segment === "." ||
    segment === ".." ||
    segment.startsWith(".") ||
    BLOCKED_SEGMENTS.has(segment.toLowerCase()) ||
    !/^[A-Za-z0-9_@()+ -][A-Za-z0-9_.@()+ -]*$/.test(segment)
  )) {
    throw new Error("That path is not allowed in the workspace.");
  }
  return segments.join("/");
}

export function languageForPath(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return LANGUAGE_BY_EXTENSION[extension] ?? "plaintext";
}
