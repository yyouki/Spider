import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as monaco from "monaco-editor/editor";
import "monaco-editor/features/register.all";
import "monaco-editor/languages/definitions/python/register";
import "monaco-editor/languages/definitions/javascript/register";
import "monaco-editor/languages/definitions/typescript/register";
import "monaco-editor/languages/definitions/css/register";
import "monaco-editor/languages/definitions/html/register";
import "monaco-editor/languages/definitions/markdown/register";
import "monaco-editor/languages/definitions/yaml/register";
import "monaco-editor/languages/definitions/sql/register";
import "monaco-editor/languages/definitions/shell/register";
import "monaco-editor/languages/features/register.all";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker.js?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker.js?worker";
import CssWorker from "monaco-editor/esm/vs/language/css/css.worker.js?worker";
import HtmlWorker from "monaco-editor/esm/vs/language/html/html.worker.js?worker";
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker.js?worker";

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

type TokenUsageSummary = {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latestAt: string | null;
  source: string;
};

type Props = {
  refreshKey: unknown;
  tokenUsage: TokenUsageSummary | null;
  onListFiles: () => Promise<WorkspaceFileMetadata[]>;
  onReadFile: (path: string) => Promise<WorkspaceFile | null>;
  onWriteFile: (path: string, content: string) => Promise<WorkspaceFileMetadata>;
};

const workerScope = globalThis as typeof globalThis & {
  MonacoEnvironment?: { getWorker: (_workerId: string, label: string) => Worker };
};

// Bundle Monaco language workers with Vite instead of loading editor code from a CDN.
workerScope.MonacoEnvironment = {
  getWorker(_workerId, label) {
    if (label === "json") return new JsonWorker();
    if (label === "css" || label === "scss" || label === "less") return new CssWorker();
    if (label === "html" || label === "handlebars" || label === "razor") return new HtmlWorker();
    if (label === "typescript" || label === "javascript") return new TsWorker();
    return new EditorWorker();
  }
};

