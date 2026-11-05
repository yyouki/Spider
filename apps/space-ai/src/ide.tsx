import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as monaco from "monaco-editor/editor";
import { strToU8, zipSync } from "fflate";
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
import "monaco-editor/languages/definitions/cpp/register";
import "monaco-editor/languages/definitions/csharp/register";
import "monaco-editor/languages/definitions/dart/register";
import "monaco-editor/languages/definitions/dockerfile/register";
import "monaco-editor/languages/definitions/go/register";
import "monaco-editor/languages/definitions/graphql/register";
import "monaco-editor/languages/definitions/ini/register";
import "monaco-editor/languages/definitions/java/register";
import "monaco-editor/languages/definitions/kotlin/register";
import "monaco-editor/languages/definitions/lua/register";
import "monaco-editor/languages/definitions/objective-c/register";
import "monaco-editor/languages/definitions/perl/register";
import "monaco-editor/languages/definitions/php/register";
import "monaco-editor/languages/definitions/powershell/register";
import "monaco-editor/languages/definitions/r/register";
import "monaco-editor/languages/definitions/ruby/register";
import "monaco-editor/languages/definitions/rust/register";
import "monaco-editor/languages/definitions/scala/register";
import "monaco-editor/languages/definitions/solidity/register";
import "monaco-editor/languages/definitions/swift/register";
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

export default function WorkspaceIDE({ refreshKey, onListFiles, onReadFile, onWriteFile, onListHistory, onRestoreFile, onRunFile, onGetRunStatus }: Props) {
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
  const [history, setHistory] = useState<{ id: string; createdAt: string; sizeBytes: number; preview: string }[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const draftRef = useRef(draft);
  const autosaveValueRef = useRef("");
  const [runTask, setRunTask] = useState<{
    id: string;
    status: string;
    exitCode?: number | null;
    stdout?: string;
    stderr?: string;
    error?: string;
  } | null>(null);
  const [runBusy, setRunBusy] = useState(false);

  useEffect(() => { draftRef.current = draft; }, [draft]);

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

  const filteredFiles = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? files.filter((file) => file.path.toLowerCase().includes(query)) : files;
  }, [files, search]);
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
      const url = URL.createObjectURL(new Blob([archive], { type: "application/zip" }));
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
      const url = URL.createObjectURL(new Blob([archive], { type: "application/zip" }));
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

  const runSelectedFile = async () => {
    if (!selectedPath || dirty || runBusy) {
      if (dirty) setNotice("Save the file before running it.");
      return;
    }
    setRunBusy(true);
    setNotice("");
    setRunTask(null);
    try {
      const result = await onRunFile(selectedPath);
      if (!result.accepted || !result.taskId) throw new Error(result.note || "The sandbox did not accept this file.");
      setRunTask({ id: result.taskId, status: result.status || "queued" });
      setNotice("File submitted to the temporary offline sandbox.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not run the selected file.");
    } finally {
      setRunBusy(false);
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
    <section className="ide-panel" aria-label="Private code workspace">
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
            placeholder="Search files…"
            aria-label="Search workspace files by path"
          />
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

        <div className={`ide-editor-column ${mobileTab === "editor" ? "mobile-visible" : ""}`}>
          <div className="ide-tabs">
            {tabs.map((tab) => (
              <div className={`ide-tab ${selectedPath === tab ? "active" : ""}`} key={tab}>
                <button type="button" onClick={() => void openFile(tab)}>{basename(tab)}</button>
                <button type="button" aria-label={"Close " + tab} onClick={() => closeTab(tab)}>×</button>
              </div>
            ))}
            <div className="ide-tabs-spacer" />
            <button type="button" className="ide-history-button" onClick={() => void loadHistory()} disabled={!selectedPath}>History</button>
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
            />
          ) : (
            <div className="ide-editor-empty">
              <div className="ide-empty-symbol">S</div>
              <h3>Workspace ready</h3>
              <p>Files created by Space will appear in Explorer.</p>
              <button type="button" onClick={() => setShowNewFile(true)}>Create your first file</button>
            </div>
          )}

          {runTask && (
            <section className="ide-output-panel" aria-label="File execution output">
              <header>
                <span><strong>RUN OUTPUT</strong><small>{runTask.status} {runTask.exitCode !== undefined && runTask.exitCode !== null ? "· exit " + runTask.exitCode : ""}</small></span>
                <button type="button" onClick={() => setRunTask(null)}>Close</button>
              </header>
              {runTask.error && <p className="ide-output-error">{runTask.error}</p>}
              <pre>{[runTask.stdout || "", runTask.stderr ? "STDERR:\\n" + runTask.stderr : ""].filter(Boolean).join("\\n") || (["succeeded","failed","cancelled","timed_out"].includes(runTask.status) ? "(no output)" : "Waiting for the temporary runner…")}</pre>
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
