import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as monaco from "monaco-editor/editor";
import { strToU8, zipSync } from "fflate";
// Register the common IDE commands individually. The full registry also imports unused
// high-contrast and other contributions that add a very large client chunk.
import "monaco-editor/features/anchorSelect/register";
import "monaco-editor/features/bracketMatching/register";
import "monaco-editor/features/caretOperations/register";
import "monaco-editor/features/clipboard/register";
import "monaco-editor/features/codeAction/register";
import "monaco-editor/features/codeEditor/register";
import "monaco-editor/features/contextmenu/register";
import "monaco-editor/features/cursorUndo/register";
import "monaco-editor/features/find/register";
import "monaco-editor/features/folding/register";
import "monaco-editor/features/format/register";
import "monaco-editor/features/gotoLine/register";
import "monaco-editor/features/hover/register";
import "monaco-editor/features/indentation/register";
import "monaco-editor/features/multicursor/register";
import "monaco-editor/features/parameterHints/register";
import "monaco-editor/features/rename/register";
import "monaco-editor/features/snippet/register";
import "monaco-editor/features/suggest/register";
import "monaco-editor/features/tokenization/register";
import "monaco-editor/features/wordHighlighter/register";
import "monaco-editor/features/wordOperations/register";
import "monaco-editor/languages/features/register.all";

export type WorkspaceFileMetadata = {
  path: string;
  language: string;
  sizeBytes: number;
  updatedAt: number;
};

export type WorkspaceFile = WorkspaceFileMetadata & {
  content: string;
};

type TreeNode = {
  name: string;
  path: string;
  folder: boolean;
  children: TreeNode[];
};

type EditorTheme = "vs-dark" | "vs" | "space-github-dark" | "space-monokai" | "space-custom";
type TerminalLine = { kind: "command" | "output" | "error" | "system"; text: string };

const EDITOR_THEME_OPTIONS: { value: EditorTheme; label: string }[] = [
  { value: "vs-dark", label: "VS Code Dark" },
  { value: "vs", label: "VS Code Light" },
  { value: "space-github-dark", label: "GitHub Dark" },
  { value: "space-monokai", label: "Monokai" },
  { value: "space-custom", label: "Custom Dark" }
];

function initialEditorTheme(): EditorTheme {
  if (typeof window === "undefined") return "vs-dark";
  try {
    const stored = window.localStorage.getItem("space-editor-theme");
    return EDITOR_THEME_OPTIONS.some((item) => item.value === stored) ? stored as EditorTheme : "vs-dark";
  } catch {
    return "vs-dark";
  }
}

function initialCustomBackground(): string {
  if (typeof window === "undefined") return "#1e1e1e";
  try {
    const stored = window.localStorage.getItem("space-editor-custom-background");
    return /^#[0-9a-f]{6}$/i.test(stored ?? "") ? stored as string : "#1e1e1e";
  } catch {
    return "#1e1e1e";
  }
}

function registerSpaceThemes(customBackground: string) {
  monaco.editor.defineTheme("space-github-dark", {
    base: "vs-dark", inherit: true,
    rules: [
      { token: "comment", foreground: "8b949e" },
      { token: "keyword", foreground: "ff7b72" },
      { token: "string", foreground: "a5d6ff" }
    ],
    colors: {
      "editor.background": "#0d1117", "editor.foreground": "#e6edf3",
      "editorLineNumber.foreground": "#6e7681", "editorLineNumber.activeForeground": "#e6edf3",
      "editor.lineHighlightBackground": "#161b22", "editor.selectionBackground": "#264f78",
      "editorCursor.foreground": "#58a6ff"
    }
  });
  monaco.editor.defineTheme("space-monokai", {
    base: "vs-dark", inherit: true,
    rules: [
      { token: "comment", foreground: "75715e" },
      { token: "keyword", foreground: "f92672" },
      { token: "string", foreground: "e6db74" },
      { token: "number", foreground: "ae81ff" }
    ],
    colors: {
      "editor.background": "#272822", "editor.foreground": "#f8f8f2",
      "editorLineNumber.foreground": "#90908a", "editorLineNumber.activeForeground": "#f8f8f2",
      "editor.lineHighlightBackground": "#303128", "editor.selectionBackground": "#49483e",
      "editorCursor.foreground": "#f8f8f0"
    }
  });
  monaco.editor.defineTheme("space-custom", {
    base: "vs-dark", inherit: true, rules: [],
    colors: {
      "editor.background": customBackground, "editor.foreground": "#f0f2f5",
      "editorLineNumber.foreground": "#8b949e", "editorLineNumber.activeForeground": "#f0f2f5",
      "editor.lineHighlightBackground": "#ffffff0d", "editor.selectionBackground": "#3d5a8090",
      "editorCursor.foreground": "#a5d6ff"
    }
  });
}

