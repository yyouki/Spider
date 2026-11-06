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
  c: "cpp",
  cc: "cpp",
  cpp: "cpp",
  cs: "csharp",
  css: "css",
  csv: "plaintext",
  dart: "dart",
  dockerfile: "dockerfile",
  go: "go",
  gql: "graphql",
  graphql: "graphql",
  h: "cpp",
  hpp: "cpp",
  htm: "html",
  html: "html",
  hh: "cpp",
  ini: "ini",
  java: "java",
  js: "javascript",
  json: "json",
  jsx: "javascript",
  kt: "kotlin",
  kts: "kotlin",
  lua: "lua",
  md: "markdown",
  mjs: "javascript",
  mm: "objective-c",
  m: "objective-c",
  pl: "perl",
  php: "php",
  ps1: "powershell",
  py: "python",
  r: "r",
  rb: "ruby",
  rs: "rust",
  scala: "scala",
  sh: "shell",
  sol: "solidity",
  sql: "sql",
  swift: "swift",
  toml: "ini",
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
  const path = input.trim();
  if (!path || path.startsWith("/") || path.endsWith("/") || path.length > 240 || path.includes("\\") || /[\u0000-\u001f]/.test(path)) {
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
