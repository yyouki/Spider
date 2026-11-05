# space AI MVP status

Last implementation pass: November 6, 2026.

## Implemented in source

| Capability | Status | Evidence |
|---|---|---|
| Single user-facing AI identity | Implemented in MVP | `apps/space-ai/src/server.ts` exports one `SpaceAgent` |
| Streaming chat UI | Implemented in source | `src/app.tsx`, `useAgentChat` |
| Persistent chat history | Implemented through Agent runtime | SQLite-backed Durable Object |
| Persistent task ledger | Implemented in source | `task_plans` SQLite table and task tools |
| Exact calculator tool | Implemented in source | `calculate` tool |
| Capability reporting | Implemented in source | `getCapabilities` tool |
| Project memory | Implemented in source | SQLite table with approval-required writes |
| Owner autonomy settings | Implemented in source | SQLite persistence and mobile settings UI |
| Private workspace files | Implemented in current branch | SQLite-backed file records, path validation, file and total size limits |
| Monaco IDE | Implemented in current branch | Monaco ESM, Vite-bundled workers, Explorer tree, tabs, save control |
| Token analysis | Implemented in current branch | Provider-reported AI usage plus clearly labeled file/workspace estimates |
| Read-only conversation sharing | Implemented in current branch | Random bearer URLs, seven-day expiry, revoke, no-store/noindex response |
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

- The latest separate-page UI redesign has not yet passed GitHub Actions or been deployed.
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
- General shell execution, project-repository execution, or a persistent coding VM.
- User device filesystem access and GitHub repository sync.
- Image/document/audio/video processing.
- Android, Windows, or macOS device runners.
- Gmail or other third-party account connectors.
- A production self-update/deployment worker.
- Scheduled 24/7 autonomous research.
- Memory/task export and deletion UI.