function resolveTerminalPath(input: string, cwd: string): string {
  if (input.length > 240 || input.includes("\\") || /[\u0000-\u001f]/.test(input)) {
    throw new Error("Invalid workspace path.");
  }
  const parts = input.startsWith("/") ? [] : cwd ? cwd.split("/") : [];
  for (const segment of input.replace(/^\/+/, "").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (!parts.length) throw new Error("Cannot move above the workspace root.");
      parts.pop();
      continue;
    }
    if (segment.startsWith(".") || !/^[A-Za-z0-9_@()+ -][A-Za-z0-9_.@()+ -]*$/.test(segment)) {
      throw new Error("That path is not allowed in the workspace.");
    }
    parts.push(segment);
  }
  return parts.join("/");
}

function tokenizeTerminalInput(input: string): string[] {
  return (input.match(/"[^"]*"|'[^']*'|\\S+/g) ?? [])
    .map((part) => part.replace(/^["']|["']$/g, ""));
}

export type Props = {
  refreshKey: unknown;
  onListFiles: () => Promise<WorkspaceFileMetadata[]>;
  onReadFile: (path: string) => Promise<WorkspaceFile | null>;
  onWriteFile: (path: string, content: string) => Promise<WorkspaceFileMetadata>;
  onListHistory: (path: string) => Promise<{ id: string; createdAt: string; sizeBytes: number; preview: string }[]>;
  onRestoreFile: (path: string, revisionId: string) => Promise<WorkspaceFileMetadata>;
  onRunFile: (path: string) => Promise<{ accepted: boolean; taskId?: string; status?: string; note?: string }>;
  onGetRunStatus: (taskId: string) => Promise<{
    id: string; status: string; exitCode?: number | null; stdout?: string; stderr?: string; error?: string; workflowRunId?: number;
  } | null>;
  onSearchFiles: (query: string) => Promise<{ path: string; language: string; updatedAt: number; preview: string }[]>;
};

const workerScope = globalThis as typeof globalThis & {
  MonacoEnvironment?: { getWorker: (_workerId: string, label: string) => Worker };
};

// Bundle Monaco language workers with Vite instead of loading editor code from a CDN.
workerScope.MonacoEnvironment = {
  getWorker(_workerId, label) {
    if (label === "json") {
      return new Worker(
        new URL("../node_modules/monaco-editor/esm/vs/language/json/json.worker.js", import.meta.url),
        { type: "module", name: "space-json-worker" }
      );
    }
    if (label === "css" || label === "scss" || label === "less") {
      return new Worker(
        new URL("../node_modules/monaco-editor/esm/vs/language/css/css.worker.js", import.meta.url),
        { type: "module", name: "space-css-worker" }
      );
    }
    if (label === "html" || label === "handlebars" || label === "razor") {
      return new Worker(
        new URL("../node_modules/monaco-editor/esm/vs/language/html/html.worker.js", import.meta.url),
        { type: "module", name: "space-html-worker" }
      );
    }
    if (label === "typescript" || label === "javascript") {
      return new Worker(
        new URL("../node_modules/monaco-editor/esm/vs/language/typescript/ts.worker.js", import.meta.url),
        { type: "module", name: "space-typescript-worker" }
      );
    }
    return new Worker(
      new URL("../node_modules/monaco-editor/esm/vs/editor/editor.worker.js", import.meta.url),
      { type: "module", name: "space-editor-worker" }
    );
  }
};

// Register only the language used by the open file. Vite emits separate chunks for these definitions.
const languageLoaders: Record<string, () => Promise<unknown>> = {
  python: () => import("monaco-editor/languages/definitions/python/register"),
  javascript: () => import("monaco-editor/languages/definitions/javascript/register"),
  typescript: () => import("monaco-editor/languages/definitions/typescript/register"),
  css: () => import("monaco-editor/languages/definitions/css/register"),
  html: () => import("monaco-editor/languages/definitions/html/register"),
  markdown: () => import("monaco-editor/languages/definitions/markdown/register"),
  yaml: () => import("monaco-editor/languages/definitions/yaml/register"),
  sql: () => import("monaco-editor/languages/definitions/sql/register"),
  shell: () => import("monaco-editor/languages/definitions/shell/register"),
  cpp: () => import("monaco-editor/languages/definitions/cpp/register"),
  csharp: () => import("monaco-editor/languages/definitions/csharp/register"),
  dart: () => import("monaco-editor/languages/definitions/dart/register"),
  dockerfile: () => import("monaco-editor/languages/definitions/dockerfile/register"),
  go: () => import("monaco-editor/languages/definitions/go/register"),
  graphql: () => import("monaco-editor/languages/definitions/graphql/register"),
  ini: () => import("monaco-editor/languages/definitions/ini/register"),
  java: () => import("monaco-editor/languages/definitions/java/register"),
  kotlin: () => import("monaco-editor/languages/definitions/kotlin/register"),
  lua: () => import("monaco-editor/languages/definitions/lua/register"),
  "objective-c": () => import("monaco-editor/languages/definitions/objective-c/register"),
  perl: () => import("monaco-editor/languages/definitions/perl/register"),
  php: () => import("monaco-editor/languages/definitions/php/register"),
  powershell: () => import("monaco-editor/languages/definitions/powershell/register"),
  r: () => import("monaco-editor/languages/definitions/r/register"),
  ruby: () => import("monaco-editor/languages/definitions/ruby/register"),
  rust: () => import("monaco-editor/languages/definitions/rust/register"),
  scala: () => import("monaco-editor/languages/definitions/scala/register"),
  solidity: () => import("monaco-editor/languages/definitions/solidity/register"),
  swift: () => import("monaco-editor/languages/definitions/swift/register")
};

const loadedLanguages = new Set<string>();
const languageLoads = new Map<string, Promise<void>>();

async function ensureLanguageRegistered(language: string): Promise<void> {
  if (loadedLanguages.has(language)) return;
  const existing = languageLoads.get(language);
  if (existing) return existing;

  const loader = languageLoaders[language];
  if (!loader) {
    loadedLanguages.add(language);
    return;
  }

  const loading = loader().then(() => {
    loadedLanguages.add(language);
  }).finally(() => {
    languageLoads.delete(language);
  });
  languageLoads.set(language, loading);
  return loading;
}

function basename(path: string): string {
  return path.split("/").at(-1) ?? path;
}

function archiveBlob(bytes: Uint8Array): Blob {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type: "application/zip" });
}

function buildTree(files: WorkspaceFileMetadata[]): TreeNode[] {
  const roots: TreeNode[] = [];
  for (const file of files) {
    const parts = file.path.split("/");
    let level = roots;
    let fullPath = "";
    parts.forEach((name, index) => {
      fullPath = fullPath ? fullPath + "/" + name : name;
      const folder = index < parts.length - 1;
      let node = level.find((item) => item.name === name);
      if (!node) {
        node = { name, path: fullPath, folder, children: [] };
        level.push(node);
      }
      level = node.children;
    });
  }

  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => Number(b.folder) - Number(a.folder) || a.name.localeCompare(b.name));
    nodes.forEach((node) => sort(node.children));
  };
  sort(roots);
  return roots;
}

