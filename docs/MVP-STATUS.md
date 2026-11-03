# space AI MVP status

Last implementation pass: November 4, 2026.

## Implemented in source

| Capability | Status | Evidence |
|---|---|---|
| Single user-facing AI identity | Implemented in MVP | `apps/space-ai/src/server.ts` exports one `SpaceAgent` |
| Streaming chat UI | Implemented in source | `src/app.tsx`, `useAgentChat` |
| Persistent chat history | Implemented through Agent runtime | `AIChatAgent`, SQLite-backed Durable Object |
| Persistent task ledger | Implemented in source | `task_plans` SQLite table, create/list/cancel tools |
| Exact calculator tool | Implemented in source | `calculate` tool |
| Capability reporting | Implemented in source | `getCapabilities` tool |
| Project memory | Implemented in source | SQLite table with approval-required writes |
| Owner autonomy settings | Implemented in source | callable getter/updater, SQLite persistence, mobile settings UI |
| Self-update release policy | Implemented in source | deterministic release gate + Node unit tests |
| Private owner access | Implemented in source | Cloudflare Access JWT issuer/audience/email validation |
| CI build and test workflow | Added | `.github/workflows/space-ai-check.yml` |

## Autonomy settings versus actual access

The owner can save preferences for future sandbox execution, read-only browser research, selected-workspace file management, and automatic promotion of eligible low-risk updates. Those preferences do not activate missing tools or grant permissions to a third-party provider.

Account access must be implemented through official OAuth consent with scopes granted by the account owner. Android/device features must use OS permission prompts. The MVP has no account or device connector.

External writes and high-impact actions (send/publish, spend, delete important data, change security/access controls) remain owner-confirmation actions.

## Self-update

The self-update preference and deterministic release gate are implemented. Promotion can only be considered for low-risk application changes after all declared checks and evaluation cases pass, protected areas remain unchanged, security findings are zero at critical/high/medium levels, rollback and staging are verified, artifact integrity passes, and budget approval is present.

No production updater or deploy credential is connected. Therefore automatic self-update is not active.

## Not yet verified

No live Cloudflare account is connected to this coding session. The latest source change must pass its own GitHub Actions run. The following remain unverified:
- npm dependency installation and build for the latest autonomy settings change;
- actual callable RPC behavior after deployment;
- Cloudflare deployment;
- Cloudflare Access policy setup;
- actual Workers AI generation/model capacity;
- chat/task/settings persistence across a real restart/deploy;
- database backup/export/restore.

## Explicitly not implemented

- Web search or autonomous browsing.
- Arbitrary website interaction.
- General shell execution or code sandbox.
- File and folder ingestion, read/write tools.
- Image/document/audio/video processing.
- Android, Windows, macOS, or Linux VM runners.
- Gmail, GitHub, or other third-party account OAuth connectors.
- A production self-update/deployment worker.
- Scheduled 24/7 autonomous research.
- Memory/task export and deletion UI.

These features must not be advertised as available until implemented and tested.

## Cost and privacy boundaries

The initial model is `@cf/zai-org/glm-4.7-flash`, selected because Cloudflare currently lists it as available on Workers Free. Workers AI includes 10,000 Neurons per day on Workers Free; exceeding the free allowance stops further inference unless the account upgrades. Some other models require paid billing. Durable Objects storage and request quotas are also limited. Check current provider terms/quotas before deployment.

The Worker fails closed for agent/API routes unless Cloudflare Access team domain, app audience, and one allowed owner email are configured. Protect the complete Worker with Cloudflare Access too; do not expose this one-owner chat endpoint publicly.