function basename(path: string): string {
  return path.split("/").at(-1) ?? path;
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

function TokenAnalysis({
  content,
  files,
  tokenUsage
}: {
  content: string;
  files: WorkspaceFileMetadata[];
  tokenUsage: TokenUsageSummary | null;
}) {
  const fileBytes = new TextEncoder().encode(content).byteLength;
  const lines = content ? content.split("\n").length : 0;
  const fileTokens = Math.ceil(fileBytes / 4);
  const projectBytes = files.reduce((sum, file) => sum + file.sizeBytes, 0);
  const projectTokens = Math.ceil(projectBytes / 4);

  return (
    <div className="ide-analysis">
      <div className="ide-analysis-heading">
        <span> TOKEN ANALYSIS</span>
        <span className="estimate-label">ESTIMATE</span>
      </div>
      <div className="ide-stats">
        <div><strong>{tokenUsage?.requests ? tokenUsage.totalTokens.toLocaleString() : "—"}</strong><span>AI tokens · actual</span></div>
        <div><strong>{tokenUsage?.requests ? tokenUsage.inputTokens.toLocaleString() : "—"}</strong><span>Input · actual</span></div>
        <div><strong>{tokenUsage?.requests ? tokenUsage.outputTokens.toLocaleString() : "—"}</strong><span>Output · actual</span></div>
        <div><strong>{fileTokens.toLocaleString()}</strong><span>Open file · estimate</span></div>
        <div><strong>{projectTokens.toLocaleString()}</strong><span>Workspace · estimate</span></div>
        <div><strong>{lines.toLocaleString()}</strong><span>Lines · {files.length} files</span></div>
      </div>
      <p>
        AI totals include up to 200 responses where the provider reported usage. File estimates use UTF-8 bytes ÷ 4; GLM tokenizer counts can differ.
        {tokenUsage?.latestAt ? " Last AI usage: " + new Date(tokenUsage.latestAt).toLocaleString() : ""}
      </p>
    </div>
  );
}

function CodeEditor({
  path,
  language,
  value,
  onChange,
  onSave
}: {
  path: string;
  language: string;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  onChangeRef.current = onChange;
  onSaveRef.current = onSave;

  useEffect(() => {
    if (!hostRef.current) return undefined;
    const model = monaco.editor.createModel(
      value,
      language,
      monaco.Uri.parse("inmemory://space/" + encodeURIComponent(path))
    );
    const editor = monaco.editor.create(hostRef.current, {
      model,
      theme: "vs-dark",
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
    const modelSubscription = model.onDidChangeContent(() => {
      onChangeRef.current(editor.getValue());
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => onSaveRef.current());

    return () => {
      modelSubscription.dispose();
      editor.dispose();
      model.dispose();
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
  onSelect
}: {
  nodes: TreeNode[];
  depth: number;
  expanded: Set<string>;
  selectedPath: string;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
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
          {node.folder && expanded.has(node.path) && (
            <FileTree
              nodes={node.children}
              depth={depth + 1}
              expanded={expanded}
              selectedPath={selectedPath}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          )}
        </div>
      ))}
    </>
  );
}

export default function WorkspaceIDE({ refreshKey, tokenUsage, onListFiles, onReadFile, onWriteFile }: Props) {
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
    setSaving(true);
    setNotice("");
    try {
      await onWriteFile(selectedPath, draft);
      setContent(draft);
      setDirty(false);
      setNotice("Saved");
      await refreshFiles();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save file.");
    } finally {
      setSaving(false);
    }
  }, [dirty, draft, onWriteFile, refreshFiles, saving, selectedPath]);

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

  const tree = useMemo(() => buildTree(files), [files]);
  const selected = files.find((file) => file.path === selectedPath);
  const currentLanguage = selected?.language ?? "plaintext";

  return (
    <section className="ide-panel" aria-label="Private code workspace">
      <div className="ide-titlebar">
        <div className="ide-title"><span className="ide-title-mark">S</span><span>SPACE WORKSPACE</span></div>
        <div className="ide-title-actions">
          <span className="ide-private">PRIVATE</span>
          <button type="button" title="Create file" onClick={() => setShowNewFile((shown) => !shown)}>＋</button>
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
          {showNewFile && (
            <form className="ide-new-file" onSubmit={(event) => { event.preventDefault(); void createFile(); }}>
              <input value={newPath} onChange={(event) => setNewPath(event.target.value)} aria-label="New file path" placeholder="folder/file.py" autoFocus />
              <div><button type="submit">Create</button><button type="button" onClick={() => setShowNewFile(false)}>Cancel</button></div>
            </form>
          )}
          <div className="ide-tree">
            {loading ? <p className="ide-empty-small">Loading files…</p> : tree.length ? (
              <FileTree nodes={tree} depth={0} expanded={expanded} selectedPath={selectedPath} onToggle={toggleFolder} onSelect={(path) => void openFile(path)} />
            ) : (
              <div className="ide-empty-tree">
                <span>No files yet</span>
                <small>Ask Space to create a file or use + above.</small>
              </div>
            )}
          </div>
          <div className="ide-explorer-footer">WORKSPACE STORAGE · 2 MB</div>
        </aside>

        <div className={`ide-editor-column ${mobileTab === "editor" ? "mobile-visible" : ""}`}>
          <div className="ide-tabs">
            {tabs.map((tab) => (
              <div className={`ide-tab ${selectedPath === tab ? "active" : ""}`} key={tab}>
                <button type="button" onClick={() => void openFile(tab)}>{basename(tab)}</button>
                <button type="button" aria-label={"Close " + tab} onClick={() => closeTab(tab)}>×</button>
              </div>
            ))}
            <div className="ide-tabs-spacer" />
            <button type="button" className="ide-save" onClick={() => void saveFile()} disabled={!dirty || saving}>
              {saving ? "Saving…" : dirty ? "Save" : "Saved"}
            </button>
          </div>

          <div className="ide-breadcrumb">
            <span>workspace</span><span>›</span><strong>{selectedPath || "No file selected"}</strong>
          </div>

          {selectedPath ? (
            <CodeEditor
              key={selectedPath}
              path={selectedPath}
              language={currentLanguage}
              value={content}
              onChange={(value) => { setDraft(value); setDirty(value !== content); }}
              onSave={() => void saveFile()}
            />
          ) : (
            <div className="ide-editor-empty">
              <div className="ide-empty-symbol">S</div>
              <h3>Workspace ready</h3>
              <p>Files created by Space will appear in Explorer.</p>
              <button type="button" onClick={() => setShowNewFile(true)}>Create your first file</button>
            </div>
          )}

          <div className="ide-statusbar">
            <span>{currentLanguage.toUpperCase()}</span>
            <span>{selectedPath ? basename(selectedPath) : "No file"}</span>
            <span>{dirty ? "UNSAVED" : "SYNCED"}</span>
          </div>
        </div>
      </div>

      <TokenAnalysis content={draft} files={files} tokenUsage={tokenUsage} />
      {notice && <div className="ide-notice" role="status">{notice}</div>}
    </section>
  );
}