function CodeEditor({
  path,
  language,
  value,
  onChange,
  onSave,
  theme,
  customBackground
}: {
  path: string;
  language: string;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  theme: EditorTheme;
  customBackground: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const themeRef = useRef(theme);
  const customBackgroundRef = useRef(customBackground);
  onChangeRef.current = onChange;
  onSaveRef.current = onSave;
  themeRef.current = theme;
  customBackgroundRef.current = customBackground;

  useEffect(() => {
    registerSpaceThemes(customBackground);
    monaco.editor.setTheme(theme);
  }, [theme, customBackground]);

  useEffect(() => {
    let disposed = false;
    let model: monaco.editor.ITextModel | null = null;
    let editor: monaco.editor.IStandaloneCodeEditor | null = null;
    let modelSubscription: monaco.IDisposable | null = null;

    void ensureLanguageRegistered(language).then(() => {
      if (disposed || !hostRef.current) return;
      registerSpaceThemes(customBackgroundRef.current);
      model = monaco.editor.createModel(
        value,
        language,
        monaco.Uri.parse("inmemory://space/" + encodeURIComponent(path))
      );
      editor = monaco.editor.create(hostRef.current, {
        model,
        theme: themeRef.current,
        automaticLayout: true,
        fontFamily: "'JetBrains Mono', 'SFMono-Regular', Consolas, monospace",
        fontSize: 13,
        lineHeight: 21,
        tabSize: 2,
        insertSpaces: true,
        minimap: { enabled: true, scale: 0.75 },
        scrollBeyondLastLine: false,
        renderLineHighlight: "all",
        roundedSelection: false,
        padding: { top: 14, bottom: 14 },
        wordWrap: "on",
        suggestOnTriggerCharacters: true,
        quickSuggestions: true,
        folding: true,
        bracketPairColorization: { enabled: true }
      });
      editorRef.current = editor;
      modelSubscription = model.onDidChangeContent(() => {
        if (editor) onChangeRef.current(editor.getValue());
      });
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => onSaveRef.current());
    }).catch(() => {
      // Keep the editor usable as plain text if a language chunk cannot be loaded.
      if (!disposed && hostRef.current) {
        registerSpaceThemes(customBackgroundRef.current);
        model = monaco.editor.createModel(value, "plaintext");
        editor = monaco.editor.create(hostRef.current, { model, theme: themeRef.current, automaticLayout: true });
        editorRef.current = editor;
      }
    });

    return () => {
      disposed = true;
      modelSubscription?.dispose();
      editor?.dispose();
      model?.dispose();
      editorRef.current = null;
    };
  }, [path, language]);

  return <div className="monaco-host" ref={hostRef} aria-label={"Code editor for " + path} />;
}

