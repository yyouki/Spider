import { useEffect, useMemo, useState } from "react";

const DEFAULT_REPOSITORY = "yyouki/space";

function normalizeRepository(value: string): string | null {
  const normalized = value.trim().replace(/^https?:\/\/(?:www\.)?github\.com\//i, "").replace(/\.git$/i, "").replace(/\/$/, "");
  const match = normalized.match(/^([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})$/);
  if (!match || match[2] === "." || match[2] === "..") return null;
  return normalized;
}

export default function VSCodeWebPage() {
  const [repositoryInput, setRepositoryInput] = useState(() => {
    try {
      return typeof window === "undefined"
        ? DEFAULT_REPOSITORY
        : window.localStorage.getItem("space-vscode-repository") || DEFAULT_REPOSITORY;
    } catch {
      return DEFAULT_REPOSITORY;
    }
  });
  const repository = useMemo(() => normalizeRepository(repositoryInput), [repositoryInput]);
  const editorUrl = repository ? "https://github.dev/" + repository : "";
  const githubUrl = repository ? "https://github.com/" + repository : "";

  useEffect(() => {
    try {
      if (repository) window.localStorage.setItem("space-vscode-repository", repository);
    } catch {
      // The selected repository remains available for this page session.
    }
  }, [repository]);

  return (
    <main className="page-container vscode-page">
      <div className="page-heading vscode-heading">
        <div>
          <p className="eyebrow">DEVELOPMENT WORKSPACE</p>
          <h1>VS Code Web</h1>
          <p>Open a GitHub repository in the official Visual Studio Code browser editor.</p>
        </div>
        <span className="meta-chip vscode-status"><span /> Official browser editor</span>
      </div>

      <section className="vscode-launch-card">
        <div className="vscode-launch-top">
          <div className="vscode-symbol" aria-hidden="true"><span>‹</span><span>/</span><span>›</span></div>
          <div>
            <p className="eyebrow">OPEN A REPOSITORY</p>
            <h2>Continue coding in VS Code</h2>
            <p>Choose a GitHub repository to browse, edit, search, and commit changes from your browser.</p>
          </div>
        </div>

        <label className="vscode-repository-field">
          <span>GitHub repository</span>
          <input
            type="text"
            value={repositoryInput}
            onChange={(event) => setRepositoryInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && editorUrl) window.open(editorUrl, "_blank", "noopener,noreferrer");
            }}
            placeholder="owner/repository"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-describedby="vscode-repository-help"
          />
          <small id="vscode-repository-help">Enter owner/repository or paste a github.com repository URL.</small>
        </label>

        {!repository && (
          <p className="vscode-validation" role="alert">Enter a valid GitHub repository in owner/repository format.</p>
        )}

        <div className="vscode-launch-actions">
          <a
            className="button button-primary"
            href={editorUrl || undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!editorUrl}
            onClick={(event) => { if (!editorUrl) event.preventDefault(); }}
          >
            Open in VS Code Web <span aria-hidden="true">↗</span>
          </a>
          <a className="button button-secondary" href={githubUrl || undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!githubUrl}>
            View on GitHub
          </a>
        </div>
        <div className="vscode-repository-preview">
          <span className="vscode-repository-dot" />
          <span>{repository || "No repository selected"}</span>
          <span className="vscode-repository-provider">github.dev</span>
        </div>
      </section>

      <section className="vscode-support-grid" aria-label="Editor touch and keyboard controls">
        <article className="surface-card vscode-support-card">
          <p className="eyebrow">TOUCH & POINTER</p>
          <h2>Use the editor on a phone</h2>
          <ul>
            <li>Try a two-finger pinch directly on the editor page. Zoom behavior depends on the mobile browser and its accessibility settings.</li>
            <li>Tap the code to place the text caret; press and drag the native selection handles to select text.</li>
            <li>For a visible mouse pointer, connect a Bluetooth or USB mouse. Space cannot draw a virtual pointer inside the separate github.dev tab.</li>
          </ul>
          <p className="vscode-control-note">The official web editor supports mobile browsers, but some desktop workflows and shortcuts are limited on smaller screens.</p>
        </article>
        <article className="surface-card vscode-support-card">
          <p className="eyebrow">KEYBOARD SHORTCUTS</p>
          <h2>Common Windows / Linux keys</h2>
          <div className="vscode-shortcut-list">
            <div><span>Zoom in</span><kbd>Ctrl</kbd><b>+</b><kbd>=</kbd></div>
            <div><span>Zoom out</span><kbd>Ctrl</kbd><b>+</b><kbd>-</kbd></div>
            <div><span>Reset zoom</span><kbd>Ctrl</kbd><b>+</b><kbd>Numpad 0</kbd></div>
            <div><span>Command palette</span><kbd>Ctrl</kbd><b>+</b><kbd>Shift</kbd><b>+</b><kbd>P</kbd><small>or F1</small></div>
            <div><span>Quick Open</span><kbd>Ctrl</kbd><b>+</b><kbd>P</kbd></div>
            <div><span>Toggle sidebar</span><kbd>Ctrl</kbd><b>+</b><kbd>B</kbd></div>
            <div><span>Search files</span><kbd>Ctrl</kbd><b>+</b><kbd>Shift</kbd><b>+</b><kbd>F</kbd></div>
            <div><span>Source control</span><kbd>Ctrl</kbd><b>+</b><kbd>Shift</kbd><b>+</b><kbd>G</kbd></div>
          </div>
        </article>
      </section>

      <section className="vscode-info-grid">
        <article className="surface-card vscode-info-card">
          <span className="vscode-info-number">01</span>
          <h3>Browser-based editor</h3>
          <p>Use Explorer, search, syntax highlighting, supported extensions, and Git source control in the official VS Code interface.</p>
        </article>
        <article className="surface-card vscode-info-card">
          <span className="vscode-info-number">02</span>
          <h3>Commit through GitHub</h3>
          <p>Sign in to GitHub in VS Code Web. Keep commits on the repository you selected and review the target before pushing changes.</p>
        </article>
        <article className="surface-card vscode-info-card">
          <span className="vscode-info-number">03</span>
          <h3>Runtime is separate</h3>
          <p>VS Code Web does not provide a terminal or build machine. Use a separately configured compute environment for builds and debugging.</p>
        </article>
      </section>

      <section className="vscode-sync-notice" aria-label="Workspace synchronization status">
        <div className="vscode-sync-icon" aria-hidden="true">↔</div>
        <div>
          <strong>Space workspace sync is not connected yet</strong>
          <p>Files saved inside Space currently remain in its private workspace. Opening a GitHub repository here does not automatically import or synchronize those files. GitHub App authorization and repository publishing are the next integration step.</p>
        </div>
      </section>

      <p className="vscode-footnote">
        VS Code Web is a separate official Microsoft/GitHub service. Space opens it in a new tab and does not embed or repackage its editor.
      </p>
    </main>
  );
}
