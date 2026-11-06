# space AI MVP status

Last implementation pass: November 6, 2026.

## Implemented in source

| Capability | Status | Evidence |
|---|---|---|
| Single user-facing AI identity | Implemented in MVP | `apps/space-ai/src/server.ts` exports one `SpaceAgent` |
| Streaming chat UI | Implemented in source | `src/app.tsx`, `useAgentChat` |
| Persistent chat history | Implemented in source | SQLite-backed Durable Object with no fixed message-count cap; older context is summarized for subsequent turns |
| Multiple persistent conversations | Implemented in source | Separate SQLite conversation snapshots, active-conversation switching, automatic titles, and per-conversation context summaries |
| Conversation management | Implemented in source | Search across conversation titles/content, rename, pin/unpin, delete, edit-and-resend user messages, and copy assistant messages |
| Persistent task ledger | Implemented in source | `task_plans` SQLite table and task tools |
| Exact calculator tool | Implemented in source | `calculate` tool |
| Capability reporting | Implemented in source | `getCapabilities` tool |
| Project memory | Implemented in source | SQLite table with approval-required writes |
| Owner autonomy settings | Implemented in source | SQLite persistence and mobile settings UI |
| Private workspace files | Implemented in current branch | SQLite-backed file records, validation, 200-file/2 MB limits, 20 revisions per file, chat download attachments, confirmed file/folder deletion with revision cleanup |
| VS Code Web launcher | Implemented in source | Validated GitHub repository input and external handoff to github.dev; no embedded Monaco editor |
| Token analysis | Implemented in current branch | Provider-reported AI usage plus clearly labeled file/workspace estimates |
| Read-only conversation sharing | Implemented in current branch | Random bearer URLs, seven-day expiry, revoke, no-store/noindex response |
| Image generation and editing | Implemented in source; model/quotas deployment-gated | FLUX.2 Klein 4B multipart generation/edit request, private asset storage, chat preview/download |
| Long-history context management | Implemented in source; runtime not yet verified | AIChatAgent unlimited persisted message setting, background summary compaction, summary + recent context on model calls |
| Self-update release policy | Implemented in source | Deterministic release gate + Node unit tests |
| Private owner access | Implemented in source | GitHub OAuth identity check, signed session cookie |
| Python/JavaScript sandbox | Implemented in source; deployment-gated | GitHub Actions runner dispatch, encrypted source/result, restricted Docker runner |
| CI build and test workflow | Added | `.github/workflows/space-ai-check.yml` |
| Manual free-tier deploy workflow | Added in branch | `.github/workflows/deploy-space-ai.yml` |

## Autonomy settings versus actual access

The owner can save preferences for future sandbox execution, read-only browser research, selected-workspace file management, and automatic promotion of eligible low-risk updates. Those preferences do not activate missing tools or grant permissions to a third-party provider.

Account access must use official OAuth consent with scopes granted by the account owner. Android/device features must use OS permission prompts. The MVP has no account or device connectors.

External writes and high-impact actions (send/publish, spend, delete important data, change security/access controls) remain owner-confirmation actions.

## Sandbox and free-tier boundaries

The proposed sandbox uses GitHub-hosted runners because `yyouki/space` is a public repository. Each run is a temporary VM with a restricted offline Docker container. Source and result are encrypted during workflow transfer and artifact storage; the GitHub Actions API token remains in the Cloudflare Worker.

GitHub documents standard GitHub-hosted runner usage as free for public repositories. This is not unlimited compute or an uptime guarantee. Cloudflare Workers Free also has daily Worker, Durable Object, SQLite, and Workers AI limits.

## Model

The default model remains `@cf/zai-org/glm-4.7-flash`. It supports reasoning and function calling, and Cloudflare describes it as multilingual and suitable for multi-turn tool calling. This is a reasonable MVP starting point, not a guarantee that it will satisfy every long-horizon autonomous task. No custom model is being trained: custom training and inference still require compute, and there is no credible unlimited-free model-serving option.

## Not yet verified

- Workspace attachments, image generation/editing, context compaction, conversation history, and the VS Code Web launcher passed CI on the current PR head; production deployment and browser-level runtime tests have not yet been performed.
- Cloudflare deployment and owner-only GitHub OAuth sign-in.
- Runtime sandbox dispatch, artifact decryption, and Python/JavaScript execution.
- Sandbox timeout, cancellation, concurrency, and no-network behavior.
- Workers AI model capacity, response quality, and actual daily quota consumption.
- Chat/task/settings persistence across a real restart/deploy.
- Database backup/export/restore.

Do not call the sandbox or production app live until a successful deployment and runtime checks are complete.

## Explicitly not implemented

- Web search or autonomous browsing.
- Arbitrary website interaction.
- General shell execution, compilation of all languages, project-repository execution, or a persistent coding VM.
- User device filesystem access and GitHub repository sync.
- Image understanding/OCR, document/audio/video processing.
- Android, Windows, or macOS device runners.
- Gmail or other third-party account connectors.
- A production self-update/deployment worker.
- Scheduled 24/7 autonomous research.
- Memory/task export and deletion UI.


## Conversation history notes

Conversations are stored in the SpaceAgent Durable Object SQLite database. Each conversation has a stable ID, title, pin state, message snapshot, timestamps, and its own context-summary row. The active chat is restored through the AIChatAgent message store so streaming, tool approvals, and message synchronization continue to use the existing chat API.

The history search checks titles and saved message content. The current browser view returns up to 100 matching conversations. Each archived snapshot is bounded to 1.5 MB; oversized snapshots are rejected when switching or creating a new chat rather than silently truncating the transcript. Deleting a conversation removes its archived messages and its context summary. The existing single-owner authentication remains unchanged; this does not implement public multi-user registration or tenant isolation.


## Workspace deletion

The IDE Explorer can delete an individual file or a derived folder tree. Both actions require a confirmation; deleting a folder recursively removes its descendant files, and deleting a file/folder also clears the corresponding retained file revisions. Protected path segments and absolute/traversal paths remain rejected by the shared workspace path validator. Empty folders are not stored as separate records: a folder exists only while it contains at least one file.


## VS Code Web transition

The embedded Monaco IDE implementation and the `monaco-editor` runtime dependency have been removed. The `/ide` route now opens the official VS Code Web service at `github.dev` for a validated GitHub repository. VS Code Web is a separate browser application and is not embedded inside Space. The current Space OAuth flow does not provide GitHub repository access tokens, and private Space workspace files do not yet sync to GitHub. Keep the sync limitation visible until the GitHub App authorization and publishing integration is complete.