function FileTree({
  nodes,
  depth,
  expanded,
  selectedPath,
  onToggle,
  onSelect,
  onDownloadFolder
}: {
  nodes: TreeNode[];
  depth: number;
  expanded: Set<string>;
  selectedPath: string;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  onDownloadFolder: (path: string) => void;
}) {
  return (
    <>
      {nodes.map((node) => (
        <div key={node.path}>
          <button
            type="button"
            className={`ide-tree-row ${node.folder ? "folder" : "file"} ${selectedPath === node.path ? "selected" : ""}`}
            style={{ paddingLeft: 10 + depth * 14 }}
            onClick={() => node.folder ? onToggle(node.path) : onSelect(node.path)}
            aria-expanded={node.folder ? expanded.has(node.path) : undefined}
          >
            <span className="ide-tree-chevron">{node.folder ? (expanded.has(node.path) ? "▾" : "▸") : ""}</span>
            <span className="ide-tree-icon">{node.folder ? "▰" : "◦"}</span>
            <span className="ide-tree-name">{node.name}</span>
          </button>
          {node.folder && (
            <button
              type="button"
              className="ide-folder-download"
              title={"Download " + node.path + " as ZIP"}
              aria-label={"Download folder " + node.path}
              onClick={() => onDownloadFolder(node.path)}
            >↓</button>
          )}
          {node.folder && expanded.has(node.path) && (
            <FileTree
              nodes={node.children}
              depth={depth + 1}
              expanded={expanded}
              selectedPath={selectedPath}
              onToggle={onToggle}
              onSelect={onSelect}
              onDownloadFolder={onDownloadFolder}
            />
          )}
        </div>
      ))}
    </>
  );
}

