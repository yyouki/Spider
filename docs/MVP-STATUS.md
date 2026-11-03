# space AI MVP status

Last implementation pass: November 3, 2026.

## Implemented in source

| Capability | Status | Evidence |
|---|---|---|
| Single user-facing AI identity | Implemented in MVP | `apps/space-ai/src/server.ts` exports one `SpaceAgent` |
| Streaming chat UI | Implemented in source | `src/app.tsx`, `useAgentChat` |
| Persistent chat history | Implemented through Agent runtime | `AIChatAgent`, SQLite-backed Durable Object |
| Exact calculator tool | Implemented in source | `calculate` tool |
| Capability reporting | Implemented in source | `getCapabilities` tool |
| Project memory | Implemented in source | SQLite table with approval-required writes |
| Private owner access | Implemented in source | Cloudflare Access JWT issuer/audience/email validation |
| Build/type-check workflow | Added | `.github/workflows/space-ai-check.yml` |

## Not yet verified

The repository integration does not have a live Cloudflare account attached to this coding session. Therefore none of these are claimed as successful:
- npm dependency installation in this repository;
- TypeScript check or Vite production build;
- Cloudflare Workers deployment;
- Cloudflare Access policy setup;
- actual Workers AI generation/model capacity;
- chat persistence across a real deploy/restart;
- backup/export/restore of Durable Object data.

GitHub Actions must pass before this MVP should be treated as build-verified. A successful CI build still does not prove Cloudflare deployment or model quota availability.

## Explicitly not implemented

- Web search or autonomous browsing.
- Arbitrary website interaction.
- General shell execution or code sandbox.
- Image/document/audio/video processing.
- Android, Windows, macOS, or Linux VM runners.
- Gmail, GitHub, or other third-party account OAuth connectors.
- Self-modifying code deployment.
- Scheduled 24/7 autonomous research.
- Memory export/delete UI.

These features must be implemented as separate, permissioned modules. They must not be advertised as available until tested.

## Cost and privacy boundaries

The initial model is `@cf/zai-org/glm-4.7-flash`, selected because Cloudflare currently lists it as available on Workers Free. Workers AI includes 10,000 Neurons per day on Workers Free; exceeding the free allowance stops further inference unless the account upgrades. Some other models require paid billing. Durable Objects SQLite has a 5 GB aggregate storage limit on Workers Free. Check current provider terms/quotas before deployment.

The Worker fails closed for agent/API routes unless Cloudflare Access team domain, app audience, and one allowed owner email are configured. Protect the complete Worker with Cloudflare Access as well; do not expose this one-owner chat endpoint publicly.
