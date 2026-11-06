# space — Autonomous AI Workspace

space is being built as **one primary AI with one identity and one orchestration core**. Browser research, coding, file management, multimodal perception, memory, sandbox execution, hosting, and self-improvement are capabilities of that core rather than separate user-facing bots.

> **Current implementation direction:** Cloudflare Workers Free hosts the app. Durable Objects SQLite stores persistent chat, automatic context summaries, preferences, plans, project memory, private source files, file revisions, and image assets. The UI has dedicated Chat, IDE, Analytics, and Settings pages. The IDE route opens the official VS Code Web editor for a selected GitHub repository; bounded Python and JavaScript execution remains a separate Space sandbox capability. AI-created source files appear in chat with direct download actions. Space's private workspace is not yet synchronized with GitHub repositories. FLUX.2 Klein powers image generation and editing. GitHub or optional Google OAuth restricts the workspace to the configured owner account. This uses Cloudflare Workers Free and temporary public-repository GitHub-hosted runners, but remains subject to provider quotas and storage limits.

## AI MVP

Start with [apps/space-ai](apps/space-ai/README.md) for local development and deployment requirements.

The app is organized into four separate areas: **Chat** for conversations, **VS Code** for opening a GitHub repository in the official browser editor, **Analytics** for provider-reported token activity, and **Settings** for autonomy preferences. VS Code Web runs in a separate tab; the private Space workspace is not synced to GitHub yet.\n\nThe **Settings** page stores the owner's preferred operating modes:
- bounded Python/JavaScript execution in a temporary offline container;
- automatic read-only research once a browser tool exists;
- file operations within the private Space workspace, managed through AI tools and chat downloads;
- automatic promotion of eligible low-risk updates after every required release gate passes.

The settings do not activate tools or grant third-party permissions that have not been connected.

## Architecture and policies

- [Product vision](docs/VISION.md)
- [Unified AI architecture](docs/ARCHITECTURE.md)
- [Security, identity, and permissions](docs/SECURITY-AND-PERMISSIONS.md)
- [Owner autonomy and account/device access](docs/OWNER-AUTONOMY-AND-ACCESS.md)
- [Multimodal and perception](docs/MULTIMODAL-AND-PERCEPTION.md)
- [Memory and continuous improvement](docs/LEARNING-AND-SELF-IMPROVEMENT.md)
- [Self-update release policy](docs/SELF-UPDATE-POLICY.md)
- [Isolated Linux sandbox](docs/SANDBOX.md)
- [Free-tier deployment guide](docs/CLOUDFLARE-DEPLOYMENT.md)
- [Implementation roadmap](docs/ROADMAP.md)
- [MVP status](docs/MVP-STATUS.md)
- [Platform limitations](docs/PLATFORM-LIMITS.md)

## Non-negotiable engineering principles

- One AI identity; all tools follow the same permission engine and task ledger.
- Plan, execute, verify, and report evidence. Never fabricate capability or success.
- Account access uses official OAuth grants with revocable scopes, never a universal password.
- Device access uses native OS permissions; raw biometric templates are not collected.
- Untrusted code runs in isolated sandboxes, not the host.
- Low-risk self-updates may be auto-promoted only after every registered gate passes and rollback is verified. Security/authentication/permission changes always require owner review.
- Never promise perfect accuracy, unlimited storage, unlimited model inference, all OSs on one host, or free unlimited 24/7 compute.

## Legacy Codespaces / Windows experiment

The Windows VM experiment remains separate from the AI workspace. It requires a compatible Codespace with Docker, KVM, TUN, enough memory, and enough persistent workspace storage. Codespaces is not a Windows Cloud PC and does not guarantee RDP reachability.

## Security

- Never commit `.env`, `.dev.vars`, OAuth tokens, service-account JSON, cookies, passwords, or private keys.
- Never commit VM disk images or private user data.
- Route chat Agent WebSocket/RPC traffic through the fixed `/api/me` endpoint; the Worker validates the signed owner session and same-origin Origin header, chooses the Durable Object identity server-side, and blocks the legacy client-selected `/agents/*` route. Public multi-user registration remains disabled until the full tenant-isolation release gate passes.
- The sandbox job receives no repository write token, deployment credentials, persistent volume, or host directory mount.
- Do not treat a successful CI build as proof of live deployment or provider availability.


## Planned integrations and current boundaries

- The current feature branch adds owner-approved GitHub App authorization and publishing of the validated workspace snapshot to a new private repository in the signed-in user's personal GitHub account. It uses encrypted, per-account expiring tokens and least-privilege Repository creation/Contents permissions. CI and Cloudflare Preview verification remain release gates; existing repositories, organizations, and public visibility are not supported yet.
- The `/ide` page hands off to official VS Code Web at https://github.dev/OWNER/REPOSITORY. The embedded Monaco implementation has been removed. The new GitHub App publishing panel can publish a confirmed workspace snapshot to a new private repository; it does not continuously synchronize later edits.
- Video links can be attached as validated references, but actual video watching, transcription, and frame analysis remain unimplemented.
- Public multi-user login stays disabled until tenant isolation, per-user token storage, abuse controls, and cross-user authorization tests are complete.
- Android companion access must use visible, revocable Android permissions. Hidden background monitoring or unrestricted device control is not part of the design.
- Android APK builds will run in GitHub Actions and produce downloadable artifacts. Directly attaching those artifacts to a Space conversation requires the future repository/Actions integration.


The Settings page displays the current provider-backed account profile (GitHub or Google), including name, avatar, and provider identity. Optional Google owner sign-in requires a separately configured Google OAuth Web client and verified owner email; it does not enable public registration. See [Google owner sign-in setup](docs/CLOUDFLARE-DEPLOYMENT.md#optional-google-owner-sign-in-and-profile).