export default function WorkspaceIDE({ refreshKey, onListFiles, onReadFile, onWriteFile, onListHistory, onRestoreFile, onRunFile, onGetRunStatus, onSearchFiles }: Props) {
  const [files, setFiles] = useState<WorkspaceFileMetadata[]>([]);
  const [selectedPath, setSelectedPath] = useState("");
  const [content, setContent] = useState("");
  const [draft, setDraft] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [tabs, setTabs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState("");
  const [newPath, setNewPath] = useState("src/main.py");
  const [showNewFile, setShowNewFile] = useState(false);
  const [mobileTab, setMobileTab] = useState<"files" | "editor">("editor");
  const [search, setSearch] = useState("");
  const [searchMatches, setSearchMatches] = useState<{ path: string; language: string; updatedAt: number; preview: string }[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [history, setHistory] = useState<{ id: string; createdAt: string; sizeBytes: number; preview: string }[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const draftRef = useRef(draft);
  const autosaveValueRef = useRef("");
  const [runTask, setRunTask] = useState<{
    id: string;
    status: string;
    path?: string;
    exitCode?: number | null;
    stdout?: string;
    stderr?: string;
    error?: string;
  } | null>(null);
  const [runBusy, setRunBusy] = useState(false);
  const [editorTheme, setEditorTheme] = useState<EditorTheme>(initialEditorTheme);
  const [customEditorBackground, setCustomEditorBackground] = useState(initialCustomBackground);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalInput, setTerminalInput] = useState("");
  const [terminalCwd, setTerminalCwd] = useState("");
  const [terminalHistory, setTerminalHistory] = useState<string[]>([]);
  const [terminalHistoryIndex, setTerminalHistoryIndex] = useState(-1);
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([
    { kind: "system", text: "Space Workspace terminal · type help to see available commands." }
  ]);
  const terminalInputRef = useRef<HTMLInputElement>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const terminalReportedTaskRef = useRef("");
  const appendTerminalLines = useCallback((lines: TerminalLine[]) => {
    setTerminalLines((current) => [...current, ...lines].slice(-300));
  }, []);

  useEffect(() => { draftRef.current = draft; }, [draft]);

  useEffect(() => {
    try {
      window.localStorage.setItem("space-editor-theme", editorTheme);
      window.localStorage.setItem("space-editor-custom-background", customEditorBackground);
    } catch {
      // Theme choices remain usable for this session when local storage is unavailable.
    }
  }, [editorTheme, customEditorBackground]);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ block: "end" });
  }, [terminalLines, terminalOpen]);

  const refreshFiles = useCallback(async () => {
    try {
      const next = await onListFiles();
      setFiles(next);
      setExpanded((current) => {
        const updated = new Set(current);
        next.forEach((file) => {
          const segments = file.path.split("/");
          let prefix = "";
          segments.slice(0, -1).forEach((segment) => {
            prefix = prefix ? prefix + "/" + segment : segment;
            updated.add(prefix);
          });
        });
        return updated;
      });
      setSelectedPath((current) => {
        if (current && next.some((file) => file.path === current)) return current;
        return next[0]?.path ?? "";
      });
    } catch {
      setNotice("Could not load workspace files.");
    } finally {
      setLoading(false);
    }
  }, [onListFiles]);

  useEffect(() => {
    void refreshFiles();
  }, [refreshFiles, refreshKey]);

  const openFile = useCallback(async (path: string) => {
    setNotice("");
    if (dirty && !window.confirm("Discard unsaved changes in the open file?")) return;
    try {
      const file = await onReadFile(path);
      if (!file) {
        setNotice("That file no longer exists.");
        await refreshFiles();
        return;
      }
      setSelectedPath(file.path);
      setContent(file.content);
      setDraft(file.content);
      setDirty(false);
      setTabs((current) => current.includes(path) ? current : [...current, path]);
      setMobileTab("editor");
    } catch {
      setNotice("Could not open that file.");
    }
  }, [dirty, onReadFile, refreshFiles]);

  useEffect(() => {
    if (!selectedPath && files.length) void openFile(files[0].path);
  }, [files, openFile, selectedPath]);

  const saveFile = useCallback(async () => {
    if (!selectedPath || !dirty || saving) return;
    const valueToSave = draft;
    setSaving(true);
    setNotice("");
    try {
      await onWriteFile(selectedPath, valueToSave);
      setContent(valueToSave);
      if (draftRef.current === valueToSave) setDirty(false);
      setNotice("Saved");
      await refreshFiles();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save file.");
    } finally {
      setSaving(false);
    }
  }, [dirty, draft, onWriteFile, refreshFiles, saving, selectedPath]);

  useEffect(() => {
    if (!dirty || !selectedPath || saving) return undefined;
    const valueToSave = draft;
    const timer = window.setTimeout(() => {
      if (autosaveValueRef.current === valueToSave) return;
      autosaveValueRef.current = valueToSave;
      void saveFile();
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [dirty, draft, saveFile, saving, selectedPath]);

  const createFile = async () => {
    const path = newPath.trim();
    if (!path) return;
    try {
      await onWriteFile(path, "");
      setShowNewFile(false);
      setNewPath("");
      await refreshFiles();
      await openFile(path);
      setNotice("File created");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not create file.");
    }
  };

  const toggleFolder = (path: string) => {
    setExpanded((current) => {
      const updated = new Set(current);
      if (updated.has(path)) updated.delete(path);
      else updated.add(path);
      return updated;
    });
  };

  const closeTab = (path: string) => {
    const next = tabs.filter((tab) => tab !== path);
    setTabs(next);
    if (selectedPath === path) {
      const nextPath = next.at(-1) ?? "";
      if (nextPath) void openFile(nextPath);
      else {
        setSelectedPath("");
        setContent("");
        setDraft("");
        setDirty(false);
      }
    }
  };

  useEffect(() => {
    const query = search.trim();
    if (query.length < 2) {
      setSearchMatches([]);
      setSearchBusy(false);
      return undefined;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      setSearchBusy(true);
      try {
        const matches = await onSearchFiles(query);
        if (active) setSearchMatches(matches);
      } catch {
        if (active) setNotice("Search could not reach the workspace database.");
      } finally {
        if (active) setSearchBusy(false);
      }
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [onSearchFiles, search]);

  const filteredFiles = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return files;
    const matchedPaths = new Set(searchMatches.map((match) => match.path));
    return files.filter((file) => file.path.toLowerCase().includes(query) || matchedPaths.has(file.path));
  }, [files, search, searchMatches]);
  const tree = useMemo(() => buildTree(filteredFiles), [filteredFiles]);
  const selected = files.find((file) => file.path === selectedPath);
  const currentLanguage = selected?.language ?? "plaintext";

  const downloadFolder = async (folderPath: string) => {
    try {
      const members = files.filter((file) => file.path.startsWith(folderPath + "/"));
      if (!members.length) throw new Error("Folder does not contain any files.");
      const entries: Record<string, Uint8Array> = {};
      for (const member of members) {
        const file = await onReadFile(member.path);
        if (file) entries[member.path.slice(folderPath.length + 1)] = strToU8(file.content);
      }
      if (!Object.keys(entries).length) throw new Error("No files were available to download.");
      const archive = zipSync(entries, { level: 6 });
      const url = URL.createObjectURL(archiveBlob(archive));
      const link = document.createElement("a");
      link.href = url;
      link.download = (basename(folderPath) || "workspace") + ".zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      setNotice("Folder archive downloaded.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not create the folder archive.");
    }
  };

  const downloadProject = async () => {
    try {
      const entries: Record<string, Uint8Array> = {};
      for (const member of files) {
        const file = await onReadFile(member.path);
        if (file) entries[member.path] = strToU8(file.content);
      }
      if (!Object.keys(entries).length) throw new Error("The workspace is empty.");
      const archive = zipSync(entries, { level: 6 });
      const url = URL.createObjectURL(archiveBlob(archive));
      const link = document.createElement("a");
      link.href = url;
      link.download = "space-workspace.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      setNotice("Workspace archive downloaded.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not download the workspace.");
    }
  };

  const loadHistory = async () => {
    if (!selectedPath) return;
    setHistoryBusy(true);
    setShowHistory(true);
    try {
      setHistory(await onListHistory(selectedPath));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load file history.");
    } finally {
      setHistoryBusy(false);
    }
  };

  const restoreRevision = async (revisionId: string) => {
    if (!selectedPath || dirty) {
      setNotice("Save or discard the current draft before restoring a version.");
      return;
    }
    if (!window.confirm("Restore this revision? The current saved version will remain in history.")) return;
    try {
      await onRestoreFile(selectedPath, revisionId);
      const file = await onReadFile(selectedPath);
      if (!file) throw new Error("Restored file could not be reloaded.");
      setContent(file.content);
      setDraft(file.content);
      setDirty(false);
      setShowHistory(false);
      setNotice("Revision restored.");
      await refreshFiles();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not restore the revision.");
    }
  };

  const executeWorkspaceFile = async (path: string) => {
    if (runBusy) throw new Error("A workspace task is already running.");
    const file = files.find((item) => item.path === path);
    if (!file) throw new Error("File not found: " + path);
    if (selectedPath === path && dirty) throw new Error("Save the file before running it.");
    if (!["python", "javascript"].includes(file.language)) {
      throw new Error("The workspace runner supports Python and JavaScript files only.");
    }
    setRunBusy(true);
    setNotice("");
    setRunTask(null);
    terminalReportedTaskRef.current = "";
    setTerminalOpen(true);
    try {
      const result = await onRunFile(path);
      if (!result.accepted || !result.taskId) throw new Error(result.note || "The sandbox did not accept this file.");
      setRunTask({ id: result.taskId, path, status: result.status || "queued" });
      appendTerminalLines([{ kind: "system", text: "Started " + path + " in the restricted offline runner." }]);
      setNotice("File submitted to the temporary offline sandbox.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not run the selected file.";
      appendTerminalLines([{ kind: "error", text: message }]);
      setNotice(message);
    } finally {
      setRunBusy(false);
    }
  };

  const runSelectedFile = async () => {
    if (!selectedPath) return;
    try {
      await executeWorkspaceFile(selectedPath);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not run the selected file.");
    }
  };

  const submitTerminalCommand = async () => {
    const raw = terminalInput.trim();
    if (!raw) return;
    setTerminalInput("");
    setTerminalHistory((current) => [...current, raw].slice(-60));
    setTerminalHistoryIndex(-1);
    appendTerminalLines([{ kind: "command", text: "space@workspace:" + (terminalCwd ? "~/" + terminalCwd : "~") + "$ " + raw }]);
    const [command, ...args] = tokenizeTerminalInput(raw);
    const name = (command ?? "").toLowerCase();
    const print = (text: string) => appendTerminalLines([{ kind: "output", text }]);
    try {
      switch (name) {
        case "help":
          print([
            "Available workspace commands:",
            "  help                 Show this help",
            "  pwd                  Show the current workspace folder",
            "  ls [path]            List files and folders",
            "  cd [path]            Change the workspace folder",
            "  tree [path]          Show files below a folder",
            "  cat <file>           Print a text file",
            "  touch <file>         Create an empty workspace file",
            "  open <file>          Open a file in the editor",
            "  run <file>           Run a saved Python or JavaScript file",
            "  python <file.py>     Run a Python file",
            "  node <file.js>       Run a JavaScript file",
            "  echo <text>          Print text",
            "  clear                Clear terminal output",
            "",
            "Workspace-only terminal. It is not a host shell; arbitrary OS commands, package installation, and network access are unavailable."
          ].join("\n"));
          break;
        case "clear":
          setTerminalLines([]);
          break;
        case "pwd":
          print("/workspace" + (terminalCwd ? "/" + terminalCwd : ""));
          break;
        case "echo":
          print(args.join(" "));
          break;
        case "ls": {
          const target = resolveTerminalPath(args[0] ?? ".", terminalCwd);
          if (target && files.some((file) => file.path === target)) {
            print(target);
            break;
          }
          const prefix = target ? target + "/" : "";
          const children = new Map<string, boolean>();
          for (const file of files) {
            if (!file.path.startsWith(prefix)) continue;
            const remainder = file.path.slice(prefix.length);
            const [child, ...rest] = remainder.split("/");
            if (child) children.set(child, rest.length > 0 || children.get(child) === true);
          }
          const rows = [...children.entries()].sort((a, b) => Number(b[1]) - Number(a[1]) || a[0].localeCompare(b[0]));
          print(rows.length ? rows.map(([child, folder]) => child + (folder ? "/" : "")).join("\n") : "(empty directory)");
          break;
        }
        case "tree": {
          const target = resolveTerminalPath(args[0] ?? ".", terminalCwd);
          const prefix = target ? target + "/" : "";
          const matches = files.filter((file) => file.path.startsWith(prefix));
          print(matches.length ? (target || "workspace") + "\n" + matches.map((file) => "  " + file.path.slice(prefix.length)).join("\n") : "(empty directory)");
          break;
        }
        case "cd": {
          const target = resolveTerminalPath(args[0] ?? "/", terminalCwd);
          if (target && !files.some((file) => file.path.startsWith(target + "/"))) {
            throw new Error("Directory not found: " + target);
          }
          setTerminalCwd(target);
          print("Current directory: /workspace" + (target ? "/" + target : ""));
          break;
        }
        case "cat": {
          if (!args[0]) throw new Error("Usage: cat <file>");
          const target = resolveTerminalPath(args[0], terminalCwd);
          const file = await onReadFile(target);
          if (!file) throw new Error("File not found: " + target);
          print(file.content.length > 16_000 ? file.content.slice(0, 16_000) + "\n… output truncated …" : file.content || "(empty file)");
          break;
        }
        case "touch": {
          if (!args[0]) throw new Error("Usage: touch <file>");
          const target = resolveTerminalPath(args[0], terminalCwd);
          if (files.some((file) => file.path === target)) throw new Error("File already exists: " + target);
          await onWriteFile(target, "");
          await refreshFiles();
          print("Created " + target);
          break;
        }
        case "open":
        case "code": {
          if (!args[0]) throw new Error("Usage: open <file>");
          const target = resolveTerminalPath(args[0], terminalCwd);
          await openFile(target);
          print("Opened " + target);
          break;
        }
        case "run":
        case "python":
        case "node": {
          if (!args[0]) throw new Error("Usage: " + name + " <file>");
          const target = resolveTerminalPath(args[0], terminalCwd);
          const file = files.find((item) => item.path === target);
          if (!file) throw new Error("File not found: " + target);
          if (name === "python" && file.language !== "python") throw new Error("python expects a Python file.");
          if (name === "node" && file.language !== "javascript") throw new Error("node expects a JavaScript file.");
          await executeWorkspaceFile(target);
          break;
        }
        default:
          throw new Error("Command not found: " + name + ". Type help for supported workspace commands.");
      }
    } catch (error) {
      appendTerminalLines([{ kind: "error", text: error instanceof Error ? error.message : "Command failed." }]);
    }
  };

  useEffect(() => {
    if (!runTask || ["succeeded", "failed", "cancelled", "timed_out"].includes(runTask.status)) return undefined;
    let active = true;
    let timer = 0;
    const poll = async () => {
      try {
        const result = await onGetRunStatus(runTask.id);
        if (!active || !result) return;
        setRunTask({
          id: result.id,
          path: runTask.path,
          status: result.status,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          error: result.error
        });
        if (!["succeeded", "failed", "cancelled", "timed_out"].includes(result.status)) {
          timer = window.setTimeout(() => void poll(), 1800);
        }
      } catch (error) {
        if (active) {
          setRunTask((current) => current ? {
            ...current,
            error: error instanceof Error ? error.message : "Could not refresh sandbox status."
          } : current);
        }
      }
    };
    timer = window.setTimeout(() => void poll(), 900);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [runTask?.id, runTask?.status, onGetRunStatus]);

  return (
    <section className="ide-panel" aria-label="Private code workspace" data-editor-theme={editorTheme}>
      <div className="ide-titlebar">
        <div className="ide-title"><span className="ide-title-mark">S</span><span>SPACE WORKSPACE</span></div>
        <div className="ide-title-actions">
          <span className="ide-private">PRIVATE</span>
          <button type="button" title="Create file" onClick={() => setShowNewFile((shown) => !shown)}>＋</button>
          <button type="button" title="Download entire workspace as ZIP" onClick={() => void downloadProject()} disabled={!files.length}>⇩</button>
          <button type="button" title="Refresh files" onClick={() => void refreshFiles()}>↻</button>
        </div>
      </div>

      <div className="ide-mobile-tabs">
        <button type="button" className={mobileTab === "files" ? "active" : ""} onClick={() => setMobileTab("files")}>Explorer</button>
        <button type="button" className={mobileTab === "editor" ? "active" : ""} onClick={() => setMobileTab("editor")}>Editor</button>
      </div>

      <div className="ide-main">
        <aside className={`ide-explorer ${mobileTab === "files" ? "mobile-visible" : ""}`}>
          <div className="ide-section-heading"><span>EXPLORER</span><span>{files.length}</span></div>
          <div className="ide-root-label"><span>▾</span> SPACE-PROJECT</div>
          <input
            className="ide-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search files and contents…"
            aria-label="Search workspace file names and contents"
          />
          {search.trim().length >= 2 && (
            <div className="ide-search-status">{searchBusy ? "Searching file contents…" : searchMatches.length + " matching files"}</div>
          )}
          {showNewFile && (
            <form className="ide-new-file" onSubmit={(event) => { event.preventDefault(); void createFile(); }}>
              <input value={newPath} onChange={(event) => setNewPath(event.target.value)} aria-label="New file path" placeholder="folder/file.py" autoFocus />
              <div><button type="submit">Create</button><button type="button" onClick={() => setShowNewFile(false)}>Cancel</button></div>
            </form>
          )}
          <div className="ide-tree">
            {loading ? <p className="ide-empty-small">Loading files…</p> : tree.length ? (
              <FileTree nodes={tree} depth={0} expanded={expanded} selectedPath={selectedPath} onToggle={toggleFolder} onSelect={(path) => void openFile(path)} onDownloadFolder={(path) => void downloadFolder(path)} />
            ) : (
              <div className="ide-empty-tree">
                <span>No files yet</span>
                <small>Ask Space to create a file or use + above.</small>
              </div>
            )}
          </div>
          <div className="ide-explorer-footer">WORKSPACE STORAGE · 2 MB</div>
        </aside>

        <div className={`ide-editor-column ${mobileTab === "editor" ? "mobile-visible" : ""}`} data-editor-theme={editorTheme}>
          <div className="ide-tabs">
            {tabs.map((tab) => (
              <div className={`ide-tab ${selectedPath === tab ? "active" : ""}`} key={tab}>
                <button type="button" onClick={() => void openFile(tab)}>{basename(tab)}</button>
                <button type="button" aria-label={"Close " + tab} onClick={() => closeTab(tab)}>×</button>
              </div>
            ))}
            <div className="ide-tabs-spacer" />
            <button type="button" className="ide-history-button" onClick={() => void loadHistory()} disabled={!selectedPath}>History</button>
            <label className="ide-theme-control">
              <span>Theme</span>
              <select value={editorTheme} onChange={(event) => setEditorTheme(event.target.value as EditorTheme)} aria-label="Editor color theme">
                {EDITOR_THEME_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            {editorTheme === "space-custom" && (
              <label className="ide-custom-color" title="Custom editor background">
                <span>BG</span>
                <input type="color" value={customEditorBackground} onChange={(event) => setCustomEditorBackground(event.target.value)} aria-label="Custom editor background color" />
              </label>
            )}
            <button type="button" className="ide-terminal-toggle" onClick={() => setTerminalOpen((open) => !open)} aria-expanded={terminalOpen}>Terminal</button>
            <button type="button" className="ide-run-button" onClick={() => void runSelectedFile()} disabled={!selectedPath || dirty || runBusy || !["python","javascript"].includes(currentLanguage)}>
              {runBusy ? "Starting…" : "▶ Run File"}
            </button>
            <button type="button" className="ide-save" onClick={() => void saveFile()} disabled={!dirty || saving}>
              {saving ? "Saving…" : dirty ? "Save now" : "Auto-saved"}
            </button>
          </div>

          <div className="ide-breadcrumb">
            <span>workspace</span><span>›</span><strong>{selectedPath || "No file selected"}</strong>
          </div>

          {showHistory && (
            <div className="ide-history-panel">
              <div><strong>File history</strong><button type="button" onClick={() => setShowHistory(false)}>×</button></div>
              {historyBusy ? <p>Loading revisions…</p> : history.length ? history.map((revision) => (
                <article key={revision.id}>
                  <span><strong>{new Date(revision.createdAt).toLocaleString()}</strong><small>{revision.sizeBytes.toLocaleString()} bytes · {revision.preview || "Empty file"}</small></span>
                  <button type="button" onClick={() => void restoreRevision(revision.id)}>Restore</button>
                </article>
              )) : <p>No saved revisions yet. Revisions are created when a saved file changes.</p>}
            </div>
          )}

          {selectedPath ? (
            <CodeEditor
              key={selectedPath}
              path={selectedPath}
              language={currentLanguage}
              value={content}
              onChange={(value) => { setDraft(value); setDirty(value !== content); }}
              onSave={() => void saveFile()}
              theme={editorTheme}
              customBackground={customEditorBackground}
            />
          ) : (
            <div className="ide-editor-empty">
              <div className="ide-empty-symbol">S</div>
              <h3>Workspace ready</h3>
              <p>Files created by Space will appear in Explorer.</p>
              <button type="button" onClick={() => setShowNewFile(true)}>Create your first file</button>
            </div>
          )}

          {terminalOpen && (
            <section className="ide-terminal-panel" aria-label="Interactive workspace terminal">
              <header className="ide-terminal-header">
                <div><strong>TERMINAL</strong><span>SPACE WORKSPACE</span></div>
                <div>
                  <button type="button" onClick={() => setTerminalLines([])}>Clear</button>
                  <button type="button" onClick={() => setTerminalOpen(false)} aria-label="Close terminal">×</button>
                </div>
              </header>
              <div className="ide-terminal-output" role="log" aria-live="polite" onClick={() => terminalInputRef.current?.focus()}>
                {terminalLines.map((line, index) => <pre className={"terminal-line terminal-" + line.kind} key={index}>{line.text}</pre>)}
                <div ref={terminalEndRef} />
              </div>
              <form className="ide-terminal-prompt" onSubmit={(event) => { event.preventDefault(); void submitTerminalCommand(); }}>
                <label htmlFor="space-terminal-input">space@workspace:{terminalCwd ? "~/" + terminalCwd : "~"}$</label>
                <input
                  id="space-terminal-input"
                  ref={terminalInputRef}
                  value={terminalInput}
                  onChange={(event) => setTerminalInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      const next = Math.max(0, terminalHistoryIndex < 0 ? terminalHistory.length - 1 : terminalHistoryIndex - 1);
                      setTerminalHistoryIndex(next);
                      setTerminalInput(terminalHistory[next] ?? "");
                    } else if (event.key === "ArrowDown") {
                      event.preventDefault();
                      const next = terminalHistoryIndex + 1;
                      setTerminalHistoryIndex(next >= terminalHistory.length ? -1 : next);
                      setTerminalInput(next >= terminalHistory.length ? "" : terminalHistory[next] ?? "");
                    }
                  }}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  aria-label="Terminal command"
                  placeholder="Type a workspace command…"
                />
              </form>
            </section>
          )}
          <div className="ide-statusbar">
            <span>{currentLanguage.toUpperCase()}</span>
            <span>{selectedPath ? basename(selectedPath) : "No file"}</span>
            <span>{dirty ? "UNSAVED" : "SYNCED"}</span>
          </div>
        </div>
      </div>

      {notice && <div className="ide-notice" role="status">{notice}</div>}
    </section>
  );
}
